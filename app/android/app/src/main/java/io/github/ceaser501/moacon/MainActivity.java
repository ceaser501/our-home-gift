package io.github.ceaser501.moacon;

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
        applySystemFontScale();
    }

    /**
     * 폰 설정의 글자 크기를 화면에 반영한다.
     *
     * 웹뷰는 시스템 글자 크기를 무시하고 늘 100%로 그린다. 크롬은 반영하기 때문에,
     * 글자를 키워둔 사람은 같은 화면인데 앱에서만 작게 보인다. 실제로 "웹보다 한 포인트씩
     * 작아진 것 같다"는 말이 나왔다.
     *
     * 이 앱은 가족이 함께 쓴다. 글자를 키워두는 건 대개 그게 필요해서 키워둔 것이라,
     * 그 설정을 따르는 게 맞다.
     *
     * 다만 그대로 따르지는 않는다. 안드로이드는 200%까지 허용하는데 그만큼 키우면 버튼
     * 글자가 넘쳐 눌러야 할 것이 화면 밖으로 나간다. 줄이는 쪽도 따르지 않는다 —
     * 읽기 어려워지는 방향이라 굳이 맞출 이유가 없다.
     *
     * 처음에는 130%까지 따라갔는데, 폰 설정을 크게 해두고 열어보니 목록 카드의 칸이
     * 어긋났다. 이 앱의 화면은 상품명·기한·버튼이 한 줄에 나란히 놓이는 곳이 많아서,
     * 글자만 커지면 그 줄이 먼저 무너진다. 읽기 편하자고 키운 것이 도리어 못 읽는
     * 화면을 만든다.
     *
     * 115%까지만 따라간다. 한 눈금 정도는 커지면서 칸은 유지되는 선이다.
     */
    private void applySystemFontScale() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        float scale = getResources().getConfiguration().fontScale;
        int zoom = Math.round(scale * 100);
        webView.getSettings().setTextZoom(Math.max(100, Math.min(115, zoom)));
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
    }

    private void pushInsets(final WebView webView) {
        if (webView == null || insetTop < 0 || insetBottom < 0) return;
        final String js =
            "document.documentElement.style.setProperty('--android-inset-top','" + insetTop + "px');" +
            "document.documentElement.style.setProperty('--android-inset-bottom','" + insetBottom + "px');";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
