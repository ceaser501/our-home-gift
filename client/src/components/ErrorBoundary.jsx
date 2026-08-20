import { Component } from 'react';

// 화면이 그리다 터지면 리액트는 트리를 통째로 걷어낸다. 받아주는 데가 없으면 남는 건
// 하얀 화면이고, 하얀 화면에는 아무 단서가 없다. 무엇이 터졌는지 알 수 없으니 고치는
// 쪽도 짐작으로 가게 되고, 짐작이 빗나가면 "손댈수록 오동작이 는다"가 된다.
//
// 그래서 여기서 받는다. 쓰는 사람에게는 무엇을 하면 되는지만 두 마디로 알려주고,
// 원인 한 줄은 작게 남긴다 — 그 한 줄을 찍어 보내주면 짐작하지 않아도 된다.
export default class ErrorBoundary extends Component {
  state = { message: null };

  static getDerivedStateFromError(error) {
    return { message: error?.message || String(error) };
  }

  render() {
    if (!this.state.message) return this.props.children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-8 text-center">
        <div>
          <p className="m-0 text-lg font-semibold text-foreground">화면이 멈췄어요</p>
          <p className="m-0 pt-2 text-sm break-keep text-muted-foreground">앱을 다시 시작하면 돼요.</p>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full max-w-64 rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground"
        >
          다시 시작
        </button>

        {/* 고치는 쪽이 볼 한 줄. 화면을 찍어 보내면 이걸로 자리를 짚는다. */}
        <p className="m-0 max-w-80 text-[11px] break-all text-muted-foreground/70">{this.state.message}</p>
      </div>
    );
  }
}
