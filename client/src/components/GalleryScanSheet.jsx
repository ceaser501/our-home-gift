import { useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, RotateCcw, ScanSearch, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  candidateToFiles,
  dismissImages,
  undismissImages,
  countSkipped,
  forgetSkipped,
  FOLDERS,
  summarizeFolders,
  getGalleryStatus,
  requestGalleryAccess,
  scanGallery,
} from '../utils/gallery';
import { findGifticonByCode } from '../api';
import { useFamily } from '../FamilyContext';
import useBackClose from '../utils/useBackClose';
import { cn } from '@/lib/utils';

// 갤러리에 받아둔 기프티콘을 찾아 등록까지 이어주는 창.
//
// 이 기능은 어디까지나 거들기 위한 것이다. 권한을 안 줘도, 못 찾아도 앱은 그대로 쓸 수
// 있어야 한다 — 사진을 직접 올리는 길이 늘 열려 있다. 그래서 여기서 무엇이 실패하든
// 막다른 길처럼 보이지 않게, 마지막에는 늘 "직접 올리셔도 돼요"로 끝난다.
//
// 찾은 것을 곧바로 저장하지는 않는다. 바코드가 있다고 다 기프티콘은 아니고(택배 송장,
// 영수증, 상품 포장 사진), 상품명·받은 사람은 사람이 확인해야 한다. 여기서는 후보만
// 보여주고, 고른 것을 평소의 등록 창으로 넘긴다.

// 화면이 어느 단계인지.
//   intro   — 무엇을 하는 기능인지 설명하고 권한을 묻기 전
//   denied  — 권한을 주지 않음
//   scanning— 훑는 중
//   done    — 다 훑음
const KOREAN_BUCKETS = FOLDERS.map((folder) => folder.label).join(' · ');

// 네이티브가 주는 시각은 초 단위다(MediaStore가 그렇게 쓴다). 자바스크립트의 Date는
// 밀리초라 천 배를 곱해야 한다.
function formatDay(seconds) {
  if (!seconds) return null;
  const at = new Date(seconds * 1000);
  const day = at.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  // 그날 0시가 기준이면 날짜만 적는다(설치한 날 전체를 봤다는 뜻이라 그게 정확하다).
  // 한나절 중간이 기준이면 시각까지 적어야 한다 — 날짜만 적으면 그날 아침에 받아둔
  // 사진이 왜 빠졌는지 알 길이 없다.
  if (at.getHours() === 0 && at.getMinutes() === 0) return day;
  return `${day} ${at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}`;
}


