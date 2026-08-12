package io.github.ceaser501.moacon;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 갤러리에서 기프티콘 후보를 찾아오는 플러그인. 웹에는 기기의 사진 폴더를 훑는
        // 방법이 없어서, 이 기능만 네이티브로 두고 나머지 판단은 화면 쪽이 한다.
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
