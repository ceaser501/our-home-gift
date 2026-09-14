# 아이폰 사진첩 훑기 — 만드는 방향 (2026-09-14)

안드로이드에만 있는 기능을 아이폰에 옮긴다. **위층은 손댈 것이 거의 없다** —
네이티브 플러그인 하나를 스위프트로 새로 쓰는 일이다.

참고: [to-be.md](to-be.md)의 1장(왜 되는가), [running-cost.md](running-cost.md)(요금).

---

## 1. 왜 위층을 안 건드려도 되나

`client/src/utils/gallery.js`가 네이티브에 부르는 것은 **다섯 개뿐이다.**

| 부르는 것 | 받는 것 |
|---|---|
| `getStatus()` | `{granted, partial, installedAt}` |
| `requestAccess()` | 같음 |
| `listImages({buckets, limit, since})` | `{images:[{id, name, addedAt, bucket}], partial, since, folders}` |
| `readImage({id, maxEdge})` | `{data(base64), width, height}` |
| `openAppSettings()` | — |

**이 다섯을 스위프트로 똑같이 만들면 그 위는 전부 그대로 돈다.** 후보 거르기,
zxing 판독, 같은 번호 묶기, 이미 등록된 것 빼기, 아니라고 한 사진 기억하기 —
전부 JS라 플랫폼을 안 탄다.

## 2. PhotoKit으로 어떻게 맞추나

| | 안드로이드 | 아이폰 |
|---|---|---|
| 권한 상태 | `READ_MEDIA_IMAGES` | `PHPhotoLibrary.authorizationStatus(for: .readWrite)` |
| 전체 허용 | 권한 있음 | `.authorized` → `granted: true` |
| 일부 허용 | `READ_MEDIA_VISUAL_USER_SELECTED` | **`.limited` → `partial: true`** |
| 사진 목록 | MediaStore + 폴더 이름 | `PHAsset.fetchAssets` + `creationDate` |
| 사진 읽기 | `BitmapFactory` + 축소 | `PHImageManager.requestImage(targetSize:)` |
| 설정 열기 | `ACTION_APPLICATION_DETAILS_SETTINGS` | `UIApplication.openSettingsURLString` |

`openAppSettings`는 [store-release.md](store-release.md) 5장에 이미 할 일로 적혀 있던
것이다. **이 작업에 딸려 온다.**

## 3. ⚠️ 폴더가 없다 — 여기가 유일하게 다른 곳

아이폰에는 「다운로드 / 카카오톡 / 스크린샷」 폴더가 없다. 카카오톡에서 저장한 것도
문자에서 저장한 것도 **카메라롤에 그냥 섞인다**(iOS가 앱별 폴더를 못 만들게 막는다).
구분되는 것은 스크린샷 하나뿐이다.

### 그래서 `buckets`를 무시하고 기간만 쓴다

```swift
// buckets 인자는 받되 쓰지 않는다. folders는 빈 배열로 돌려준다.
let options = PHFetchOptions()
options.predicate = NSPredicate(format: "creationDate > %@", since as NSDate)
options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
```

**JS 쪽 시그니처를 안 바꾸는 것이 핵심이다.** 플랫폼 분기를 JS에 넣기 시작하면 두
갈래가 따로 자란다. 안 쓰는 인자를 받아 무시하는 편이 싸다.

### 화면은 바뀐다

지금 스캔 화면은 **폴더별 개수**를 칩으로 보여준다
(`GalleryScanSheet.jsx:1553`, "다운로드 12장 · 카카오톡 5장"). 아이폰에서는
`folders`가 비므로 그 자리가 빈다.

**대신 기간과 장수를 보여준다.** 쿠폰히어가 쓰는 방식이고, 정직하다.

```
기간        최근 1개월 ⌄
스캔할 사진      566장
       [ 찾기 시작 ]
```

**스캔 전에 장수를 먼저 보여주는 것**이 이 화면의 핵심이다. 아이폰은 그물이 넓어서
몇 분이 걸릴 수 있는데, 얼마나 걸릴지 모르고 기다리면 도중에 나간다.

## 4. 기간을 사용자가 고르게 한다

안드로이드는 폴더가 좁아서 200장이면 끝났다(`MAX_IMAGES = 200`). 아이폰은 카메라롤
전체라 **기본값을 짧게 잡고 사용자가 늘리게 한다.**

| | |
|---|---|
| 기본 | **최근 1개월** |
| 고를 수 있는 것 | 1개월 · 3개월 · 6개월 · 1년 |
| 바닥 | 설치일보다 앞으로는 안 간다 (`since = 0`을 네이티브가 그렇게 푼다) |

