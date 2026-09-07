package io.github.ceaser501.ourhomegift;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    // 마지막으로 잰 시스템 바 높이(dp). -1은 아직 재지 못했다는 뜻이다.
    private int insetTop = -1;
    private int insetBottom = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 갤러리에서 기프티콘 후보를 찾아오는 플러그인. 웹에는 기기의 사진 폴더를 훑는
        // 방법이 없어서, 이 기능만 네이티브로 두고 나머지 판단은 화면 쪽이 한다.
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
        watchSystemBarInsets();
        pinTextZoom();
    }

    /**
     * 웹뷰가 스스로 하는 글자 확대를 100%로 묶어둔다.
     *
     * 크기를 정하는 자리는 화면 쪽 한 곳이다 — client/src/utils/uiScale.js가 시스템 값을
     * 읽어(@capacitor/text-zoom의 getPreferred) index.css의 --ui-scale에 걸고, html의
     * zoom이 글자·여백·버튼·아이콘을 한꺼번에 움직인다. 여기서 글자에 배율을 또 걸면
     * 두 값이 곱해진다.
     *
     * 한동안 여기서 fontScale을 읽어 setTextZoom으로 걸었다. 그것을 "배율을 더하는 코드"로
     * 보고 걷어냈는데, 실은 웹뷰가 스스로 하던 확대를 묶어두는 코드였다. 걷어내자 웹뷰가
     * 시스템 글자 배율(최대 2.0배)을 그대로 먹기 시작했고, 거기에 zoom 1.15가 또 곱해져
     * 글자만 두 배가 됐다. 폰 글자를 키우면 상품명이 잘리고 '사용완료'가 버튼 밖으로
     * 넘쳤다 — 칸은 1.15배인데 글자는 2.3배였으니 당연한 일이다.
     *
     * 100으로 못 박아두면 그 곱셈이 사라진다. 시스템 글자 크기를 따라가는 일은 화면 쪽이
     * 이미 하고 있으므로 잃는 것도 없다.
     */
    private void pinTextZoom() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.getSettings().setTextZoom(100);
    }

    /**
     * 시스템 바(상태 바·내비게이션 바)가 차지하는 높이를 화면 쪽에 알려준다.
     *
     * 웹에는 이걸 알 방법이 없다. env(safe-area-inset-bottom)은 크롬이 디스플레이
     * 컷아웃(노치)에만 채워주고 내비게이션 바에는 쓰지 않아서, 안드로이드 웹뷰에서는
     * 늘 0이다. 그래서 시트 맨 아래 버튼이 제스처 바에 가려 눌리지 않았다.
     *
     * 재는 것과 보내는 것을 나눠 둔 이유가 있다. 높이를 재는 때(웹뷰가 자리를 잡을 때)는
     * 우리 화면이 아직 로드되기 전이라, 그때 값을 심어도 페이지가 뜨면서 통째로 사라진다.
     * 처음에 그렇게 만들었다가 값이 한 번도 도착하지 못했다 — 화면은 CSS의 기본값으로만
     * 돌고 있었고, 상단은 기본값이 우연히 맞아서 고쳐진 것처럼 보였다.
     *
     * 그래서 잰 값을 들고 있다가 화면이 준비된 뒤에 다시 보낸다.
     *
     * 받는 쪽은 client/src/index.css의 --safe-top / --safe-bottom이다.
     */
    private void watchSystemBarInsets() {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );

            // 안드로이드가 주는 값은 실제 화소, CSS가 쓰는 값은 dp다.
            float density = getResources().getDisplayMetrics().density;
            if (density <= 0f) density = 1f;
            insetTop = Math.round(bars.top / density);
            insetBottom = Math.round(bars.bottom / density);
            // 리스너가 넘겨주는 건 View다. 같은 웹뷰지만 형이 달라서, 위에서 잡아둔
            // 참조를 그대로 쓴다.
            pushInsets(webView);

            // 그대로 돌려준다. 우리는 값을 알려주기만 하고 소비하지 않는다 —
            // 삼켜버리면 웹뷰 자체의 배치가 어긋난다.
            return windowInsets;
        });

        // 화면이 다 뜬 뒤에 한 번 더 보낸다. 이때가 실제로 값이 남는 시점이다.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                pushInsets(view);
            }
        });
    }

    // 다른 앱에 다녀오는 사이 내비게이션 방식이 바뀌었을 수 있다(제스처 ↔ 3버튼).
    // 돌아올 때마다 마지막 값을 다시 심어준다.
    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() != null) pushInsets(getBridge().getWebView());
        // 폰 설정에서 글자 크기를 바꾸고 돌아오는 길. 그때 웹뷰가 제 배율을 다시 잡을 수
        // 있어서 한 번 더 못 박는다.
        pinTextZoom();
    }

    private void pushInsets(final WebView webView) {
        if (webView == null || insetTop < 0 || insetBottom < 0) return;
        final String js =
            "document.documentElement.style.setProperty('--android-inset-top','" + insetTop + "px');" +
            "document.documentElement.style.setProperty('--android-inset-bottom','" + insetBottom + "px');";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
