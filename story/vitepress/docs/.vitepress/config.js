// docs/.vitepress/config.js
import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/story/',
  title: 'Milthm story text',
  description: 'Markdown reader with languages in sidebar',

  themeConfig: {
    nav: [{ text: 'Home', link: '/index' }],
    sidebar: [
      { text: 'Milthm Story', items: [{ text: 'Languages', link: '/index' }] },
      {
        text: '二创分区/Fan Content',
        items: [{ text: '曲绘分析', link: '/illustration' }]
      }
    ],
    outline: { level: [2, 4] },
    outlineTitle: 'On this page'
  }
})
