// 팝업 검증용 하니스. 시트·다이얼로그를 진짜 컴포넌트로 띄운다.
// Supabase 를 안 부르는 것만 고른다 — 나머지는 껍데기(ui/sheet)가 같아서 이걸로 갈음된다.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { FamilyContext } from '../src/FamilyContext';
import RenameSheet from '../src/components/RenameSheet';
import FilterBar from '../src/components/FilterBar';
import FamilySwitcherSheet from '../src/components/FamilySwitcherSheet';
import GifticonCard from '../src/components/GifticonCard';
import SpendSheet from '../src/components/SpendSheet';
import ExtendSheet from '../src/components/ExtendSheet';
import AlertDialog from '../src/components/AlertDialog';
import ImageViewerModal from '../src/components/ImageViewerModal';
import BarcodeModal from '../src/components/BarcodeModal';

// 제목이 한 줄인 경우와 두 줄인 경우를 다 본다. 닫기 버튼과 부딪히는 자리라
// 한 줄만 보면 넘어간다.
const STAGES = {
  rename1: '① 이름 바꾸기 — 제목 한 줄',
  rename2: '① - 2 제목이 두 줄일 때',
  spend: '② 금액 입력 — 부제 없음',
  extend: '③ 기한 연장 — 긴 제목 + 부제',
  photo: '⑥ 원본 사진 — 제목 아래가 값',
  barcode: '⑥ - 2 바코드',
  t16: '⑤ 제목이 16px 인 넷 — 고르개 시트',
  t16b: '⑤ - 2 가족 바꾸기',
  t16c: '⑤ - 3 카드 ⋮ 메뉴',
  danger: '④ 삭제 다이얼로그',
  warn: '④ - 2 오류 다이얼로그',
  info: '④ - 3 알림 다이얼로그',
};

const FAMILY = {
  family: { id: 1, name: '우리집' },
  families: [{ id: 1, name: '우리집' }],
  members: [
    { user_id: 'u1', display_name: '태수', tag_color: 0 },
    { user_id: 'u2', display_name: '클로이', tag_color: 1 },
  ],
  user: { id: 'u1' },
  switchFamily: () => {},
  refresh: () => {},
};

const GIFTICON = {
  id: 1,
  name: '카페 아메리카노 T 2잔 + 딸기 생크림 케이크',
  brand: '스타벅스',
  amount: 500000,
  spent_amount: 120000,
  is_voucher: true,
  expires_at: '2026-09-03',
};

// 시안은 늘 폰 폭으로 본다. 넓은 창에서 보면 시트가 480 까지 벌어져서, 글이 몇 줄로
// 접히는지도 버튼이 나란히 들어가는지도 실제와 달라진다.
const PHONE = `
  [data-slot="sheet-content"] { max-width: 375px !important; }`;

