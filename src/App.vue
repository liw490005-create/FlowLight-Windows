<template>
  <div class="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
    <!-- Top Custom TitleBar with Speed Counters -->
    <TitleBar
      :global-download-speed="globalSpeed.download"
      :global-upload-speed="globalSpeed.upload"
    />

    <!-- Main Body Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar Navigation -->
      <Sidebar
        v-model:current-tab="currentTab"
        :active-count="activeTasks.length"
        :completed-count="completedTasks.length"
        :download-dir="downloadDir"
        @open-new-task="showNewTaskModal = true"
      />

      <!-- Right Content View Area -->
      <main class="flex-1 bg-slate-950/60 overflow-hidden relative">
        <DownloadingView
          v-if="currentTab === 'downloading'"
          :tasks="activeTasks"
          @open-new-task="showNewTaskModal = true"
          @play-task="handlePlayTask"
          @refresh="fetchTasks"
        />

        <CompletedView
          v-else-if="currentTab === 'completed'"
          :tasks="completedTasks"
          @play-task="handlePlayTask"
          @refresh="fetchTasks"
        />

        <MagnetSearchView
          v-else-if="currentTab === 'magnet'"
          @switch-tab="currentTab = $event"
          @refresh="fetchTasks"
        />

        <NetdiskView
          v-else-if="currentTab === 'netdisk'"
          @switch-tab="currentTab = $event"
          @open-sniffer-url="handleOpenSnifferUrl"
          @refresh="fetchTasks"
        />

        <WebSnifferView
          v-else-if="currentTab === 'sniffer'"
          :initial-url="snifferTargetUrl"
          @refresh="fetchTasks"
        />

        <PlayerView
          v-else-if="currentTab === 'player'"
        />

        <SettingsView
          v-else-if="currentTab === 'settings'"
          :download-dir="downloadDir"
          @update-dir="downloadDir = $event"
        />
      </main>
    </div>

    <!-- Modals -->
    <NewTaskModal
      :is-open="showNewTaskModal"
      :download-dir="downloadDir"
      @close="showNewTaskModal = false"
      @task-created="handleTaskCreated"
    />

    <VideoPlayerModal
      :is-open="showPlayerModal"
      :file-path="playingFilePath"
      :title="playingTitle"
      @close="showPlayerModal = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import TitleBar from './components/TitleBar.vue';
import Sidebar from './components/Sidebar.vue';
import NewTaskModal from './components/NewTaskModal.vue';
import VideoPlayerModal from './components/VideoPlayerModal.vue';

import DownloadingView from './views/DownloadingView.vue';
import CompletedView from './views/CompletedView.vue';
import MagnetSearchView from './views/MagnetSearchView.vue';
import NetdiskView from './views/NetdiskView.vue';
import WebSnifferView from './views/WebSnifferView.vue';
import PlayerView from './views/PlayerView.vue';
import SettingsView from './views/SettingsView.vue';

import { aria2 } from './services/aria2-client';
import { formatSpeed, getTaskFileName, getTaskFilePath } from './services/utils';

const currentTab = ref('downloading');
const downloadDir = ref('D:\\流光下载\\Downloads');
const showNewTaskModal = ref(false);
const showPlayerModal = ref(false);
const playingFilePath = ref('');
const playingTitle = ref('');
const snifferTargetUrl = ref('');

const activeTasks = ref([]);
const completedTasks = ref([]);
const globalSpeed = ref({ download: '0 B/s', upload: '0 B/s' });
let pollTimer = null;
let isPolling = false;

onMounted(async () => {
  // 1. Fetch Aria2 RPC config
  if (window.api?.getAria2Config) {
    try {
      const config = await window.api.getAria2Config();
      if (config) {
        aria2.init(config);
        downloadDir.value = config.downloadDir;
      }
    } catch (e) {
      console.error('Failed to init Aria2 config:', e);
    }
  }

  // 2. Start Polling Tasks
  await fetchTasks();
  pollTimer = setInterval(fetchTasks, 1000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

const fetchTasks = async () => {
  if (isPolling) return;
  isPolling = true;
  try {
    const [active, waiting, stopped, stat] = await Promise.all([
      aria2.getActive().catch(() => []),
      aria2.getWaiting(0, 100).catch(() => []),
      aria2.getStopped(0, 100).catch(() => []),
      aria2.getGlobalStat().catch(() => null)
    ]);

    const errored = (stopped || []).filter(t => t.status === 'error');
    activeTasks.value = [...(active || []), ...(waiting || []), ...errored];
    completedTasks.value = (stopped || []).filter(t => t.status === 'complete');

    if (stat) {
      globalSpeed.value = {
        download: formatSpeed(stat.downloadSpeed),
        upload: formatSpeed(stat.uploadSpeed)
      };
    }
  } catch (err) {
    // ignore transient RPC errors
  } finally {
    isPolling = false;
  }
};

const handleTaskCreated = () => {
  currentTab.value = 'downloading';
  fetchTasks();
};

const handleOpenSnifferUrl = (url) => {
  snifferTargetUrl.value = url;
  currentTab.value = 'sniffer';
};

const handlePlayTask = (task) => {
  const filePath = getTaskFilePath(task);
  const title = getTaskFileName(task);
  if (filePath) {
    playingFilePath.value = filePath;
    playingTitle.value = title;
    showPlayerModal.value = true;
  }
};
</script>
