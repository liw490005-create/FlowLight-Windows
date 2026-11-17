<template>
  <div class="h-full flex flex-col p-6 space-y-4 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>网页智能嗅探与内置浏览器</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-mono">
            免客户端协议拦截
          </span>
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          内置网盘登录与流媒体嗅探，自动屏蔽 baiduyunguanjia:// 强制调起客户端弹窗并转为 Aria2 直链下载
        </p>
      </div>

      <div class="flex items-center gap-2 text-xs">
        <button
          v-for="site in quickSites"
          :key="site.url"
          @click="jumpToSite(site.url)"
          class="px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          {{ site.name }}
        </button>
        <button
          @click="clearSniffed"
          class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-colors flex items-center gap-1"
        >
          <Trash class="w-3.5 h-3.5" />
          <span>清空嗅探</span>
        </button>
      </div>
    </div>

    <!-- Toast / Intercept Notification Banner -->
    <div
      v-if="toastMsg"
      :class="[
        'px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between shrink-0',
        toastType === 'warn'
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
          : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
      ]"
    >
      <span>{{ toastMsg }}</span>
      <button @click="toastMsg = ''" class="ml-4 underline hover:text-white shrink-0">知道了</button>
    </div>

    <!-- URL Navigation Bar -->
    <div class="flex items-center gap-2.5 shrink-0">
      <div class="flex items-center gap-1 text-slate-400">
        <button @click="navigateBack" class="p-2 rounded-lg hover:bg-slate-800 transition-colors" title="后退">
          <ArrowLeft class="w-4 h-4" />
        </button>
        <button @click="reloadWebview" class="p-2 rounded-lg hover:bg-slate-800 transition-colors" title="刷新">
          <RotateCw class="w-4 h-4" />
        </button>
      </div>

      <div class="relative flex-1">
        <Globe class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          v-model="inputUrl"
          @keyup.enter="loadUrl"
          type="text"
          placeholder="输入网址（例如 https://pan.baidu.com 或任何视频网页）按回车访问..."
          class="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500 font-mono placeholder:text-slate-500"
        />
      </div>

      <button
        @click="loadUrl"
        class="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-violet-500/20 transition-all"
      >
        <ArrowRight class="w-3.5 h-3.5" />
        <span>访问</span>
      </button>

      <!-- Direct Netdisk Extraction Button when on Baidu/Quark Share -->
      <button
        v-if="isNetdiskSharePage"
        @click="extractCurrentNetdiskDirectLink"
        :disabled="extractingNetdisk"
        class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-500/25 transition-all"
      >
        <Zap class="w-3.5 h-3.5" />
        <span>{{ extractingNetdisk ? '正在提取直链...' : '⚡ 免客户端提取直链下载' }}</span>
      </button>
    </div>

    <!-- Main Content: Split into Webview & Sniffed Results -->
    <div class="flex-1 grid grid-rows-3 gap-4 min-h-0">
      <!-- Top (2/3 height): Embedded Webview Container -->
      <div class="row-span-2 relative bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
        <div class="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>内置沙盒浏览器 (在此登录百度/夸克账号后，直接点击右上角【⚡ 免客户端提取直链下载】即可推入 Aria2)</span>
          </span>
          <span class="text-slate-500 text-[11px] truncate max-w-[360px]">{{ currentUrl }}</span>
        </div>
        <webview
          ref="webviewRef"
          :src="currentUrl"
          class="flex-1 w-full h-full"
          allowpopups
        ></webview>
      </div>

      <!-- Bottom (1/3 height): Sniffed Media List Panel -->
      <div class="row-span-1 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
        <div class="px-4 py-2 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Radio class="w-4 h-4 text-emerald-400 animate-pulse" />
            <span class="text-xs font-semibold text-slate-200">已嗅探捕获的媒体与文件直链</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
              {{ sniffedList.length }}
            </span>
          </div>
          <span class="text-[11px] text-slate-500">捕获到的音视频/直链点击右侧“立即下载”即可携带 Cookie 极速拉取</span>
        </div>

        <!-- Sniffed Items -->
        <div class="flex-1 p-3 overflow-y-auto space-y-2">
          <div
            v-if="sniffedList.length === 0"
            class="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-4"
          >
            <span>在上方浏览器中播放视频或点击【⚡ 免客户端提取直链下载】，直链任务将自动推送至下载队列</span>
          </div>

          <div
            v-for="(item, idx) in sniffedList"
            :key="idx"
            class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-3 text-xs"
          >
            <div class="flex items-center gap-2.5 truncate">
              <Film class="w-4 h-4 text-cyan-400 shrink-0" />
              <div class="truncate">
                <div class="text-slate-200 font-medium truncate flex items-center gap-2" :title="item.filename">
                  <span>{{ item.filename }}</span>
                  <span v-if="item.cookie" class="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">已附带Cookie</span>
                </div>
                <div class="text-slate-400 font-mono text-[11px] truncate" :title="item.url">
                  {{ item.url }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span v-if="item.size && item.size !== '0'" class="text-slate-400 font-mono text-[11px]">
                {{ formatBytes(item.size) }}
              </span>
              <button
                @click="downloadSniffed(item)"
                class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1 shadow transition-all"
              >
                <Download class="w-3.5 h-3.5" />
                <span>立即下载</span>
              </button>
              <button
                @click="copyUrl(item.url)"
                class="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                title="复制直链"
              >
                <Copy class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  Globe,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  Film,
  Download,
  Copy,
  Trash,
  Radio,
  Zap
} from 'lucide-vue-next';
import { aria2 } from '../services/aria2-client';
import { formatBytes } from '../services/utils';

