<template>
  <div class="h-full flex flex-col p-6 space-y-5 overflow-y-auto">
    <!-- Header -->
    <div>
      <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
        <span>磁力资源聚合搜索</span>
        <span class="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-mono">
          全网免翻多源
        </span>
      </h2>
      <p class="text-xs text-slate-400 mt-1">聚合多条公开磁力搜索通道，支持关键词搜索、种子解析与一键下达极速下载任务</p>
    </div>

    <!-- Search Input Box -->
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="keyword"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="输入影片名、动漫、游戏、软件或影视资源关键词搜索..."
            class="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-500 shadow-inner"
          />
        </div>
        <button
          @click="handleSearch"
          :disabled="loading || !keyword.trim()"
          class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
        >
          <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
          <Search v-else class="w-4 h-4" />
          <span>{{ loading ? '搜索中...' : '搜索' }}</span>
        </button>
      </div>

      <!-- Quick Search Tags -->
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <span>热门搜索：</span>
        <button
          v-for="tag in hotTags"
          :key="tag"
          @click="quickSearch(tag)"
          class="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <!-- Toast Notification -->
    <div
      v-if="toastMessage"
      class="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between"
    >
      <span>{{ toastMessage }}</span>
      <button @click="$emit('switch-tab', 'downloading')" class="underline hover:text-white">查看下载进度</button>
    </div>

    <!-- Search Results -->
    <div v-if="hasSearched && results.length === 0 && !loading" class="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-2 py-12">
      <AlertCircle class="w-8 h-8 text-slate-500" />
      <p class="text-sm">未找到与 “{{ keyword }}” 相关的磁力资源，请更换关键词重试</p>
    </div>

    <div v-else-if="results.length > 0" class="space-y-3">
      <div class="text-xs text-slate-400 flex items-center justify-between">
        <span>搜索结果 (共 {{ results.length }} 项)：</span>
        <span class="text-slate-500">点击“一键下载”即可使用 Aria2 引擎并行加速</span>
      </div>

      <div
        v-for="(item, idx) in results"
        :key="idx"
        class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-4 shadow-lg shadow-black/20"
      >
        <div class="space-y-1.5 truncate">
          <h4 class="text-sm font-medium text-slate-200 truncate hover:text-blue-400 cursor-pointer" :title="item.name" @click="copyMagnet(item.magnet)">
            {{ item.name }}
          </h4>
          <div class="flex items-center gap-4 text-xs text-slate-400">
            <span class="text-cyan-400 font-mono">大小：{{ item.size }}</span>
            <span v-if="item.hot" class="text-emerald-400/90 font-mono">热度/做种：{{ item.hot }}</span>
            <span v-if="item.date" class="text-slate-500 font-mono">发布时间：{{ item.date }}</span>
            <span class="text-slate-600">来源：{{ item.source }}</span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            @click="downloadMagnet(item.magnet, item.name)"
            class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all"
          >
            <Download class="w-3.5 h-3.5" />
            <span>一键下载</span>
          </button>
          <button
            @click="copyMagnet(item.magnet)"
            class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            title="复制磁力链接"
          >
            <Copy class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Search, Loader2, Download, Copy, AlertCircle } from 'lucide-vue-next';
import { aria2 } from '../services/aria2-client';

const emit = defineEmits(['switch-tab', 'refresh']);

const keyword = ref('');
const loading = ref(false);
const hasSearched = ref(false);
const results = ref([]);
const toastMessage = ref('');

const hotTags = ['Ubuntu 24.04', 'Debian ISO', 'Blender Demo', 'Big Buck Bunny 4K', 'Tears of Steel'];

const handleSearch = async () => {
  if (!keyword.value.trim()) return;
  loading.value = true;
  hasSearched.value = true;
  toastMessage.value = '';

  try {
    if (window.api?.searchMagnet) {
      results.value = await window.api.searchMagnet({ keyword: keyword.value, page: 1 });
    }
  } catch (err) {
    console.error('Search error:', err);
    results.value = [];
  } finally {
    loading.value = false;
  }
};

const quickSearch = (tag) => {
  keyword.value = tag;
  handleSearch();
};

const downloadMagnet = async (magnet, name) => {
  try {
    await aria2.addUri(magnet);
    toastMessage.value = `已成功添加下载任务：“${name || '磁力资源'}”`;
    emit('refresh');
  } catch (e) {
    alert('添加下载任务失败: ' + e.message);
  }
};

const copyMagnet = (magnet) => {
  navigator.clipboard.writeText(magnet);
  alert('磁力链接已复制到剪贴板！');
};
</script>
