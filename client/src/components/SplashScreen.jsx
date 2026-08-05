import Logo from './Logo';

// 앱을 열자마자 세션/가족 정보를 확인하는 동안 보여주는 인트로 화면.
// 그냥 "불러오는 중…" 텍스트만 스쳐 지나가면 뭔지 알 수 없어서,
// 로고와 한 줄 소개를 함께 보여줘 앱을 인지할 수 있게 한다.
//
// ⚠️ 지금은 아무 데서도 쓰지 않는다. 웹(설치형 PWA)에서는 앱을 켤 때 브라우저가 먼저
// 제 스플래시(아이콘 + 앱 이름)를 띄우는데, 그건 우리가 끌 수 없어서 이 화면까지 나오면
// 같은 인사를 두 번 하게 된다. 그래서 AuthGate에서 떼어냈다(40117b0).
//
// 지우지 않고 남겨둔 이유: Capacitor로 앱을 만들 때 되살릴 화면이다. 네이티브에서는
// 런치 스크린을 우리가 그리고 언제 내릴지도 정할 수 있어서(@capacitor/splash-screen의
// launchAutoHide: false + SplashScreen.hide()), 이 화면과 똑같이 생긴 네이티브 이미지를
// 깔아두면 인트로가 한 번만 보이게 이어붙일 수 있다. 그때 AuthGate에 다시 끼우면 된다.
export default function SplashScreen() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-background px-6">
      <Logo className="animate-splash-in size-16" />
      <div className="animate-splash-in-delayed flex flex-col items-center gap-1.5">
        <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">모아콘</h1>
        <p className="m-0 text-center text-sm break-keep text-muted-foreground">
          받은 기프티콘을 한곳에. 가족과 함께 볼 수 있어요.
        </p>
      </div>
    </div>
  );
}
