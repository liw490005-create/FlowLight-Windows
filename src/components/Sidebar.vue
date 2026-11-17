<template>
  <aside class="w-56 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between p-3 select-none">
    <div class="space-y-6">
      <!-- Quick Action: New Task -->
      <div>
        <button
          @click="$emit('open-new-task')"
          class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all transform active:scale-95"
        >
          <PlusCircle class="w-4 h-4" />
          <span>新建任务</span>
        </button>
      </div>

      <!-- Navigation Menu -->
      <nav class="space-y-1">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="$emit('update:currentTab', item.id)"
          :class="[
            'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
            currentTab === item.id
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          ]"
        >
          <div class="flex items-center gap-3">
            <component :is="item.icon" class="w-4 h-4" />
            <span>{{ item.label }}</span>
          </div>
          <span
            v-if="item.badge !== undefined && item.badge > 0"
            class="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400"
          >
            {{ item.badge }}
          </span>
        </button>
      </nav>
    </div>

    <!-- Bottom Status Info -->
    <div class="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs space-y-1.5">
      <div class="flex items-center justify-between text-slate-400">
        <span>Aria2 内核</span>
        <span class="flex items-center gap-1.5 text-emerald-400">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          运行正常
        </span>
      </div>
      <div class="flex items-center justify-between text-slate-500 text-[11px]">
        <span>下载目录</span>
        <span class="truncate max-w-[100px]" :title="downloadDir">{{ downloadDirShort }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import {
  PlusCircle,
  Download,
  CheckCircle2,
  Search,
  Cloud,
  Compass,
  Film,
  Settings
} from 'lucide-vue-next';

const props = defineProps({
  currentTab: {
    type: String,
    default: 'downloading'
  },
  activeCount: {
    type: Number,
    default: 0
  },
  completedCount: {
    type: Number,
    default: 0
  },
  downloadDir: {
    type: String,
    default: 'D:\\流光下载\\Downloads'
  }
});

defineEmits(['update:currentTab', 'open-new-task']);

const navItems = computed(() => [
  { id: 'downloading', label: '正在下载', icon: Download, badge: props.activeCount },
  { id: 'completed', label: '已完成', icon: CheckCircle2, badge: props.completedCount },
  { id: 'magnet', label: '磁力聚合', icon: Search },
  { id: 'netdisk', label: '网盘解析', icon: Cloud },
  { id: 'sniffer', label: '网页嗅探', icon: Compass },
  { id: 'player', label: '影音播放', icon: Film },
  { id: 'settings', label: '设置中心', icon: Settings }
]);

const downloadDirShort = computed(() => {
  if (!props.downloadDir) return '默认';
  const parts = props.downloadDir.split('\\');
  return parts[parts.length - 1] || props.downloadDir;
});
</script>
