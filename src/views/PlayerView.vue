<template>
  <div class="h-full flex flex-col p-6 space-y-4 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>影音播放中心</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-mono">
            4K / HDR 硬件加速
          </span>
        </h2>
        <p class="text-xs text-slate-400 mt-1">独立播放器引擎，支持本地媒体文件点播与全格式流媒体播放</p>
      </div>

      <div>
        <label
          class="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer transition-all"
        >
          <FolderPlus class="w-4 h-4" />
          <span>打开本地视频</span>
          <input type="file" accept="video/*,audio/*" class="hidden" @change="handleFileChange" />
        </label>
      </div>
    </div>

    <!-- Player Window Container -->
    <div class="flex-1 bg-black rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-center items-center relative group">
      <video
        v-if="currentSource"
        ref="videoRef"
        :src="currentSource"
        controls
        autoplay
        class="w-full h-full object-contain"
      ></video>

      <!-- Empty State / Placeholder -->
      <div v-else class="flex flex-col items-center justify-center text-slate-500 space-y-3">
        <div class="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center border border-slate-800">
          <Film class="w-8 h-8 text-slate-400" />
        </div>
        <p class="text-sm">暂无正在播放的媒体</p>
        <p class="text-xs text-slate-600">点击右上角“打开本地视频”，或从“正在下载”列表中点击“边下边播”</p>
      </div>
    </div>

    <!-- Quick Playback Controls -->
    <div v-if="currentSource" class="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
      <div class="flex items-center gap-3 truncate">
        <Film class="w-4 h-4 text-cyan-400 shrink-0" />
        <span class="text-slate-200 truncate font-medium">{{ videoTitle }}</span>
      </div>

      <div class="flex items-center gap-2">
        <span>倍速：</span>
        <button
          v-for="s in [0.75, 1.0, 1.25, 1.5, 2.0]"
          :key="s"
          @click="setSpeed(s)"
          :class="[
            'px-2 py-0.5 rounded text-xs font-mono transition-colors',
            currentSpeed === s ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          ]"
        >
          {{ s }}x
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Film, FolderPlus } from 'lucide-vue-next';

const videoRef = ref(null);
const currentSource = ref('');
const videoTitle = ref('');
const currentSpeed = ref(1.0);

const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    currentSource.value = URL.createObjectURL(file);
    videoTitle.value = file.name;
    currentSpeed.value = 1.0;
  }
};

const setSpeed = (s) => {
  currentSpeed.value = s;
  if (videoRef.value) {
    videoRef.value.playbackRate = s;
  }
};
</script>
