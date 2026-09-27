import UIKit
import Capacitor

// 앱 안에 직접 둔 플러그인을 캐패시터에 알린다.
//
// npm으로 받은 플러그인은 캐패시터가 알아서 찾지만, 이 폴더에 둔 것(GalleryPlugin.swift)은
// 여기서 손으로 등록해야 한다. 안 하면 JS에서 부를 때 "플러그인이 없다"는 말만 돌아온다.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MoaconGalleryPlugin())
    }
}