function Bar({ cur }) {
  // 옆으로 미는 띠였는데 스크롤이 안 먹었다. Radix 가 창을 열면 바깥 스크롤을 막기
  // 때문이다(react-remove-scroll). 뒤쪽 선택지에 손이 닿지 않으니 고르는 칸으로 바꾼다 —
  // 제 목록을 스스로 띄우는 것이라 스크롤이 필요 없고, 한 줄이라 화면도 안 가린다.
  return (
    <div
      style={{
        position: 'fixed', insetInline: 0, top: 0, zIndex: 100, display: 'flex', alignItems: 'center',
        gap: 8, padding: '6px 10px', background: '#1b1b21', pointerEvents: 'auto',
      }}
    >
      <select
        value={cur}
        onChange={(e) => {
          location.search = '?v=' + e.target.value;
        }}
        style={{
          flex: 1, minWidth: 0, height: 28, borderRadius: 8, border: 0, padding: '0 8px',
          background: '#3f3f4a', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
        }}
      >
        {Object.entries(STAGES).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

// 제목이 닫기 버튼 밑으로 들어가는 것은 눈으로 잘 안 잡힌다 — 제목이 짧으면 안 겹치고
// 길어야 겹치기 때문이다. 열릴 때마다 재서 걸리면 화면에 띄운다.
function useCloseGuard() {
  useEffect(() => {
    const id = setInterval(() => {
      const t = document.querySelector('[data-slot="sheet-title"]');
      const c = document.querySelector('[data-slot="sheet-content"]');
      if (!t || !c) return;
      const close = [...c.querySelectorAll('button')].find((b) => b.querySelector('.sr-only'));
      const el = document.getElementById('guard');
      if (!close || !el) return;
      const hit = t.getBoundingClientRect().right > close.getBoundingClientRect().left;
      el.textContent = hit ? '제목이 닫기 버튼과 겹친다' : '';
      el.style.display = hit ? 'block' : 'none';
    }, 400);
    return () => clearInterval(id);
  }, []);
}

function App() {
  useCloseGuard();
  const cur = new URLSearchParams(location.search).get('v') || 'rename1';
  const [, force] = useState(0);
  const reopen = () => force((n) => n + 1);

  return (
    <>
      <style>{PHONE}</style>
      <Bar cur={cur} />
      <div
        id="guard"
        style={{
          display: 'none', position: 'fixed', insetInline: 0, bottom: 0, zIndex: 200,
          background: '#e03e49', color: '#fff', fontSize: 12, fontWeight: 700,
          padding: '10px 14px', textAlign: 'center',
        }}
      />
      <div style={{ height: 40 }} />

      {cur === 'rename1' && (
        <RenameSheet
          title="어떤 이름을 쓸까요?"
          label="이름"
          initialValue="태수"
          placeholder="예: 태수"
          description="기프티콘에 적힌 이름도 함께 바뀌어요."
          onSubmit={async () => {}}
          onClose={reopen}
        />
      )}

      {cur === 'rename2' && (
        <RenameSheet
          title="이 가족을 뭐라고 부를까요?"
          label="가족 이름"
          hint="가족 모두가 함께 쓰는 이름이에요."
          initialValue="우리집"
          placeholder="예: 우리 가족"
          onSubmit={async () => {}}
          onClose={reopen}
        />
      )}

      {cur === 'spend' && <SpendSheet gifticon={GIFTICON} onSpend={async () => {}} onClose={reopen} />}

      {cur === 'extend' && <ExtendSheet gifticon={GIFTICON} onExtend={async () => {}} onClose={reopen} />}

      {cur === 'photo' && (
        <ImageViewerModal
          gifticon={{
            ...GIFTICON,
            // 사진 두 장 — 제목 아래 '2장 중 1장' 같은 줄이 그때만 뜬다
            image_urls: [
              'data:image/svg+xml;utf8,' +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="300" height="420" fill="%23e7e7ec"/></svg>'
                ),
              'data:image/svg+xml;utf8,' +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="300" height="420" fill="%23d8d8e0"/></svg>'
                ),
            ],
          }}
          onClose={reopen}
        />
      )}

      {cur === 'barcode' && (
        // BarcodeModal 은 useFamily 를 부른다. 감싸지 않으면 흰 화면만 나온다.
        <FamilyContext.Provider value={FAMILY}>
          <BarcodeModal
            gifticon={{ ...GIFTICON, code: '8801234567890123' }}
            onClose={reopen}
            onUsed={reopen}
            onSpend={reopen}
          />
        </FamilyContext.Provider>
      )}

      {cur === 't16' && (
        <FamilyContext.Provider value={FAMILY}>
          <FilterBar
            search=""
            onSearchChange={() => {}}
            category=""
            onCategoryChange={() => {}}
            categoryCounts={{ cafe: 5 }}
            totalCount={12}
            statusTab="usable"
            onStatusTabChange={() => {}}
          />
          <p style={{ padding: 16, fontSize: 13, color: '#71717f' }}>
            ↑ 왼쪽 위 <b>쓸 수 있는 것</b> 을 눌러 고르개 시트를 연다.
          </p>
        </FamilyContext.Provider>
      )}

      {cur === 't16b' && (
        <FamilyContext.Provider value={FAMILY}>
          <FamilySwitcherSheet onClose={reopen} />
        </FamilyContext.Provider>
      )}

      {cur === 't16c' && (
        <FamilyContext.Provider value={FAMILY}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 16 }}>
            <GifticonCard
              gifticon={{ ...GIFTICON, owner: '태수', status: 'active' }}
              onViewCode={() => {}}
              onViewImage={() => {}}
              onToggleUsed={() => {}}
              onEdit={() => {}}
              onDelete={() => {}}
              onFindStores={() => {}}
              onToggleClaim={() => {}}
              onExtend={() => {}}
              onSpend={() => {}}
            />
          </ul>
          <p style={{ padding: 16, fontSize: 13, color: '#71717f' }}>
            ↑ 카드 오른쪽 위 <b>⋮</b> 를 눌러 메뉴 시트를 연다.
          </p>
        </FamilyContext.Provider>
      )}

      {cur === 'danger' && (
        <AlertDialog
          tone="danger"
          title="이 기프티콘을 지울까요?"
          description="지우면 되돌릴 수 없어요. 가족 모두의 목록에서 사라져요."
          confirmLabel="지우기"
          cancelLabel="그만두기"
          onConfirm={reopen}
          onClose={reopen}
        />
      )}

      {cur === 'warn' && (
        <AlertDialog
          tone="warning"
          title="사진을 읽지 못했어요"
          description="바코드가 흐릿하게 찍혔어요. 다시 찍거나 직접 등록으로 올려주세요."
          confirmLabel="확인"
          onConfirm={reopen}
        />
      )}

      {cur === 'info' && (
        <AlertDialog
          tone="info"
          title="저장했어요"
          description="기프티콘 3개를 목록에 넣었어요."
          confirmLabel="확인"
          onConfirm={reopen}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
