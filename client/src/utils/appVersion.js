// 앱의 버전 번호와 「새 버전이 있어요」 판단.
//
// 번호는 스토어에 나간 그 번호를 쓴다. 앱에서는 앱이 스스로 안다(@capacitor/app).
// 예전에는 웹 설정 파일(client/package.json, 1.0.0)을 읽어서 아이폰이 1.0.2인데도 내 정보에
// 1.0.0이 나왔다. 아이폰과 안드로이드는 번호가 따로 간다(아이폰 1.0.2, 안드로이드 0.0.190).
//
// 최신·최소 버전은 서버의 app_versions 표에서 읽는다(supabase/app-versions.sql).
//   깔린 버전 < 최소 버전 → 강제(닫을 수 없다)
//   깔린 버전 < 최신 버전 → 안내(그대로 사용하기로 닫는다. 그 버전으로는 다시 안 띄운다)
import { isNativeApp } from './browser';

// 안내를 닫은 버전. 더 새 버전이 나오면 그때 다시 뜬다.
export const DISMISSED_KEY = 'moacon:update-dismissed';

export const STORE_URL = {
  ios: 'https://apps.apple.com/app/id6808555980',
  android: 'https://play.google.com/store/apps/details?id=io.github.ceaser501.ourhomegift',
};

// 칸마다 숫자로 견준다. 글자로 견주면 0.0.190 < 0.0.99 가 된다.
// 서버 쪽 supabase/functions/admin-stats/index.ts의 compareVersions와 같은 규칙이다.
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => Number(n) || 0);
  const pb = String(b || '0').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function nativePlatform() {
  if (!isNativeApp()) return null;
  const p = window.Capacitor?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : null;
}

// 화면에 보여줄 번호. 앱이면 스토어 번호, 웹이면 웹 설정 파일의 번호.
// 앱에서 못 읽으면(옛 빌드 등) 웹 번호로 물러선다 — 빈칸보다는 낫다.
export async function installedVersion() {
  if (!nativePlatform()) return __APP_VERSION__;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info?.version || __APP_VERSION__;
  } catch {
    return __APP_VERSION__;
  }
}

// "2026-09-30" → "2026.09.30". 내 정보 줄의 빌드 날짜와 같은 꼴이다.
export function dotDate(iso) {
  return iso ? String(iso).slice(0, 10).replace(/-/g, '.') : '';
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function dismissUpdate(version) {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // 기억하지 못하면 다음에 한 번 더 뜰 뿐이다
  }
}

// 서버 줄과 깔린 버전으로 무엇을 띄울지 정한다. 순수 함수라 따로 시험한다.
//   null → 띄우지 않는다
export function decideUpdate(row, installed, dismissed) {
  if (!row?.latest_version || !installed) return null;
  const force = Boolean(row.min_version) && compareVersions(installed, row.min_version) < 0;
  const behind = compareVersions(installed, row.latest_version) < 0;
  if (!force && !behind) return null;
  // 그대로 사용하기로 닫은 버전이면 다시 안 띄운다. 강제는 닫은 적이 있어도 띄운다.
  if (!force && dismissed === row.latest_version) return null;
  return {
    force,
    latest: row.latest_version,
    releasedOn: dotDate(row.released_on),
  };
}

// 앱에서만 본다. 웹은 client/src/utils/appUpdate.js가 새 판을 알아서 새로고침한다.
// 네트워크가 안 되거나 표가 없으면 조용히 null — 안내 때문에 앱이 막히면 안 된다.
export async function checkForUpdate() {
  const platform = nativePlatform();
  if (!platform) return null;
  try {
    // 필요할 때 불러온다. 내 정보(ProfileMenu)도 이 파일에서 번호만 읽는데, 거기까지
    // 서버 접속을 끌고 가지 않게 한다.
    const { supabase } = await import('../supabaseClient');
    const [installed, { data, error }] = await Promise.all([
      installedVersion(),
      supabase
        .from('app_versions')
        .select('latest_version, released_on, min_version')
        .eq('platform', platform)
        .maybeSingle(),
    ]);
    if (error || !data) return null;
    const decision = decideUpdate(data, installed, readDismissed());
    return decision ? { ...decision, platform, storeUrl: STORE_URL[platform] } : null;
  } catch {
    return null;
  }
}
