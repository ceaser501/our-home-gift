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
import { useFamily } from '../FamilyContext';
import useBackClose from '../utils/useBackClose';
import { cn } from '@/lib/utils';

// 갤러리에 받아둔 기프티콘을 찾아 등록까지 이어주는 창.
//
// 이 기능은 어디까지나 거들기 위한 것이다. 권한을 안 줘도, 못 찾아도 앱은 그대로 쓸 수
// 있어야 한다 — 사진을 직접 올리는 길이 늘 열려 있다. 그래서 여기서 무엇이 실패하든
// 막다른 길처럼 보이지 않게, 마지막에는 늘 "직접 올리셔도 돼요"로 끝난다.
//
// ── 두 번 읽는다 ────────────────────────────────────────────────────────────
// 훑기는 바코드만 찾는다(공짜, 빠름). 상품명·금액·유효기한은 모델이 읽는다(돈, 느림).
// 예전에는 두 번째를 등록 창에서 했다. 사용자가 하나를 누르면 그때 읽고, 폼을 채워
// 보여주고, 저장을 누르게 했다.
//
// 그런데 자동으로 찾아달라고 누른 사람에게 그건 일이 늘어난 것이다 — 알아서 해달라고
// 눌렀는데 글자를 또 읽고 있고 입력창이 하나 더 뜬다. 세 개면 세 번 그렇다.
//
// 그래서 읽기를 앞으로 당겼다. 훑기가 끝나면 곧바로 후보들을 읽어서, 목록에 바코드
// 번호가 아니라 상품명과 유효기한을 보여준다. 그러면:
//
//   - 무엇을 등록하는지 보고 누른다. 번호만 보고 누르는 건 눈 감고 누르는 것과 같다.
//   - 못 읽은 것을 미리 안다. 등록을 눌러봐야 아는 게 아니라 목록에서 갈린다.
//   - 금액권을 따로 묶어 보여줄 수 있다. 읽기 전에는 그게 금액권인지 알 수가 없다.
//
// 전체 시간은 같다. 어차피 등록할 때 읽던 것을 앞으로 옮긴 것뿐이다. 다만 치울 것까지
// 읽게 되는데, 후보에 오르는 건 바코드가 읽힌 사진이라 대부분 진짜 기프티콘이다.

const KOREAN_BUCKETS = FOLDERS.map((folder) => folder.label).join(' · ');

