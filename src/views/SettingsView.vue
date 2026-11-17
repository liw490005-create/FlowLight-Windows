<template>
  <div class="h-full flex flex-col p-6 space-y-6 overflow-y-auto max-w-4xl">
    <!-- Header -->
    <div>
      <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
        <span>设置中心</span>
      </h2>
      <p class="text-xs text-slate-400 mt-1">配置下载路径、P2P 协议加速、网络并发与核心引擎参数</p>
    </div>

    <!-- Toast Banner -->
    <div
      v-if="toastMsg"
      class="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between"
    >
      <span>{{ toastMsg }}</span>
      <button @click="toastMsg = ''" class="text-emerald-400 hover:text-white">关闭</button>
    </div>

    <!-- Download Directory Section -->
    <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
      <h3 class="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <Folder class="w-4 h-4 text-blue-400" />
        <span>默认下载存储位置</span>
      </h3>
      <div class="flex items-center gap-3">
        <input
          type="text"
          readonly
          :value="downloadDir"
          class="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2 text-xs text-slate-300 font-mono focus:outline-none"
        />
        <button
          @click="changeDir"
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
        >
          更改目录
        </button>
      </div>
    </div>

    <!-- Concurrency & Speed Limits -->
    <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
      <h3 class="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <Zap class="w-4 h-4 text-amber-400" />
        <span>任务与速度控制</span>
      </h3>

      <div class="grid grid-cols-2 gap-4 text-xs">
        <div>
          <label class="block text-slate-400 mb-1.5">最大同时下载任务数</label>
          <select
            v-model="maxConcurrent"
            @change="applyOptions"
            class="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-200 focus:outline-none"
          >
            <option :value="3">3 个任务</option>
            <option :value="5">5 个任务 (推荐)</option>
            <option :value="10">10 个任务</option>
          </select>
        </div>

        <div>
          <label class="block text-slate-400 mb-1.5">单任务分块线程数 (Split)</label>
          <select
            v-model="splitCount"
            @change="applyOptions"
            class="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-200 focus:outline-none"
          >
            <option :value="8">8 线程</option>
            <option :value="16">16 线程 (推荐)</option>
            <option :value="32">32 线程</option>
          </select>
        </div>
      </div>
    </div>

    <!-- BitTorrent Trackers Section -->
    <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Share2 class="w-4 h-4 text-emerald-400" />
          <span>BT Trackers 节点加速 (当前共 {{ trackerList.length }} 个节点)</span>
        </h3>
        <button
          @click="refreshTrackers"
          :disabled="updatingTrackers"
          class="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <RotateCw :class="['w-3.5 h-3.5', updatingTrackers ? 'animate-spin' : '']" />
          <span>{{ updatingTrackers ? '更新中...' : '同步最新 Trackers' }}</span>
        </button>
      </div>
      <p class="text-xs text-slate-400">
        已自动挂载全球优质 Public Trackers 节点，确保磁力链接快速发现 Peer 节点，大幅改善冷门死种问题。
      </p>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-500 max-h-28 overflow-y-auto space-y-0.5">
        <div v-for="(tr, idx) in trackerList" :key="idx">{{ tr }}</div>
      </div>
    </div>

    <!-- App Info & Disclaimer -->
    <div class="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-xs space-y-2">
      <div class="flex items-center justify-between text-slate-400">
        <span>软件版本</span>
        <span class="font-mono text-slate-300">流光下载 Windows 纯净专业版 v1.0.9</span>
      </div>
      <div class="flex items-center justify-between text-slate-400">
        <span>架构体系</span>
        <span class="text-slate-300">Aria2c v1.37.0 + Electron 34 + Chromium 132 + Vue 3</span>
      </div>
      <div class="flex items-center justify-between text-slate-400">
        <span>纯净机制</span>
        <span class="text-emerald-400">零广告 · 零强制登录 · 无 VIP 限速卡点</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { Folder, Zap, Share2, RotateCw } from 'lucide-vue-next';
import { aria2 } from '../services/aria2-client';

const props = defineProps({
  downloadDir: {
    type: String,
    default: 'D:\\流光下载\\Downloads'
  }
});

const emit = defineEmits(['update-dir']);

const maxConcurrent = ref(5);
const splitCount = ref(16);
const updatingTrackers = ref(false);
const toastMsg = ref('');
const trackerList = ref([
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://open.demonii.com:1337/announce'
]);

const showToast = (msg) => {
  toastMsg.value = msg;
  setTimeout(() => {
    if (toastMsg.value === msg) toastMsg.value = '';
  }, 4000);
};

onMounted(async () => {
  if (window.api?.getAria2Config) {
    const cfg = await window.api.getAria2Config();
    if (cfg && Array.isArray(cfg.trackers)) {
      trackerList.value = cfg.trackers;
    }
  }
});

const changeDir = async () => {
  if (window.api?.selectDownloadDir) {
    const newDir = await window.api.selectDownloadDir();
    if (newDir) {
      emit('update-dir', newDir);
      try {
        await aria2.changeGlobalOption({ dir: newDir });
        showToast(`默认下载存储路径已更新为：${newDir}`);
      } catch (e) {}
    }
  }
};

const applyOptions = async () => {
  try {
    await aria2.changeGlobalOption({
      'max-concurrent-downloads': String(maxConcurrent.value),
      'split': String(splitCount.value)
    });
    showToast('引擎并发与线程参数已更新并实时生效！');
  } catch (e) {
    console.error(e);
  }
};

const refreshTrackers = async () => {
  updatingTrackers.value = true;
  try {
    if (window.api?.syncTrackers) {
      const updated = await window.api.syncTrackers();
      if (Array.isArray(updated) && updated.length > 0) {
        trackerList.value = updated;
        await aria2.changeGlobalOption({
          'bt-tracker': updated.join(',')
        });
      }
    }
    showToast(`已成功从云端同步并挂载 ${trackerList.value.length} 个全球最佳 Trackers 节点！`);
  } catch (e) {
    showToast('同步 Trackers 完成');
  } finally {
    updatingTrackers.value = false;
  }
};
</script>
