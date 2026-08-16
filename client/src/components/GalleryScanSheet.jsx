import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  ImageOff,
  ImagePlus,
  Images,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  ScanSearch,
  X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  deepScan,
  groupImages,
} from '../utils/gallery';
import { createGifticon, findGifticonByCode, removeImages, uploadGifticonImages } from '../api';
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
//
// ── 읽기를 다시 앞으로 당겼다 ────────────────────────────────────────────────
// 그렇게 옮겨놓고도 첫 결과까지 6초가 넘게 걸렸다. 읽기가 훑기를 통째로 기다렸기
// 때문이다 — 어느 사진을 보낼지가 다 훑어야 정해졌다.
//
// 그런데 그게 모든 사진에 해당하지는 않는다. 카카오톡·다운로드에서 나온 것은 발행사가
// 만든 그림 자체라, 같은 기프티콘의 더 나은 사진이 뒤에 나올 수 없다. 그런 건 찾는
// 즉시 보낸다. 캡처만 다 훑을 때까지 기다린다 — 원본이 뒤에 오는 일이 실제로 있었고,
// 일찍 보내면 유효기간 없는 그림을 읽히게 된다.
//
// 사고가 나는 경우만 골라서 기다리는 셈이라 읽어내는 값은 예전과 같다. 판단은 훑기
// 쪽에 있다(client/src/utils/gallery.js의 canReadEarly). 여기서는 readyNow가 붙어
// 오면 그 자리에서 읽기를 걸 뿐이다.

/**
 * 후보 하나당 한 번씩만 하는 일을, 한 번에 limit개까지 겹쳐서 돌린다.
 *
 * 읽기와 사진 올리기가 각각 하나씩 쓴다. 한 번에 몇 개까지만 도는 것은 폰이 더
 * 바빠져서가 아니라(자바스크립트는 한 줄로 돈다) 서버에 한꺼번에 몰아붙이지 않기
 * 위해서다.
 *
 * 이 물건이 하는 진짜 일은 같은 후보를 두 번 건드리지 않는 것이다. 읽기에서는 훑는
 * 동안 먼저 보낸 것을 다시 읽지 않게 하고 — 그러지 않으면 하루 한도가 두 배로 닳는다 —
 * 올리기에서는 미리 올려둔 것을 등록할 때 또 올리지 않게 한다. 그러면 같은 파일이
 * 두 벌 남는다.
 */
function makePool(limit) {
  const jobs = new Map();
  const results = new Map();
  const waiting = [];
  let active = 0;

  function pump() {
    while (active < limit && waiting.length > 0) {
      active += 1;
      const job = waiting.shift();
      const step = () => {
        active -= 1;
        pump();
      };
      job().then(step, step);
    }
  }

  return {
    results,
    /**
     * 하나를 줄에 세우고, 끝나면 그 값을 주는 약속을 돌려준다.
     * 이미 세운 것이면 하던 것의 약속을 그대로 준다 — 두 번 하지 않는다.
     * 하다가 넘어지면 값 없이 끝난다. 부르는 쪽이 없으면 없는 대로 처리한다.
     */
    add(id, task) {
      const already = jobs.get(id);
      if (already) return already;

      let settle;
      const job = new Promise((resolve) => {
        settle = resolve;
      });
      jobs.set(id, job);

      waiting.push(async () => {
        let value;
        try {
          value = await task();
          results.set(id, value);
        } finally {
          settle(value);
        }
      });
      pump();
      return job;
    },
    /** 지금까지 세운 것이 다 끝날 때까지 기다린다. */
    settled: () => Promise.all([...jobs.values()]),
  };
}

const KOREAN_BUCKETS = FOLDERS.map((folder) => folder.label).join(' · ');

// 첫 결과가 나오기 전에 한 줄씩 돌려 보여주는 안내.
//
// 이 자리에서 사용자가 기다리는 시간은 4초 안팎이다. 그 사이 화면에는 자리만 잡아둔
// 빈 칸 하나뿐인데, 하필 그때가 "얘가 내 사진첩을 통째로 들여다보는 건가" 하는 생각이
// 드는 자리다. 사진 권한은 사람들이 가장 망설이는 권한이고, 그 망설임은 허용을 누른
// 뒤에도 사라지지 않는다.
//
// 그래서 비어 있는 그 시간에 무엇을 보고 무엇을 안 보내는지 말한다. 기다림을 메우는
// 것이 아니라, 기다리는 동안이 이 말을 할 수 있는 유일한 자리라서 여기 둔다.
// 순서는 안심시키는 힘이 큰 것부터다 — 두어 개밖에 못 보고 지나가기 때문이다.
//
// 다 사실이어야 한다. 여기 적힌 것과 실제로 하는 일이 다르면, 안심시키려던 말이
// 거짓말이 된다. 각 줄이 어느 코드에 기대고 있는지 옆에 적어둔다.
//
// 처음에는 다섯 줄이었다. 줄여서 셋이다 — 어차피 두 줄쯤 읽고 지나가는 자리라,
// 다섯을 두면 무엇이 중요한지가 흐려진다. 남긴 셋은 '어디를 보는가 / 나머지는
// 어떻게 되는가 / 언제부터인가'로, 사진 권한을 망설이게 하는 물음 그 자체다.
const HINTS = [
  // FOLDERS — 이 셋 말고는 listImages에 넘기지도 않는다.
  { icon: Images, text: `사진첩은 ${KOREAN_BUCKETS}, 이 세 곳만 봐요` },
  // collect() — 바코드가 읽힌 것만 후보가 되고, 서버로는 그 후보만 간다.
  // 나머지는 폰 안에서 걸러져 NO_BARCODE로만 남는다(사진이 아니라 id만).
  //
  // "찾지도 않아요"라고 적었다가 고쳤다. 앱은 저 세 폴더의 사진을 폰 안에서 한 장씩
  // 열어 바코드가 있는지 본다 — 안 보는 것이 아니다. 사실이 아닌 말로 안심시키면
  // 그건 안심이 아니라 속인 것이 된다. 지금 문구는 실제로 하는 일과 정확히 같고,
  // 사람들이 진짜 걱정하는 것("내 사진이 어디로 가나")에도 더 곧바로 답한다.
  { icon: EyeOff, text: '기프티콘이 아닌 사진은 폰 밖으로 나가지도 저장되지도 않아요' },
  // listImages({ since: '0' }) — 네이티브가 설치일 0시를 바닥으로 삼는다.
  { icon: CalendarClock, text: '앱을 설치한 날 이후에 담긴 사진만 봐요' },
];

// 한 줄이 머무는 시간. 짧으면 읽기 전에 넘어가고, 길면 두 번째 줄을 못 보고 끝난다.
// 첫 결과까지 4초 안팎이라 이 정도면 두 줄은 읽고 지나간다.
const HINT_MS = 2600;

// 한 번에 몇 건씩 읽을지.
//
// 처음에는 한 건씩 차례로 읽었다. 그런데 이 단계에서 걸리는 시간은 거의 다 서버를
// 다녀오는 시간이라(모델이 그림을 보는 데 4초 안팎), 줄을 세우면 개수만큼 그대로
// 곱해진다. 세 개를 찾으면 세 배를 기다린다. 실제로 "너무 느리다"가 여기서 나왔다.
//
// 다섯으로 뒀더니 여섯 개를 찾은 날 7.7초가 걸렸다. 다섯이 한 물결, 남은 하나가 또 한
// 물결이라 두 배가 된 것이다. 하나 때문에 두 배를 기다리는 셈이었다.
//
// 올려도 폰이 더 바빠지지는 않는다. 자바스크립트는 한 줄로 돌아서, 사진을 줄이고
// 압축하는 일은 동시성과 무관하게 차례대로 실행된다. 겹쳐지는 건 서버를 기다리는
// 시간뿐이다. 한 번 훑어 나오는 수는 대개 여덟 안쪽이라, 여기까지면 한 물결에 담긴다.
const READ_CONCURRENCY = 8;

// 한 번에 몇 건씩 넣을지.
//
// 사진은 대개 미리 올라가 있어서 여기서는 줄 하나를 넣는 일만 남는다. 그래도 하나씩
// 하면 개수만큼 왕복이 곱해진다 — 여섯 개면 여섯 번 다녀온다.
//
// 읽기(8)보다 낮게 둔다. 미처 못 올린 건이 섞여 있으면 여기서 사진까지 올리게 되는데,
// 그때 여덟 건이 한꺼번에 달려들면 폰의 좁은 업로드를 서로 밀어낸다.
const SAVE_CONCURRENCY = 3;

// 찾기가 전체 진행에서 차지하는 몫(%).
//
// 사용자에게 이건 한 가지 일이다 — "갤러리에서 기프티콘을 가져와줘". 그걸 두 막대로
// 나눠 보여줬더니 숫자가 18/20에서 0/6으로 되돌아갔고, 다 온 줄 알았다가 처음부터
// 다시 시작하는 것처럼 보였다. 실제로는 이어서 하는 일이다.
//
// 막대 하나가 끝까지 간다. 재보니 찾기 2.5초 · 읽기 5.5초라 대략 이 비율이다.
const SCAN_SHARE = 30;

