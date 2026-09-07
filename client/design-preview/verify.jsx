// 실화면 검증용 하니스. 운영 컴포넌트를 그대로 불러 실제 토큰으로 그린다.
// Supabase 키가 없어도 화면을 볼 수 있게, 데이터와 FamilyContext 만 손으로 채운다.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { FamilyContext } from '../src/FamilyContext';
import GifticonList from '../src/components/GifticonList';
import AlertDialog from '../src/components/AlertDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../src/components/ui/sheet';
import { Button } from '../src/components/ui/button';
import { Input } from '../src/components/ui/input';
import { Label } from '../src/components/ui/label';

const FAMILY = {
  family: { id: 1, name: '우리집' },
  members: [
    { user_id: 'u1', display_name: '태수' },
    { user_id: 'u2', display_name: '클로이' },
  ],
  user: { id: 'u1' },
  joinRequests: [],
  dataVersion: 0,
  refreshFamily() {}, refetchFamily() {}, switchFamily() {}, signOut() {},
};

const today = new Date();
const day = (n) => new Date(today.getTime() + n * 864e5).toISOString().slice(0, 10);

// 극단 케이스를 일부러 섞는다 — 정상 데이터만 보면 실화면에서 깨지는 자리가 안 드러난다.
const ITEMS = [
  { id: 1, name: '아이스 카페 아메리카노 T', brand: '스타벅스', category: 'cafe',
    owner: '태수', expires_at: day(3), amount: null, status: 'active', code: '9816401685019' },
  { id: 2, name: '베스킨라빈스 파인트 아이스크림 교환권 (플레이버 2종 선택 가능)', brand: '배스킨라빈스',
    category: 'cafe', owner: '클로이', expires_at: day(1), amount: null, status: 'active', code: 'X1' },
  { id: 3, name: '신세계상품권', brand: '신세계', category: 'voucher', owner: '태수',
    expires_at: day(120), amount: 500000, is_voucher: true, spent_amount: 120000, status: 'active', code: 'V1' },
  { id: 4, name: '교촌 허니콤보', brand: '교촌치킨', category: 'chicken', owner: '클로이',
    expires_at: null, amount: 23000, status: 'active', code: 'C1' },
  { id: 5, name: 'CGV 영화관람권', brand: 'CGV', category: 'movie', owner: '태수',
    expires_at: day(-5), amount: null, status: 'active', code: 'M1' },
  { id: 6, name: '뚜레쥬르 생크림케이크', brand: '뚜레쥬르', category: 'cake', owner: '태수',
    expires_at: day(-30), amount: 32000, status: 'used', used_at: day(-31), code: 'K1' },
];

const noop = () => {};
const listProps = {
  onViewCode: noop, onViewImage: noop, onToggleUsed: noop, onEdit: noop,
  onDelete: noop, onFindStores: noop, onToggleClaim: noop, onExtend: noop, onSpend: noop,
};

function Phone({ title, tall, children }) {
  return (
    <div>
      <p className="cap">{title}</p>
      <div className={'phone' + (tall ? ' tall' : '')}>{children}</div>
    </div>
  );
}

// 다이얼로그와 시트는 document.body 로 portal 되고 fixed 로 깔린다. 한 화면에 여러 개를
// 늘어놓으면 서로 덮어써서 아무것도 못 본다. 그래서 ?v= 로 하나씩 그린다.
const STAGES = {
  list:   '① 기프티콘 리스트 — 극단 케이스 6건',
  empty:  '① - 2 빈 목록',
  danger: '② 삭제 다이얼로그',
  warn:   '② - 2 오류 다이얼로그',
  info:   '② - 3 알림 다이얼로그 (배지 없음)',
  sheet:  '③ 하단 시트',
};

function Nav({ cur }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:999, background:'#1c1e27',
                  padding:'8px 12px', display:'flex', gap:8, flexWrap:'wrap' }}>
      {Object.entries(STAGES).map(([k, label]) => (
        <a key={k} href={'?v=' + k}
           style={{ fontSize:11, color: k===cur ? '#fff' : '#9b9ba6', textDecoration:'none',
                    background: k===cur ? '#5b4fe8' : 'transparent', padding:'3px 9px', borderRadius:99 }}>
          {label}
        </a>
      ))}
    </div>
  );
}

function App() {
  const cur = new URLSearchParams(location.search).get('v') || 'list';
  const isOverlay = cur === 'danger' || cur === 'warn' || cur === 'info' || cur === 'sheet';
  return (
    <FamilyContext.Provider value={FAMILY}>
      <Nav cur={cur} />
      <div className="lab" style={{ paddingTop: 52 }}>
        {cur === 'list' && (
          <Phone title={STAGES.list} tall>
            <main className="flex-1 px-5 pt-3 pb-5">
              <GifticonList gifticons={ITEMS} {...listProps} />
            </main>
          </Phone>
        )}
        {cur === 'empty' && (
          <Phone title={STAGES.empty}>
            <main className="flex-1 px-5 pt-3 pb-5">
              <GifticonList gifticons={[]} {...listProps} />
            </main>
          </Phone>
        )}
        {isOverlay && (
          <Phone title={STAGES[cur === 'warn' ? 'warn' : cur]} tall>
            <main className="flex-1 px-5 pt-3 pb-5">
              <GifticonList gifticons={ITEMS.slice(0, 2)} {...listProps} />
            </main>
          </Phone>
        )}
      </div>

      {cur === 'danger' && (
        <AlertDialog title="이 기프티콘을 지울까요?" tone="danger"
          description="지운 기프티콘은 되돌릴 수 없어요." confirmLabel="지우기"
          onConfirm={noop} onClose={noop} />
      )}
      {cur === 'warn' && (
        <AlertDialog title="사용 금액을 기록하지 못했어요" tone="warning"
          description="잠시 뒤 다시 시도해주세요." confirmLabel="다시 시도"
          onConfirm={noop} onClose={noop} />
      )}
      {cur === 'info' && (
        <AlertDialog title="알림을 보냈어요" tone="info"
          description="가족 모두에게 전해졌어요." confirmLabel="확인" onClose={noop} />
      )}
      {cur === 'sheet' && (
        <Sheet open>
          <SheetContent onPointerDownOutside={(e) => e.preventDefault()}
                        onEscapeKeyDown={(e) => e.preventDefault()}>
            <SheetHeader className="pr-14 pb-1">
              <SheetTitle>기프티콘 추가</SheetTitle>
              <SheetDescription>사진을 올리면 이름과 기한을 읽어드려요.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-5 pt-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="v-name">상품명</Label>
                <Input id="v-name" defaultValue="아이스 카페 아메리카노 T" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="v-amt">금액</Label>
                <Input id="v-amt" defaultValue="500,000" />
              </div>
              <Button size="lg" className="w-full">저장하기</Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </FamilyContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
