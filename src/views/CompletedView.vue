<template>
  <div class="h-full flex flex-col p-6 space-y-4 overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>已完成</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
            {{ tasks.length }} 个文件
          </span>
        </h2>
        <p class="text-xs text-slate-400 mt-1">本地下载库与历史记录管理，支持直接播放或在资源管理器中查看</p>
      </div>

      <div v-if="tasks.length > 0">
        <button
          @click="clearAll"
          class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <Trash class="w-3.5 h-3.5" />
          <span>清空所有记录</span>
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="tasks.length === 0" class="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3">
      <div class="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center border border-slate-700/50">
        <CheckCircle2 class="w-8 h-8 text-slate-400" />
      </div>
      <p class="text-sm">暂无已完成的下载任务</p>
    </div>

    <!-- Task List -->
    <div v-else class="space-y-3">
      <div
        v-for="task in tasks"
        :key="task.gid"
        class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-4 shadow-lg shadow-black/20"
      >
        <div class="flex items-center gap-3.5 truncate">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Film v-if="isVideo(task)" class="w-5 h-5 text-cyan-400" />
            <FileText v-else class="w-5 h-5 text-emerald-400" />
          </div>
          <div class="truncate">
            <h4 class="text-sm font-medium text-slate-200 truncate" :title="getTaskFileName(task)">
              {{ getTaskFileName(task) }}
            </h4>
            <div class="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>大小：{{ formatBytes(task.totalLength) }}</span>
              <span class="text-slate-500 truncate max-w-[360px]" :title="getTaskFilePath(task)">
                {{ getTaskFilePath(task) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="isVideo(task)"
            @click="$emit('play-task', task)"
            class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all"
            title="内置播放器播放"
          >
            <Play class="w-3.5 h-3.5 fill-current" />
            <span>播放</span>
          </button>

          <button
            @click="openFile(task)"
            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="调起默认应用打开"
          >
            <ExternalLink class="w-3.5 h-3.5 text-blue-400" />
            <span>打开</span>
          </button>

          <button
            @click="openFolder(task)"
            class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title="在文件夹中显示"
          >
            <FolderOpen class="w-4 h-4 text-amber-400" />
          </button>

          <button
            @click="deleteRecord(task.gid)"
            class="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            title="清除记录"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Play, FolderOpen, ExternalLink, Trash2, Trash, Film, FileText, CheckCircle2 } from 'lucide-vue-next';
import { aria2 } from '../services/aria2-client';
import { formatBytes, getTaskFileName, getTaskFilePath, isVideoFile } from '../services/utils';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['play-task', 'refresh']);

const isVideo = (task) => {
  return isVideoFile(getTaskFileName(task));
};

const openFolder = (task) => {
  const p = getTaskFilePath(task);
  if (p && window.api?.showItemInFolder) {
    window.api.showItemInFolder(p);
  }
};

const openFile = (task) => {
  const p = getTaskFilePath(task);
  if (p && window.api?.openPath) {
    window.api.openPath(p);
  }
};

const deleteRecord = async (gid) => {
  await aria2.removeResult(gid);
  emit('refresh');
};

const clearAll = async () => {
  if (confirm('确定要清除所有已完成的记录吗？（不会删除本地实际文件）')) {
    for (const t of props.tasks) {
      try {
        await aria2.removeResult(t.gid);
      } catch (e) {}
    }
    emit('refresh');
  }
};
</script>