export default function GalleryScanSheet({ onRegister, savedMark, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family } = useFamily();

  const [stage, setStage] = useState('intro');
  const [partial, setPartial] = useState(false);
  const [progress, setProgress] = useState(null);
  const [candidates, setCandidates] = useState([]);
  // 이번 창에서 치운 후보. 목록에 흐리게 남겨두고 되돌릴 수 있게 한다.
  const [dismissedIds, setDismissedIds] = useState([]);
  const [scanned, setScanned] = useState(0);
  // 기준 시각 이후 기기에 있던 사진 수. scanned와의 차이가 '전에 확인해서 건너뛴' 수다.
  const [listed, setListed] = useState(0);
  // 실제로 어느 시각 이후를 봤는지(초). 화면에 적어주기 위한 값이다.
  const [since, setSince] = useState(0);
  // 기기에 실제로 있는 폴더 이름과 장수, 그리고 몇 장이 어떤 이유로 걸러졌는지.
  // 못 찾았을 때 그 이유를 짚어주기 위한 값이다.
  const [folders, setFolders] = useState([]);
  const [tally, setTally] = useState(null);
  // 끝까지 훑었는지. 중간에 그만뒀으면 "여기까지 봤다"고 적으면 안 된다 —
  // 못 본 사진들이 다음 번에 통째로 건너뛰어진다.
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  // 창을 닫는 순간 훑기를 멈춘다. 안 그러면 닫은 뒤에도 수십 장을 계속 읽어서
  // 폰이 더워지고 배터리만 쓴다.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 이미 권한이 있으면 설명 화면을 건너뛰고 바로 훑는다. 두 번째부터는 사용자가
  // 무엇을 하는 기능인지 이미 알고 있어서, 한 번 더 누르게 할 이유가 없다.
  useEffect(() => {
    let cancelled = false;
    getGalleryStatus().then((status) => {
      if (cancelled) return;
      if (status.granted || status.partial) start();
    });
    return () => {
      cancelled = true;
    };
    // start는 매번 새로 만들어지는 함수라 의존성에 넣으면 효과가 계속 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 등록이 끝난 것은 목록에서 뺀다. 남겨두면 방금 넣은 것을 또 넣게 된다.
  //
  // 어느 후보였는지(id)로 뺀다. 예전에는 저장된 번호로 짝지었는데, 훑을 때 읽은 번호와
  // 등록 창이 저장한 번호가 다를 수 있다 — 같은 사진을 두 곳에서 각자 판독하기 때문이다.
  // 한 자리라도 갈리면 등록을 마치고 돌아와도 그 후보가 그대로 남았고, 한 번 더 누르면
  // 같은 기프티콘이 두 건으로 들어갔다. 실제로 그렇게 됐다.
  //
  // 번호로도 함께 뺀다. 훑기를 거치지 않고 + 로 직접 올린 것이 마침 후보에 있던 것과
  // 같을 수 있어서다. 그때는 id가 없으니 번호가 유일한 단서다.
  //
  // 마지막 하나까지 등록했으면 이 창을 닫는다. 열어둔 채로 두면 방금 등록을 마쳤는데
  // "등록할 기프티콘이 없어요"가 뜬다 — 없어서가 아니라 다 했기 때문인데, 화면만 보면
  // 실패한 것처럼 읽힌다. 남은 게 있을 때만 계속 열어둔다.
  useEffect(() => {
    if (!savedMark) return;
    setCandidates((prev) => {
      const left = prev.filter(
        (item) => item.id !== savedMark.candidateId && item.code !== savedMark.code
      );
      if (left.length === prev.length) return prev;
      // 갱신 함수 안에서 창을 닫으면 안 된다. React가 이 함수를 두 번 부를 수 있어서
      // 닫기가 두 번 불릴 수 있다. 판단만 여기서 하고 닫는 건 밖에서 한다.
      if (left.length === 0) queueMicrotask(onClose);
      return left;
    });
    // seq만 본다. 같은 후보를 다시 등록하는 일은 없고, 저장할 때마다 하나씩 오른다.
    // onClose는 부모가 매번 새로 만드는 함수라 의존성에 넣으면 효과가 계속 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedMark?.seq]);

  async function start({ forgetHistory = false } = {}) {
    setError('');
    if (forgetHistory) forgetSkipped();
    const status = await requestGalleryAccess();
    if (!status.granted && !status.partial) {
      setStage('denied');
      return;
    }

    setPartial(Boolean(status.partial));
    setStage('scanning');
    setComplete(false);
    setCandidates([]);
    setDismissedIds([]);
    setProgress({ scanned: 0, total: 0, found: 0 });

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const result = await scanGallery({
        signal: controller.signal,
        onProgress: setProgress,
        // 이미 목록에 있는 번호는 후보에서 뺀다. 기프티콘 사진은 지우지 않고 그대로
        // 두는 사람이 많아서, 이게 없으면 훑을 때마다 등록한 것들이 계속 다시 나온다.
        isRegistered: async (code) => {
          try {
            return Boolean(await findGifticonByCode(family.id, code));
          } catch {
            // 물어보지 못했으면 보여주는 쪽을 고른다. 중복은 저장할 때 한 번 더 걸러진다.
            return false;
          }
        },
      });
      if (controller.signal.aborted) return;
      setCandidates(result.candidates);
      setScanned(result.scanned ?? 0);
      setListed(result.listed ?? 0);
      setSince(result.since ?? 0);
      setFolders(result.folders ?? []);
      setTally(result.tally ?? null);
      setComplete(true);
    } catch (err) {
      setError(err?.message || '갤러리를 훑지 못했어요.');
    } finally {
      if (!controller.signal.aborted) {
        setStage('done');
        setProgress(null);
      }
    }
  }

  // 치운 것을 목록에서 곧바로 빼지 않는다. 자리에 흐리게 남겨두고 되돌릴 수 있게 한다.
  // 치우기는 영구적이라, 손이 미끄러졌을 때 그 자리에서 되돌릴 수 없으면 방법이 없다.
  // 창을 닫으면 사라진다 — 그때는 사용자가 이미 결정을 내린 것이다.
  function handleDismiss(candidate) {
    dismissImages([candidate.id]);
    setDismissedIds((prev) => [...prev, candidate.id]);
  }

  function handleUndismiss(candidate) {
    undismissImages([candidate.id]);
    setDismissedIds((prev) => prev.filter((id) => id !== candidate.id));
  }

  // 못 찾았을 때 "우리가 보는 3개 폴더에 각각 몇 장이 있었나"를 보여주기 위한 값.
  const summary = summarizeFolders(folders);
  // 지금까지 건너뛰기로 감춰둔 사진 수. 훑기가 끝난 뒤에만 쓰므로 그때 세면 된다.
  const skipped = complete ? countSkipped() : 0;

  // 훑기 결과를 한 상자에 담아 보여준다.
  //
  // 예전에는 못 찾았을 때만 '왜 못 찾았는지 보기'로 펼치게 해뒀는데, 찾았을 때 뜨는
  // '읽은 정보 상세보기'와 내용이 같았다. 같은 것을 두 이름으로 부르면 다른 것인 줄 안다.
  // 이름 하나로 두고 늘 보여준다.
  //
  // 숫자가 서로 안 맞아 보이는 게 문제였다. 앨범에는 20장이 있는데 확인한 사진은 4장으로
  // 적혀 있으니, 나머지 16장을 왜 안 봤는지 알 길이 없었다. 실제로는 전에 확인해서
  // 기억해둔 것들이라 다시 읽지 않은 것인데, 그 사실이 화면에 없었다.
  //
  // 그래서 세 덩어리로 나눈다. 어느 앨범을 봤는지, 그중 몇 장을 실제로 열었는지,
  // 연 것이 어떻게 갈렸는지. 위에서 아래로 읽으면 숫자가 이어진다.
  const albums = summary.watched.map((folder) => `${folder.label} ${folder.count}`).join(' · ');
  const skippedBefore = Math.max(0, listed - scanned);

  const panelBody = tally ? (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/60 px-4 py-3.5">
      <p className="m-0 text-sm font-semibold text-foreground">상세내역</p>

      {/* 어느 앨범을 봤는지. 사진이 없어도 0장으로 남긴다 — 목록에서 빠지면 "걸러진 건가"
          하고 의심하게 되는데, 실제로는 볼 게 없었던 것이다. 기기에 있는 다른 앨범은
          적지 않는다. 안 보는 것을 늘어놓으면 그걸 뒤진다는 뜻으로 읽힌다. */}
      <div className="flex gap-2 text-sm break-keep text-muted-foreground">
        <span className="shrink-0">앨범</span>
        <span className="flex-1 text-foreground">{albums}</span>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2.5 text-sm">
        <div className="flex justify-between gap-2">
          <span className="font-semibold text-foreground">확인한 사진</span>
          <span className="tabular-nums text-foreground">{tally.read}장</span>
        </div>
        {/* 연 사진이 어떻게 갈렸는지. 한 칸 들여써서 위 숫자를 나눈 것임을 보인다. */}
        <div className="flex justify-between gap-2 pl-3 text-muted-foreground">
          <span>이미 등록됨</span>
          <span className="tabular-nums">{tally.alreadyHave}장</span>
        </div>
        <div className="flex justify-between gap-2 pl-3 text-muted-foreground">
          <span>바코드 없음</span>
          <span className="tabular-nums">{tally.noBarcode}장</span>
        </div>
        {tally.readFailed > 0 && (
          <div className="flex justify-between gap-2 pl-3 text-muted-foreground">
            <span>열지 못함</span>
            <span className="tabular-nums">{tally.readFailed}장</span>
          </div>
        )}
      </div>

      {/* 앨범 장수와 확인한 장수가 벌어지는 이유. 이 줄이 없으면 앱이 뭘 빼먹은 것처럼
          보인다. 실제로는 전에 확인한 것이라 다시 읽지 않은 것뿐이다. */}
      {skippedBefore > 0 && (
        <p className="m-0 border-t border-border pt-2.5 text-sm break-keep text-muted-foreground">
          전에 확인한 {skippedBefore}장은 다시 읽지 않았어요.
        </p>
      )}

      {/* 셋 다 0장이면 앨범 이름이 우리 목록과 다를 수 있다. 그때만 기기에 있는 이름을
          보여준다 — 그게 유일한 단서다. */}
      {summary.watched.every((folder) => folder.count === 0) && summary.others.length > 0 && (
        <p className="m-0 text-sm break-keep text-muted-foreground">
          폰에 있는 앨범: {summary.others.map((f) => `${f.name} ${f.count}`).join(' · ')}
        </p>
      )}
    </div>
  ) : null;

  function handleRegister(candidate) {
    onRegister(candidateToFiles(candidate), candidate.id);
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>기프티콘 찾기</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pt-2">
          {stage === 'intro' && (
            <>
              <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
<b className="font-semibold text-foreground">{KOREAN_BUCKETS}</b> 폴더에서 새 기프티콘을 찾아드려요.
              </p>
              {/* 사진 권한은 사람들이 가장 망설이는 권한이다. 무엇을 보고 무엇을 안 보내는지
                  먼저 적어두면, 눌러도 되는 것인지 판단할 근거가 생긴다. */}
              <ul className="m-0 flex list-none flex-col gap-2 rounded-xl bg-muted/60 px-4 py-3.5 pl-4 text-sm leading-relaxed break-keep text-muted-foreground">
                <li>사진은 폰 안에서만 읽어요</li>
                <li>고른 것만 등록돼요</li>
                <li>허용 안 해도 직접 올릴 수 있어요</li>
              </ul>
              <Button type="button" size="lg" className="w-full rounded-xl" onClick={() => start()}>
                <ScanSearch className="size-4.5" />
                사진 허용하고 찾기
              </Button>
            </>
          )}

          {stage === 'denied' && (
            <>
              <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
사진을 볼 수 없어요. 그래도 <b className="font-semibold text-foreground">+ 로 직접 올리면</b> 정보는 자동으로
                채워드려요.
              </p>
              <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
                설정 → 애플리케이션 → 모아콘 → 권한 → 사진에서 허용할 수 있어요.
              </p>
              <Button type="button" variant="outline" size="lg" className="w-full rounded-xl" onClick={onClose}>
                닫기
              </Button>
            </>
          )}

          {stage === 'scanning' && (
            <>
              <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  <span className="flex-1 text-base font-semibold text-foreground">
                    찾는 중이에요
                    {progress?.total ? ` (${progress.scanned}/${progress.total})` : ''}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                    style={{
                      width: progress?.total ? `${Math.round((progress.scanned / progress.total) * 100)}%` : '20%',
                    }}
                  />
                </div>
                <p className="m-0 text-xs text-muted-foreground">
{progress?.found ? `${progress.found}개 찾았어요` : '잠시만요'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full rounded-xl"
                onClick={() => {
                  abortRef.current?.abort();
                  setStage('done');
                  setProgress(null);
                }}
              >
                그만 찾기
              </Button>
            </>
          )}

          {stage === 'done' && (
            <>
              {/* 안드로이드 14의 "선택한 사진만 허용"이면 사용자가 고른 몇 장만 보인다.
                  폴더를 훑는다는 전제가 깨지므로, 못 찾았을 때 왜 그런지 알려줘야 한다. */}
              {partial && (
                <p className="m-0 rounded-xl bg-warning/10 px-3.5 py-3 text-xs leading-relaxed break-keep text-muted-foreground">
<b className="font-semibold text-foreground">선택한 사진만 허용</b>이라 고르신 사진에서만 찾았어요.
                  설정에서 &lsquo;모두 허용&rsquo;으로 바꿀 수 있어요.
                </p>
              )}

              {error && <p className="m-0 text-xs text-destructive">{error}</p>}

              {candidates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ImageOff className="size-8 text-muted-foreground" />
                  <p className="m-0 text-base font-semibold text-foreground">
                    {scanned === 0 ? '새로 담긴 사진이 없어요' : '등록할 기프티콘이 없어요'}
                  </p>
                  <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
                    {scanned === 0 ? '+ 로 직접 올려주세요.' : `사진 ${scanned}장을 봤어요. + 로 직접 올려주세요.`}
                  </p>

                  {/* 왜 못 찾았는지 짚어준다.
                      "사진이 없어서"와 "바코드를 못 읽어서"와 "이미 다 등록해서"는 사용자가
                      할 일이 서로 다른데, 이게 없으면 셋이 똑같은 화면으로 보인다.
                      폴더 이름은 기기마다 달라서, 여기 낯선 이름이 뜨면 그게 원인이다. */}
                </div>
              ) : (
                <>
                  <p className="m-0 text-base break-keep text-foreground">
<b className="font-semibold">{candidates.length}개</b> 찾았어요. 확인 후 등록해주세요.
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {candidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border border-border bg-background p-2.5',
                          dismissedIds.includes(candidate.id) && 'opacity-50'
                        )}
                      >
                        <img
                          src={`data:image/jpeg;base64,${candidate.images[0]}`}
                          alt=""
                          className="size-16 shrink-0 rounded-lg bg-black object-cover"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm text-muted-foreground">{candidate.bucket}</span>
                          <span className="truncate font-mono text-base font-semibold text-foreground">{candidate.code}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {dismissedIds.includes(candidate.id) ? (
                            <button
                              type="button"
                              onClick={() => handleUndismiss(candidate)}
                              className="px-2 py-1 text-sm font-semibold text-primary underline"
                            >
                              되돌리기
                            </button>
                          ) : (
                            <>
                          <Button type="button" size="sm" onClick={() => handleRegister(candidate)}>
                            등록
                          </Button>
                          {/* 아닌 것을 치우면 다음부터 다시 묻지 않는다. 안 그러면 갤러리에
                              남아 있는 한 훑을 때마다 같은 사진이 계속 올라온다. */}
                          <button
                            type="button"
                            onClick={() => handleDismiss(candidate)}
                            aria-label="기프티콘 아님"
                            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground"
                          >
                            <X className="size-4" />
                          </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* 어디까지 봤는지 적어준다. "왜 예전 사진이 안 나오지?"는 이 줄이 없으면
                  알 길이 없다. 두 번째부터는 지난번 이후만 보기 때문에 더 그렇다. */}
              {complete && formatDay(since) && (
                <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
<b className="font-semibold text-foreground">{formatDay(since)} 0시</b> 이후 사진만 봐요.
                  <br />
                  이전 사진은 + 로 올려주세요.
                </p>
              )}

              {panelBody}

              {/* 두 버튼의 차이를 이름에 담는다. 둘 다 설치일 0시부터 보되, 위는 아직
                  확인하지 않은 것만, 아래는 아니라고 봤던 것까지 전부 본다.
                  '새 기프티콘' ↔ '전부'가 나란히 놓여 설명 없이 갈린다.

                  예전 이름은 '건너뛴 사진 …'이었는데, 앱이 스스로 무언가를 건너뛰었다고
                  말하는 셈이라 "뭘 놓친 거지" 하는 의심을 만들었다. 이 앱의 약속은
                  놓치지 않는 것이고, 실제로 놓친 게 아니라 아니라고 판단한 것이다.
                  한 일을 그대로 적는다.

                  생김새로도 갈라둔다. 늘 누르는 쪽이 색이 있는 버튼이고, 어쩌다 한 번
                  쓰는 쪽은 같은 모양의 테두리 버튼이다. 아래쪽을 밑줄 글자로 뒀더니
                  둘이 다른 종류의 것으로 보이지 않고 그냥 안 보였다. */}
              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" className="w-full rounded-xl" onClick={() => start()}>
                  <ScanSearch className="size-4.5" />
                  새 기프티콘 찾기
                </Button>

                {skipped > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full rounded-xl"
                    onClick={() => start({ forgetHistory: true })}
                  >
                    <RotateCcw className="size-4.5" />
                    전부 다시 찾기
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
