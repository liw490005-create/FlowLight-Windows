<template>
  <div class="h-full flex flex-col p-6 space-y-4 overflow-y-auto">
    <!-- Header / Actions Toolbar -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>正在下载</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-mono">
            {{ tasks.length }} 个任务
          </span>
        </h2>
        <p class="text-xs text-slate-400 mt-1">支持 BT/磁力、HTTP 多线程极速并行下载，支持视频边下边播</p>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          @click="$emit('open-new-task')"
          class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>新建下载</span>
        </button>
        <button
          @click="startAll"
          class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
          title="全部继续"
        >
          <Play class="w-3.5 h-3.5 text-emerald-400" />
          <span>全部开始</span>
        </button>
        <button
          @click="pauseAll"
          class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
          title="全部暂停"
        >
          <Pause class="w-3.5 h-3.5 text-amber-400" />
          <span>全部暂停</span>
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="tasks.length === 0" class="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3">
      <div class="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center border border-slate-700/50">
        <Download class="w-8 h-8 text-slate-400" />
      </div>
      <p class="text-sm">暂无下载任务</p>
      <button
        @click="$emit('open-new-task')"
        class="text-xs text-blue-400 hover:underline flex items-center gap-1"
      >
        <span>点击此处新建任务</span>
      </button>
    </div>

    <!-- Task Cards List -->
    <div v-else class="space-y-3">
      <div
        v-for="task in tasks"
        :key="task.gid"
        class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all shadow-lg shadow-black/20"
      >
        <!-- Task Title & Controls -->
        <div class="flex items-start justify-between gap-4 mb-2.5">
          <div class="flex items-center gap-3 truncate">
            <div class="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Film v-if="isVideo(task)" class="w-5 h-5 text-cyan-400" />
              <FileDown v-else class="w-5 h-5 text-blue-400" />
            </div>
            <div class="truncate">
              <h4 class="text-sm font-medium text-slate-200 truncate" :title="getTaskFileName(task)">
                {{ getTaskFileName(task) }}
              </h4>
              <div class="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                <span>{{ formatBytes(task.completedLength) }} / {{ formatBytes(task.totalLength) }}</span>
                <span v-if="task.numPieces > 0" class="text-slate-500">分片: {{ task.numPieces }}</span>
                <span v-if="task.numSeeders" class="text-emerald-400/90 font-mono">做种数: {{ task.numSeeders }}</span>
                <span v-if="task.connections" class="text-sky-400/90 font-mono">连接节点: {{ task.connections }}</span>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center gap-1.5 shrink-0">
            <!-- Play while downloading button -->
            <button
              v-if="isVideo(task) && task.completedLength > 524288"
              @click="$emit('play-task', task)"
              class="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs flex items-center gap-1 transition-colors"
              title="边下边播"
            >
              <Play class="w-3.5 h-3.5 fill-current" />
              <span>边下边播</span>
            </button>

            <!-- Pause / Resume -->
            <button
              v-if="task.status === 'active'"
              @click="pauseTask(task.gid)"
              class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors"
              title="暂停"
            >
              <Pause class="w-4 h-4" />
            </button>
            <button
              v-else-if="task.status === 'paused' || task.status === 'waiting'"
              @click="resumeTask(task.gid)"
              class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
              title="继续"
            >
              <Play class="w-4 h-4" />
            </button>

            <!-- Delete -->
            <button
              @click="deleteTask(task)"
              class="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
              title="删除任务"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            :class="[
              'h-full rounded-full transition-all duration-300',
              task.status === 'error' ? 'bg-rose-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400'
            ]"
            :style="{ width: calcPercent(task) + '%' }"
          ></div>
        </div>

        <!-- Status & Speed Details -->
        <div class="flex items-center justify-between text-xs text-slate-400 font-mono mt-2">
          <div class="flex items-center gap-2">
            <span class="text-blue-400 font-semibold">{{ calcPercent(task) }}%</span>
            <span v-if="task.status === 'paused'" class="text-amber-400">已暂停</span>
            <span v-else-if="task.status === 'waiting'" class="text-slate-400">等待队列</span>
            <span v-else-if="task.status === 'error'" class="text-rose-400">
              下载出错 {{ task.errorMessage ? `(${task.errorMessage})` : '' }}
            </span>
            <span v-else class="text-emerald-400">下载中</span>
          </div>

          <div class="flex items-center gap-4">
            <span v-if="task.status === 'active'">
              速度：<span class="text-emerald-400 font-semibold">{{ formatSpeed(task.downloadSpeed) }}</span>
            </span>
            <span v-if="task.status === 'active' && task.downloadSpeed > 0">
              剩余时间：<span class="text-slate-300">{{ formatEta(task.totalLength, task.completedLength, task.downloadSpeed) }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Plus, Play, Pause, Trash2, Film, FileDown, Download } from 'lucide-vue-next';
import { aria2 } from '../services/aria2-client';
import { formatBytes, formatSpeed, formatEta, getTaskFileName, isVideoFile } from '../services/utils';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['open-new-task', 'play-task', 'refresh']);

const calcPercent = (task) => {
  if (!+task.totalLength) return 0;
  const p = (task.completedLength / task.totalLength) * 100;
  return Math.min(100, Math.max(0, p.toFixed(1)));
};

const isVideo = (task) => {
  const name = getTaskFileName(task);
  return isVideoFile(name);
};

const pauseTask = async (gid) => {
  try {
    await aria2.pause(gid);
    emit('refresh');
  } catch (e) {}
};

const resumeTask = async (gid) => {
  try {
    await aria2.unpause(gid);
    emit('refresh');
  } catch (e) {}
};

const deleteTask = async (task) => {
  try {
    if (task.status === 'error' || task.status === 'removed' || task.status === 'complete') {
      await aria2.removeResult(task.gid);
    } else {
      await aria2.remove(task.gid);
    }
    emit('refresh');
  } catch (e) {
    try { await aria2.removeResult(task.gid); } catch (_) {}
    emit('refresh');
  }
};

const pauseAll = async () => {
  for (const t of props.tasks) {
    if (t.status === 'active') {
      try { await aria2.pause(t.gid); } catch (e) {}
    }
  }
  emit('refresh');
};

const startAll = async () => {
  for (const t of props.tasks) {
    if (t.status === 'paused') {
      try { await aria2.unpause(t.gid); } catch (e) {}
    }
  }
  emit('refresh');
};
</script>
