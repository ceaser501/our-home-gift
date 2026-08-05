import path from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './package.json'), 'utf8'))

// 문의를 받았을 때 "어떤 코드를 쓰고 계신가"를 알아야 이미 고친 문제인지 판단할 수 있다.
// 웹은 자동 배포라 버전 번호만으로는 언제 것인지 알기 어려워서 배포 날짜를 함께 넣는다.
// (한국 시간 기준. 빌드하는 서버는 UTC라 그대로 쓰면 하루 어긋난다.)
const buildDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '.')

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'build' ? '/our-home-gift/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
  },
}))