const props = defineProps({
  initialUrl: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['refresh']);

const quickSites = [
  { name: '🟢 夸克网盘网页版', url: 'https://pan.quark.cn/' },
  { name: '🔵 百度网盘网页版', url: 'https://pan.baidu.com/' },
  { name: '🎬 测试视频源', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/' }
];

const defaultUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
const inputUrl = ref(props.initialUrl || defaultUrl);
const currentUrl = ref(props.initialUrl || defaultUrl);
const webviewRef = ref(null);
const sniffedList = ref([]);
const toastMsg = ref('');
const toastType = ref('success');
const extractingNetdisk = ref(false);
let unregisterSniffer = null;
let unregisterProtocol = null;

const isNetdiskSharePage = computed(() => {
  const u = (inputUrl.value || currentUrl.value || '').toLowerCase();
  return u.includes('pan.baidu.com/s/') || u.includes('pan.baidu.com/share/') || u.includes('pan.quark.cn/s/');
});

watch(() => props.initialUrl, (newUrl) => {
  if (newUrl) {
    inputUrl.value = newUrl;
    currentUrl.value = newUrl;
  }
});

const showToast = (msg, type = 'success', duration = 6000) => {
  toastMsg.value = msg;
  toastType.value = type;
  if (duration > 0) {
    setTimeout(() => {
      if (toastMsg.value === msg) toastMsg.value = '';
    }, duration);
  }
};

const cleanIpcError = (err) => {
  const msg = err?.message || String(err);
  return msg.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').replace(/^NEED_BAIDU_LOGIN:/, '');
};

onMounted(() => {
  if (window.api?.onMediaDetected) {
    unregisterSniffer = window.api.onMediaDetected((media) => {
      if (!sniffedList.value.some(m => m.url === media.url)) {
        sniffedList.value.unshift(media);
        if (sniffedList.value.length > 150) {
          sniffedList.value.pop();
        }
      }
    });
  }

  // When webpage tries to invoke baiduyunguanjia:// or quark://, intercept and trigger direct link extraction!
  if (window.api?.onProtocolIntercepted) {
    unregisterProtocol = window.api.onProtocolIntercepted((info) => {
      console.log('Intercepted client protocol:', info);
      if (isNetdiskSharePage.value) {
        extractCurrentNetdiskDirectLink();
      } else {
        showToast(
          '🛡️ 已成功为您拦截网盘强制调起客户端请求！若需下载当前文件，请先在网页内登录网盘账号后使用【⚡ 免客户端提取直链下载】功能。',
          'warn',
          8000
        );
      }
    });
  }
});

onUnmounted(() => {
  if (unregisterSniffer) unregisterSniffer();
  if (unregisterProtocol) unregisterProtocol();
});

const extractCurrentNetdiskDirectLink = async () => {
  const shareUrl = inputUrl.value || currentUrl.value;
  if (!shareUrl || extractingNetdisk.value) return;

  extractingNetdisk.value = true;
  showToast('⚡ 已拦截客户端调起，正在为您自动转存并提取 Aria2 高速直链...', 'success', 10000);

  try {
    const parsed = await window.api.parseNetdiskShare({
      url: shareUrl,
      passcode: ''
    });

    if (!parsed || !parsed.files || parsed.files.length === 0) {
      throw new Error('未能解析出分享文件列表');
    }

    const targetFiles = parsed.files.filter(f => !f.is_dir);
    if (targetFiles.length === 0) {
      throw new Error('该分享内为文件夹，请前往左侧【☁️ 网盘解析】打开子文件夹选择文件下载');
    }

    let addedCount = 0;
    for (const file of targetFiles) {
      if (parsed.type === 'baidu') {
        const dl = await window.api.getBaiduDownloadUrl({
          surl: parsed.surl,
          randsk: parsed.randsk,
          share_id: parsed.share_id,
          uk: parsed.uk,
          fid: file.fid,
          file_name: file.file_name
        });
        if (dl && dl.downloadUrl) {
          await aria2.addUri(dl.downloadUrls || dl.downloadUrl, {
            header: dl.headers,
            out: file.file_name,
            'max-connection-per-server': '2',
            split: '8'
          });
          addedCount++;
        }
      } else if (parsed.type === 'quark') {
        const dl = await window.api.getQuarkDownloadUrl({
          pwd_id: parsed.pwd_id,
          stoken: parsed.stoken,
          fid: file.fid
        });
        if (dl && dl.downloadUrl) {
          await aria2.addUri(dl.downloadUrls || dl.downloadUrl, {
            header: dl.headers,
            out: file.file_name,
            'max-connection-per-server': '4',
            split: '8'
          });
          addedCount++;
        }
      }
    }

    if (addedCount > 0) {
      showToast(`✅ 免客户端提取成功！已将 ${addedCount} 个文件推入【正在下载】高速队列！`, 'success', 8000);
      emit('refresh');
    }
  } catch (err) {
    showToast(`🛡️ 已拦截百度客户端弹窗！提示：${cleanIpcError(err)}`, 'warn', 10000);
  } finally {
    extractingNetdisk.value = false;
  }
};

const jumpToSite = (url) => {
  inputUrl.value = url;
  currentUrl.value = url;
};

const loadUrl = () => {
  let u = inputUrl.value.trim();
  if (!u) return;
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  currentUrl.value = u;
};

const navigateBack = () => {
  try {
    if (webviewRef.value && webviewRef.value.canGoBack()) {
      webviewRef.value.goBack();
    }
  } catch (e) {}
};

const reloadWebview = () => {
  try {
    if (webviewRef.value) {
      webviewRef.value.reload();
    }
  } catch (e) {}
};

const clearSniffed = () => {
  sniffedList.value = [];
};

const downloadSniffed = async (item) => {
  try {
    const headers = [
      'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ];
    if (item.cookie) headers.push(`Cookie: ${item.cookie}`);
    if (item.referer) headers.push(`Referer: ${item.referer}`);

    const options = { header: headers };
    if (item.filename && item.filename !== 'download_resource') {
      options.out = item.filename;
    }

    await aria2.addUri(item.url, options);
    showToast(`已成功添加嗅探任务：“${item.filename}”（已自动附带防盗链请求头）`);
    emit('refresh');
  } catch (e) {
    showToast('添加任务失败: ' + e.message, 'warn');
  }
};

const copyUrl = (url) => {
  navigator.clipboard.writeText(url);
  showToast('直链已复制到剪贴板！');
};
</script>