// 등록에 반드시 있어야 하는 것.
//
// 번호가 없으면 계산대에서 못 쓰고, 상품명과 상호가 없으면 목록에서 찾아낼 수가 없다.
// 유효기한과 금액은 없어도 쓰는 데 지장이 없어서 여기 넣지 않는다 — 대신 비었다고
// 알려주고, 목록에서 채우게 한다.
// 받침이 있으면 '을', 없으면 '를'. '상호을 못 읽었어요'가 나오고 있었다.
function withParticle(word) {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}을`;
  return (last - 0xac00) % 28 === 0 ? `${word}를` : `${word}을`;
}

/**
 * 이 후보를 왜 넣을 수 없는지.
 *
 * 예전에는 무슨 일이 있었든 '정보를 못 읽었어요' 하나로 뭉갰다. 그런데 이 자리에 오는
 * 이유는 둘이고, 사람이 할 일이 서로 다르다.
 *
 *   빠진 칸이 있다  — 사진에 안 적혀 있거나 흐린 것이다. 직접 올려서 채우면 된다.
 *   읽다가 막혔다   — 하루 한도를 다 썼거나 인터넷이 끊긴 것이다. 나중에 다시 하면 된다.
 *
 * 둘을 같은 말로 덮으면 뒤쪽은 영영 안 보인다. 실제로 하루 한도 메시지가 그렇게 묻혔다.
 */
// 빠진 칸의 이름과, 그 값이 info에서 어느 열쇠에 들어 있는지.
// missingFields가 만드는 이름과 같아야 한다 — 갈라지면 칸이 안 뜬다.
const FIELD_KEYS = { 상품명: 'name', 상호: 'brand', '바코드 번호': 'code' };
const FIELD_HINTS = {
  상품명: '예: 아이스 아메리카노 T',
  상호: '예: 스타벅스',
  '바코드 번호': '사진에 인쇄된 숫자',
};

function reasonOf(candidate) {
  if (candidate.readError) return candidate.readError;
  if (candidate.missing?.length > 0) return `${withParticle(candidate.missing.join('·'))} 못 읽었어요`;
  return '아직 읽지 않았어요';
}

/**
 * 훑는 동안 도는 스캐너.
 *
 * 예전에는 진행 막대 하나였다. 그런데 이 화면은 6초 넘게 떠 있고, 그 대부분이 서버를
 * 기다리는 시간이라 막대가 거의 멈춰 있다. 멈춘 막대는 고장 난 것처럼 보인다.
 *
 * 그렇다고 막대를 무한 반복으로 바꾸면 "얼마나 왔는지"를 잃는다. 그래서 나눴다 —
 * 움직임은 이 그림이 맡고, 진행률은 아래 막대와 숫자가 맡는다.
 *
 * 모양은 client/src/index.css의 .moacon-scan-* 에 있다.
 */
function ScannerArt() {
  return (
    <div className="moacon-scan-area" aria-hidden="true">
      <div className="moacon-scanner">
        <div className="moacon-paper-back" />
        <div className="moacon-paper-mid" />
        <div className="moacon-paper">
          <div className="moacon-p-line a" />
          <div className="moacon-p-line b" />
          <div className="moacon-p-code" />
          <div className="moacon-p-sweep" />
        </div>
        <div className="moacon-frame">
          <div className="moacon-bracket tl" />
          <div className="moacon-bracket tr" />
          <div className="moacon-bracket bl" />
          <div className="moacon-bracket br" />
        </div>
      </div>
    </div>
  );
}

/**
 * 아직 아무것도 못 읽었을 때 자리만 잡아두는 카드.
 *
 * 첫 결과까지 4초 안팎이 걸린다. 그동안 목록이 비어 있으면 아무 일도 안 일어나는
 * 것처럼 보인다. 들어올 줄과 같은 높이·같은 자리라, 값이 채워질 때 자리가 흔들리지
 * 않는다.
 *
 * 안내는 이 안에 겹쳐 띄운다. 따로 한 칸을 두면 화면에 회색 상자가 둘이 되는데,
 * 둘 다 "아직 아무것도 없다"는 같은 말을 하고 있어서 자리만 두 배로 먹는다.
 * 비어 있는 칸이 곧 할 말이 있는 자리다.
 *
 * 넘기는 방식은 겹쳐 띄우고 투명도만 바꾸는 것이다. 지우고 새로 붙이면 한 줄이
 * 사라진 뒤에 다음 줄이 들어와서 중간이 비고, 그게 툭툭 끊겨 보인다. 세 줄을 모두
 * 같은 자리에 포개두면 하나가 옅어지는 동안 다른 하나가 짙어져 끊기는 데가 없다.
 */
function CandidateSlot({ at, hints = true }) {
  return (
    <li className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-card p-3">
      {/* 들어올 카드의 뼈대. 안내에 자리를 내주느라 옅게 깔아둔다 — 무엇이 들어올
          자리인지는 보이되, 읽어야 할 글자와 다투지는 않아야 한다. */}
      <span className="size-14 shrink-0 animate-pulse rounded-lg bg-secondary opacity-40" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 opacity-40">
        <span className="h-2.5 w-16 animate-pulse rounded bg-secondary" />
        <span className="h-4 w-3/4 animate-pulse rounded bg-secondary" />
        <span className="h-3 w-2/5 animate-pulse rounded bg-secondary" />
      </div>

      {/* 안내멘트는 사진첩을 훑을 때의 이야기다(어느 폴더를 보는지, 언제 이후를 보는지).
          받아 온 사진에는 해당이 없어서, 그때는 뼈대만 옅게 둔다. */}
      <div className={cn('absolute inset-0 flex items-center px-3.5', !hints && 'hidden')}>
        {HINTS.map((item, i) => {
          const Icon = item.icon;
          const on = i === at % HINTS.length;
          return (
            <span
              key={item.text}
              aria-hidden={!on}
              className={cn(
                'absolute inset-x-3.5 flex items-center gap-2.5 transition-all duration-500 ease-out',
                on ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
              )}
            >
              <Icon className="size-4 shrink-0 text-primary" />
              <span className="text-sm leading-snug break-keep text-muted-foreground">{item.text}</span>
            </span>
          );
        })}
      </div>
    </li>
  );
}

/**
 * 이 요소를 실제로 스크롤하는 조상을 찾는다.
 *
 * 시트(client/src/components/ui/sheet.jsx)를 짚어서 찾다가 그만뒀다. 어느 요소가
 * 스크롤을 맡는지는 화면 구조가 바뀌면 같이 바뀌는데, 이름으로 짚어두면 바뀐 줄도
 * 모르고 조용히 안 움직인다. 실제로 넘치고 있는 것을 찾는 편이 안 틀린다.
 *
 * 아무것도 못 찾으면 내용이 화면에 다 들어간다는 뜻이라, 내릴 것이 없다.
 */
function scrollerOf(node) {
  let el = node?.parentElement;
  while (el) {
    const overflow = getComputedStyle(el).overflowY;
    if (/(auto|scroll|overlay)/.test(overflow) && el.scrollHeight - el.clientHeight > 1) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * 목록 끝까지 사람이 손으로 내린 것처럼 흘려보낸다.
 *
 * 브라우저의 scrollIntoView({ behavior: 'smooth' })를 쓰다가 그만뒀다. 카드가 들어올
 * 때마다 다시 부르면 앞서 흐르던 것을 끊고 처음부터 새로 시작한다. 0.4초마다 한 장씩
 * 들어오는 화면에서는 그게 툭툭 끊기는 움직임이 된다.
 *
 * 여기서는 늘 지금 있는 자리에서 새 목적지로 이어 간다. 중간에 몇 번을 다시 불러도
 * 자리가 끊기지 않아서 한 번의 흐름으로 보인다.
 *
 * 시간은 거리에 맞춘다. 짧은 거리를 오래 끌면 늘어져 보이고, 먼 거리를 짧게 지나가면
 * 튕긴 것처럼 보인다.
 */
function glideToEnd(box, state) {
  const target = Math.max(0, box.scrollHeight - box.clientHeight);
  const from = box.scrollTop;
  const distance = target - from;
  cancelAnimationFrame(state.raf);
  if (Math.abs(distance) < 2) return;

  // 움직임을 줄여달라고 설정해둔 사람에게는 흐르지 않고 바로 옮긴다.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    box.scrollTop = target;
    return;
  }

  const ms = Math.min(700, Math.max(280, Math.abs(distance) * 1.6));
  const startedAt = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startedAt) / ms);
    // 시작과 끝이 다 느린 곡선. 한쪽만 느리면 출발이나 도착 중 하나가 툭 끊긴다.
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    box.scrollTop = from + distance * eased;
    if (t < 1) state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
}

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

// files를 주면 사진첩을 훑는 대신 그 사진들을 묶는다. 그 뒤는 완전히 같은 길이다 —
// 후보를 읽히고, 목록을 보여주고, 한꺼번에 넣는다.
//
// 화면을 둘로 나누지 않은 이유가 있다. 아이폰에서는 사진첩을 훑을 수 없어서
// (isGalleryScanSupported) 직접 고르는 이 길이 유일한 다건 경로가 된다. 둘이 다른
// 화면이면 안드로이드 사용자와 아이폰 사용자가 서로 다른 것을 배워야 하고, 우리도 같은
// 것을 두 벌 고쳐야 한다.
export default function GalleryScanSheet({ onRegistered, onClose, files = null }) {
  // 사진을 받아 온 판인가. 훑기와 갈리는 자리가 여럿이라 이름을 붙여둔다.
  const picked = Array.isArray(files) && files.length > 0;
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
  // 지금 펼쳐서 고치는 중인 후보. 한 번에 하나만 연다 — 여럿을 펼쳐두면 어느 칸이
  // 어느 기프티콘 것인지 헷갈린다.
  const [editingId, setEditingId] = useState(null);
  // 다시 읽는 중인 후보.
  const [retryingId, setRetryingId] = useState(null);
  // 이번 창에서 치운 후보. 목록에 흐리게 남겨두고 되돌릴 수 있게 한다.
  const [dismissedIds, setDismissedIds] = useState([]);
  // 금액권으로 넣을 후보. 판정이 확실하지 않아서 켜는 건 사람이 한다.
  const [voucherIds, setVoucherIds] = useState([]);
  const [scanned, setScanned] = useState(0);
  // 실제로 어느 시각 이후를 봤는지(초). 화면에 적어주기 위한 값이다.
  const [since, setSince] = useState(0);
  // 기기에 실제로 있는 폴더 이름과 장수. 못 찾았을 때 이유를 짚어주기 위한 값이다.
  const [folders, setFolders] = useState([]);
  const [tally, setTally] = useState(null);
  // 지금 보여주고 있는 안내 줄. 계속 커지고, 쓸 때 나머지로 돌린다.
  const [hint, setHint] = useState(0);
  // 읽는 동안의 막대 길이(%).
  //
  // 끝난 개수로 그리면 0에 붙어 있다가 한꺼번에 뛴다 — 여덟을 함께 보내니 아무것도 안
  // 끝나다가 거의 같이 끝나기 때문이다. 거짓말은 아니지만 보는 사람에게는 멈춘 것으로
  // 읽힌다. 그래서 걸릴 만한 시간에 맞춰 천천히 밀어놓고, 실제로 끝나면 끝까지 채운다.
  const [readBar, setReadBar] = useState(0);
  const [readBarMs, setReadBarMs] = useState(0);
  // 결과를 보여준 뒤에도 뒤에서 도는 정밀 탐색. 도는 중인지와, 거기서 걸린 시간.
  const [digging, setDigging] = useState(false);
  // 끝까지 훑었는지. 중간에 그만뒀으면 "여기까지 봤다"고 적으면 안 된다 —
  // 못 본 사진들이 다음 번에 통째로 건너뛰어진다.
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  // 등록해 넣는 중일 때의 진행 상황과, 다 넣은 뒤의 결과.
  const [saving, setSaving] = useState(null);
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);
  // 얕은 판에서 잡은 후보. 깊은 판이 같은 번호를 또 만들지 않게 넘겨준다.
  const found0Ref = useRef([]);
  // 이번 훑기의 읽기 일꾼들. 훑는 중에 먼저 보낸 것과 나중 한 판이 같은 줄을 쓴다.
  const poolRef = useRef(null);
  // 사진을 미리 올려두는 일꾼들. 목록이 다 뜬 뒤부터 돈다.
  const uploadRef = useRef(null);
  // 미리 올려둔 것 중 실제로 등록에 쓰인 것. 나머지는 창을 닫을 때 지운다.
  const spentRef = useRef(new Set());
  // 읽기 진행률. 훑는 중에 이미 끝난 건이 있어서 0에서 시작하지 않는다.
  const readTallyRef = useRef({ done: 0, total: 0 });
  // 읽기가 끝난 순번. 목록에 쌓이는 차례가 된다.
  const readSeqRef = useRef(0);
  // 목록이 들어 있는 칸. 여기 높이가 바뀌는 것을 듣고 화면을 따라 내린다.
  const contentRef = useRef(null);
  // 흐르고 있는 스크롤. 다시 부를 때 앞의 것을 멈추고 이어 가기 위해 들고 있는다.
  const glideRef = useRef({ raf: 0 });
  // 화면을 바닥에 붙여 따라갈지. 손으로 위를 보러 올라가면 꺼진다.
  const stickyRef = useRef(true);
  // 이 시각까지는 바닥에 붙이지 않는다. 마지막에 흘려 내리는 동안 그것을 앞질러
  // 순간이동시켜 버리는 것을 막는다.
  const settleUntilRef = useRef(0);

  // 창을 닫는 순간 하던 일을 멈춘다. 안 그러면 닫은 뒤에도 계속 읽어서 폰이 더워지고
  // 배터리와 돈만 쓴다.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      // 미리 올려두고 등록하지 않은 사진을 지운다. 여기서 놓치면 아무 줄도 가리키지
      // 않는 파일이 남는다.
      sweepUploads();
    };
    // sweepUploads는 매번 새로 만들어지는 함수지만, 여기서는 창을 닫을 때 한 번만
    // 부르면 되고 필요한 것은 전부 ref에 들어 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 이미 권한이 있으면 설명 화면을 건너뛰고 바로 훑는다. 두 번째부터는 사용자가
  // 무엇을 하는 기능인지 이미 알고 있어서, 한 번 더 누르게 할 이유가 없다.
  //
  // 사진을 받아 온 판은 물어볼 것이 없다. 사용자가 이미 고르는 화면을 지나왔고,
  // 사진첩 권한도 필요 없다.
  useEffect(() => {
    let cancelled = false;
    if (picked) {
      start();
      return () => {
        cancelled = true;
      };
    }
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
    if (!picked) {
      const status = await requestGalleryAccess();
      if (!status.granted && !status.partial) {
        setStage('denied');
        return;
      }
      setPartial(Boolean(status.partial));
    }
    setStage('scanning');
    setComplete(false);
    setCandidates([]);
    setDismissedIds([]);
    setVoucherIds([]);
    setResult(null);
    setDigging(false);
    setReadBar(0);
    setReadBarMs(0);
    found0Ref.current = [];
    readTallyRef.current = { done: 0, total: 0 };
    readSeqRef.current = 0;
    setHint(0);
    // 새로 훑을 때는 다시 따라간다. 지난번에 위를 보러 올라가 꺼둔 채로 남아 있으면
    // 이번에는 카드가 화면 밖에 쌓인다.
    stickyRef.current = true;
    settleUntilRef.current = 0;
    setProgress({ scanned: 0, total: 0, found: 0 });

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const pool = makePool(READ_CONCURRENCY);
    poolRef.current = pool;
    // 지난번에 미리 올려두고 안 쓴 것이 있으면 지금 치운다. 새로 훑으면 그 후보들은
    // 화면에서 사라지므로, 여기서 놓치면 아무도 지울 수 없는 파일이 된다.
    sweepUploads();
    uploadRef.current = makePool(SAVE_CONCURRENCY);
    spentRef.current = new Set();

    // 이미 목록에 있는 번호는 후보에서 뺀다. 기프티콘 사진은 지우지 않고 그대로
    // 두는 사람이 많아서, 이게 없으면 훑을 때마다 등록한 것들이 계속 다시 나온다.
    const isRegistered = async (code) => {
      try {
        return Boolean(await findGifticonByCode(family.id, code));
      } catch {
        // 물어보지 못했으면 보여주는 쪽을 고른다. 중복은 저장할 때 한 번 더 걸러진다.
        return false;
      }
    };

    // 찾자마자 카드로 쌓는다. 한 장씩 차례로 도니 실제로 하나씩 늘어난다.
    const onCandidate = (candidate) => {
      setCandidates((prev) => [...prev, candidate]);
      // 원본 폴더에서 나온 것은 더 나은 사진이 뒤에 올 수 없다. 다 훑기를 기다리지
      // 않고 지금 보낸다 — 첫 카드가 여기서 2초 당겨진다.
      if (!candidate.readyNow) return;
      // 보낼 사진을 지금 떠둔다. 훑기가 끝나면 candidate.images가 고른 결과로
      // 갈아끼워지는데, 그때 뜨면 방금 보기로 한 그 사진이 아닐 수 있다.
      const shots = candidateToFiles(candidate);
      pool.add(candidate.id, () => runRead(candidate, shots, controller));
    };

    let found = [];
    let pending = [];
    try {
      const scan = picked
        ? await groupImages(files, {
            signal: controller.signal,
            onProgress: setProgress,
            onCandidate,
            isRegistered,
          })
        : await scanGallery({
            signal: controller.signal,
            onProgress: setProgress,
            onCandidate,
            isRegistered,
          });
      if (controller.signal.aborted) return;
      found = scan.candidates;
      pending = scan.pending ?? [];
      setScanned(scan.scanned ?? 0);
      setSince(scan.since ?? 0);
      setFolders(scan.folders ?? []);
      setTally(scan.tally ?? null);
      setComplete(true);
    } catch (err) {
      setError(err?.message || (picked ? '사진을 읽지 못했어요.' : '갤러리를 훑지 못했어요.'));
      if (!controller.signal.aborted) {
        setStage('done');
        setProgress(null);
      }
      return;
    }

    await readAll(found, controller);

    // 여기서부터는 사용자가 이미 목록을 보고 있다. 못 찾은 사진을 정밀 탐색으로 한 번 더
    // 뒤진다 — 무거운 일이지만 기다리게 하지는 않는다.
    //
    // 받아 온 사진은 처음부터 정밀 탐색으로 읽었으므로 한 번 더 볼 것이 없다.
    if (!picked) await digDeeper(pending, controller);
  }

  /**
   * 얕은 판에서 못 찾은 사진을 정밀 탐색으로 다시 본다.
   *
   * 결과 화면이 뜬 뒤에 돈다. 여기서 나오는 것은 정보까지 읽어서 목록에 얹는다.
   * 사용자가 그 사이에 등록을 눌러도 상관없다 — 얹히는 건 새로 찾은 것뿐이다.
   */
  async function digDeeper(pending, controller) {
    if (!pending?.length || controller.signal.aborted) return;
    setDigging(true);

    try {
      const deep = await deepScan({
        pending,
        signal: controller.signal,
        // 얕은 판에서 이미 잡은 번호는 또 만들지 않는다.
        skipCodes: new Set(found0Ref.current.map((c) => c.code)),
        onCandidate: (candidate) => setCandidates((prev) => [...prev, candidate]),
        isRegistered: async (code) => {
          try {
            return Boolean(await findGifticonByCode(family.id, code));
          } catch {
            return false;
          }
        },
      });
      if (controller.signal.aborted) return;
      if (deep.candidates.length > 0) {
        // 이미 쌓여 있으니 고른 결과로 갈아끼우기만 한다.
        setCandidates((prev) =>
          prev.map((item) => deep.candidates.find((found) => found.id === item.id) || item)
        );
        found0Ref.current = [...found0Ref.current, ...deep.candidates];
        await readAll(deep.candidates, controller, { append: true });
      }
    } finally {
      if (!controller.signal.aborted) setDigging(false);
    }
  }

  /**
   * 후보 하나를 읽는다. 폰에서 사진을 줄이고(prepareImages), 서버에 글자를 읽힌다.
   *
   * files를 받으면 그것을 쓴다. 훑는 중에 미리 보내는 건은 그 순간의 사진을 떠둬야
   * 하기 때문이다 — 훑기가 끝나면 candidate.images가 고른 결과로 바뀐다.
   */
  async function readOne(candidate, files) {
    try {
      const prepared = await prepareImages(files || candidateToFiles(candidate));
      // 훑기가 이미 읽어둔 번호를 캐시 열쇠로 넘긴다. prepareImages가 같은 사진에서 또
      // 읽어보긴 하지만 정밀 탐색으로 겨우 찾은 건은 거기서 다시 안 나온다.
      const info = await readGifticonInfo(prepared, { knownCode: candidate.code });
      // 모델에게 보낸 base64는 여기서 할 일이 끝났다. 후보마다 들고 있으면 열 개만
      // 되어도 메가바이트 단위로 쌓인다.
      prepared.uploads = null;
      return { prepared, info, missing: missingFields(info, candidate.code) };
    } catch (err) {
      // 빠진 칸이 아니라 읽다가 막힌 것이다. 서버가 보낸 말을 그대로 들고 있는다 —
      // 하루 한도를 다 썼는지, 인터넷이 끊겼는지는 그 말에만 적혀 있다.
      return { prepared: null, info: null, missing: [], readError: err?.message || '읽지 못했어요' };
    }
  }

  /**
   * 한 건을 읽고 그 결과를 목록에 반영한다. 훑는 중에 미리 보내는 것과 나중 한 판이
   * 이 함수 하나를 같이 쓴다 — 두 길로 갈라두면 한쪽만 고치는 일이 생긴다.
   */
  async function runRead(candidate, files, controller) {
    // 그만 찾기를 눌렀으면 줄에 서 있던 것은 보내지 않는다. 창을 닫은 뒤에도 계속
    // 읽으면 폰이 더워지고 하루 한도만 닳는다.
    if (controller.signal.aborted) return null;
    const read = await readOne(candidate, files);
    if (controller.signal.aborted) return read;

    // 목록에 쌓이는 차례. 찾은 순서가 아니라 읽기가 끝난 순서다 — 찾은 순서로 두면
    // 나중에 읽힌 것이 목록 가운데로 끼어들어 아래가 통째로 밀린다.
    read.readOrder = readSeqRef.current += 1;

    setCandidates((prev) => prev.map((item) => (item.id === candidate.id ? { ...item, ...read } : item)));
    found0Ref.current = found0Ref.current.map((item) =>
      item.id === candidate.id ? { ...item, ...read } : item
    );
    // 읽어낸 것이 금액권으로 보이면 그 자리에서 켜준다. 확실하지 않으니 끌 수 있게
    // 두되, 열 개 중 여덟이 맞는 판단을 매번 손으로 켜게 하는 것도 일이다.
    if (read.info?.isVoucher && read.info?.amount) {
      setVoucherIds((prev) => (prev.includes(candidate.id) ? prev : [...prev, candidate.id]));
    }

    // 진행률은 총 개수를 알게 된 뒤부터 그린다. 훑는 중에는 아직 몇 개가 될지 모른다.
    const tally = readTallyRef.current;
    tally.done += 1;
    if (tally.total > 0) {
      setProgress({ scanned: Math.min(tally.done, tally.total), total: tally.total, found: tally.total });
    }
    return read;
  }

  /**
   * 찾아낸 것들의 상품명·금액·유효기한을 읽는다.
   *
   * 훑는 동안 이미 보낸 것들이 있다(readyNow). 여기서는 남은 것만 집어 들고, 먼저
   * 보낸 것들이 돌아올 때까지 함께 기다린다.
   */
  async function readAll(found, controller, { append = false } = {}) {
    const pool = poolRef.current;
    if (!append) {
      setStage('reading');
      // 훑는 동안 이미 카드가 쌓였고 그중 일부는 읽기까지 끝났다. 여기서는 등록에
      // 넘길 사진을 고른 결과로 갈아끼우되, 먼저 읽어둔 값은 그대로 얹는다.
      // id가 같으니 화면에서는 자리가 그대로다.
      const merged = found.map((item) => {
        const read = pool.results.get(item.id);
        return read ? { ...item, ...read } : item;
      });
      setCandidates(merged);
      found0Ref.current = merged;
      readTallyRef.current = { done: pool.results.size, total: merged.length };
      setProgress({ scanned: pool.results.size, total: merged.length, found: merged.length });

      // 실제로 재보니 한 물결에 5.5초 안팎이었다. 눈금은 그보다 조금 넉넉하게 잡는다 —
      // 짧게 잡으면 막대가 끝에 닿아 멈춰 선 채로 기다리게 되는데, 그건 고치려던 것과
      // 같은 그림이다. 넉넉하면 아직 움직이는 중에 끝나서 마지막이 자연스럽다.
      // 정확할 필요는 없다. 실제로 끝나는 순간 100%로 채우므로, 이건 그 사이를 메우는 눈금이다.
      const left = merged.length - pool.results.size;
      const waves = Math.max(1, Math.ceil(left / READ_CONCURRENCY));
      setReadBar(SCAN_SHARE);
      setReadBarMs(waves * 6500);
      setTimeout(() => setReadBar(92), 60);
    }

    // 이미 보낸 것은 pool이 알아서 걸러낸다.
    found.forEach((candidate) => {
      if (controller.signal.aborted) return;
      pool.add(candidate.id, () => runRead(candidate, null, controller));
    });

    await pool.settled();

    if (controller.signal.aborted) return;
    // 뒤에서 도는 판은 화면 단계를 건드리지 않는다. 사용자가 이미 목록을 보고 있다.
    if (append) return;
    // 진행률 그리기를 멈춘다. 여기서부터 늦게 돌아오는 것은 정밀 탐색 몫이라,
    // 계속 세면 끝난 막대가 다시 움직인다.
    readTallyRef.current = { done: 0, total: 0 };
    setReadBarMs(200);
    setReadBar(100);
    // 여기서부터 잠깐은 바닥에 붙이지 않는다. 마지막 한 번은 흘려서 내리기 때문이다.
    //
    // 이 줄이 화면 갱신 쪽(useEffect)에 있으면 늦다. 높이 변화를 듣는 쪽이 먼저
    // 깨어나 바닥으로 데려가버려서, 흘러 내려갈 거리가 남지 않는다.
    settleUntilRef.current = performance.now() + 900;
    setStage('done');
    setProgress(null);
  }

  // 이 후보에서 잘라낸 것들. 사진과 함께 올라간다.
  function cropsOf(candidate) {
    const { prepared, info } = candidate;
    return {
      barcodeCropFile:
        prepared?.code && prepared?.barcodeCropBlob
          ? new File([prepared.barcodeCropBlob], 'barcode.png', { type: 'image/png' })
          : null,
      thumbCropFile: info?.thumbCropBlob
        ? new File([info.thumbCropBlob], 'thumb.jpg', { type: 'image/jpeg' })
        : null,
    };
  }

  /**
   * 사진을 등록 전에 미리 올려둔다.
   *
   * 등록에서 걸리는 시간은 거의 다 사진을 보내는 시간이다. 그런데 그 사진은 읽기가
   * 끝난 순간 이미 손에 있다 — 사용자가 목록을 보고 무엇을 넣을지 고르는 그 몇 초
   * 동안 놀고 있을 뿐이다. 그때 올려두면 등록을 눌렀을 때 남는 일은 줄 하나 넣는
   * 것뿐이라 거의 즉시 끝난다.
   *
   * 훑는 동안에는 시작하지 않는다. 그때는 같은 회선으로 글자를 읽히고 있고, 사용자가
   * 눈으로 좇는 것도 그쪽이다. 여기서 끼어들면 보이는 것이 느려진다.
   *
   * 등록하지 않은 것은 지워야 한다. 아래 sweepUploads가 한다.
   */
  useEffect(() => {
    if (stage !== 'done' || !uploadRef.current) return;
    candidates.forEach((candidate) => {
      if (dismissedIds.includes(candidate.id) || !isPickable(candidate)) return;
      uploadRef.current.add(candidate.id, () =>
        uploadGifticonImages(family.id, candidate.prepared.storageFiles, cropsOf(candidate))
      );
    });
    // isPickable은 매번 새로 만들어지는 함수라 의존성에 넣으면 효과가 계속 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, candidates, dismissedIds]);

  /**
   * 미리 올려뒀지만 결국 쓰지 않은 사진을 지운다.
   *
   * 치운 후보, 끝내 등록하지 않고 닫은 후보의 사진이 여기 걸린다. 그냥 두면 아무
   * 줄도 가리키지 않는 파일이 남아서, 눈에 보이지도 않는 채로 용량만 먹는다.
   * 무료 스토리지가 1GB다.
   *
   * 등록에 쓴 것은 건드리지 않는다. 그건 이제 그 줄의 것이고, 넣다가 실패한 경우는
   * createGifticon이 이미 치웠다(client/src/api.js).
   */
  function sweepUploads() {
    const store = uploadRef.current;
    if (!store) return;
    // 지금의 '쓴 목록'을 붙들어둔다. 아래는 나중에 도는데, 그 사이 새로 훑기가
    // 시작되면 이 목록이 빈 것으로 갈아끼워진다. 그러면 방금 등록한 기프티콘의
    // 사진을 안 쓴 것으로 보고 지워버린다 — 화면에는 남고 사진만 사라진다.
    const spent = spentRef.current;
    // 아직 올라가는 중인 것까지 끝난 뒤에 훑는다. 창을 닫는 길에도 부르는데, 그때
    // 지금까지 올라간 것만 보고 끝내면 뒤늦게 도착한 파일이 영영 남는다.
    //
    // 기다렸다가 하지만 아무도 이 약속을 기다리지 않는다. 창은 이미 닫혔고, 지우는
    // 일은 화면과 상관없이 끝나면 된다.
    store.settled().then(() => {
      const orphans = [];
      store.results.forEach((stored, id) => {
        if (spent.has(id) || !stored) return;
        orphans.push(...stored.image_paths, stored.barcode_image_path, stored.thumb_image_path);
      });
      const paths = orphans.filter(Boolean);
      if (paths.length) removeImages(paths).catch(() => {});
      store.results.clear();
    });
  }

  /**
   * 고른 것을 전부 넣는다.
   *
   * 정보도 사진도 이미 올려뒀다. 여기서는 줄을 넣기만 하므로 금방 끝난다.
   * 세 건씩 겹쳐 돈다 — 하나씩 하면 개수만큼 왕복이 곱해진다.
   */
  async function registerAll() {
    const targets = candidates.filter(isPickable);
    if (targets.length === 0) return;

    setStage('registering');
    setError('');
    const done = [];
    const failed = [];
    const noExpiry = targets.filter((c) => !c.info?.expiresAt).length;

    async function save(candidate) {
      const { prepared, info } = candidate;
      const code = info.code || candidate.code;

      // 넣기 직전에 한 번 더 물어본다. 마지막 문이다.
      //
      // 후보를 고를 때도 물어보지만(gallery.js의 isRegistered), 그건 훑을 때 읽은 번호로
      // 묻는 것이고 실제로 들어가는 번호는 읽기가 끝난 뒤에 정해진다. 둘이 갈리면 앞의
      // 물음은 헛돈다 — 실제로 이미 등록한 6건 중 2건이 다시 잡혀 또 등록됐다.
      //
      // 위에서 번호 고르는 규칙을 고쳐서 갈릴 일이 줄었지만, 그건 규칙이고 이건 사실이다.
      // 사진 한 장 올리기 전에 묻는 것이라 값도 거의 안 든다.
      if (code && (await findGifticonByCode(family.id, code))) {
        throw new Error('이미 등록된 기프티콘이에요');
      }

      // 미리 올려둔 것을 쓴다. 아직 올라가는 중이면 그것만 기다린다. 아직 시작도
      // 안 했으면(정밀 탐색에서 뒤늦게 나온 것) 여기서 시작해 기다린다.
      // 어느 쪽이든 같은 파일을 두 번 올리는 일은 없다.
      const stored = await uploadRef.current?.add(candidate.id, () =>
        uploadGifticonImages(family.id, prepared.storageFiles, cropsOf(candidate))
      );
      // 이제 이 경로들은 아래 createGifticon의 것이다. 실패하면 거기서 치운다.
      if (stored) spentRef.current.add(candidate.id);

      return createGifticon(
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
          code,
          code_type: info.codeType || candidate.codeType || null,
          expires_at: info.expiresAt || null,
          is_voucher: voucherIds.includes(candidate.id),
          created_by: user.id,
        },
        // 미리 올려둔 것이 있으면 파일은 넘기지 않는다. 넘겨봐야 쓰지 않는다.
        stored ? [] : prepared.storageFiles,
        stored ? {} : cropsOf(candidate),
        stored || null
      );
    }

    let finished = 0;
    const queue = [...targets];

    async function worker() {
      while (queue.length > 0) {
        const candidate = queue.shift();
        try {
          done.push(await save(candidate));
        } catch (err) {
          // 하나가 실패해도 나머지는 계속 넣는다. 여기서 멈추면 넣은 것과 못 넣은 것이
          // 섞인 채로 화면만 사라진다.
          failed.push({ candidate, reason: err?.message || '등록하지 못했어요' });
        }
        finished += 1;
        setSaving({ current: finished, total: targets.length });
      }
    }

    setSaving({ current: 0, total: targets.length });
    await Promise.all(Array.from({ length: Math.min(SAVE_CONCURRENCY, targets.length) }, worker));

    // 넣지 않은 것들의 사진은 여기서 정리한다. 결과 화면에서 창을 닫으면 다시 볼 일이 없다.
    sweepUploads();
    setSaving(null);
    // 못 읽어서 애초에 넣을 수 없던 것도 함께 적는다. 목록에서 이미 보여줬지만,
    // 결과 화면만 보고 닫는 사람에게는 여기가 마지막 기회다.
    const unreadable = candidates
      .filter((c) => !dismissedIds.includes(c.id) && !isPickable(c))
      .map((c) => ({ candidate: c, reason: reasonOf(c) }));
    setResult({ done: done.length, failed: [...unreadable, ...failed], noExpiry });
    setStage('registered');
    // 목록을 다시 읽게 한다. 방금 넣은 것이 뒤에 보여야 한다.
    if (done.length > 0) onRegistered?.();
  }

  /**
   * 사람이 직접 채운 값을 후보에 얹는다.
   *
   * 모델이 못 읽은 칸을 여기서 채우면 그 카드도 등록에 낄 수 있게 된다. 예전에는
   * "+ 로 직접 올려주세요"뿐이었는데, 그건 여덟 장을 한 번에 넣으러 온 사람에게
   * 한 건만 따로 처음부터 다시 하라는 말이었다. 빠진 칸 하나 때문에 그럴 이유가 없다.
   *
   * 화면과 등록에 넘길 목록 두 곳에 같이 얹는다. 한쪽만 고치면 화면에는 채워졌는데
   * 저장은 옛 값으로 나가는 일이 생긴다.
   */
  function patchInfo(candidate, patch) {
    const apply = (item) => {
      if (item.id !== candidate.id) return item;
      const info = { ...item.info, ...patch };
      return { ...item, info, missing: missingFields(info, item.code), edited: true };
    };
    setCandidates((prev) => prev.map(apply));
    found0Ref.current = found0Ref.current.map(apply);
  }

  /**
   * 읽다가 막힌 후보를 다시 읽는다.
   *
   * 하루 한도를 다 썼거나 인터넷이 끊긴 경우다. 둘 다 조금 뒤에는 풀리는 일이라,
   * 창을 닫고 처음부터 다시 하게 할 이유가 없다.
   *
   * pool을 거치지 않고 바로 부른다 — pool은 같은 id를 한 번만 돌리도록 되어 있어서,
   * 그리로 넣으면 처음의 실패한 결과가 그대로 돌아온다.
   */
  async function retryRead(candidate) {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    setRetryingId(candidate.id);
    try {
      await runRead(candidate, null, controller);
    } finally {
      setRetryingId(null);
    }
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

  function toggleVoucher(candidate) {
    setVoucherIds((prev) =>
      prev.includes(candidate.id) ? prev.filter((id) => id !== candidate.id) : [...prev, candidate.id]
    );
  }

  const summary = summarizeFolders(folders);
  // 지금까지 건너뛰기로 감춰둔 사진 수. 훑기가 끝난 뒤에만 쓰므로 그때 세면 된다.
  const skipped = complete ? countSkipped() : 0;

  // 훑거나 읽는 중. 위에 막대가 뜨고, 아래로 카드가 쌓인다.
  const isWorking = stage === 'scanning' || stage === 'reading';

  // 진행률 하나를 막대와 사진이 함께 쓴다.
  //
  // 사진 위의 스캔 선을 무한 반복으로 돌려봤더니 보기에는 살아 있는데 아무것도 말해주지
  // 않았다. 선의 자리를 진행률로 두면 그 자체가 눈금이 된다 — 위쪽 밝은 부분이 본 만큼,
  // 아래 어두운 부분이 남은 만큼이다. 숫자를 따로 읽지 않아도 어디까지 왔는지 보인다.
  //
  // 찾기 단계는 실제로 센 값이고, 읽기 단계는 걸릴 만한 시간에 맞춘 눈금이다.
  // 어느 쪽이든 막대와 사진이 같은 값을 쓰므로 둘이 따로 놀지 않는다.
  const barPercent =
    stage === 'reading'
      ? readBar
      : progress?.total
        ? Math.round((progress.scanned / progress.total) * SCAN_SHARE)
        : 6;
  const barMs = stage === 'reading' ? readBarMs : 300;
  // 목록을 보여줄 때. 도는 중에도 보여준다 — 창이 갈아치워지지 않게.
  const isListing = isWorking || stage === 'done';

  // 카드가 붙을 때마다 화면도 따라 내려간다.
  //
  // 위에 머물러 있으면 새로 들어온 카드가 화면 밖에 쌓인다. 그런데 이 화면에서 하는
  // 일은 들어오는 것을 보는 것으로 끝나지 않는다 — 다 나오면 등록을 누르는 것이 다음
  // 순서고, 그 버튼은 목록 아래에 있다. 위에 붙어 있으면 결국 손으로 끝까지 내려야 한다.
  //
  // 들어오는 것을 눈으로 따라가다 보면 마지막에 버튼 앞에 서 있게 되는 것이 맞다.
  // stage를 함께 보는 건 다 끝나는 순간에도 한 번 맞춰주기 위해서다 — 그때 스캐너가
  // 걷히고 목록이 성격별로 나뉘면서 높이가 통째로 바뀐다.
  // 카드가 들어오는 동안 화면이 계속 아래에 붙어 있게 한다.
  //
  // 처음에는 카드가 하나 붙을 때마다 한 번씩 내렸다. 그런데 카드는 0.42초에 걸쳐
  // 높이가 자란다 — 붙은 순간에 재면 그 높이가 아직 0이라 목적지가 제자리다.
  // 그래서 한 번도 내려가지 않았다.
  //
  // 몇 밀리초 뒤에 다시 재는 식으로 맞추지 않는다. 애니메이션 시간을 두 곳에 적어두면
  // 한쪽만 고치는 날이 온다. 대신 내용의 높이가 바뀌는 것을 그대로 듣는다 — 카드가
  // 자라는 내내 신호가 오고, 그때마다 바닥에 붙인다.
  //
  // 흐르게 만들 필요도 없다. 카드가 부드럽게 자라니 그 높이를 따라가는 것만으로
  // 화면도 부드럽게 내려간다. 둘이 같은 곡선을 탄다.
  //
  // 도는 동안만 붙는다. 다 끝난 뒤에도 붙여두면 상세내역을 펼쳤을 때 그 높이까지
  // 따라가서, 정작 읽으려고 연 내용을 지나쳐 맨 아래로 데려간다.
  useEffect(() => {
    const content = contentRef.current;
    if (!isWorking || !content || typeof ResizeObserver === 'undefined') return;

    const follow = () => {
      if (!stickyRef.current || performance.now() < settleUntilRef.current) return;
      const box = scrollerOf(content);
      if (!box) return;
      box.scrollTop = box.scrollHeight - box.clientHeight;
    };

    const observer = new ResizeObserver(follow);
    observer.observe(content);
    return () => observer.disconnect();
  }, [isWorking]);

  // 사용자가 손으로 위를 보러 올라갔으면 따라가기를 멈춘다. 다시 바닥 가까이
  // 내려오면 저절로 붙는다. 우리가 내리는 것도 바닥에서 끝나니 켜진 채로 남는다.
  useEffect(() => {
    const content = contentRef.current;
    if (!isListing || !content) return;
    // 아직 넘치지 않았으면 scrollerOf가 못 찾는다. 그때는 바로 위 칸이 곧 그 자리다.
    const box = scrollerOf(content) || content.parentElement;
    if (!box) return;
    const onScroll = () => {
      stickyRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, [isListing]);

  // 다 끝나는 순간에는 한 번 흘려서 내린다.
  //
  // 그때 스캐너가 걷히고 목록이 성격별로 나뉘면서 화면이 통째로 다시 짜인다. 바닥에
  // 붙이기만 하면 순간이동처럼 보이는데, 여기서 할 일은 등록을 누르는 것이라 손이
  // 따라올 시간이 필요하다.
  useEffect(() => {
    if (stage !== 'done' || !stickyRef.current) return;
    const content = contentRef.current;
    if (!content) return;
    const state = glideRef.current;
    // 붙이기를 잠가두는 것은 stage를 done으로 바꾸는 자리에서 이미 했다(readAll,
    // 그만 찾기). 여기서 하면 늦는다.
    // 새 화면이 자리를 잡은 다음에 잰다.
    const id = requestAnimationFrame(() => {
      const box = scrollerOf(content);
      if (box) glideToEnd(box, state);
    });
    return () => cancelAnimationFrame(id);
  }, [stage]);

  // 창을 닫을 때 흐르던 것을 멈춘다.
  useEffect(() => {
    const state = glideRef.current;
    return () => cancelAnimationFrame(state.raf);
  }, []);

  // 지금 무슨 일을 하는 중인지와, 어디까지 왔는지. 시안의 상태 줄이다 —
  // 왼쪽이 하는 일, 오른쪽이 숫자다.
  const workingLabel =
    stage === 'scanning'
      ? picked
        ? '고른 사진에서 기프티콘을 찾고 있어요'
        : '사진첩에서 기프티콘을 찾고 있어요'
      : '기프티콘 정보를 읽고 있어요';
  const workingCount =
    stage === 'scanning'
      ? progress?.total
        ? `사진 ${progress.scanned}/${progress.total}`
        : '잠시만요'
      : `${progress?.scanned ?? 0}/${progress?.total ?? 0}개`;


  const alive = candidates.filter((candidate) => !dismissedIds.includes(candidate.id));
  // 금액권은 따로 묶는다. 확인할 것이 하나 더 있는 무리라, 섞여 있으면 그 하나를
  // 매번 찾아내야 한다. 나눠 두면 위는 그냥 넘기고 아래만 보면 된다.
  const vouchers = alive.filter((c) => isPickable(c) && voucherIds.includes(c.id));
  const plains = alive.filter((c) => isPickable(c) && !voucherIds.includes(c.id));
  // 넣을 수 없는 것. 빠진 칸이 있거나, 읽다가 막혔거나, 중간에 그만둬서 못 읽었다.
  const unreadable = alive.filter((c) => !isPickable(c));
  // 읽기가 끝난 순서대로. 훑는 중에는 이 차례로 카드가 한 장씩 쌓인다.
  const arrived = alive
    .filter((c) => c.info || c.readError)
    .sort((a, b) => (a.readOrder || 0) - (b.readOrder || 0));


  // 안내를 한 줄씩 넘긴다. 첫 기프티콘이 들어오면 멈춘다 — 그때부터는 보여줄 것이
  // 생겼고, 읽을 것이 둘이면 둘 다 안 읽힌다.
  //
  // 이 자리는 arrived 아래여야 한다. 위에 두면 의존성 배열이 렌더 도중 arrived를
  // 읽는데 그때는 아직 만들어지기 전이라, 이 화면이 뜨는 순간 통째로 죽는다.
  // 실제로 그래서 흰 화면이 났다 — 자동 찾기가 켜져 있으면 앱을 여는 순간이다.
  useEffect(() => {
    if (!isWorking || arrived.length > 0) return;
    const timer = setInterval(() => setHint((n) => n + 1), HINT_MS);
    return () => clearInterval(timer);
  }, [isWorking, arrived.length]);

  const dismissed = candidates.filter((candidate) => dismissedIds.includes(candidate.id));
  const keptCount = alive.filter(isPickable).length;
  // 못 읽은 것들이 같은 이유로 막혔으면 한 번만 적는다. 하루 한도를 다 썼을 때가
  // 그런데, 그 긴 문장을 카드마다 되풀이하면 읽지 않게 된다.
  const blockedReasons = [...new Set(unreadable.map((c) => c.readError).filter(Boolean))];
  const commonBlock = unreadable.length > 0 && blockedReasons.length === 1 && unreadable.every((c) => c.readError)
    ? blockedReasons[0]
    : null;

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
        {/* 받아 온 사진은 어느 폴더에서 왔는지 모른다. 그 줄 대신 몇 장을 봤는지만 적는다. */}
        {picked ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Images className="size-3.5 shrink-0" />
            고른 사진 <b className="font-semibold tabular-nums text-foreground">{scanned}장</b>
          </span>
        ) : (
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
        )}

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
        {!picked && summary.watched.every((folder) => folder.count === 0) && summary.others.length > 0 && (
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
  function renderCandidate(candidate, { voucher = false, entering = false } = {}) {
    const isDismissed = dismissedIds.includes(candidate.id);
    const info = candidate.info;
    const broken = !isDismissed && !isPickable(candidate);
    const editing = editingId === candidate.id;

    return (
      /* 두 겹이다. 바깥은 차지하는 높이가 자라고, 안쪽이 밀려 들어온다.
         한 겹으로 두면 카드가 제자리에 통째로 나타나면서 목록 높이가 한 번에 뛰고,
         따라 내려가던 화면이 그 순간 흔들린다. */
      <li key={candidate.id} className={cn('list-none', entering && 'moacon-card-enter')}>
        <div
          className={cn(
            'moacon-card-body relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-3',
            (isDismissed || broken) && 'opacity-60'
          )}
        >
            <div className="flex items-start gap-3">
            {/* 어느 사진을 집었는지. 시안에는 없었지만 글자만으로는 "이게 그거 맞나"를
                확인할 방법이 없다. 같은 상호의 기프티콘이 여러 장 나오면 상품명이
                비슷비슷해서, 그림이 있어야 눈으로 가른다.
                여기에 스캔 선은 그리지 않는다 — 훑는 일은 맨 위 스캐너 한 자리에서만
                말한다. 이건 그냥 무엇을 집었는지 보여주는 그림이다. */}
            <img
              src={`data:image/jpeg;base64,${candidate.images[0]}`}
              alt=""
              className="size-14 shrink-0 rounded-lg bg-secondary object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              {/* 맨 윗줄은 상호와 어느 사진첩에서 나왔는지. 상호를 작게 위에 올려두면
                  아래 상품명이 한 덩어리로 읽힌다. 어디서 나왔는지를 함께 적는 건,
                  같은 기프티콘이 여러 사진첩에 있을 때 무엇을 집었는지 알기 위해서다. */}
              <div className="flex items-baseline gap-2">
                <span className="truncate text-xs font-bold tracking-wider text-primary uppercase">
                  {info?.brand || candidate.bucket}
                </span>
                {info?.brand && (
                  <span className="shrink-0 text-xs text-muted-foreground">{candidate.bucket}</span>
                )}
              </div>
              <span className="mt-1 text-base leading-snug font-semibold break-keep text-foreground">
                {info?.name || (broken ? '못 읽었어요' : candidate.code)}
              </span>
              <span className="mt-1.5 truncate text-sm tabular-nums text-muted-foreground">
                {broken
                  ? reasonOf(candidate)
                  : formatDate(info?.expiresAt)
                    ? `${formatDate(info.expiresAt)} 까지`
                    : '유효기한 없음'}
              </span>
            </div>

            {/* 오른쪽은 금액과, 이 후보를 치우는 자리. 시안에는 '확인됨' 같은 상태 글자가
                있었는데 빼뒀다 — 아래에서 성격별로 나눠 보여주므로 카드마다 또 적으면
                같은 말이 두 번 된다. */}
            <div className="flex shrink-0 flex-col items-end gap-1">
              {formatWon(info?.amount) && (
                <span className="text-base font-bold tabular-nums text-foreground">
                  {formatWon(info.amount)}
                </span>
              )}
              {isDismissed ? (
                <button
                  type="button"
                  onClick={() => handleUndismiss(candidate)}
                  className="px-1 py-0.5 text-sm font-semibold text-primary underline"
                >
                  되돌리기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDismiss(candidate)}
                  aria-label="기프티콘 아님"
                  className="-mr-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground"
                >
                  <X className="size-4.5" />
                </button>
              )}
            </div>
          </div>

          {/* 금액권 여부는 사람이 정한다. 사진의 글자로 짐작하는 것이라 확실할 수가 없는데,
              틀렸을 때의 결과가 한쪽으로 치우친다 — 교환권을 금액권으로 켜두면 쓸 때마다
              얼마를 썼는지 묻고 잔액이 남아 목록에서 사라지지 않는다. 반대로 꺼두면 잔액을
              못 따라갈 뿐 쓰는 데는 지장이 없다. */}
          {voucher && !isDismissed && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-muted px-2.5 py-2">
              <input
                type="checkbox"
                checked={voucherIds.includes(candidate.id)}
                onChange={() => toggleVoucher(candidate)}
                className="size-4.5 shrink-0 accent-primary"
              />
              <span className="text-sm break-keep text-foreground">금액권 — 쓴 만큼 깎여요</span>
            </label>
          )}

          {/* 빠진 칸이 있는 카드에만 나온다. 다 읽힌 카드에까지 붙이면, 고칠 것이 없는데도
              뭔가 확인해야 할 것처럼 보인다 — 대부분의 날은 다 읽힌다. */}
          {broken && !isDismissed && candidate.prepared && (
            <button
              type="button"
              onClick={() => setEditingId(editing ? null : candidate.id)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-muted px-2.5 py-2 text-sm font-semibold text-foreground"
            >
              <Pencil className="size-4" />
              {editing ? '접기' : '직접 채우기'}
            </button>
          )}

          {/* 읽다가 막힌 것은 채울 일이 아니라 다시 해볼 일이다. 하루 한도를 다 썼거나
              인터넷이 끊긴 경우라, 조금 뒤에는 그냥 읽힌다. */}
          {candidate.readError && !isDismissed && (
            <button
              type="button"
              disabled={retryingId === candidate.id}
              onClick={() => retryRead(candidate)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-muted px-2.5 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
            >
              {retryingId === candidate.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              {retryingId === candidate.id ? '읽는 중…' : '다시 읽기'}
            </button>
          )}

          {/* 빠진 칸만 묻는다. 다 보여주면 이미 제대로 읽힌 값까지 훑어보게 되고, 그러다
              멀쩡한 값을 건드린다. 모르는 것만 물어보는 쪽이 손도 덜 가고 안전하다. */}
          {editing && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted px-2.5 py-2.5">
              {candidate.missing?.map((field) => {
                const key = FIELD_KEYS[field];
                if (!key) return null;
                return (
                  <label key={field} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-muted-foreground">{field}</span>
                    <Input
                      value={candidate.info?.[key] || ''}
                      onChange={(e) => patchInfo(candidate, { [key]: e.target.value })}
                      placeholder={FIELD_HINTS[field]}
                      inputMode={key === 'code' ? 'numeric' : undefined}
                      className="bg-card"
                    />
                  </label>
                );
              })}
              <p className="m-0 text-xs break-keep text-muted-foreground">
                채우면 아래 등록에 함께 들어가요. 나머지는 등록한 뒤에 카드에서 고칠 수 있어요.
              </p>
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>{picked ? '기프티콘 등록' : '기프티콘 찾기'}</SheetTitle>
        </SheetHeader>

        {/* 어디까지 보는지는 결과보다 먼저 알아야 한다. 아래에 뒀을 때는 "왜 예전 사진이
            안 나오지"를 다 훑고 나서야 알게 됐고, 찾은 것이 많으면 목록에 밀려 화면 밖으로
            나갔다. 제목 바로 아래가 그 자리다.
            기준 시각은 훑기가 끝나야 알 수 있어서, 그 전에는 이 줄이 없다. */}
        {!picked && complete && formatDay(since) && stage === 'done' && (
          <div className="mx-5 mt-2 flex gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="m-0 flex-1 text-sm leading-relaxed break-keep text-muted-foreground">
              <b className="font-semibold text-foreground">{formatDay(since)} 0시</b> 이후 사진만 봐요.
              <br />
              이전 사진은 + 로 올려주세요.
            </p>
          </div>
        )}

        {/* 카드 생김새는 훑기와 같게 두되, 여기가 등록하는 자리라는 것은 알아야 한다.
            둘이 똑같이 생기면 "지금 보고 있는 게 내 목록인가 넣으려는 것인가"가 헷갈린다.
            통일성은 카드가 지키고, 구별은 이 띠가 맡는다. 색은 아래 '등록하는 중'과 같은
            것을 쓴다 — 같은 일의 앞뒤라 같은 색으로 묶인다. */}
        {picked && (
          <div className="mx-5 mt-2 flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
            <ImagePlus className="size-4 shrink-0 text-primary" />
            <p className="m-0 flex-1 text-sm break-keep text-foreground">
              고른 사진 <b className="font-semibold tabular-nums">{files.length}장</b>을 기프티콘으로 넣어요.
            </p>
          </div>
        )}

        <div ref={contentRef} className="flex flex-col gap-4 px-5 pt-2">
          {stage === 'intro' && (
            <>
              {/* 폴더 이름을 한 줄로 몰아둔다. 그냥 흘려 쓰면 "…스크린샷 폴더에서 새 /
                  기프티콘을 찾아드려요"로 끊겨서, 굵게 해둔 세 이름이 뒷말과 엉킨다. */}
              <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
                <b className="font-semibold text-foreground">{KOREAN_BUCKETS}</b>
                <br />
                폴더에서 새 기프티콘을 찾아드려요.
              </p>
              {/* 사진 권한은 사람들이 가장 망설이는 권한이다. 무엇을 보고 무엇을 안 보내는지
                  먼저 적어두면, 눌러도 되는 것인지 판단할 근거가 생긴다. */}
              <ul className="m-0 flex list-none flex-col gap-2 rounded-xl bg-secondary px-4 py-3.5 pl-4 text-sm leading-relaxed break-keep text-muted-foreground">
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

          {/* 훑는 중에도, 다 훑고 나서도 같은 화면이다.
              예전에는 진행 막대만 있는 창을 보여주고 끝나면 결과 창으로 갈아치웠다.
              한 가지 일인데 창이 둘이라 "다 됐나?" 하고 한 번 더 기다리게 됐다.
              이제 위에서 막대가 흐르는 동안 아래로 카드가 하나씩 쌓인다. */}
          {isWorking && (
            <div className="flex flex-col">
              <ScannerArt />
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="text-base font-semibold text-foreground">{workingLabel}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{workingCount}</span>
                </div>
                {/* 막대 위로 빛이 한 번씩 지나간다. 막대가 잠시 멈춰 보이는 순간에도
                    무언가 돌고 있다는 게 보인다. 진행률은 그대로 막대가 말한다 —
                    움직임만 얹었지 정보를 대신하지 않는다. */}
                <div className="moacon-sweep relative h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                  {/* 찾기는 앞의 몫(SCAN_SHARE)만 채운다. 여기서 100%까지 갔다가 읽기에서
                      다시 0으로 떨어지면, 다 온 줄 알았다가 처음으로 돌아간다. */}
                  <div
                    className="h-full rounded-full bg-primary transition-[width] ease-out"
                    style={{ width: `${barPercent}%`, transitionDuration: `${barMs}ms` }}
                  />
                </div>
              </div>
            </div>
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
                {!picked && (
                  <Button type="button" variant="outline" size="lg" className="w-full rounded-xl" onClick={() => start()}>
                    <ScanSearch className="size-4.5" />
                    새 기프티콘 찾기
                  </Button>
                )}
              </div>
            </>
          )}

          {isListing && (
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

              {/* 바코드 없이 정보만 있는 사진(금액·기한이 적힌 캡처)을 뺐다고 알린다.
                  아무 말 없이 빼면 사용자는 금액이 빈칸인 걸 보고 "왜 안 읽혔지" 하는데,
                  사실은 읽을 사진을 우리가 뺀 것이다.

                  왜 빼는가 — 여기 온 사진들은 여러 기프티콘이 섞여 있고, 바코드가 없는
                  사진은 그중 어느 것 옆에 붙는지 알 방법이 없다. 짐작해서 붙이면 맞을
                  때는 아무도 모르고 틀릴 때는 엉뚱한 기프티콘에 남의 금액과 기한이
                  박힌다. 조용히 틀리는 쪽이 훨씬 나쁘다.

                  되살릴 길은 같이 적는다. 이 앱은 기프티콘을 놓치지 않겠다는 약속으로
                  서 있고, "뺐어요"만 적으면 그 사진은 거기서 끝난다. */}
              {picked && tally?.noCode > 0 && !isWorking && (
                <p className="m-0 rounded-xl bg-muted px-3.5 py-3 text-sm leading-relaxed break-keep text-muted-foreground">
                  바코드가 없는 사진 <b className="font-semibold text-foreground">{tally.noCode}장</b>은 어느
                  기프티콘 것인지 몰라서 뺐어요.
                  <br />
                  등록한 뒤 그 기프티콘을 수정에서 열고 사진을 더하면 같이 읽어요.
                </p>
              )}

              {alive.length === 0 && !isWorking ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ImageOff className="size-8 text-muted-foreground" />
                  <p className="m-0 text-base font-semibold text-foreground">
                    {scanned === 0 ? '새로 담긴 사진이 없어요' : '등록할 기프티콘이 없어요'}
                  </p>
                  <p className="m-0 text-base leading-relaxed break-keep text-muted-foreground">
                    {scanned === 0 ? '+ 로 직접 올려주세요.' : `사진 ${scanned}장을 봤어요. + 로 직접 올려주세요.`}
                  </p>
                </div>
              ) : isWorking ? (
                /* 도는 동안에는 한 줄로만 쌓는다. 읽기가 끝난 차례대로 한 장씩 밀려
                   들어온다.
                   성격별로 나누는 건 다 끝난 뒤의 일이다 — 도는 중에 나눠두면 방금
                   읽힌 카드가 무리를 옮겨 다니면서 자리가 튀고, 옮길 때마다 등장
                   애니메이션이 다시 돈다. */
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {arrived.map((candidate) => renderCandidate(candidate, { entering: true }))}
                  {arrived.length === 0 && <CandidateSlot at={hint} hints={!picked} />}
                </ul>
              ) : (
                <>
                  {plains.length > 0 && (
                    <>
                      <p className="m-0 text-base break-keep text-foreground">
                        <b className="font-semibold">{plains.length}개</b>
                        {picked ? '를 넣을 수 있어요.' : ' 찾았어요.'}
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
                      {commonBlock ? (
                        <p className="m-0 rounded-xl bg-warning/10 px-3.5 py-3 text-base leading-relaxed break-keep text-foreground">
                          {commonBlock}
                        </p>
                      ) : (
                        <p className="m-0 text-base break-keep text-foreground">
                          <b className="font-semibold">{unreadable.length}개</b>는 정보를 못 읽었어요. + 로 직접
                          올려주세요.
                        </p>
                      )}
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

              {/* 결과를 이미 보여준 뒤에도 정밀 탐색이 뒤에서 돈다. 아무 말도 없으면
                  다 끝난 줄 알고 창을 닫는데, 그러면 거기서 나올 것이 사라진다.
                  막지는 않는다 — 지금 목록으로도 등록할 수 있다. */}
              {digging && (
                <p className="m-0 flex items-center gap-2 text-sm break-keep text-muted-foreground">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  흐린 사진도 더 찾아보는 중이에요
                </p>
              )}

              {stage === 'done' && panelBody}

              {/* 두 버튼의 차이를 이름에 담는다. 둘 다 설치일 0시부터 보되, 위는 아직
                  확인하지 않은 것만, 아래는 아니라고 봤던 것까지 전부 본다.
                  '새 기프티콘' ↔ '전부'가 나란히 놓여 설명 없이 갈린다.

                  예전 이름은 '건너뛴 사진 …'이었는데, 앱이 스스로 무언가를 건너뛰었다고
                  말하는 셈이라 "뭘 놓친 거지" 하는 의심을 만들었다. 이 앱의 약속은
                  놓치지 않는 것이고, 실제로 놓친 게 아니라 아니라고 판단한 것이다. */}
              <div className="flex flex-col gap-2">
                {/* 도는 중에는 멈추는 것 말고 할 일이 없다. 등록 버튼을 미리 띄워두면
                    아직 다 안 들어온 것을 넣게 된다. */}
                {isWorking && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full rounded-xl"
                    onClick={() => {
                      abortRef.current?.abort();
                      settleUntilRef.current = performance.now() + 900;
                      setStage('done');
                      setProgress(null);
                    }}
                  >
                    그만 찾기
                  </Button>
                )}

                {stage === 'done' && keptCount > 0 && (
                  <Button type="button" size="lg" className="w-full rounded-xl" onClick={registerAll}>
                    <Check className="size-4.5" />
                    {keptCount}개 등록
                  </Button>
                )}

                {stage === 'done' && !picked && (
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
                )}

                {/* 받아 온 사진은 다시 찾을 것이 없다. 닫는 길만 둔다. */}
                {stage === 'done' && picked && keptCount === 0 && (
                  <Button type="button" size="lg" className="w-full rounded-xl" onClick={onClose}>
                    목록으로
                  </Button>
                )}

                {stage === 'done' && !picked && skipped > 0 && (
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