**요금 방어도 된다.** 첫 스캔에서 기프티콘 15건이 잡히면 540원이다
([running-cost.md](running-cost.md)). 기간이 짧으면 그만큼 적게 나간다.

## 5. 한 번 본 것은 다시 안 본다

```
1) 훑은 뒤 마지막 creationDate를 적어둔다
2) 다음에는 그 뒤에 생긴 것만 본다
3) 바코드가 없던 사진의 localIdentifier도 기억한다 (JS에 이미 NO_BARCODE_KEY가 있다)
```

**안드로이드도 이 구조가 더 낫다.** 지금은 폴더 안을 매번 다시 훑는다. 아이폰을
만들면서 같이 고칠 만하다.

## 6. 바코드는 어디서 읽나 — **1단계는 JS 그대로**

Vision(`VNDetectBarcodesRequest`)으로 네이티브에서 읽으면 훨씬 빠르다. 그런데
**1단계에서는 쓰지 않는다.**

안드로이드에서 검증된 판독 경로가 JS에 있다 — 배율을 바꿔 여러 번 재시도하고, 검산
자리로 걸러내고, 얕은 판과 정밀 탐색을 나눠 돈다(`client/src/utils/gallery.js`).
**Vision으로 새로 만들면 「안드로이드는 읽는데 아이폰은 못 읽는다」가 생긴다.**
바코드를 못 읽는 것이 이 기능의 유일한 실패 방식이라, 거기서 갈리면 안 된다.

**느리면 그때 내린다.** 566장을 base64로 브리지 너머로 나르는 것이 병목이 될 수 있다.
재보고 못 견디겠으면 Vision을 **1차 거르개로만** 쓴다 — 바코드가 있는지 없는지만
네이티브가 보고, 있는 사진만 JS로 넘긴다. 판독 자체는 계속 JS가 한다.

## 7. 권한 두 갈래를 다 만든다

iOS는 「전체 접근」과 「선택한 사진」 중에 고르게 하고, **「선택한 사진」을 미는 쪽으로
계속 바뀌어 왔다.** 상당수가 그걸 누른다.

| 상태 | 화면 |
|---|---|
| `.authorized` | 훑기 화면 (위 4번) |
| `.limited` | **지금처럼 직접 고르는 화면.** 한 줄 안내: "사진을 모두 볼 수 있게 하면 기프티콘을 알아서 찾아드려요" + [설정 열기] |
| `.denied` | 지금 그대로 |

**「전체 접근」 하나만 믿고 만들면 절반이 빈 화면을 본다.**

`PHPhotoLibraryPreventAutomaticLimitedAccessAlert`를 Info.plist에 넣어두면 iOS가
띄우는 「사진 더 고르기」 알림을 우리가 띄우는 때로 미룰 수 있다. 매번 뜨면 성가시다.

## 8. 심사에 맞춰 고칠 것

- **`NSPhotoLibraryUsageDescription`을 다시 쓴다.** 지금은 "등록할 기프티콘 사진을 고를
  때 사용해요"라 **고르는 것만** 말한다. 훑는다는 말이 들어가야 한다
- 애플은 「필요한 만큼만 받으라」(5.1.1)고 한다. **기간으로 자른다는 것**이 그 답이 된다
- 앱 심사 정보 메모에 적힌 "사진첩을 훑어 기프티콘을 찾아주는 기능은 안드로이드
  전용입니다"를 **지워야 한다**([store-listing.md](store-listing.md))
- App Store 설명에서 뺐던 「사진첩에서 알아서 찾아줍니다」 문단을 **되살린다**
- 스크린샷 2번(사진첩 훑는 중)을 아이폰용으로 찍어 **7장 → 8장**으로 만든다

## 9. 순서

- [ ] 스위프트 플러그인 — `getStatus` · `requestAccess` · `openAppSettings` 셋 먼저
      (제일 쉽고, `openAppSettings`는 그 자체로 밀린 숙제다)
- [ ] `listImages` — 기간 필터, `folders`는 빈 배열
- [ ] `readImage` — `PHImageManager`, `maxEdge`에 맞춰 축소
- [ ] 실기에서 재본다 — **몇 장에 몇 초인지**. 여기서 6번(Vision) 여부가 갈린다
- [ ] 스캔 화면에 기간 고르개와 「스캔할 사진 N장」
- [ ] 증분 스캔 (5번). 안드로이드도 같이 고친다
- [ ] 권한 두 갈래 UX
- [ ] 심사 문구·스크린샷 (8번)

**심사가 도는 동안에는 손대지 않는다.** 통과한 뒤에 시작한다.
