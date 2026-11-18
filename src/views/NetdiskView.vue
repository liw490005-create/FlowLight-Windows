<template>
  <div class="h-full flex flex-col p-6 space-y-5 overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>网盘资源解析与高速下载</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
            免客户端 · 多线程加速
          </span>
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          支持解析夸克网盘与百度网盘分享链接（粘贴链接后自动识别网盘类型与提取码），通过 Aria2 引擎多线程极速拉取
        </p>
      </div>

      <!-- Netdisk Type Switcher -->
      <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
        <button
          @click="switchNetdiskTab('quark')"
          :class="[
            'px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5',
            currentNetdisk === 'quark' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          ]"
        >
          <span class="w-2 h-2 rounded-full bg-emerald-300"></span>
          <span>夸克网盘</span>
        </button>

        <button
          @click="switchNetdiskTab('baidu')"
          :class="[
            'px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5',
            currentNetdisk === 'baidu' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          ]"
        >
          <span class="w-2 h-2 rounded-full bg-blue-300"></span>
          <span>百度网盘</span>
        </button>

        <button
          @click="switchNetdiskTab('rpc')"
          :class="[
            'px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5',
            currentNetdisk === 'rpc' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          ]"
        >
          <Zap class="w-3.5 h-3.5 text-amber-300" />
          <span>油猴/RPC直推</span>
        </button>
      </div>
    </div>

    <!-- Toast Notification -->
    <div
      v-if="toastMessage"
      class="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between"
    >
      <span>{{ toastMessage }}</span>
      <div class="flex items-center gap-3 shrink-0">
        <button @click="$emit('switch-tab', 'downloading')" class="underline hover:text-white">前往正在下载</button>
        <button @click="toastMessage = ''" class="text-slate-400 hover:text-white">关闭</button>
      </div>
    </div>

    <!-- Mode 1 & 2: Share Link Parser (Quark / Baidu) -->
    <div v-if="currentNetdisk !== 'rpc'" class="space-y-4">
      <!-- Input Panel -->
      <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2 text-slate-300 font-medium">
            <Link2 class="w-4 h-4 text-cyan-400" />
            <span>输入{{ currentNetdisk === 'quark' ? '夸克' : '百度' }}网盘分享链接 (自动识别网盘域名与提取码)：</span>
          </div>
          
          <!-- Cookie Auth Indicator -->
          <div class="flex items-center gap-2">
            <span
              :class="[
                'text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1',
                hasCookie ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              ]"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="hasCookie ? 'bg-emerald-400' : 'bg-amber-400'"></span>
              <span>{{ hasCookie ? '已同步登录凭据' : '未登录 (大于50MB文件需登录)' }}</span>
            </span>
            <button
              @click="openWebLogin"
              class="px-2.5 py-0.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-[11px] text-blue-400 transition-colors"
            >
              在内置浏览器登录
            </button>
          </div>
        </div>

        <div class="space-y-3">
          <div class="relative">
            <textarea
              v-model="shareUrlInput"
              @input="handleUrlInputChange"
              rows="2"
              :placeholder="currentNetdisk === 'quark' ? '例如：https://pan.quark.cn/s/c97b5e4a3b21 提取码: abcd' : '例如：https://pan.baidu.com/s/1gEhupSKfE1VePedFPjYdjA?pwd=3ca4'"
              class="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono resize-none placeholder:text-slate-600"
            ></textarea>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <input
                v-model="passcodeInput"
                type="text"
                placeholder="提取码 (若链接中已有可不填)"
                class="bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono w-48 focus:outline-none focus:border-blue-500"
              />
              <span class="text-[11px] text-slate-500">支持 ?pwd=xxxx 或 提取码: xxxx 自动提取</span>
            </div>

            <button
              @click="handleParseShare()"
              :disabled="parsing || !shareUrlInput.trim()"
              class="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
            >
              <Loader2 v-if="parsing" class="w-4 h-4 animate-spin" />
              <Search v-else class="w-4 h-4" />
              <span>{{ parsing ? '正在深度解析...' : '解析分享文件' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Parse / Login Prompt Error Message -->
      <div v-if="errorMessage" class="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMessage }}</span>
        </div>
        <button
          v-if="needLoginAction"
          @click="openWebLogin"
          class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shrink-0 transition-colors"
        >
          立即前往内置浏览器登录账号
        </button>
      </div>

      <!-- Parsed File List Area -->
      <div v-if="parsedData" class="space-y-3">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <div class="flex items-center gap-2">
            <FolderCheck class="w-4 h-4 text-emerald-400" />
            <span class="font-medium text-slate-200">{{ parsedData.title }}</span>
            <span class="text-slate-500 font-mono">(共 {{ parsedData.files.length }} 项)</span>
            <button
              v-if="inSubfolder"
              @click="backToRoot"
              class="ml-2 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-[11px]"
            >
              ← 返回根目录
            </button>
          </div>

          <div class="flex items-center gap-3">
            <button @click="toggleSelectAll" class="text-blue-400 hover:underline">
              {{ isAllSelected ? '取消全选' : '全选所有文件' }}
            </button>
            <button
              @click="downloadSelectedFiles"
              :disabled="selectedFids.length === 0 || downloading"
              class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Download class="w-3.5 h-3.5" />
              <span>{{ downloading ? '正在转存并提取直链...' : `免客户端高速下载 (${selectedFids.length})` }}</span>
            </button>
          </div>
        </div>

        <!-- File Table -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden">
          <div
            v-for="file in parsedData.files"
            :key="file.fid"
            @click="file.is_dir ? openSubFolder(file) : toggleSelectFile(file.fid)"
            class="px-4 py-3 border-b border-slate-800/80 last:border-b-0 hover:bg-slate-800/50 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors"
          >
            <div class="flex items-center gap-3 truncate">
              <input
                v-if="!file.is_dir"
                type="checkbox"
                :checked="selectedFids.includes(file.fid)"
                @click.stop="toggleSelectFile(file.fid)"
                class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer"
              />
              <FolderCheck v-if="file.is_dir" class="w-4 h-4 text-amber-400 shrink-0" />
              <FileIcon v-else class="w-4 h-4 text-cyan-400 shrink-0" />
              <span class="text-slate-200 font-medium truncate" :title="file.file_name">
                {{ file.file_name }}
              </span>
              <span v-if="file.is_dir" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">文件夹 (点击进入)</span>
            </div>

            <div class="flex items-center gap-4 shrink-0 font-mono text-slate-400 text-[11px]">
              <span v-if="!file.is_dir">{{ formatBytes(file.size) }}</span>
              <button
                v-if="file.is_dir"
                @click.stop="openSubFolder(file)"
                class="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors"
              >
                打开目录
              </button>
              <button
                v-else
                @click.stop="handleDownloadOne(file)"
                :disabled="downloading"
                class="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-sans font-medium transition-colors"
              >
                {{ downloading ? '提取中...' : '⚡ 免客户端下载' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mode 3: Tampermonkey / ScriptCat RPC Helper -->
    <div v-else class="space-y-5 max-w-4xl">
      <div class="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Zap class="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">配合浏览器油猴脚本（Tampermonkey / 脚本猫）直连满速下载</h3>
            <p class="text-xs text-slate-400 mt-0.5">
              本软件内置的标准 Aria2c 核心已开放固定本地 JSON-RPC 接口，可完美联动各大主流网盘直链助手脚本。
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 text-xs pt-2">
          <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span class="text-slate-400 font-semibold block">Aria2 RPC 地址</span>
            <div class="flex items-center justify-between font-mono bg-slate-900 px-3 py-2 rounded-lg text-emerald-400 border border-slate-800">
              <span>{{ rpcEndpoint }}</span>
              <button @click="copyText(rpcEndpoint)" class="text-slate-400 hover:text-white">
                <Copy class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span class="text-slate-400 font-semibold block">RPC 固定密钥 (Token)</span>
            <div class="flex items-center justify-between font-mono bg-slate-900 px-3 py-2 rounded-lg text-sky-400 border border-slate-800">
              <span class="truncate max-w-[200px]">{{ rpcSecret }}</span>
              <button @click="copyText(rpcSecret)" class="text-slate-400 hover:text-white">
                <Copy class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Instructions Step by step -->
        <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3 text-xs text-slate-300">
          <h4 class="font-semibold text-slate-200">🚀 极速使用指南（一次配置，永久有效）：</h4>
          <ol class="list-decimal list-inside space-y-1.5 text-slate-400">
            <li>在浏览器（Edge/Chrome）中安装扩展 <strong class="text-slate-200">Tampermonkey (油猴)</strong> 或 <strong class="text-slate-200">脚本猫</strong>；</li>
            <li>安装 GitHub 热门开源脚本 <strong class="text-cyan-400">网盘直链下载助手</strong>（支持百度网盘、夸克网盘、阿里云盘等全主流云盘）；</li>
            <li>在网盘网页打开任意大文件，点击网页顶部的 <strong class="text-emerald-400">“下载助手” -> “RPC 下载”</strong>；</li>
            <li>将上方展示的 <strong class="text-slate-200">RPC 地址</strong> 与固定 <strong class="text-slate-200">Token (flowlight_rpc_2026)</strong> 填入脚本配置中；</li>
            <li>以后在网页端勾选任何大文件或文件夹，点击“发送到 RPC”，即可自动秒级推入本软件的【正在下载】列表以 32 线程全力跑满宽带！</li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  Link2,
  Search,
  Download,
  Copy,
  AlertCircle,
  FolderCheck,
  File as FileIcon,
  Loader2,
  Zap
} from 'lucide-vue-next';
import { aria2 } from '../services/aria2-client';
import { formatBytes } from '../services/utils';

const emit = defineEmits(['switch-tab', 'open-sniffer-url', 'refresh']);

const currentNetdisk = ref('quark');
const shareUrlInput = ref('');
const passcodeInput = ref('');
const parsing = ref(false);
const downloading = ref(false);
const errorMessage = ref('');
const needLoginAction = ref(false);
const toastMessage = ref('');
const parsedData = ref(null);
const selectedFids = ref([]);
const hasCookie = ref(false);
const inSubfolder = ref(false);

const rpcEndpoint = ref('http://127.0.0.1:6800/jsonrpc');
const rpcSecret = ref('flowlight_rpc_2026');

const cleanIpcError = (err) => {
  const msg = err?.message || String(err);
  const stripped = msg.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '');
  if (stripped.includes('NEED_BAIDU_LOGIN:') || stripped.includes('需先登录')) {
    needLoginAction.value = true;
    return stripped.replace('NEED_BAIDU_LOGIN:', '');
  }
  needLoginAction.value = false;
  return stripped;
};

onMounted(async () => {
  if (window.api?.getAria2Config) {
    const config = await window.api.getAria2Config();
    if (config) {
      rpcEndpoint.value = config.endpoint;
      rpcSecret.value = config.secret;
    }
  }
  await checkCookies();
});

const checkCookies = async () => {
  if (window.api?.getNetdiskCookies && currentNetdisk.value !== 'rpc') {
    const domain = currentNetdisk.value === 'quark' ? '.quark.cn' : '.baidu.com';
    const c = await window.api.getNetdiskCookies(domain);
    if (currentNetdisk.value === 'baidu') {
      hasCookie.value = Boolean(c && c.includes('BDUSS='));
    } else {
      hasCookie.value = Boolean(c && c.includes('__puus'));
    }
  }
};

const switchNetdiskTab = (tab) => {
  currentNetdisk.value = tab;
  errorMessage.value = '';
  needLoginAction.value = false;
  toastMessage.value = '';
  checkCookies();
};

const handleUrlInputChange = () => {
  const text = shareUrlInput.value || '';
  if (text.includes('pan.baidu.com') || text.includes('yun.baidu.com')) {
    if (currentNetdisk.value !== 'baidu') {
      currentNetdisk.value = 'baidu';
      checkCookies();
    }
  } else if (text.includes('pan.quark.cn') || text.includes('quark.cn')) {
    if (currentNetdisk.value !== 'quark') {
      currentNetdisk.value = 'quark';
      checkCookies();
    }
  }

  const match = text.match(/(?:提取码|密码|pwd|code|passcode)[:：=\s]*([a-zA-Z0-9]{4,8})/i);
  if (match && match[1]) {
    passcodeInput.value = match[1];
  }
};

const handleParseShare = async (subParams = {}) => {
  if (!shareUrlInput.value.trim()) return;

  handleUrlInputChange();

  parsing.value = true;
  errorMessage.value = '';
  needLoginAction.value = false;
  toastMessage.value = '';
  if (!subParams.dirPath && !subParams.pdir_fid) {
    inSubfolder.value = false;
  }

  try {
    if (window.api?.parseNetdiskShare) {
      const res = await window.api.parseNetdiskShare({
        type: currentNetdisk.value,
        url: shareUrlInput.value,
        passcode: passcodeInput.value,
        dirPath: subParams.dirPath || '',
        pdir_fid: subParams.pdir_fid || '0'
      });

      if (res && res.files) {
        if (res.type && res.type !== currentNetdisk.value) {
          currentNetdisk.value = res.type;
          await checkCookies();
        }
        parsedData.value = res;
        selectedFids.value = res.files.filter(f => !f.is_dir).map(f => f.fid);
      }
    }
  } catch (err) {
    errorMessage.value = cleanIpcError(err);
  } finally {
    parsing.value = false;
  }
};

const openSubFolder = async (folder) => {
  inSubfolder.value = true;
  if (currentNetdisk.value === 'baidu') {
    await handleParseShare({ dirPath: folder.path });
  } else {
    await handleParseShare({ pdir_fid: folder.fid });
  }
};

const backToRoot = async () => {
  inSubfolder.value = false;
  await handleParseShare();
};

const toggleSelectAll = () => {
  if (!parsedData.value) return;
  const selectable = parsedData.value.files.filter(f => !f.is_dir);
  if (selectedFids.value.length === selectable.length) {
    selectedFids.value = [];
  } else {
    selectedFids.value = selectable.map(f => f.fid);
  }
};

const isAllSelected = computed(() => {
  if (!parsedData.value) return false;
  const selectable = parsedData.value.files.filter(f => !f.is_dir);
  return selectable.length > 0 && selectedFids.value.length === selectable.length;
});

const toggleSelectFile = (fid) => {
  if (selectedFids.value.includes(fid)) {
    selectedFids.value = selectedFids.value.filter(id => id !== fid);
  } else {
    selectedFids.value.push(fid);
  }
};

const dispatchFileToAria2 = async (file) => {
  if (parsedData.value.type === 'quark' && window.api?.getQuarkDownloadUrl) {
    const dl = await window.api.getQuarkDownloadUrl({
      pwd_id: parsedData.value.pwd_id,
      stoken: parsedData.value.stoken,
      fid: file.fid
    });

    await aria2.addUri(dl.downloadUrls || dl.downloadUrl, {
      header: dl.headers,
      out: file.file_name,
      'max-connection-per-server': '4',
      split: '8'
    });
    return { ok: true };
  } else if (parsedData.value.type === 'baidu' && window.api?.getBaiduDownloadUrl) {
    const dl = await window.api.getBaiduDownloadUrl({
      surl: parsedData.value.surl,
      randsk: parsedData.value.randsk,
      share_id: parsedData.value.share_id,
      uk: parsedData.value.uk,
      fid: file.fid,
      file_name: file.file_name,
      file_size: file.size
    });

    if (dl && dl.downloadUrl) {
      await aria2.addUri(dl.downloadUrls || dl.downloadUrl, {
        header: dl.headers,
        out: file.file_name,
        'max-connection-per-server': '16',
        split: '16'
      });
      return { ok: true };
    }
  }
  throw new Error('请先在内置浏览器登录对应网盘账号以获取大文件高速直链');
};

const handleDownloadOne = async (file) => {
  downloading.value = true;
  errorMessage.value = '';
  needLoginAction.value = false;
  try {
    const result = await dispatchFileToAria2(file);
    if (result.ok) {
      toastMessage.value = `已成功将【${file.file_name}】免客户端推入高速下载队列！`;
      emit('refresh');
    }
  } catch (e) {
    errorMessage.value = cleanIpcError(e);
  } finally {
    downloading.value = false;
  }
};

const downloadSelectedFiles = async () => {
  if (!parsedData.value || selectedFids.value.length === 0) return;
  downloading.value = true;
  errorMessage.value = '';
  needLoginAction.value = false;
  let successCount = 0;

  try {
    for (const fid of selectedFids.value) {
      const file = parsedData.value.files.find(f => f.fid === fid);
      if (file && !file.is_dir) {
        const res = await dispatchFileToAria2(file);
        if (res.ok) successCount++;
      }
    }
    if (successCount > 0) {
      toastMessage.value = `已成功免客户端批量下达 ${successCount} 个文件至高速下载队列！`;
      emit('refresh');
    }
  } catch (e) {
    errorMessage.value = cleanIpcError(e);
  } finally {
    downloading.value = false;
  }
};

const openWebLogin = () => {
  const loginUrl = currentNetdisk.value === 'quark'
    ? 'https://pan.quark.cn/'
    : (parsedData.value?.shareUrl || 'https://pan.baidu.com/');
  emit('open-sniffer-url', loginUrl);
};

const copyText = (txt) => {
  navigator.clipboard.writeText(txt);
  toastMessage.value = 'RPC 配置参数已复制到剪贴板！';
};
</script>