// 등록에 반드시 있어야 하는 것.
//
// 번호가 없으면 계산대에서 못 쓰고, 상품명과 상호가 없으면 목록에서 찾아낼 수가 없다.
// 유효기한과 금액은 없어도 쓰는 데 지장이 없어서 여기 넣지 않는다 — 대신 비었다고
// 알려주고, 목록에서 채우게 한다.
function missingFields(info, fallbackCode) {
  const missing = [];
  if (!info?.name) missing.push('상품명');
  if (!info?.brand) missing.push('상호');
  if (!info?.code && !fallbackCode) missing.push('바코드 번호');
  return missing;
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

function formatDate(iso) {
  if (!iso) return null;
  return iso.replaceAll('-', '.');
}

function formatWon(amount) {
  if (amount === null || amount === undefined || amount === '') return null;
  return `${Number(amount).toLocaleString('ko-KR')}원`;
}

export default function GalleryScanSheet({ onRegistered, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family, members, user } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || members[0]?.display_name || '';

  // 화면이 어느 단계인지.
  //   intro       — 무엇을 하는 기능인지 설명하고 권한을 묻기 전
  //   denied      — 권한을 주지 않음
  //   scanning    — 사진에서 바코드를 찾는 중
  //   reading     — 찾아낸 것들의 정보를 읽는 중
  //   done        — 목록을 보여주고 고르게 함
  //   registering — 넣는 중
  //   registered  — 다 넣고 결과
  const [stage, setStage] = useState('intro');
  const [partial, setPartial] = useState(false);
  const [progress, setProgress] = useState(null);
  const [candidates, setCandidates] = useState([]);
  // 이번 창에서 치운 후보. 목록에 흐리게 남겨두고 되돌릴 수 있게 한다.
  const [dismissedIds, setDismissedIds] = useState([]);
  // 이번에는 빼둘 후보. 치우기와 다르다 — 다음에 찾을 때 다시 올라온다.
  const [unpickedIds, setUnpickedIds] = useState([]);
  // 금액권으로 넣을 후보. 판정이 확실하지 않아서 켜는 건 사람이 한다.
  const [voucherIds, setVoucherIds] = useState([]);
  const [scanned, setScanned] = useState(0);
  // 실제로 어느 시각 이후를 봤는지(초). 화면에 적어주기 위한 값이다.
  const [since, setSince] = useState(0);
  // 기기에 실제로 있는 폴더 이름과 장수. 못 찾았을 때 이유를 짚어주기 위한 값이다.
  const [folders, setFolders] = useState([]);
  const [tally, setTally] = useState(null);
  // 끝까지 훑었는지. 중간에 그만뒀으면 "여기까지 봤다"고 적으면 안 된다 —
  // 못 본 사진들이 다음 번에 통째로 건너뛰어진다.
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  // 등록해 넣는 중일 때의 진행 상황과, 다 넣은 뒤의 결과.
  const [saving, setSaving] = useState(null);
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);

  // 창을 닫는 순간 하던 일을 멈춘다. 안 그러면 닫은 뒤에도 계속 읽어서 폰이 더워지고
  // 배터리와 돈만 쓴다.
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
    setUnpickedIds([]);
    setVoucherIds([]);
    setResult(null);
    setProgress({ scanned: 0, total: 0, found: 0 });

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    let found = [];
    try {
      const scan = await scanGallery({
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
      found = scan.candidates;
      setScanned(scan.scanned ?? 0);
      setSince(scan.since ?? 0);
      setFolders(scan.folders ?? []);
      setTally(scan.tally ?? null);
      setComplete(true);
    } catch (err) {
      setError(err?.message || '갤러리를 훑지 못했어요.');
      if (!controller.signal.aborted) {
        setStage('done');
        setProgress(null);
      }
      return;
    }

    await readAll(found, controller);
  }

  /**
   * 찾아낸 것들의 상품명·금액·유효기한을 읽는다.
   *
   * 한 건씩 순서대로 읽고, 읽는 대로 목록에 채워 넣는다. 다 읽을 때까지 기다렸다가
   * 한꺼번에 보여주면 그동안 화면이 비어 있는데, 이 단계가 가장 오래 걸린다.
   */
  async function readAll(found, controller) {
    setStage('reading');
    setCandidates(found);
    setProgress({ scanned: 0, total: found.length, found: found.length });

    for (const [index, candidate] of found.entries()) {
      if (controller.signal.aborted) return;
      setProgress({ scanned: index, total: found.length, found: found.length });

      let read = null;
      try {
        const prepared = await prepareImages(candidateToFiles(candidate));
        const info = await readGifticonInfo(prepared);
        // 모델에게 보낸 base64는 여기서 할 일이 끝났다. 후보마다 들고 있으면 열 개만
        // 되어도 메가바이트 단위로 쌓인다.
        prepared.uploads = null;
        read = { prepared, info, missing: missingFields(info, candidate.code) };
      } catch (err) {
        read = { prepared: null, info: null, missing: ['정보'], readError: err?.message || '' };
      }

      if (controller.signal.aborted) return;
      setCandidates((prev) => prev.map((item) => (item.id === candidate.id ? { ...item, ...read } : item)));
      // 읽어낸 것이 금액권으로 보이면 그 자리에서 켜준다. 확실하지 않으니 끌 수 있게
      // 두되, 열 개 중 여덟이 맞는 판단을 매번 손으로 켜게 하는 것도 일이다.
      if (read.info?.isVoucher && read.info?.amount) {
        setVoucherIds((prev) => (prev.includes(candidate.id) ? prev : [...prev, candidate.id]));
      }
    }

    if (controller.signal.aborted) return;
    setStage('done');
    setProgress(null);
  }

  /**
   * 고른 것을 전부 넣는다.
   *
   * 정보는 이미 읽어뒀다. 여기서는 저장만 하므로 금방 끝난다.
   */
  async function registerAll() {
    const targets = candidates.filter(isPickable).filter((c) => !unpickedIds.includes(c.id));
    if (targets.length === 0) return;

    setStage('registering');
    setError('');
    const done = [];
    const failed = [];
    let noExpiry = 0;

    for (const [index, candidate] of targets.entries()) {
      setSaving({ current: index + 1, total: targets.length });
      const { prepared, info } = candidate;
      try {
        if (!info?.expiresAt) noExpiry += 1;
        const saved = await createGifticon(
          family.id,
          {
            name: info.name,
            category: info.category || '기타',
            brand: info.brand,
            amount: info.amount ?? '',
            // 지금 로그인한 사람 것으로 넣는다. 대신 넣어주는 경우도 그렇게 둔다 —
            // 누가 받았는지보다 누가 쓰는지가 중요하고, 그건 쓸 때 정해진다.
            owner: myName || null,
            // 훑을 때 읽은 번호를 뒤에 둔다. 등록 쪽 판독이 실패해도 번호는 남아야 한다.
            code: info.code || candidate.code,
            code_type: info.codeType || candidate.codeType || null,
            expires_at: info.expiresAt || null,
            is_voucher: voucherIds.includes(candidate.id),
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
        // 하나가 실패해도 나머지는 계속 넣는다. 여기서 멈추면 넣은 것과 못 넣은 것이
        // 섞인 채로 화면만 사라진다.
        failed.push({ candidate, reason: err?.message || '등록하지 못했어요' });
      }
    }

    setSaving(null);
    // 못 읽어서 애초에 넣을 수 없던 것도 함께 적는다. 목록에서 이미 보여줬지만,
    // 결과 화면만 보고 닫는 사람에게는 여기가 마지막 기회다.
    const unreadable = candidates
      .filter((c) => !dismissedIds.includes(c.id) && !isPickable(c))
      .map((c) => ({
        candidate: c,
        reason: c.missing?.length > 0 ? `${c.missing.join('·')}을 못 읽었어요` : '정보를 읽지 못했어요',
      }));
    setResult({ done: done.length, failed: [...unreadable, ...failed], noExpiry });
    setStage('registered');
    // 목록을 다시 읽게 한다. 방금 넣은 것이 뒤에 보여야 한다.
    if (done.length > 0) onRegistered?.();
  }

  // 치우지 않았고, 읽기가 끝났고, 빠진 게 없는 것만 넣을 수 있다.
  function isPickable(candidate) {
    return !dismissedIds.includes(candidate.id) && candidate.info && candidate.missing?.length === 0;
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

  function togglePick(candidate) {
    setUnpickedIds((prev) =>
      prev.includes(candidate.id) ? prev.filter((id) => id !== candidate.id) : [...prev, candidate.id]
    );
  }

  function toggleVoucher(candidate) {
    setVoucherIds((prev) =>
      prev.includes(candidate.id) ? prev.filter((id) => id !== candidate.id) : [...prev, candidate.id]
    );
  }

  const summary = summarizeFolders(folders);
  // 지금까지 건너뛰기로 감춰둔 사진 수. 훑기가 끝난 뒤에만 쓰므로 그때 세면 된다.
  const skipped = complete ? countSkipped() : 0;

  const alive = candidates.filter((candidate) => !dismissedIds.includes(candidate.id));
  // 금액권은 따로 묶는다. 확인할 것이 하나 더 있는 무리라, 섞여 있으면 그 하나를
  // 매번 찾아내야 한다. 나눠 두면 위는 그냥 넘기고 아래만 보면 된다.
  const vouchers = alive.filter((c) => isPickable(c) && voucherIds.includes(c.id));
  const plains = alive.filter((c) => isPickable(c) && !voucherIds.includes(c.id));
  // 못 읽은 것과, 읽기를 중간에 그만둬서 아직 못 읽은 것. 둘 다 지금은 넣을 수 없다.
  // isPickable로 한 번에 가른다 — 어느 쪽도 목록에서 조용히 사라지면 안 된다.
  const unreadable = alive.filter((c) => !isPickable(c));
  const dismissed = candidates.filter((candidate) => dismissedIds.includes(candidate.id));
  const keptCount = alive.filter((c) => isPickable(c) && !unpickedIds.includes(c.id)).length;

  // 훑기 결과. 접어둔다 — 찾은 것이 여러 개면 위쪽 목록만으로 화면이 꽉 차는데, 그 아래
  // 표까지 펼쳐져 있으면 정작 눌러야 할 등록 버튼이 밀린다. 궁금할 때 여는 자리다.
  //
  // 세는 단위를 섞지 않는다. 사진 수는 사진첩 줄에서만 말하고, 그 아래는 기프티콘 수만
  // 말한다. '확인한 사진 4장 / 이미 등록됨 3장'을 나란히 뒀더니 아래 숫자가 기프티콘
  // 세 개로 읽혔다.
  const panelBody = tally ? (
    <details className="group rounded-xl bg-muted/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground">
        상세내역
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="flex flex-col gap-2.5 px-4 pb-3.5">
        {/* 사진첩 이름과 장수를 한 덩어리로 묶어 보여준다 — 줄글로 늘어놓으면
            '다운로드 1 카카오톡 1'에서 1이 어디에 붙는지 한 번 더 읽어야 한다.
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
              <span key={folder.label} className="rounded-lg bg-card px-2.5 py-1 text-sm text-foreground">
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
   * 후보 한 줄.
   *
   * 왼쪽 체크와 오른쪽 X는 하는 일이 다르다. 여기서 끄면 이번만 빼는 것이고 다음에
   * 찾을 때 다시 올라온다. X는 기프티콘이 아니라는 뜻이라 다시 묻지 않는다.
   * 그래서 자리도 왼쪽·오른쪽으로 갈라 뒀다.
   */
  function renderCandidate(candidate, { voucher = false } = {}) {
    const isDismissed = dismissedIds.includes(candidate.id);
    const picked = !unpickedIds.includes(candidate.id);
    const info = candidate.info;
    const broken = !isDismissed && !isPickable(candidate);

    return (
      <li
        key={candidate.id}
        className={cn(
          'flex flex-col gap-2 rounded-xl border border-border bg-background p-2.5',
          (isDismissed || broken) && 'opacity-60'
        )}
      >
        <div className="flex items-center gap-2.5">
          {!isDismissed && !broken && (
            <input
              type="checkbox"
              checked={picked}
              onChange={() => togglePick(candidate)}
              aria-label="이번에 등록"
              className="size-5 shrink-0 accent-primary"
            />
          )}
          <img
            src={`data:image/jpeg;base64,${candidate.images[0]}`}
            alt=""
            className="size-16 shrink-0 rounded-lg bg-black object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {broken ? (
              <>
                <span className="truncate text-base font-semibold text-foreground">
                  {info?.name || info?.brand || '못 읽었어요'}
                </span>
                <span className="text-sm break-keep text-muted-foreground">
                  {candidate.missing?.length > 0
                    ? `${candidate.missing.join('·')}을 못 읽었어요`
                    : '정보를 읽지 못했어요'}
                </span>
              </>
            ) : (
              <>
                <span className="truncate text-base font-semibold text-foreground">
                  {info?.name || candidate.bucket}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {[info?.brand, formatWon(info?.amount), formatDate(info?.expiresAt)]
                    .filter(Boolean)
                    .join(' · ') || candidate.code}
                </span>
              </>
            )}
          </div>
          {isDismissed ? (
            <button
              type="button"
              onClick={() => handleUndismiss(candidate)}
              className="shrink-0 px-2 py-1 text-sm font-semibold text-primary underline"
            >
              되돌리기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleDismiss(candidate)}
              aria-label="기프티콘 아님"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
            >
              <X className="size-4.5" />
            </button>
          )}
        </div>

        {/* 금액권 여부는 사람이 정한다. 사진의 글자로 짐작하는 것이라 확실할 수가 없는데,
            틀렸을 때의 결과가 한쪽으로 치우친다 — 교환권을 금액권으로 켜두면 쓸 때마다
            얼마를 썼는지 묻고 잔액이 남아 목록에서 사라지지 않는다. 반대로 꺼두면 잔액을
            못 따라갈 뿐 쓰는 데는 지장이 없다. */}
        {voucher && !isDismissed && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-2">
            <input
              type="checkbox"
              checked={voucherIds.includes(candidate.id)}
              onChange={() => toggleVoucher(candidate)}
              className="size-4.5 shrink-0 accent-primary"
            />
            <span className="text-sm break-keep text-foreground">금액권 — 쓴 만큼 깎여요</span>
          </label>
        )}
      </li>
    );
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
        {complete && formatDay(since) && stage === 'done' && (
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
                <b className="font-semibold text-foreground">{KOREAN_BUCKETS}</b> 폴더에서 새 기프티콘을
                찾아드려요.
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
                사진을 볼 수 없어요. 그래도 <b className="font-semibold text-foreground">+ 로 직접 올리면</b>{' '}
                정보는 자동으로 채워드려요.
              </p>
              <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
                설정 → 애플리케이션 → 모아콘 → 권한 → 사진에서 허용할 수 있어요.
              </p>
              <Button type="button" variant="outline" size="lg" className="w-full rounded-xl" onClick={onClose}>
                닫기
              </Button>
            </>
          )}

          {(stage === 'scanning' || stage === 'reading') && (
            <>
              <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  <span className="flex-1 text-base font-semibold text-foreground">
                    {stage === 'scanning' ? '찾는 중이에요' : '정보를 읽는 중이에요'}
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
                <p className="m-0 text-sm text-muted-foreground">
                  {stage === 'scanning'
                    ? progress?.found
                      ? `${progress.found}개 찾았어요`
                      : '잠시만요'
                    : '상품명과 유효기한을 읽고 있어요'}
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
                그만하기
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
            </div>
          )}

          {stage === 'registered' && result && (
            <>
              <div className="flex flex-col items-center gap-2 pt-4 pb-2 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="m-0 text-lg font-semibold text-foreground">
                  {result.done > 0 ? `${result.done}개 등록했어요` : '등록한 게 없어요'}
                </p>
                {/* 유효기한은 없어도 넣는다. 대신 비었다는 걸 알려준다 — 말해주지 않으면
                    빠진 줄 모르고 지나가고, 그러면 만료 전에 알려줄 수가 없다. */}
                {result.noExpiry > 0 && (
                  <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
                    유효기한이 빈 게 {result.noExpiry}개 있어요.
                    <br />
                    목록에서 수정으로 채워주세요.
                  </p>
                )}
              </div>

              {/* 못 넣은 것을 하나씩 적는다. 개수만 적으면 어느 것이 빠졌는지 알 수 없고,
                  아예 말하지 않으면 다 들어간 줄 안다. 이 앱은 기프티콘을 놓치지 않겠다는
                  약속으로 서 있다. */}
              {result.failed.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3">
                  <p className="m-0 text-base font-semibold text-foreground">
                    {result.failed.length}개는 등록하지 못했어요
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {result.failed.map(({ candidate, reason }) => (
                      <li key={candidate.id} className="flex items-center gap-2.5">
                        <img
                          src={`data:image/jpeg;base64,${candidate.images[0]}`}
                          alt=""
                          className="size-10 shrink-0 rounded-lg bg-black object-cover"
                        />
                        <span className="flex-1 text-sm break-keep text-foreground">{reason}</span>
                      </li>
                    ))}
                  </ul>
                  {/* 다음에도 올라온다는 걸 못 박아둔다. 여기서 사라졌다고 생각하면
                      그 기프티콘은 영영 안 들어간다. */}
                  <p className="m-0 border-t border-warning/30 pt-2.5 text-sm break-keep text-muted-foreground">
                    다음에 찾을 때 다시 보여드려요. + 로 직접 올려도 돼요.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" className="w-full rounded-xl" onClick={onClose}>
                  목록으로
                </Button>
                <Button type="button" variant="outline" size="lg" className="w-full rounded-xl" onClick={() => start()}>
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
                <p className="m-0 rounded-xl bg-warning/10 px-3.5 py-3 text-sm leading-relaxed break-keep text-muted-foreground">
                  <b className="font-semibold text-foreground">선택한 사진만 허용</b>이라 고르신 사진에서만
                  찾았어요. 설정에서 &lsquo;모두 허용&rsquo;으로 바꿀 수 있어요.
                </p>
              )}

              {error && <p className="m-0 text-sm text-destructive">{error}</p>}

              {alive.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ImageOff className="size-8 text-muted-foreground" />
                  <p className="m-0 text-base font-semibold text-foreground">
                    {scanned === 0 ? '새로 담긴 사진이 없어요' : '등록할 기프티콘이 없어요'}
                  </p>
                  <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
                    {scanned === 0 ? '+ 로 직접 올려주세요.' : `사진 ${scanned}장을 봤어요. + 로 직접 올려주세요.`}
                  </p>
                </div>
              ) : (
                <>
                  {plains.length > 0 && (
                    <>
                      <p className="m-0 text-base break-keep text-foreground">
                        <b className="font-semibold">{plains.length}개</b> 찾았어요.
                      </p>
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {plains.map((candidate) => renderCandidate(candidate))}
                      </ul>
                    </>
                  )}

                  {/* 금액권은 아래에 따로 묶는다. 확인할 것이 하나 더 있는 무리라, 위에
                      섞여 있으면 그 하나를 매번 찾아내야 한다. 나눠 두면 위는 그냥 넘기고
                      아래만 보면 된다. */}
                  {vouchers.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-border pt-4">
                      <p className="m-0 text-base break-keep text-foreground">
                        <b className="font-semibold">금액권 {vouchers.length}개</b> 같아요. 맞는지 봐주세요.
                      </p>
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {vouchers.map((candidate) => renderCandidate(candidate, { voucher: true }))}
                      </ul>
                    </div>
                  )}

                  {/* 못 읽은 것. 등록할 수 없으니 체크도 없다. 목록에서 미리 보여주는 건
                      등록을 눌러봐야 아는 것보다 낫기 때문이다. */}
                  {unreadable.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-border pt-4">
                      <p className="m-0 text-base break-keep text-foreground">
                        <b className="font-semibold">{unreadable.length}개</b>는 정보를 못 읽었어요. + 로 직접
                        올려주세요.
                      </p>
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {unreadable.map((candidate) => renderCandidate(candidate))}
                      </ul>
                    </div>
                  )}

                  {dismissed.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {dismissed.map((candidate) => renderCandidate(candidate))}
                    </ul>
                  )}
                </>
              )}

              {panelBody}

              {/* 두 버튼의 차이를 이름에 담는다. 둘 다 설치일 0시부터 보되, 위는 아직
                  확인하지 않은 것만, 아래는 아니라고 봤던 것까지 전부 본다.
                  '새 기프티콘' ↔ '전부'가 나란히 놓여 설명 없이 갈린다.

                  예전 이름은 '건너뛴 사진 …'이었는데, 앱이 스스로 무언가를 건너뛰었다고
                  말하는 셈이라 "뭘 놓친 거지" 하는 의심을 만들었다. 이 앱의 약속은
                  놓치지 않는 것이고, 실제로 놓친 게 아니라 아니라고 판단한 것이다. */}
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
