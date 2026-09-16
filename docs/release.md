# 배포 — 웹 · 안드로이드 · 아이폰

**셋이 나가는 길이 다 다르다.** 이 문서 하나만 보고 하면 된다.

| | 명령 | 어디서 | 누가 빌드하나 |
|---|---|---|---|
| **웹** | `git push origin HEAD:main` | 어디서든 | GitHub Actions |
| **안드로이드** | `npm run release` | 저장소 맨 위 | GitHub Actions |
| **아이폰** | `npm run sync:ios` + Xcode | **맥에서** | 내 맥 |

---

## ⚠️ 먼저 — 세 번 밟은 함정

### 1. `npm install`을 맨 위에서 돌리면 아무것도 안 깔린다

맨 위 `package.json`에는 **의존성이 하나도 없다.** 스크립트만 있다.

```
npm install
  removed 378 packages, and audited 1 package    ← 이게 나오면 잘못 돌린 것
```

깔려야 할 곳은 **`client/`와 `app/` 둘**이다.

### 2. 플러그인은 **두 곳 다** 넣어야 한다

`client/package.json`은 화면이 쓰는 목록이고, `app/package.json`은 **네이티브에 붙는
목록**이다. 한쪽만 넣으면 빌드는 되는데 **오류 없이 조용히 그 기능만 안 된다.**

```
npm i --prefix client @capacitor/무엇
npm i --prefix app    @capacitor/무엇
```

2026-09-16에 clipboard와 filesystem을 client에만 넣었다가 이걸 겪었다.

### 3. 앱 빌드는 `build`가 아니라 **`build:app`**

앱은 화면을 `https://localhost/` 루트에서 연다. 웹 기본값(`/our-home-gift/`)으로
빌드하면 **자바스크립트를 못 찾아 흰 화면만 뜬다.**

```
npm run build       ← 웹용. /our-home-gift/
npm run build:app   ← 앱용. VITE_BASE_PATH=/
```

흰 화면으로 켜지는 판이 두 번 나갔고, 두 번 다 이것이었다.

**`sync:ios` / `sync:android`가 이걸 알아서 해준다.** 손으로 풀어 치지 않는 이유가
그것이다.

---

## 웹

```
git push origin HEAD:main
```

`.github/workflows/deploy-pages.yml`이 받아서 30~40초 뒤에 나간다.
관리자 페이지(`admin/`)도 같이 얹혀 나간다.

**main에 밀 때만 나간다.** 브랜치에서 태그만 계속 따면 앱은 새것, 웹은 옛것이 된다.
배포할 때마다 웹이 몇 커밋 뒤처져 있는지 세어본다.

---

## 안드로이드 — 손으로 할 게 없다

```
npm run release          # 저장소 맨 위에서
```

태그를 달면 `.github/workflows/build-android-apk.yml`이 **전부 한다** —
`npm ci` · `npm test` · `build:app` · `cap sync android` · `assembleRelease bundleRelease`.

**APK와 AAB를 둘 다 만든다.** Play에 올릴 것은 AAB다.

- 버전 번호는 스크립트가 센다. **손으로 세지 않는다** — 원격 태그를 먼저 받아오고
  제일 큰 번호에서 하나 올린다
- 무엇이 나갈지만 보려면 `npm run release:dry`
- 끝나면 메일로 받는다. Actions 탭에서도 본다

**태그는 밀면 되돌리기 비싸다.** 밀기 전에 `release:dry`를 한 번 본다.

⚠️ 이 환경(클로드)에서는 태그 밀기가 자주 403으로 막힌다. 그때는 위 한 줄을 태수님이
직접 치신다.

---

## 아이폰 — 맥에서

CI는 **빌드가 되는지만 보고 설치 파일을 안 만든다**(서명이 필요해서다).

### 1. 맥에서 받아온다

```
git pull
```

### 2. 한 줄로 준비한다

```
cd app
npm run sync:ios
```

이 한 줄이 넷을 한다 — `client` 의존성 · `build:app` · `app` 의존성 · `cap sync ios`.
**풀어서 치지 않는다.** 위 함정 셋이 전부 여기서 나왔다.

⚠️ 플러그인을 새로 넣은 판이면 **끝에 이 줄이 보이는지 본다.**

```
[info] Found N Capacitor plugins for ios:
       @capacitor/clipboard@8.x.x
       @capacitor/filesystem@8.x.x
```

**안 보이면 안 깔린 것이다.** 그대로 빌드하면 오류 없이 그 기능만 조용히 안 된다.

### 3. Xcode

```
npx cap open ios
```

- **버전을 올린다.** `MARKETING_VERSION`(1.0 → 1.0.1)과 `CURRENT_PROJECT_VERSION`(1 → 2).
  같은 번호로는 App Store Connect가 안 받는다. 안드로이드 태그와 **따로 센다**
- Product → Archive
- Distribute App → App Store Connect

### 4. 심사

새 빌드는 예외 없이 심사를 탄다. 업데이트는 대개 하루 안팎이다.
권한이 늘거나 하는 일이 바뀌면 **앱 심사 정보 메모도 고친다**(`docs/store-listing.md`).

---

## 순서

**아이폰을 먼저 넣는다.** 심사가 하루이틀 걸리니 먼저 걸어두고, Play는 그사이에 올린다.

```
1.  git push origin HEAD:main     웹
2.  cd app && npm run sync:ios    아이폰 → Xcode → 심사
3.  npm run release               안드로이드 → AAB → Play
```

**셋이 벌어져도 된다.** 다만 벌어진 것을 알고 있어야 한다 — 웹만 나간 날, 앱만 나간
날이 다 있었다.
