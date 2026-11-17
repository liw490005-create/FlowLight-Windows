<template>
  <div class="titlebar flex items-center justify-between select-none">
    <!-- Left: Logo & Title -->
    <div class="flex items-center gap-2 px-4 py-2 drag-region">
      <div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
        <Zap class="w-3.5 h-3.5 text-white" />
      </div>
      <span class="font-semibold text-sm tracking-wide text-slate-100">流光下载</span>
      <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Windows 纯净专业版</span>
    </div>

    <!-- Center: Global Speed Banner -->
    <div class="drag-region flex items-center gap-4 text-xs font-mono text-slate-300">
      <div class="flex items-center gap-1.5" title="全局下载速度">
        <ArrowDownCircle class="w-3.5 h-3.5 text-emerald-400" />
        <span class="text-emerald-400 font-medium">{{ globalDownloadSpeed }}</span>
      </div>
      <div class="flex items-center gap-1.5" title="全局上传速度">
        <ArrowUpCircle class="w-3.5 h-3.5 text-sky-400" />
        <span class="text-sky-400 font-medium">{{ globalUploadSpeed }}</span>
      </div>
    </div>

    <!-- Right: Window Controls -->
    <div class="flex items-center no-drag">
      <button @click="minimize" class="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors" title="最小化">
        <Minus class="w-4 h-4" />
      </button>
      <button @click="maximize" class="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors" title="最大化/还原">
        <Square class="w-3.5 h-3.5" />
      </button>
      <button @click="close" class="p-2.5 text-slate-400 hover:text-white hover:bg-rose-600 transition-colors" title="关闭">
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { Zap, ArrowDownCircle, ArrowUpCircle, Minus, Square, X } from 'lucide-vue-next';

defineProps({
  globalDownloadSpeed: {
    type: String,
    default: '0 B/s'
  },
  globalUploadSpeed: {
    type: String,
    default: '0 B/s'
  }
});

const minimize = () => window.api?.windowControl('minimize');
const maximize = () => window.api?.windowControl('maximize');
const close = () => window.api?.windowControl('close');
</script>

<style scoped>
.titlebar {
  height: 40px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
}
.drag-region {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}
</style>
