<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div class="w-[520px] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h3 class="font-semibold text-slate-100 flex items-center gap-2">
          <Plus class="w-5 h-5 text-blue-400" />
          <span>新建下载任务</span>
        </h3>
        <button @click="close" class="text-slate-400 hover:text-white transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-4">
        <!-- URL / Magnet Input -->
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1.5">
            下载链接 (支持 Magnet 磁力链、HTTP/HTTPS、FTP 链接，支持批量输入)
          </label>
          <textarea
            v-model="uriInput"
            rows="4"
            placeholder="粘贴磁力链接 magnet:?xt=urn:btih:... 或 HTTP/HTTPS 直链"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono resize-none placeholder:text-slate-600"
          ></textarea>
        </div>

        <!-- Or Select Torrent File -->
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div class="flex items-center gap-2 text-sm text-slate-300">
            <FileArchive class="w-4 h-4 text-cyan-400" />
            <span v-if="!selectedTorrent">或者导入本地种子文件 (.torrent)</span>
            <span v-else class="text-cyan-300 font-mono text-xs">{{ selectedTorrent.fileName }}</span>
          </div>
          <button
            type="button"
            @click="handleSelectTorrent"
            class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-medium text-slate-200 transition-colors"
          >
            {{ selectedTorrent ? '重新选择' : '浏览种子' }}
          </button>
        </div>

        <!-- Target Dir Preview -->
        <div class="text-xs text-slate-400 flex items-center justify-between">
          <span>存储路径：</span>
          <span class="text-slate-300 font-mono truncate max-w-[320px]">{{ downloadDir }}</span>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-3">
        <button
          @click="close"
          class="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          取消
        </button>
        <button
          @click="submitTask"
          :disabled="!canSubmit"
          class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all"
        >
          <Download class="w-4 h-4" />
          <span>立即下载</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Plus, X, Download, FileArchive } from 'lucide-vue-next';
import { aria2 } from '../services/aria2-client';

const props = defineProps({
  isOpen: Boolean,
  downloadDir: {
    type: String,
    default: 'D:\\流光下载\\Downloads'
  }
});

const emit = defineEmits(['close', 'task-created']);

const uriInput = ref('');
const selectedTorrent = ref(null);

const canSubmit = computed(() => {
  return (uriInput.value && uriInput.value.trim().length > 0) || selectedTorrent.value !== null;
});

const close = () => {
  uriInput.value = '';
  selectedTorrent.value = null;
  emit('close');
};

const handleSelectTorrent = async () => {
  if (window.api?.selectTorrentFile) {
    const file = await window.api.selectTorrentFile();
    if (file) {
      selectedTorrent.value = file;
    }
  }
};

const submitTask = async () => {
  try {
    if (selectedTorrent.value) {
      await aria2.addTorrent(selectedTorrent.value.base64);
    } else if (uriInput.value) {
      const lines = uriInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      for (const uri of lines) {
        await aria2.addUri(uri);
      }
    }
    emit('task-created');
    close();
  } catch (err) {
    alert('添加任务失败: ' + err.message);
  }
};
</script>
