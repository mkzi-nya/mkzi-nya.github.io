<template>
  <div v-if="role === 'system'" class="system-msg">
    <slot />
  </div>

  <div v-else class="chat-row" :class="role">
    <img v-if="avatar" :src="avatar" class="avatar" />
    <div class="chat-bubble" :class="{ image: hasImage }">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  role: { type: String, default: 'bot' }, // bot, user, or system
  avatar: { type: String, default: '' }
})

const hasImage = ref(false)
onMounted(() => {
  const slot = document.currentScript?.ownerDocument || document
  const imgs = slot.querySelectorAll('img')
  hasImage.value = imgs.length > 0
})
</script>

<style scoped>
/* === 通用布局 === */
.chat-row {
  display: flex;
  align-items: flex-start;
  margin: 10px 0;
  width: 100%;
}

.chat-row.user {
  flex-direction: row-reverse;
}

/* === 气泡基础 === */
.chat-bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 16px;
  line-height: 1.6;
  font-size: 15px;
  word-break: break-word;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* 图片消息（去掉背景） */
.chat-bubble.image {
  padding: 6px;
  background: none;
  box-shadow: none;
}

.chat-bubble.image img {
  max-width: 260px;
  border-radius: 12px;
  display: block;
}

/* === 头像 === */
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin: 0 10px;
  object-fit: cover;
}

/* === 亮色模式 === */
.chat-row.bot .chat-bubble {
  background: #f2f3f5;
  color: #1f1f1f;
}

.chat-row.user .chat-bubble {
  background: #cce6ff;
  color: #111;
}

/* === 系统消息 === */
.system-msg {
  width: 100%;
  text-align: center;
  color: rgba(120, 120, 120, 0.85);
  font-size: 14px;
  margin: 12px 0;
  user-select: none;
}

/* === 暗色模式（兼容 VitePress） === */
html.dark .chat-row.bot .chat-bubble {
  background: #2b2b2b; /* 🩶 深灰近黑，像 QQ 左气泡 */
  color: #e0e0e0;
}

html.dark .chat-row.user .chat-bubble {
  background: #3b4d65; /* 💙 蓝灰色，像 QQ 右气泡 */
  color: #f5f7fa;
}

html.dark .system-msg {
  color: rgba(200, 200, 200, 0.65);
}

html.dark .chat-bubble.image {
  background: none;
}
</style>
