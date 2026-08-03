// 인트로 스플래시는 앱을 처음 열 때 한 번만 보여주고,
// 그 뒤(로그인 직후 가족 정보 조회 등)에 잠깐 기다리는 순간에는 이 조용한 화면을 쓴다.
export default function LoadingScreen() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] items-center justify-center bg-background px-6">
      <span
        className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground"
        role="status"
        aria-label="불러오는 중"
      />
    </div>
  );
}
