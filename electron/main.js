const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const aria2Manager = require('./aria2-manager');
const streamServer = require('./stream-server');
const magnetSearch = require('./magnet-search');
const netdiskService = require('./netdisk-service');

let mainWindow = null;

// Global crash safety guards
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason);
});

// Single instance lock to prevent duplicate windows / port conflicts
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Intercept external protocol launches (e.g., baiduyunguanjia://, quark://) across all WebViews
app.on('web-contents-created', (event, contents) => {
  const isCustomProtocol = (url) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return !lower.startsWith('http://') &&
           !lower.startsWith('https://') &&
           !lower.startsWith('file://') &&
           !lower.startsWith('devtools://') &&
           !lower.startsWith('about:') &&
           !lower.startsWith('javascript:') &&
           !lower.startsWith('data:') &&
           !lower.startsWith('blob:');
  };

  contents.on('will-navigate', (e, url) => {
    if (isCustomProtocol(url)) {
      e.preventDefault();
      console.log('[Protocol Intercept] Blocked custom protocol navigation:', url);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sniffer:protocolIntercepted', {
          protocolUrl: url,
          pageUrl: contents.getURL()
        });
      }
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (isCustomProtocol(url)) {
      console.log('[Protocol Intercept] Blocked custom protocol window:', url);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sniffer:protocolIntercepted', {
          protocolUrl: url,
          pageUrl: contents.getURL()
        });
      }
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
});

async function createWindow() {
  // Start Aria2 daemon and Local streaming server first so RPC is ready when UI mounts
  await Promise.all([
    aria2Manager.start(),
    streamServer.start()
  ]);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    },
    icon: path.join(__dirname, '..', 'public', 'favicon.ico')
  });

  // Block OS external protocol popups (e.g. Microsoft Store 'baiduyunguanjia' prompt)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'openExternal') {
      console.log('[Permission Intercept] Blocked openExternal request:', details?.externalURL);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sniffer:protocolIntercepted', {
          protocolUrl: details?.externalURL || 'baiduyunguanjia://',
          pageUrl: webContents?.getURL() || ''
        });
      }
      return callback(false);
    }
    callback(true);
  });

  // Setup sniffer request interceptor for webview / sessions
  setupMediaSniffer();

  const isDev = process.env.NODE_ENV === 'development';
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
    } else {
      mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupMediaSniffer() {
  const mediaFilter = {
    urls: ['*://*/*']
  };

  const isMediaUrl = (url) => {
    const cleanUrl = url.split('?')[0].toLowerCase();
    const mediaExts = ['.mp4', '.m3u8', '.flv', '.webm', '.avi', '.mkv', '.mov', '.mp3', '.aac', '.m4a', '.exe', '.zip', '.7z', '.rar', '.iso'];
    return mediaExts.some(ext => cleanUrl.endsWith(ext));
  };

  session.defaultSession.webRequest.onResponseStarted(mediaFilter, async (details) => {
    try {
      const url = details.url;
      if (!url || url.startsWith('http://127.0.0.1') || url.startsWith('file://') || url.startsWith('devtools://')) {
        return;
      }

      const headers = details.responseHeaders || {};
      const contentType = (headers['content-type'] || headers['Content-Type'] || [''])[0].toLowerCase();
      const contentDisposition = (headers['content-disposition'] || headers['Content-Disposition'] || [''])[0];

      const isVideoOrBinaryContent = contentType.includes('video/') ||
                                     contentType.includes('audio/') ||
                                     contentType.includes('application/vnd.apple.mpegurl') ||
                                     contentType.includes('application/x-mpegurl') ||
                                     contentType.includes('application/octet-stream') ||
                                     contentDisposition.toLowerCase().includes('attachment');

      if (isVideoOrBinaryContent || isMediaUrl(url)) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          let filename = path.basename(url.split('?')[0]) || 'download_resource';
          const fnMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
          if (fnMatch && fnMatch[1]) {
            try { filename = decodeURIComponent(fnMatch[1]); } catch (_) { filename = fnMatch[1]; }
          }

          // Extract active cookies for the URL host to enable header passthrough
          let cookieHeader = '';
          try {
            const urlObj = new URL(url);
            const cookies = await session.defaultSession.cookies.get({ domain: urlObj.hostname });
            cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          } catch (e) {}

          mainWindow.webContents.send('sniffer:mediaDetected', {
            url,
            filename,
            contentType,
            size: (headers['content-length'] || headers['Content-Length'] || ['0'])[0],
            cookie: cookieHeader,
            referer: details.referrer || ''
          });
        }
      }
    } catch (e) {
      // ignore
    }
  });
}

