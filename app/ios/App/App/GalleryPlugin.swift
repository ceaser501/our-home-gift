import Foundation
import Capacitor
import Photos
import UIKit

// 아이폰 사진첩 훑기. 안드로이드의 GalleryPlugin.java와 같은 이름(MoaconGallery)과 같은
// 메서드를 둔다 — client/src/utils/gallery.js가 두 폰을 가리지 않고 같은 것을 부른다.
//
//   getStatus()        {granted, partial, installedAt}
//   requestAccess()    같음
//   listImages(...)    {images:[{id, name, addedAt, bucket}], partial, since, folders, total}
//   readImage(...)     {data(base64 jpeg), width, height}
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
        CAPPluginMethod(name: "listImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise)
    ]

    // 안드로이드와 같은 값. 목록 상한과 사진을 넘길 때의 크기·화질.
    private let defaultLimit = 300
    private let defaultMaxEdge = 2000
    private let jpegQuality: CGFloat = 0.85

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

    // ── 사진 목록 ──────────────────────────────────────────────────────────────
    //
    // 아이폰에는 폴더가 없다. 카카오톡에서 저장한 것도 문자에서 저장한 것도 한 사진첩에
    // 섞인다. 그래서 buckets 인자는 받되 쓰지 않고, 기간(since)으로만 자른다.
    // folders는 빈 배열이다 — 화면이 폴더 칩 대신 기간과 장수를 보여준다.
    //
    // 대신 bucket 칸은 채운다. 화면 쪽이 이 값으로 "원본인가"를 가린다
    // (client/src/utils/gallery.js의 isOriginal).
    //   스크린샷            → "Screenshots"  (아이폰이 스스로 표시해 둔다)
    //   파일 이름이 KakaoTalk_… → "KakaoTalk"  (카카오톡이 저장할 때 붙이는 이름)
    //   그 밖               → ""             (모른다. 원본으로 치지 않는다)
    //
    // total은 기간 안의 전체 장수다. 상한(limit)에 걸려 덜 담았는지를 화면이 알 수 있게.
    @objc func listImages(_ call: CAPPluginCall) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            call.reject("사진 접근 권한이 없어요.", "no_permission")
            return
        }

        var since = Int(call.getString("since") ?? "0") ?? 0
        if since <= 0 { since = installedAtSeconds() }
        let limit = call.getInt("limit") ?? defaultLimit

        DispatchQueue.global(qos: .userInitiated).async {
            let options = PHFetchOptions()
            options.predicate = NSPredicate(
                format: "creationDate >= %@",
                Date(timeIntervalSince1970: TimeInterval(since)) as NSDate
            )
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            let assets = PHAsset.fetchAssets(with: .image, options: options)

            var images: [[String: Any]] = []
            let count = min(assets.count, max(0, limit))
            if count > 0 {
                for index in 0..<count {
                    let asset = assets.object(at: index)
                    let name = PHAssetResource.assetResources(for: asset).first?.originalFilename ?? ""
                    images.append([
                        // 아이폰의 사진 id는 문자열이다. 안드로이드도 문자열로 주고받는다.
                        "id": asset.localIdentifier,
                        "name": name,
                        "addedAt": Int(asset.creationDate?.timeIntervalSince1970 ?? 0),
                        "bucket": self.bucketFor(asset, name: name)
                    ])
                }
            }

            call.resolve([
                "images": images,
                "partial": status == .limited,
                "since": since,
                "folders": [] as [Any],
                "total": assets.count
            ])
        }
    }

    private func bucketFor(_ asset: PHAsset, name: String) -> String {
        if asset.mediaSubtypes.contains(.photoScreenshot) { return "Screenshots" }
        if name.lowercased().hasPrefix("kakaotalk") { return "KakaoTalk" }
        return ""
    }

    // ── 사진 한 장 ─────────────────────────────────────────────────────────────
    //
    // 바코드를 읽을 만큼만 줄여서 jpeg로 넘긴다. 안드로이드와 같은 크기(긴 변 2000)와
    // 화질(85)이다 — 두 폰에서 같은 사진이 같은 그림으로 판독기에 들어가야 "갤럭시는
    // 읽는데 아이폰은 못 읽는다"가 안 생긴다.
    //
    // iCloud에만 있는 사진은 받아와서 읽는다(isNetworkAccessAllowed). 오래 걸릴 수 있지만,
    // 막아두면 그 사진은 조용히 빠진다 — 사진첩 최적화를 켠 아이폰에서는 대부분이 그렇다.
    @objc func readImage(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("사진 id가 없어요.", "no_id")
            return
        }
        let maxEdge = max(100, call.getInt("maxEdge") ?? defaultMaxEdge)

        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            call.reject("사진을 열지 못했어요.", "open_failed")
            return
        }

        let longest = max(asset.pixelWidth, asset.pixelHeight)
        let scale = longest > maxEdge ? CGFloat(maxEdge) / CGFloat(longest) : 1
        let target = CGSize(
            width: max(1, (CGFloat(asset.pixelWidth) * scale).rounded()),
            height: max(1, (CGFloat(asset.pixelHeight) * scale).rounded())
        )

        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false

        // highQualityFormat이면 한 번만 온다. 그래도 두 번 답하지 않게 막아둔다 —
        // 한 호출에 두 번 답하면 캐패시터가 경고를 남기고 두 번째는 버려진다.
        var answered = false
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: target,
            contentMode: .aspectFit,
            options: options
        ) { image, info in
            if answered { return }
            if let degraded = info?[PHImageResultIsDegradedKey] as? Bool, degraded { return }
            answered = true

            guard let image = image, let data = image.jpegData(compressionQuality: self.jpegQuality) else {
                call.reject("사진을 읽지 못했어요.", "decode_failed")
                return
            }
            let pixelWidth = Int((image.size.width * image.scale).rounded())
            let pixelHeight = Int((image.size.height * image.scale).rounded())
            call.resolve([
                "data": data.base64EncodedString(),
                "width": pixelWidth,
                "height": pixelHeight
            ])
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
