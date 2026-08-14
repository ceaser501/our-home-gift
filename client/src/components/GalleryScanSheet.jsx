import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ImageOff, Images, Info, Loader2, RotateCcw, ScanSearch, X } from 'lucide-react';
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
import { createGifticon, findGifticonByCode } from '../api';
import { prepareImages, readGifticonInfo } from '../utils/imageAnalyze';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
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

// 내가 받은 기프티콘을 넣는 경우가 가장 많아서 내 이름을 맨 위에 둔다.
// 다만 가족 것을 대신 넣을 수도 있으니 나머지 구성원도 그대로 아래에 나열한다.
// (등록 창의 같은 함수와 규칙을 맞춘다 — client/src/components/UploadSheet.jsx)
function membersWithMeFirst(members, myName) {
  const me = members.filter((m) => m.display_name === myName);
  const others = members.filter((m) => m.display_name !== myName);
  return [...me, ...others];
}

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


export default function GalleryScanSheet({ onRegistered, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family, members, user } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || members[0]?.display_name || '';

  const [stage, setStage] = useState('intro');
  const [partial, setPartial] = useState(false);
  const [progress, setProgress] = useState(null);
  const [candidates, setCandidates] = useState([]);
  // 이번 창에서 치운 후보. 목록에 흐리게 남겨두고 되돌릴 수 있게 한다.
  const [dismissedIds, setDismissedIds] = useState([]);
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
  // 등록해 넣는 중일 때의 진행 상황과, 다 넣은 뒤의 결과.
  const [saving, setSaving] = useState(null);
  const [result, setResult] = useState(null);
  // 받은 사람. 사진으로는 알 수 없어서 사람이 고른다. 기본은 나다 — 내가 받은 것을
  // 넣는 경우가 가장 많다.
  const [owner, setOwner] = useState('');
  const abortRef = useRef(null);

  // 가족을 다 읽어온 뒤에 기본값이 정해진다.
  useEffect(() => {
    if (!owner && myName) setOwner(myName);
  }, [myName, owner]);

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
  // 치우지 않고 남아 있는 후보 수. 등록 버튼에 그대로 적힌다.
  const keptCount = candidates.filter((candidate) => !dismissedIds.includes(candidate.id)).length;

  // 훑기 결과를 한 상자에 담아 보여준다.
  //
  // 예전에는 못 찾았을 때만 '왜 못 찾았는지 보기'로 펼치게 해뒀는데, 찾았을 때 뜨는
  // '읽은 정보 상세보기'와 내용이 같았다. 같은 것을 두 이름으로 부르면 다른 것인 줄 안다.
  // 이름 하나로 두고 늘 보여준다.
  //
  // 세는 단위가 문제였다. '확인한 사진 4장 / 이미 등록됨 3장'은 둘 다 사진 수인데,
  // 읽는 사람은 아래 숫자를 기프티콘 세 개로 받아들인다. 같은 기프티콘을 원본과 캡처로
  // 두 장 갖고 있으면 실제로는 하나인데도 그렇다.
  //
  // 사진 수는 사진첩 줄에서만 말하고, 그 아래는 기프티콘 수만 말한다.
  //
  // 접어둔다. 찾은 것이 여러 개면 위쪽 목록만으로도 화면이 꽉 차는데, 그 아래 표까지
  // 펼쳐져 있으면 정작 눌러야 할 등록 버튼이 밀린다. 이건 궁금할 때 여는 자리다.
  const panelBody = tally ? (
    <details className="group rounded-xl bg-muted/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground">
        상세내역
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="flex flex-col gap-2.5 px-4 pb-3.5">
        {/* 어느 사진첩을 봤는지. 이름과 숫자를 한 덩어리로 묶어 보여준다 — 줄글로
            늘어놓으면 '다운로드 1 카카오톡 1'에서 1이 어디에 붙는지 한 번 더 읽어야 한다.
            사진이 없어도 0으로 남긴다. 목록에서 빠지면 "걸러진 건가" 하고 의심하게
            되는데, 실제로는 볼 게 없었던 것이다. 기기에 있는 다른 사진첩은 적지 않는다 —
            안 보는 것을 늘어놓으면 그걸 뒤진다는 뜻으로 읽힌다. */}
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Images className="size-3.5 shrink-0" />
            사진첩 별 확인 사진
          </span>
          <div className="flex flex-wrap gap-1.5">
            {summary.watched.map((folder) => (
              <span
                key={folder.label}
                className="rounded-lg bg-card px-2.5 py-1 text-sm text-foreground"
              >
                {folder.label} <b className="font-semibold tabular-nums">{folder.count}</b>
              </span>
            ))}
          </div>
        </div>

        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-2.5 text-sm">
          <dt className="text-muted-foreground">발견한 기프티콘</dt>
          <dd className="m-0 font-semibold tabular-nums text-foreground">{tally.found}개</dd>
          <dt className="text-muted-foreground">이미 등록된 기프티콘</dt>
          <dd className="m-0 tabular-nums text-foreground">{tally.alreadyHave}개</dd>
          {/* 오류일 때만 나온다. 평소에는 자리를 차지하지 않는다. */}
          {tally.readFailed > 0 && (
            <>
              <dt className="text-muted-foreground">열지 못한 사진</dt>
              <dd className="m-0 tabular-nums text-foreground">{tally.readFailed}장</dd>
            </>
          )}
        </dl>

        {/* 셋 다 0장이면 사진첩 이름이 우리 목록과 다를 수 있다. 그때만 기기에 있는
            이름을 보여준다 — 그게 유일한 단서다. */}
        {summary.watched.every((folder) => folder.count === 0) && summary.others.length > 0 && (
          <p className="m-0 border-t border-border pt-2.5 text-sm break-keep text-muted-foreground">
            폰에 있는 사진첩: {summary.others.map((f) => `${f.name} ${f.count}`).join(' · ')}
          </p>
        )}
      </div>
    </details>
  ) : null;

  /**
   * 남아 있는 후보를 전부 등록한다.
   *
   * 예전에는 하나를 누르면 등록 창이 열렸다. 정보를 확인하라는 뜻이었는데, 자동으로
   * 찾아주는 기능을 쓴 사람에게는 그게 일이 늘어난 것으로 느껴진다 — 알아서 해달라고
   * 눌렀는데 글자를 또 읽고 있고, 입력창이 하나 더 뜬다. 세 개를 찾으면 세 번 그런다.
   *
   * 확인은 나중에도 할 수 있다. 목록에 들어온 뒤 수정에서 고치면 되고, 메모도 거기서
   * 남긴다. 반면 여기서 막아두면 등록 자체가 늦어진다.
   *
   * 다만 받은 사람만은 미리 고르게 한다. 사진에 적혀 있지 않아서 모델이 알 수 없고,
   * 이 앱은 가족이 함께 쓰는 것이라 누구 것인지가 목록의 뼈대다. 나중에 건건이 고치는
   * 편이 훨씬 번거롭다.
   */
  async function registerAll() {
    const targets = candidates.filter((candidate) => !dismissedIds.includes(candidate.id));
    if (targets.length === 0) return;

    setStage('registering');
    setError('');
    const done = [];
    const failed = [];
    let noName = 0;
    let noExpiry = 0;

    for (const [index, candidate] of targets.entries()) {
      setSaving({ current: index + 1, total: targets.length });
      try {
        const prepared = await prepareImages(candidateToFiles(candidate));
        const info = await readGifticonInfo(prepared);

        // 상품명은 반드시 있어야 저장된다(supabase/schema.sql). 못 읽었으면 상호로
        // 대신하고, 그것도 없으면 자리만 채워둔다. 여기서 멈추면 사진은 그대로 남고
        // 등록만 안 되는데, 그건 사용자가 알아채기 어려운 실패다.
        const name = info.name || info.brand || '이름 없음';
        if (!info.name) noName += 1;
        if (!info.expiresAt) noExpiry += 1;

        const saved = await createGifticon(
          family.id,
          {
            name,
            category: info.category || '기타',
            brand: info.brand || null,
            amount: info.amount ?? '',
            owner,
            // 훑을 때 읽은 번호를 뒤에 둔다. 등록 쪽 판독이 실패해도 번호는 남아야 한다 —
            // 번호가 없으면 계산대에서 쓸 수가 없다.
            code: info.code || candidate.code || null,
            code_type: info.codeType || candidate.codeType || null,
            expires_at: info.expiresAt || null,
            // 금액권은 켜지 않는다. 확실하지 않은 판단을 사람 없이 켜면, 쓸 때마다
            // 얼마를 썼는지 묻고 잔액이 남아 목록에서 사라지지 않는다.
            is_voucher: false,
            created_by: user.id,
          },
          prepared.storageFiles,
          {
            barcodeCropFile:
              prepared.code && prepared.barcodeCropBlob
                ? new File([prepared.barcodeCropBlob], 'barcode.png', { type: 'image/png' })
                : null,
            thumbCropFile: info.thumbCropBlob
              ? new File([info.thumbCropBlob], 'thumb.jpg', { type: 'image/jpeg' })
              : null,
          }
        );
        done.push(saved);
      } catch (err) {
        // 하나가 실패해도 나머지는 계속 넣는다. 여기서 멈추면 이미 넣은 것과 못 넣은 것이
        // 섞인 채로 화면만 사라진다.
        failed.push({ candidate, message: err?.message || '' });
      }
    }

    setSaving(null);
    setResult({ done: done.length, failed: failed.length, noName, noExpiry });
    setStage('registered');
    // 목록을 다시 읽게 한다. 방금 넣은 것이 뒤에 보여야 한다.
    if (done.length > 0) onRegistered?.();
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>기프티콘 찾기</SheetTitle>
        </SheetHeader>

        {/* 어디까지 보는지는 결과보다 먼저 알아야 한다. 아래에 뒀을 때는 "왜 예전 사진이
            안 나오지"를 다 훑고 나서야 알게 됐고, 찾은 것이 많으면 목록에 밀려 화면 밖으로
            나갔다. 제목 바로 아래가 그 자리다.
            기준 시각은 훑기가 끝나야 알 수 있어서, 그 전에는 이 줄이 없다. */}
        {complete && formatDay(since) && (
          <div className="mx-5 mt-2 flex gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="m-0 flex-1 text-sm leading-relaxed break-keep text-muted-foreground">
              <b className="font-semibold text-foreground">{formatDay(since)} 0시</b> 이후 사진만 봐요.
              <br />
              이전 사진은 + 로 올려주세요.
            </p>
          </div>
        )}

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

          {stage === 'registering' && (
            <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                <span className="flex-1 text-base font-semibold text-foreground">
                  등록하는 중이에요{saving ? ` (${saving.current}/${saving.total})` : ''}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: saving ? `${Math.round((saving.current / saving.total) * 100)}%` : '10%' }}
                />
              </div>
              {/* 여기서는 멈출 수 없다. 중간에 끊으면 넣은 것과 안 넣은 것이 섞여서,
                  무엇이 들어갔는지 확인할 방법이 사라진다. 대신 무엇을 하는 중인지 적는다. */}
              <p className="m-0 text-sm text-muted-foreground">사진에서 정보를 읽고 있어요</p>
            </div>
          )}

          {stage === 'registered' && result && (
            <>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="m-0 text-lg font-semibold text-foreground">{result.done}개 등록했어요</p>
                {/* 자동으로 채운 것 중 비어 있는 자리를 짚어준다. 등록은 됐으니 급한 일은
                    아니지만, 말해주지 않으면 빠진 줄 모르고 지나간다. 특히 유효기한은
                    비어 있으면 만료 전에 알려줄 수가 없다. */}
                {(result.noExpiry > 0 || result.noName > 0) && (
                  <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
                    {result.noExpiry > 0 && `유효기한을 못 읽은 게 ${result.noExpiry}개 있어요.`}
                    {result.noExpiry > 0 && result.noName > 0 && <br />}
                    {result.noName > 0 && `상품명을 못 읽은 게 ${result.noName}개 있어요.`}
                    <br />
                    목록에서 수정으로 채워주세요.
                  </p>
                )}
                {result.failed > 0 && (
                  <p className="m-0 text-base break-keep text-destructive">
                    {result.failed}개는 등록하지 못했어요. + 로 직접 올려주세요.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" className="w-full rounded-xl" onClick={onClose}>
                  목록으로
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full rounded-xl"
                  onClick={() => start()}
                >
                  <ScanSearch className="size-4.5" />
                  새 기프티콘 찾기
                </Button>
              </div>
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
<b className="font-semibold">{candidates.length}개</b> 찾았어요.
                  </p>

                  {/* 받은 사람만 미리 고른다. 사진에 적혀 있지 않아 모델이 알 수 없고,
                      가족이 함께 쓰는 앱이라 누구 것인지가 목록의 뼈대다. 나중에
                      건건이 들어가 고치는 편이 훨씬 번거롭다. */}
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-base text-muted-foreground">받은 사람</span>
                    <Select value={owner} onValueChange={setOwner}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {membersWithMeFirst(members, myName).map((member) => (
                          <SelectItem key={member.id ?? member.display_name} value={member.display_name}>
                            {member.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                            /* 아닌 것을 치우면 다음부터 다시 묻지 않는다. 안 그러면 갤러리에
                               남아 있는 한 훑을 때마다 같은 사진이 계속 올라온다.
                               건별 등록 버튼은 뺐다. 남은 것을 아래에서 한 번에 넣는다. */
                            <button
                              type="button"
                              onClick={() => handleDismiss(candidate)}
                              aria-label="기프티콘 아님"
                              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground"
                            >
                              <X className="size-4.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
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
                {keptCount > 0 && (
                  <Button type="button" size="lg" className="w-full rounded-xl" onClick={registerAll}>
                    <Check className="size-4.5" />
                    {keptCount}개 등록
                  </Button>
                )}

                <Button
                  type="button"
                  variant={keptCount > 0 ? 'outline' : 'default'}
                  size="lg"
                  className="w-full rounded-xl"
                  onClick={() => start()}
                >
                  <ScanSearch className="size-4.5" />
                  새 기프티콘 찾기
                </Button>

                {skipped > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="w-full rounded-xl text-muted-foreground"
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
