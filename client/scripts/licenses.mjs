// 오픈소스 고지 페이지(public/licenses.html)를 만든다.
//
// 손으로 적어두면 패키지를 하나 바꿀 때마다 문서가 조용히 낡는다. 고지는 낡으면 안 하느니만
// 못하므로(틀린 내용을 공표하는 셈이다) 빌드할 때마다 실제 설치된 것에서 다시 만든다.
//
// package.json의 목록이 아니라 node_modules에 실제로 설치된 package.json을 읽는 이유는,
// 버전 범위(^1.2.3)가 아니라 진짜 들어간 버전과 라이선스를 적어야 하기 때문이다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const names = [...new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})])].sort();

const packages = names
  .map((name) => {
    const manifest = join(root, 'node_modules', name, 'package.json');
    if (!existsSync(manifest)) return null;
    const info = JSON.parse(readFileSync(manifest, 'utf8'));
    const license = info.license || info.licenses?.[0]?.type || '확인 필요';
    return { name, version: info.version || '', license, homepage: info.homepage || `https://www.npmjs.com/package/${name}` };
  })
  .filter(Boolean);

const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rows = packages
  .map(
    (p) => `      <tr>
        <td><a href="${escape(p.homepage)}" target="_blank" rel="noreferrer">${escape(p.name)}</a></td>
        <td>${escape(p.version)}</td>
        <td>${escape(p.license)}</td>
      </tr>`
  )
  .join('\n');

const licenseSummary = [...new Set(packages.map((p) => p.license))].sort().join(', ');

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>모아콘 오픈소스 및 기술 정보</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0 auto; padding: 24px 20px 64px; max-width: 720px;
        font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', system-ui, sans-serif;
        line-height: 1.75; word-break: keep-all; color: #1c1c1e; background: #fff;
      }
      @media (prefers-color-scheme: dark) { body { color: #e8e8ea; background: #111113; } td, th { border-color: #333 !important; } }
      h1 { font-size: 1.5rem; margin-bottom: 4px; }
      h2 { font-size: 1.05rem; margin-top: 32px; border-top: 1px solid currentColor; padding-top: 20px; }
      .updated { color: #888; font-size: .85rem; margin-top: 0; }
      table { border-collapse: collapse; width: 100%; font-size: .88rem; margin: 12px 0; display: block; overflow-x: auto; }
      th, td { border: 1px solid #ddd; padding: 7px 10px; text-align: left; vertical-align: top; }
      th { background: rgba(128,128,128,.12); white-space: nowrap; }
      a { color: inherit; }
      ul { padding-left: 20px; }
      li { margin: 6px 0; }
      .note { background: rgba(128,128,128,.1); border-radius: 10px; padding: 12px 16px; font-size: .92rem; }
    </style>
  </head>
  <body>
    <h1>오픈소스 및 기술 정보</h1>
    <p class="updated">이 문서는 빌드할 때 실제 설치된 패키지에서 자동으로 만들어집니다.</p>

    <h2>이 앱이 쓰는 기술</h2>
    <p>모아콘이 어떤 기술로 만들어졌고, 회원님의 정보가 어디를 거치는지 밝힙니다.</p>
    <table>
      <tr><th>구분</th><th>사용 기술</th><th>하는 일</th></tr>
      <tr><td>화면</td><td>React, Vite, Tailwind CSS</td><td>앱 화면을 그립니다. 회원님의 기기에서만 동작합니다.</td></tr>
      <tr><td>바코드</td><td>ZXing, JsBarcode, qrcode</td><td>사진에서 바코드를 읽고, 화면에 다시 그립니다. <strong>모두 기기 안에서 처리되며 어디로도 전송되지 않습니다.</strong></td></tr>
      <tr><td>데이터 보관</td><td>Supabase (PostgreSQL, Storage, Auth)</td><td>기프티콘 정보와 이미지를 보관하고 로그인을 처리합니다.</td></tr>
      <tr><td>이미지 자동 인식</td><td><strong>Anthropic Claude Haiku 4.5</strong></td><td>기프티콘 사진에서 상품명·상호·금액·유효기한을 읽어냅니다.</td></tr>
      <tr><td>가격 검색</td><td><strong>Anthropic Claude Haiku 4.5</strong> (웹 검색)</td><td>금액이 인쇄돼 있지 않은 상품의 판매가를 찾습니다.</td></tr>
      <tr><td>장소·지도</td><td>카카오 로컬 API, 카카오맵, 카카오모빌리티</td><td>주변 매장을 찾고 지도와 자동차 경로를 보여줍니다.</td></tr>
      <tr><td>도보 경로</td><td>SK텔레콤 TMAP API</td><td>매장까지 걸어가는 길을 안내합니다.</td></tr>
      <tr><td>알림</td><td>Web Push (VAPID)</td><td>유효기한 임박 등을 알려줍니다.</td></tr>
    </table>

    <div class="note">
      <strong>AI가 보는 것과 보지 않는 것.</strong> 상품 정보를 자동으로 채워 넣는 기능을 쓰실 때에만
      기프티콘 이미지가 Anthropic(미국)으로 전송됩니다. 직접 입력하시면 이미지는 국외로 나가지 않습니다.
      바코드를 읽는 일은 AI가 아니라 회원님의 기기 안에서 처리되므로, 바코드만 쓰실 때는 아무 데도
      전송되지 않습니다. 자세한 내용은 <a href="./privacy.html">개인정보처리방침</a>에 있습니다.
    </div>

    <h2>오픈소스 라이선스</h2>
    <p>
      모아콘은 아래 오픈소스 소프트웨어를 사용합니다. 각 소프트웨어의 저작권은 원저작자에게 있으며,
      해당 라이선스(${escape(licenseSummary)})에 따라 사용하고 있습니다. 전체 라이선스 원문은 각 항목의
      링크에서 확인하실 수 있습니다.
    </p>
    <table>
      <tr><th>이름</th><th>버전</th><th>라이선스</th></tr>
${rows}
    </table>
    <p class="updated">총 ${packages.length}개</p>
  </body>
</html>
`;

writeFileSync(join(root, 'public', 'licenses.html'), html);
console.log(`licenses.html 생성 완료 — 패키지 ${packages.length}개`);
