import Logo from './Logo';

// 앱을 열자마자 세션/가족 정보를 확인하는 동안 잠깐 보이는 화면.
// 그냥 "불러오는 중…" 텍스트만 스쳐 지나가면 뭔지 알 수 없어서,
// 로고와 한 줄 소개를 함께 보여줘 앱을 인지할 수 있게 한다.
export default function SplashScreen() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-background px-6">
      <Logo className="animate-splash-in size-16" />
      <div className="animate-splash-in-delayed flex flex-col items-center gap-1.5">
        <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">모아콘</h1>
        <p className="m-0 text-center text-sm break-keep text-muted-foreground">
          가족끼리 주고받은 기프티콘을 한곳에 모아서 관리해요.
        </p>
      </div>
    </div>
  );
}