// --- IPC Handlers ---

ipcMain.handle('aria2:getConfig', () => {
  return aria2Manager.getRpcConfig();
});

ipcMain.handle('aria2:syncTrackers', async () => {
  return await aria2Manager.syncTrackers();
});

ipcMain.handle('aria2:selectDownloadDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择下载保存目录',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    aria2Manager.setDownloadDir(selected);
    return selected;
  }
  return null;
});

ipcMain.handle('aria2:selectTorrentFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Torrent 种子文件',
    filters: [{ name: 'Torrent 种子', extensions: ['torrent'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const fs = require('fs');
    const torrentBuf = fs.readFileSync(result.filePaths[0]);
    return {
      filePath: result.filePaths[0],
      fileName: path.basename(result.filePaths[0]),
      base64: torrentBuf.toString('base64')
    };
  }
  return null;
});

ipcMain.handle('stream:getUrl', (event, filePath) => {
  return streamServer.getStreamUrl(filePath);
});

ipcMain.handle('system:openPath', async (event, filePath) => {
  return await shell.openPath(filePath);
});

ipcMain.handle('system:showItemInFolder', (event, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('system:windowControl', (event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === 'close') {
    mainWindow.close();
  }
});

ipcMain.handle('magnet:search', async (event, { keyword, page }) => {
  return await magnetSearch.search(keyword, page);
});

// --- Netdisk IPC Handlers ---

async function getCombinedDomainCookies(baseDomain) {
  try {
    const all = await session.defaultSession.cookies.get({});
    const clean = baseDomain.replace(/^\./, '');
    const matched = all.filter(c => c.domain && c.domain.includes(clean));
    const map = new Map();
    matched.forEach(c => map.set(c.name, c.value));
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  } catch (e) {
    return '';
  }
}

ipcMain.handle('netdisk:getCookies', async (event, domain) => {
  return await getCombinedDomainCookies(domain);
});

ipcMain.handle('netdisk:parseShare', async (event, { type, url, passcode, dirPath, pdir_fid }) => {
  const detectedType = netdiskService.detectNetdiskType(url) || type;
  const domain = detectedType === 'quark' ? 'quark.cn' : 'baidu.com';
  const cookieStr = await getCombinedDomainCookies(domain);

  if (detectedType === 'quark') {
    return await netdiskService.parseQuarkShare(url, passcode, cookieStr, pdir_fid || '0');
  } else {
    const parsed = await netdiskService.parseBaiduShare(url, passcode, cookieStr, dirPath || '');
    if (parsed.randsk) {
      try {
        await session.defaultSession.cookies.set({
          url: 'https://pan.baidu.com',
          name: 'BDCLND',
          value: parsed.randsk,
          domain: 'pan.baidu.com',
          path: '/'
        });
      } catch (e) {}
    }
    return parsed;
  }
});

ipcMain.handle('netdisk:getQuarkDownloadUrl', async (event, { pwd_id, stoken, fid, file_name }) => {
  const cookieStr = await getCombinedDomainCookies('quark.cn');
  const dl = await netdiskService.getQuarkDownloadUrl(pwd_id, stoken, fid, cookieStr);
  const proxy = streamServer.registerNetdiskProxy({
    urls: dl.downloadUrls || [dl.downloadUrl],
    userAgent: netdiskService.userAgent,
    cookie: cookieStr,
    referer: 'https://pan.quark.cn/',
    fileName: file_name
  });
  return {
    downloadUrl: proxy.proxyUrl,
    downloadUrls: proxy.proxyUrls,
    headers: []
  };
});

ipcMain.handle('netdisk:getBaiduDownloadUrl', async (event, params) => {
  const cookieStr = await getCombinedDomainCookies('baidu.com');
  const dl = await netdiskService.getBaiduDownloadUrl(params, cookieStr);
  const uaHeader = (dl.headers || []).find(h => h.toLowerCase().startsWith('user-agent:'));
  const ua = uaHeader ? uaHeader.split(':').slice(1).join(':').trim() : netdiskService.baiduPcsUa;
  const proxy = streamServer.registerNetdiskProxy({
    urls: dl.downloadUrls || [dl.downloadUrl],
    userAgent: ua,
    cookie: cookieStr,
    referer: 'https://pan.baidu.com/disk/home',
    fileName: params.file_name
  });
  return {
    downloadUrl: proxy.proxyUrl,
    downloadUrls: proxy.proxyUrls,
    headers: []
  };
});

if (gotTheLock) {
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  aria2Manager.stop();
  streamServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  aria2Manager.stop();
  streamServer.stop();
});
