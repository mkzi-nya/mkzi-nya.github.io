import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import ChatBubble from './components/ChatBubble.vue'
import './style.css'

// 音乐播放按钮组件
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
    this.audio = new Audio('/story/files/story.mp3')
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
      [h('span', { class: 'icon' }, this.isPlaying ? '🎵' : '🔇')]
    )
  }
}

// 导出主题配置
export default {
  ...DefaultTheme,
  Layout() {
    // 在导航栏后面插入音乐按钮
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(MusicToggle)
    })
  },
  enhanceApp({ app }) {
    // 注册 ChatBubble 组件
    app.component('ChatBubble', ChatBubble)
  }
}
