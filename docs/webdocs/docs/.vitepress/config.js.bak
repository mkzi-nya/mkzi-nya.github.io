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
            text: '语文',
            collapsible: true,
            collapsed: false,
            items: [
            { text: '蜀道の難', link: 'yuwf/udnj_jp' }
            ]
          },
          {
            text: '政治',
            collapsible: true,
            collapsed: false,
            items: [
            { text: '必修2', link: 'http://mkzi-nya.github.io/docs/vgvi/2.html' },
            { text: '必修3', link: 'http://mkzi-nya.github.io/docs/vgvi/3.html' },
            { text: '必修4', link: 'http://mkzi-nya.github.io/docs/vgvi/4.html' },
            { text: '选必1', link: 'http://mkzi-nya.github.io/docs/vgvi/xb1.html' },
            { text: '选必2', link: 'http://mkzi-nya.github.io/docs/vgvi/xb2.html' },
            { text: '选必3', link: 'http://mkzi-nya.github.io/docs/vgvi/xb3.html' },
            { text: '必修4_vite', link: 'vgvi/4_vite' }
            ]
          }
        ]
      }
    ],
    outline: { level: [2, 4] },
    outlineTitle: '导览'
  }
})
