import Foundation
import Capacitor
import Photos
import UIKit

// 아이폰 사진첩 훑기. 안드로이드의 GalleryPlugin.java와 같은 이름(MoaconGallery)과 같은
// 메서드를 둔다 — client/src/utils/gallery.js가 두 폰을 가리지 않고 같은 것을 부른다.
//
//   getStatus()        {granted, partial, installedAt}
//   requestAccess()    같음
//   listImages(...)    2단계에서 만든다
//   readImage(...)     2단계에서 만든다
//   openAppSettings()  이 앱의 설정 화면
//
// 만드는 방향은 docs/ios-gallery.md에 있다.
@objc(MoaconGalleryPlugin)
public class MoaconGalleryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MoaconGalleryPlugin"
    public let jsName = "MoaconGallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise)
    ]

    // 권한 상태를 안드로이드와 같은 두 칸으로 접는다.
    //
    //   .authorized → granted   사진첩 전체를 볼 수 있다. 자동 찾기가 된다.
    //   .limited    → partial   사용자가 고른 몇 장만 보인다. 새로 저장한 기프티콘은 못 본다.
    //   그 밖       → 둘 다 false
    //
    // .readWrite로 묻는 것은 '읽기'가 거기 들어 있어서다. .addOnly는 저장만 하는 권한이다.
    private func statusResult(_ status: PHAuthorizationStatus) -> [String: Any] {
        return [
            "granted": status == .authorized,
            "partial": status == .limited,
            "installedAt": installedAtSeconds()
        ]
    }

    // 훑기 기준선 — 설치한 날 0시(이 폰의 시간대). 안드로이드와 같은 규칙이다.
    //
    // 아이폰은 설치 시각을 알려주는 기능이 없다. 대신 앱의 Documents 폴더가 만들어진 날을
    // 쓴다. 앱을 처음 깔 때 생기고, 업데이트해도 그대로라서 1.0.1부터 쓰던 사람도 처음
    // 설치한 날로 잡힌다. 못 읽으면 0 — 화면 쪽이 '기준 없음'으로 다룬다.
    private func installedAtSeconds() -> Int {
        guard
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
            let attrs = try? FileManager.default.attributesOfItem(atPath: docs.path),
            let created = attrs[.creationDate] as? Date
        else { return 0 }
        return Int(Calendar.current.startOfDay(for: created).timeIntervalSince1970)
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(statusResult(PHPhotoLibrary.authorizationStatus(for: .readWrite)))
    }

    // 이미 정해졌으면(허용·거절·일부) 아이폰은 다시 묻지 않는다. 그때는 지금 상태만
    // 돌려준다 — 거절한 사람을 설정으로 보내는 것은 화면 쪽 일이다.
    @objc func requestAccess(_ call: CAPPluginCall) {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if current != .notDetermined {
            call.resolve(statusResult(current))
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            call.resolve(self.statusResult(status))
        }
    }

    // 이 앱의 설정 화면. 사진·위치·카메라 권한을 바꾸는 곳이다.
    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString),
                  UIApplication.shared.canOpenURL(url) else {
                call.reject("설정을 열 수 없어요.")
                return
            }
            UIApplication.shared.open(url) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("설정을 열 수 없어요.")
                }
            }
        }
    }
}
