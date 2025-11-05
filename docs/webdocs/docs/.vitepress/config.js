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
        text: 'Milthm Text', 
        collapsible: true,
        collapsed: false,
        items: [
          {
            text: 'Story',
            collapsible: true,
            collapsed: false,
            items: [
            { text: 'meow', link: 'https://google.com' }
            ]
          }
        ]
      }
    ],
    outline: { level: [2, 4] },
    outlineTitle: '导览'
  }
})
