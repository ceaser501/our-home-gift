import { useEffect, useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { lastLoginMethod, sendMagicLink, signInWithGoogle, signInWithKakao, signInWithNaver } from '../auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import Logo from './Logo';
import InstallPrompt from './InstallPrompt';

// 네이버 마크. 글자 N을 그냥 적어뒀더니 앞뒤 두 가지가 어긋났다 — 다른 둘은 그림인데
// 이것만 글자라 획 굵기가 따로 놀고, 19px 네모 안에 작은 글자가 들어앉아 오른쪽에
// 빈자리가 남아 이름과의 간격만 벌어졌다. 마크를 그대로 그린다.
function NaverIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z"
      />
    </svg>
  );
}

function GoogleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.1C3.24 21.3 7.29 24 12 24z"
      />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.26a12 12 0 0 0 0 10.78z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.29 0 3.24 2.7 1.26 6.61l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

// 지난번에 쓴 수단.
//
// 로그인 수단마다 이메일이 달라서(구글은 gmail, 네이버는 naver.com) 다른 걸 누르면
// 아예 다른 계정이 된다 — 같은 사람이 가족 구성원 두 명으로 늘어난다. 앱은 그 둘이
// 같은 사람인지 알 수 없으니, 애초에 헷갈리지 않게 하는 것이 유일한 방법이다.
//
// 한때 이 자리를 테두리 카드로 감쌌다. 그러면 안쪽 여백만큼 이 버튼만 좁아져서, 아래
// '다른 방법'의 버튼들과 폭이 어긋난다 — 같은 일을 하는 단추 넷이 두 가지 폭으로 놓인다.
// 그래서 표시는 버튼 위에 얹고 이유는 버튼 아래에 적는다. 폭은 넷 다 같다.
//
// 경고를 아래에 붙이는 것은 지킨다. 예전에는 화면 맨 아래에 뒀는데, 그러면 버튼을 누른
// 뒤에 읽는다. 바로 밑에 있어야 누르기 전에 눈에 들어온다.
function LastUsed({ children }) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute -top-2 right-3 z-10 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">
          최근 로그인
        </span>
        {children}
      </div>
      <div className="flex items-start gap-2 px-0.5">
        <span className="mt-px flex size-[17px] shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
          !
        </span>
        <p className="m-0 flex-1 text-[13px] leading-relaxed break-keep text-muted-foreground">
          다른 방법으로 로그인하면 새 계정이 만들어져요
        </p>
      </div>
    </div>
  );
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [naverLoading, setNaverLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  // 화면이 그려질 때 한 번만 읽는다. 이 화면에 머무는 동안 바뀔 값이 아니다.
  const [lastUsed] = useState(() => lastLoginMethod());
  // 지난번에 쓴 것이 따로 있는 날, 이메일 칸을 펼쳤는가.
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginError = params.get('login_error');
    if (loginError) {
      setError(loginError);
      params.delete('login_error');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || '로그인 링크 전송에 실패했어요.');
    } finally {
      setSending(false);
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || '구글 로그인에 실패했어요.');
      setGoogleLoading(false);
    }
  }

  async function handleNaverLogin() {
    setNaverLoading(true);
    setError('');
    try {
      await signInWithNaver();
    } catch (err) {
      setError(err.message || '네이버 로그인에 실패했어요.');
      setNaverLoading(false);
    }
  }

  async function handleKakaoLogin() {
    setKakaoLoading(true);
    setError('');
    try {
      await signInWithKakao();
    } catch (err) {
      setError(err.message || '카카오 로그인에 실패했어요.');
      setKakaoLoading(false);
    }
  }

  // 세 수단을 한 줄씩. 지난번에 쓴 것과 나머지가 같은 모양을 쓰되 무게만 다르다.
  //
  // 차례는 쓰는 사람이 많을 순서다 — 카카오 · 네이버 · 구글. 기프티콘을 주고받는 곳이
  // 카카오톡이라 그쪽이 맨 위고, 나머지 둘은 국내에서 쓰는 비중을 따랐다.
  const socials = [
    {
      key: 'kakao',
      label: kakaoLoading ? '연결 중…' : '카카오로 로그인',
      // 노란 바탕 위 글자색(#191919)을 그대로 따라간다.
      icon: <MessageCircle className="size-[19px] fill-current" />,
      onClick: handleKakaoLogin,
      loading: kakaoLoading,
      brand: 'bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]/90',
    },
    {
      key: 'naver',
      label: naverLoading ? '연결 중…' : '네이버로 로그인',
      // 마크가 꽉 찬 도형이라 옆의 둘(말풍선·G)보다 무겁게 읽힌다. 그만큼 작게 그린다.
      icon: <NaverIcon className="size-[14px]" />,
      onClick: handleNaverLogin,
      loading: naverLoading,
      brand: 'bg-[#03C75A] text-white hover:bg-[#03C75A]/90',
    },
    {
      key: 'google',
      label: googleLoading ? '연결 중…' : '구글로 로그인',
      // 구글은 흰 버튼에 색 있는 G가 제 모양이다(구글이 정해둔 것). 그래서 brand가 없다.
      icon: <GoogleIcon className="size-[19px]" />,
      onClick: handleGoogleLogin,
      loading: googleLoading,
      brand: null,
    },
  ];

  // plain은 '다른 방법' 자리에 놓일 때다. 여기서도 브랜드 색은 그대로 간다.
  //
  // 한때 이 자리에서 색을 빼 흰 버튼으로 눕혔다. 지난번에 쓴 것 하나만 눈에 들어오게
  // 하려던 것인데, 그러면 카카오 노랑과 네이버 초록이 사라진다. 그 색은 강조하려고
  // 있는 게 아니라 알아보라고 있는 것이다 — 노란 것을 찾는 사람에게 흰 줄 세 개는
  // 다 읽어야 하는 목록이 된다.
  //
  // 무게는 색 말고 다른 것으로 가른다: 위에 붙은 '최근 로그인' 표시, 그 아래 한 줄
  // 경고, 그리고 높이(52 → 48px).
  function renderSocial(method, plain) {
    return (
      <Button
        key={method.key}
        type="button"
        size="lg"
        onClick={method.onClick}
        disabled={method.loading}
        variant={method.brand ? 'default' : 'outline'}
        className={cn(
          'w-full rounded-[13px] font-semibold',
          plain ? 'h-12 text-[15px]' : 'h-[52px] text-[15.5px]',
          // 브랜드 색이 없는 것(구글)만 '다른 방법'에서 한 단 눕는다.
          plain && !method.brand && 'text-muted-foreground',
          method.brand
        )}
      >
        {method.icon}
        {method.label}
      </Button>
    );
  }

  // 이메일은 평소에 접어둔다. 소셜 셋은 한 번만 누르면 끝인데 이쪽만 칸을 적어야 해서,
  // 펼쳐두면 네 번째 자리가 혼자 두 칸을 먹는다. 필요한 사람만 펼친다.
  //
  // 라벨은 뒤에 걷었다 — 라벨·플레이스홀더·버튼이 같은 말을 세 번 했다.
  // 화면을 읽어주는 기기에는 aria-label로 남는다.
  const emailToggle = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => setEmailOpen(true)}
      className="h-12 w-full rounded-[13px] text-[15px] font-semibold text-muted-foreground"
    >
      이메일로 로그인 링크 받기
      <ChevronDown className="size-4" />
    </Button>
  );

  const emailForm = (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2.5">
      <Input
        id="login-email"
        aria-label="이메일"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        className="h-[52px] rounded-[13px] text-[15px]"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Button
        type="submit"
        size="lg"
        variant="outline"
        className="h-[52px] w-full rounded-[13px] text-[15.5px] font-semibold"
        disabled={sending}
      >
        {sending ? '전송 중…' : '이메일로 로그인 링크 받기'}
      </Button>
    </form>
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      <div className="pt-[var(--safe-top)]">
        <InstallPrompt />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-7">
      <div className="flex flex-col items-center gap-4">
        <Logo className="size-14 rounded-2xl shadow-[0_6px_18px_rgba(138,92,255,0.26)]" />
        <h1 className="m-0 text-[22px] font-bold tracking-[-0.03em] text-foreground">모아콘</h1>
        {/* 이 앱의 중심은 가족과 함께 보는 것이다. 개인용으로 방향을 틀면 카카오톡 선물함과
            겨루는 싸움이 되고, 유일한 차별점을 잃는다. 그래서 문구에서 가족을 빼지 않는다.
            다만 그것이 "가족이 있어야 쓸 수 있다"는 조건처럼 읽히면 혼자 쓰려던 사람이
            첫 화면에서 나가버리므로, 조건이 아니라 할 수 있는 일로 적는다.
            ("볼 수도 있어요"처럼 흐리지 않는다. 곁다리로 들려서 오히려 중심이 약해진다.) */}
        <p className="m-0 text-center text-[15px] leading-relaxed break-keep text-muted-foreground">
          기프티콘을 모아두고,
          <br />
          가족과 함께 볼 수 있어요
        </p>
      </div>

      {sent ? (
        <div className="w-full rounded-2xl border border-border bg-card p-5 text-center">
          <p className="m-0 text-base text-foreground">{email}로 로그인 링크를 보냈어요.</p>
          <p className="mt-1.5 mb-0 text-sm text-muted-foreground">메일함에서 링크를 눌러 로그인을 완료해주세요.</p>
        </div>
      ) : lastUsed ? (
        /* 두 번째부터. 지난번에 쓴 것 하나를 카드로 올려두고 나머지는 아래로 내린다. */
        <div className="flex w-full flex-col gap-5">
          <LastUsed>
            {lastUsed === 'email'
              ? emailForm
              : renderSocial(socials.find((m) => m.key === lastUsed) || socials[0], false)}
          </LastUsed>

          {error && <p className="m-0 text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2.5">
            <p className="m-0 text-[13px] font-semibold text-muted-foreground">다른 방법</p>
            {socials.filter((m) => m.key !== lastUsed).map((m) => renderSocial(m, true))}
            {lastUsed !== 'email' && (emailOpen ? emailForm : emailToggle)}
          </div>
        </div>
      ) : (
        /* 처음 오는 사람. 네 수단을 같은 무게로 나열한다. */
        <div className="flex w-full flex-col gap-2.5">
          {socials.map((m) => renderSocial(m, false))}

          <div className="flex items-center gap-2.5 py-0.5 text-[13.5px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>

          {error && <p className="m-0 text-sm text-destructive">{error}</p>}
          {emailOpen ? emailForm : emailToggle}
        </div>
      )}

      </div>
    </div>
  );
}
