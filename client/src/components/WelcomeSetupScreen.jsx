import { useState } from 'react';
import { BellRing, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SwitchTrack } from './SettingRow';
import { isGalleryScanSupported, setAutoScanOn } from '../utils/gallery';
import { isNativeApp } from '../utils/browser';
import { isServiceWorkerSupported } from '../utils/serviceWorker';

// 가족까지 정한 사람이 앱에 처음 들어가기 전에 한 번 보는 화면.
//
// 두 가지를 켜고 시작한다. 둘 다 켜짐으로 두고 열지, 여기서 끌 수 있게 한다.
//
// 왜 이 화면이 생겼나. 테스터가 "왜 자동 찾기가 안 되냐"고 물었다. 설정에 들어가
// 스위치를 켜야 도는 것이었는데, 앱을 연 사람 눈에는 아무 일도 안 일어나는 화면이라
// 고장으로 보였다. 받아둔 기프티콘을 넣는 것이 이 앱에 들어오는 이유인데, 그 일을
// 하려면 먼저 설정 화면을 찾아 들어가야 했던 것이다.
//
// 그렇다고 아무 말 없이 켜둘 수는 없다. 사진첩을 읽는 일이고 알림을 보내는 일이다.
// 무엇을 하는지 적어두고, 끄고 싶으면 여기서 끄게 한다.
//
// 권한 창(사진·알림)은 우리가 대신 누를 수 없다. 여기서 하는 일은 그 창이 뜰 자리를
// 만들어주는 것뿐이다 — 무슨 창인지 모른 채 뜨면 대개 '거부'를 누르고, 안드로이드는
// 두 번 거부하면 다시 물어볼 수도 없다.
//
// 알림은 이 화면에서 바로 묻는다(스위치를 켜둔 채 시작하기를 누른 그 순간이 맥락이다).
// 사진은 안 묻는다 — 다음에 찾기 창이 "기프티콘을 찾고 있어요"를 띄우는 그 자리가 더
// 분명한 맥락이라, 거기서 폰이 묻게 둔다.
export default function WelcomeSetupScreen({ familyId, onDone }) {
  const scanAvailable = isGalleryScanSupported();
  // 알림을 켤 수 있는 폰인지. 앱은 파이어베이스로, 웹은 브라우저 구독으로 간다.
  const pushAvailable = isNativeApp() || (isServiceWorkerSupported() && 'PushManager' in window);

  const [scan, setScan] = useState(true);
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);

    if (scanAvailable) setAutoScanOn(scan);

    // 알림은 켜기로 한 경우에만 묻는다. 거절해도 그냥 넘어간다 — 시작을 막을 일이 아니고,
    // 내 메뉴에서 언제든 다시 켤 수 있다.
    if (pushAvailable && push) {
      try {
        // 켜는 코드는 여기서 불러온다. 이 화면은 로그인 관문(AuthGate)이 들고 있는데,
        // 위에서 통째로 불러오면 그 관문을 세우는 것만으로 서버 연결까지 딸려 온다.
        if (isNativeApp()) {
          const { enableNativePush } = await import('../nativePush');
          await enableNativePush({ familyId });
        } else {
          const { subscribeToPush } = await import('../push');
          await subscribeToPush({ familyId });
        }
      } catch {
        // 권한을 거부했거나 알림 서버에 닿지 못했다. 여기서 붙잡지 않는다.
      }
    }

    onDone();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh/var(--ui-scale))] w-full max-w-[480px] flex-col bg-background px-6">
      <div className="flex flex-1 flex-col justify-center gap-7 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[25px] leading-[1.32] font-bold tracking-[-0.03em] break-keep text-foreground">
            두 가지만 켜고
            <br />
            시작할까요?
          </h1>
          <p className="m-0 text-[15px] leading-[1.6] font-medium break-keep text-muted-foreground">
            나중에 내 메뉴에서 바꿀 수 있어요.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {scanAvailable && (
            <SetupRow
              icon={ScanSearch}
              label="사진첩에서 기프티콘 찾기"
              hint="앱을 열 때 찾아서 상품명과 기한까지 채워드려요"
              on={scan}
              onToggle={() => setScan(!scan)}
            />
          )}
          {pushAvailable && (
            <SetupRow
              icon={BellRing}
              label="사용기한 알림 받기"
              hint="쓰기 전에 기한이 지나가지 않게 알려드려요"
              on={push}
              onToggle={() => setPush(!push)}
            />
          )}
        </div>
      </div>

      <div className="pb-[max(28px,var(--safe-bottom))]">
        <Button
          type="button"
          onClick={start}
          disabled={busy}
          className="h-14 w-full rounded-[14px] text-[16.5px] font-bold"
        >
          {busy ? '준비하는 중…' : '이대로 시작하기'}
        </Button>
      </div>
    </div>
  );
}

// 설정 화면의 줄과 같은 모양이다. 여기서 켜고 끈 것이 그대로 그 줄이 되므로, 나중에
// 내 메뉴에서 찾을 때 "아, 그때 그것"이 되어야 한다.
function SetupRow({ icon: Icon, label, hint, on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center gap-3.5 rounded-[15px] border border-border bg-card px-4 py-[18px] text-left"
    >
      <Icon className="size-[22px] shrink-0 text-foreground/70" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[16px] font-semibold tracking-[-0.015em] text-foreground">{label}</span>
        <span className="text-[13.5px] leading-[1.5] font-medium break-keep text-muted-foreground">{hint}</span>
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}
