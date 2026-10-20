import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#f1ead9' } },
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#f1ead9' } },
  },
  images: ['public/icon.svg'],
})
