import { useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, ScanSearch, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  candidateToFile,
  dismissImages,
  forgetScanHistory,
  getGalleryStatus,
  rememberScannedUntil,
  requestGalleryAccess,
  scanGallery,
} from '../utils/gallery';
import { findGifticonByCode } from '../api';
import { useFamily } from '../FamilyContext';
import useBackClose from '../utils/useBackClose';

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
const KOREAN_BUCKETS = '다운로드 · 카카오톡 · 스크린샷';

// 네이티브가 주는 시각은 초 단위다(MediaStore가 그렇게 쓴다). 자바스크립트의 Date는
// 밀리초라 천 배를 곱해야 한다.
function formatDay(seconds) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// 기준 시각 이후 기기에 있는 폴더 목록에서, 우리가 훑은 것과 아닌 것을 갈라 적는다.
function folderText(folders, used) {
  const picked = (folders || []).filter((folder) => Boolean(folder.used) === used);
  if (picked.length === 0) return '없음';
  return picked.map((folder) => `${folder.name} ${folder.count}장`).join(' · ');
}

export default function GalleryScanSheet({ onRegister, savedCode, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family } = useFamily();

  const [stage, setStage] = useState('intro');
  const [partial, setPartial] = useState(false);
  const [progress, setProgress] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [scanned, setScanned] = useState(0);
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
  const startedAtRef = useRef(0);

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
  useEffect(() => {
    if (!savedCode) return;
    setCandidates((prev) => prev.filter((item) => item.code !== savedCode));
  }, [savedCode]);

  // 훑기가 끝난 뒤, 어디까지 봤는지 적어둔다. 다음 번엔 그 이후에 담긴 사진만 본다.
  //
  // 남아 있는 후보(등록도 치우기도 하지 않은 것)가 있으면 그중 가장 오래된 것 직전까지만
  // 적는다. 그러지 않으면 앱이 찾아준 것을 사용자가 결정하기도 전에 잃어버린다.
  // 등록하거나 치우면 이 효과가 다시 돌면서 표시가 저절로 앞으로 나아간다.
  useEffect(() => {
    if (!complete) return;
    const oldest = candidates.reduce((min, item) => Math.min(min, item.addedAt || Infinity), Infinity);
    rememberScannedUntil(Number.isFinite(oldest) ? oldest : startedAtRef.current);
  }, [complete, candidates]);

  async function start({ fromInstall = false } = {}) {
    setError('');
    const status = await requestGalleryAccess();
    if (!status.granted && !status.partial) {
      setStage('denied');
      return;
    }

    if (fromInstall) forgetScanHistory();

    setPartial(Boolean(status.partial));
    setStage('scanning');
    setComplete(false);
    setCandidates([]);
    setProgress({ scanned: 0, total: 0, found: 0 });
    startedAtRef.current = Math.floor(Date.now() / 1000);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const result = await scanGallery({
        signal: controller.signal,
        onProgress: setProgress,
        fromInstall,
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

  function handleDismiss(candidate) {
    dismissImages([candidate.id]);
    setCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
  }

  function handleRegister(candidate) {
    onRegister(candidateToFile(candidate));
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>갤러리에서 찾기</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pt-2">
          {stage === 'intro' && (
            <>
              <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
                앱을 설치한 뒤 <b className="font-semibold text-foreground">{KOREAN_BUCKETS}</b> 폴더에 담긴 사진 중에서
                아직 등록하지 않은 기프티콘을 찾아드려요.
              </p>
              {/* 사진 권한은 사람들이 가장 망설이는 권한이다. 무엇을 보고 무엇을 안 보내는지
                  먼저 적어두면, 눌러도 되는 것인지 판단할 근거가 생긴다. */}
              <ul className="m-0 flex list-none flex-col gap-1.5 rounded-xl bg-muted/60 px-4 py-3 pl-4 text-xs leading-relaxed break-keep text-muted-foreground">
                <li>바코드를 읽는 건 폰 안에서만 해요. 사진이 밖으로 나가지 않아요.</li>
                <li>찾은 것을 바로 저장하지 않아요. 확인하고 고른 것만 등록돼요.</li>
                <li>허용하지 않아도 지금처럼 사진을 직접 올려서 등록할 수 있어요.</li>
              </ul>
              <Button type="button" size="lg" className="w-full rounded-xl" onClick={() => start()}>
                <ScanSearch className="size-4.5" />
                사진 허용하고 찾기
              </Button>
            </>
          )}

          {stage === 'denied' && (
            <>
              <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
                사진을 볼 수 없어서 갤러리를 훑지 못했어요. 그래도 괜찮아요 —{' '}
                <b className="font-semibold text-foreground">+ 버튼으로 사진을 직접 올리면</b> 지금까지처럼 자동으로
                정보를 채워드려요.
              </p>
              <p className="m-0 text-xs leading-relaxed break-keep text-muted-foreground">
                나중에 쓰고 싶으시면 휴대폰 설정 → 애플리케이션 → 모아콘 → 권한 → 사진에서 허용해주세요.
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
                  <span className="flex-1 text-sm font-semibold text-foreground">
                    사진을 살펴보고 있어요
                    {progress?.total ? ` (${progress.scanned}/${progress.total})` : ''}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: progress?.total ? `${Math.round((progress.scanned / progress.total) * 100)}%` : '20%',
                    }}
                  />
                </div>
                <p className="m-0 text-xs text-muted-foreground">
                  {progress?.found ? `${progress.found}개 찾았어요. ` : ''}
                  사진이 많으면 조금 걸려요.
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
                  <b className="font-semibold text-foreground">선택한 사진만 허용</b>으로 되어 있어서, 고르신 사진 안에서만
                  찾았어요. 폴더를 통째로 훑으려면 설정에서 &lsquo;모두 허용&rsquo;으로 바꿔주세요.
                </p>
              )}

              {error && <p className="m-0 text-xs text-destructive">{error}</p>}

              {candidates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ImageOff className="size-8 text-muted-foreground" />
                  <p className="m-0 text-sm font-semibold text-foreground">
                    {scanned === 0 ? '새로 담긴 사진이 없어요' : '등록할 만한 게 없었어요'}
                  </p>
                  <p className="m-0 text-xs leading-relaxed break-keep text-muted-foreground">
                    {scanned === 0
                      ? '지난번에 찾은 뒤로 갤러리에 새로 담긴 사진이 없어요.'
                      : `사진 ${scanned}장을 봤어요. 바코드가 흐리거나 앱에서만 열리는 기프티콘은 이 방법으로 못 찾아요.`}
                    <br />+ 버튼으로 직접 올리시면 그때도 정보를 채워드려요.
                  </p>

                  {/* 왜 못 찾았는지 짚어준다.
                      "사진이 없어서"와 "바코드를 못 읽어서"와 "이미 다 등록해서"는 사용자가
                      할 일이 서로 다른데, 이게 없으면 셋이 똑같은 화면으로 보인다.
                      폴더 이름은 기기마다 달라서, 여기 낯선 이름이 뜨면 그게 원인이다. */}
                  {tally && (
                    <details className="w-full pt-2 text-left">
                      <summary className="cursor-pointer list-none text-center text-xs text-muted-foreground underline">
                        왜 못 찾았는지 보기
                      </summary>
                      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
                        <dt>읽은 사진</dt>
                        <dd className="m-0">{tally.read}장</dd>
                        <dt>바코드 없음</dt>
                        <dd className="m-0">{tally.noBarcode}장</dd>
                        <dt>이미 등록됨</dt>
                        <dd className="m-0">{tally.alreadyHave}장</dd>
                        {tally.readFailed > 0 && (
                          <>
                            <dt>열지 못함</dt>
                            <dd className="m-0">{tally.readFailed}장</dd>
                          </>
                        )}
                        {/* 본 폴더와 안 본 폴더를 갈라서 적는다. 한 줄에 섞어두면
                            "왜 카메라 폴더까지 뒤지지"로 읽힌다 — 아래는 기기에 무엇이
                            있는지의 목록이지 우리가 훑은 목록이 아니다. */}
                        <dt className="col-span-2 pt-1 font-semibold text-foreground">본 폴더</dt>
                        <dd className="col-span-2 m-0 break-all">{folderText(folders, true)}</dd>
                        <dt className="col-span-2 pt-1 font-semibold text-foreground">안 본 폴더</dt>
                        <dd className="col-span-2 m-0 break-all">{folderText(folders, false)}</dd>
                      </dl>
                    </details>
                  )}
                </div>
              ) : (
                <>
                  <p className="m-0 text-sm break-keep text-foreground">
                    바코드가 있는 사진 <b className="font-semibold">{candidates.length}장</b>을 찾았어요. 기프티콘이 맞는지
                    보시고 등록해주세요.
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {candidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5"
                      >
                        <img
                          src={`data:image/jpeg;base64,${candidate.data}`}
                          alt=""
                          className="size-16 shrink-0 rounded-lg bg-black object-cover"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-xs text-muted-foreground">{candidate.bucket}</span>
                          <span className="truncate font-mono text-sm text-foreground">{candidate.code}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
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
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* 어디까지 봤는지 적어준다. "왜 예전 사진이 안 나오지?"는 이 줄이 없으면
                  알 길이 없다. 두 번째부터는 지난번 이후만 보기 때문에 더 그렇다. */}
              {complete && formatDay(since) && (
                <p className="m-0 text-xs leading-relaxed break-keep text-muted-foreground">
                  {formatDay(since)} 이후에 갤러리에 담긴 사진만 봤어요. 다음에 찾을 땐 그 뒤에 새로 담긴 것만 봐서 더
                  빨라요.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" size="lg" className="w-full rounded-xl" onClick={() => start()}>
                  <ScanSearch className="size-4.5" />
                  다시 찾기
                </Button>
                {/* 폴더 이름이 안 맞아 못 찾았거나, 실수로 치운 것을 되찾고 싶을 때.
                    시간이 오래 걸려서 눈에 띄지 않게 아래에 작게 둔다. */}
                <button
                  type="button"
                  onClick={() => start({ fromInstall: true })}
                  className="w-full py-1 text-xs text-muted-foreground underline"
                >
                  설치한 날부터 처음처럼 다시 훑기
                </button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
