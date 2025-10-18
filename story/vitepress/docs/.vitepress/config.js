// docs/.vitepress/config.js
import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/story/',
  title: 'Milthm story text',
  description: 'Markdown reader with languages in sidebar',

  themeConfig: {
    nav: [{ text: 'Home', link: '/index' }],
    sidebar: [
      {
        text: 'Languages',
        items: [
          { text: '简体中文', link: '/zh_Hans' },
          { text: '繁體中文', link: '/zh_Hant' },
          { text: '粵語', link: '/yue_Hant' },
          { text: 'English', link: '/en' },
          { text: '日本語', link: '/ja' },
          { text: 'Español', link: '/es' },
          { text: 'Français', link: '/fr' },
          { text: '한국어', link: '/ko' },
          { text: 'Русский', link: '/ru' },
          { text: 'Tiếng Việt', link: '/vi' }
        ]
      }
    ],
    outline: { level: [2, 4] },
    outlineTitle: 'On this page'
  }
})
