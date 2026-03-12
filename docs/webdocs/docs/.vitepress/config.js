// docs/.vitepress/config.js
import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/docs/',
  title: 'Home',
  description: 'Markdown reader with languages in sidebar',

  themeConfig: {
    nav: [{ text: 'Home', link: '/index' }],
    sidebar: [
      { 
        text: 'Text', 
        collapsible: true,
        collapsed: false,
        items: [
          {
            text: 'Story',
            collapsible: true,
            collapsed: false,
            items: [
            { text: '蜀道の難', link: 'yuwf/udnj_jp' }
            ]
          }
        ]
      }
    ],
    outline: { level: [2, 4] },
    outlineTitle: '导览'
  }
})
