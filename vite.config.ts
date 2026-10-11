import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import pkg from './package.json'

export default defineConfig({
  plugins: [preact(), {
    name: 'tizen-widget',
    closeBundle() {
      const config = readFileSync('tizen-meta/config.xml', 'utf-8')
        .replace(/version="0\.2\.0"/, `version="${pkg.version}"`)
      writeFileSync('dist/config.xml', config)
      copyFileSync('tizen-meta/icon.png', 'dist/icon.png')
      copyFileSync('LICENSE', 'dist/LICENSE')
      copyFileSync('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md')
      mkdirSync('dist/licenses', { recursive: true })
      for (const dependency of ['preact', 'hls.js', '@sentry/browser', '@sentry/core',
        '@sentry-internal/browser-utils', '@sentry-internal/feedback', '@sentry-internal/replay', '@sentry-internal/replay-canvas']) {
        copyFileSync(`node_modules/${dependency}/LICENSE`, `dist/licenses/${dependency.replace('/', '-').replace('@', '')}.txt`)
      }
      copyFileSync('licenses/APACHE-2.0.txt', 'dist/licenses/APACHE-2.0.txt')
      const htmlPath = 'dist/index.html'
      const html = readFileSync(htmlPath, 'utf-8')
        .replace(' type="module"', '').replace(' crossorigin', '')
        .replace('<script src="./assets/', '<script defer src="./assets/')
      writeFileSync(htmlPath, html)
    }
  }],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __TV_DIAGNOSTICS_URL__: JSON.stringify(process.env.KINOWATCH_DIAGNOSTICS_URL || '')
  },
  build: {
    target: 'chrome69',
    cssTarget: 'chrome69',
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: { output: { manualChunks: undefined, format: 'iife' } }
  }
})
