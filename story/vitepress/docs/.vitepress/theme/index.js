import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import './style.css'  // 引入自定义样式

export default {
  ...DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(MusicToggle)
    })
  }
}

const MusicToggle = {
  name: 'MusicToggle',
  data() {
    return {
      audio: null,
      isPlaying: true,
      unlocked: false
    }
  },
  mounted() {
    this.audio = new Audio('/files/story.mp3')
    this.audio.loop = true
    this.audio.preload = 'auto'

    const unlock = () => {
      if (!this.unlocked && this.isPlaying) {
        this.audio.play().catch(() => {})
        this.unlocked = true
      }
    }
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('touchstart', unlock, { once: true })
  },
  methods: {
    toggle() {
      if (this.isPlaying) {
        this.audio.pause()
        this.isPlaying = false
      } else {
        this.audio.play().catch(() => {})
        this.isPlaying = true
      }
    }
  },
  render() {
    return h(
      'button',
      {
        id: 'bgm-toggle',
        class: this.isPlaying ? 'playing' : 'paused',
        'aria-label': 'Toggle background music',
        onClick: this.toggle
      },
      [
        h('span', { class: 'icon' }, this.isPlaying ? '🎵' : '🔇')
      ]
    )
  }
}
