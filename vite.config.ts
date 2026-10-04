import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Ипотечный планировщик',
        short_name: 'Ипотека',
        description: 'Личный калькулятор ипотеки и досрочных погашений',
        theme_color: '#128f4b',
        background_color: '#f4f7f5',
        display: 'standalone',
        lang: 'ru',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})
