// 팝업 검증이 흰 화면으로 뜨는 원인을 집어내는 판.
// 의심 가는 것을 하나씩 따로 불러서, 어디서 터지는지 글자로 적는다.
const out = document.getElementById('out');
const line = (t) => { out.textContent += '\n' + t; };
out.textContent = '하나씩 불러봅니다.';

const STEPS = [
  ['1. 앱 CSS',        () => import('../src/index.css')],
  ['2. lucide 아이콘',  () => import('lucide-react')],
  ['3. cn 도우미',      () => import('../src/lib/utils')],
  ['4. Button',        () => import('../src/components/ui/button')],
  ['5. Sheet 껍데기',   () => import('../src/components/ui/sheet')],
  ['6. FamilyContext', () => import('../src/FamilyContext')],
  ['7. supabaseClient', () => import('../src/supabaseClient')],
  ['8. api',           () => import('../src/api')],
  ['9. RenameSheet',   () => import('../src/components/RenameSheet')],
  ['10. UploadSheet',  () => import('../src/components/UploadSheet')],
  ['11. GalleryScan',  () => import('../src/components/GalleryScanSheet')],
];

for (const [name, load] of STEPS) {
  try {
    await load();
    line('OK    ' + name);
  } catch (e) {
    line('터짐  ' + name);
    line('      → ' + (e && e.message ? e.message : String(e)));
    break;
  }
}
line('\n끝. 「터짐」이 있으면 그 줄을 알려주세요.');
