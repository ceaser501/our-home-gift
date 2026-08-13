package io.github.ceaser501.moacon;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 갤러리에서 기프티콘 후보를 찾아오는 플러그인. 웹에는 기기의 사진 폴더를 훑는
        // 방법이 없어서, 이 기능만 네이티브로 두고 나머지 판단은 화면 쪽이 한다.
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
        reportSystemBarInsets();
    }

    /**
     * 시스템 바(상태 바·내비게이션 바)가 차지하는 높이를 화면 쪽에 알려준다.
     *
     * 웹에는 이걸 알 방법이 없다. env(safe-area-inset-bottom)은 크롬이 디스플레이
     * 컷아웃(노치)에만 채워주고 내비게이션 바에는 쓰지 않아서, 안드로이드 웹뷰에서는
     * 늘 0이다. 그래서 시트 맨 아래 버튼이 제스처 바에 가려 눌리지 않았다.
     *
     * 값을 짐작해서 여백을 크게 주는 방법도 써봤는데, 제스처 바(24dp)와 3버튼 바(48dp)가
     * 다르고 기기마다도 달라서 맞출 수가 없었다. 실제 값을 받아 쓰는 게 맞다.
     *
     * 받는 쪽은 client/src/index.css의 --safe-bottom이다. 이 값이 오기 전에도 화면은
     * 그려지므로 CSS에 기본값을 함께 둔다.
     */
    private void reportSystemBarInsets() {
        final WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );

            // 안드로이드가 주는 값은 실제 화소, CSS가 쓰는 값은 dp다.
            float density = getResources().getDisplayMetrics().density;
            if (density <= 0f) density = 1f;
            final int top = Math.round(bars.top / density);
            final int bottom = Math.round(bars.bottom / density);

            webView.post(() -> webView.evaluateJavascript(
                "document.documentElement.style.setProperty('--android-inset-top','" + top + "px');" +
                "document.documentElement.style.setProperty('--android-inset-bottom','" + bottom + "px');",
                null
            ));

            // 그대로 돌려준다. 우리는 값을 알려주기만 하고 소비하지 않는다 —
            // 삼켜버리면 웹뷰 자체의 배치가 어긋난다.
            return windowInsets;
        });
    }
}
