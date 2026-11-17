<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
    <div class="w-[880px] max-w-[95vw] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <!-- Player Header -->
      <div class="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
        <div class="flex items-center gap-2 truncate pr-4">
          <Film class="w-4 h-4 text-cyan-400 shrink-0" />
          <span class="text-sm font-medium text-slate-200 truncate">{{ title || '正在播放' }}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">边下边播</span>
        </div>
        <button @click="close" class="text-slate-400 hover:text-white transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Video Area -->
      <div class="relative bg-black flex items-center justify-center aspect-video group">
        <video
          v-if="streamUrl"
          ref="videoRef"
          :src="streamUrl"
          controls
          autoplay
          class="w-full h-full object-contain"
        ></video>
      </div>

      <!-- Quick Speed Controls Bar -->
      <div class="px-5 py-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div class="flex items-center gap-2">
          <span>倍速播放：</span>
          <button
            v-for="s in [0.75, 1.0, 1.25, 1.5, 2.0]"
            :key="s"
            @click="setSpeed(s)"
            :class="[
              'px-2.5 py-1 rounded-lg font-mono transition-colors',
              currentSpeed === s ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            ]"
          >
            {{ s }}x
          </button>
        </div>
        <div class="text-slate-500 text-[11px]">
          支持 MP4 / WebM / MKV 等主流格式硬件解码与流式缓冲
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { Film, X } from 'lucide-vue-next';

const props = defineProps({
  isOpen: Boolean,
  filePath: String,
  title: String
});

const emit = defineEmits(['close']);

const videoRef = ref(null);
const streamUrl = ref('');
const currentSpeed = ref(1.0);

watch([() => props.isOpen, () => props.filePath], async ([open, newPath]) => {
  if (open && newPath && window.api?.getStreamUrl) {
    streamUrl.value = await window.api.getStreamUrl(newPath);
    currentSpeed.value = 1.0;
  } else if (!open) {
    streamUrl.value = '';
  }
}, { immediate: true });

const setSpeed = (speed) => {
  currentSpeed.value = speed;
  if (videoRef.value) {
    videoRef.value.playbackRate = speed;
  }
};

const close = () => {
  if (videoRef.value) {
    videoRef.value.pause();
  }
  emit('close');
};
</script>
