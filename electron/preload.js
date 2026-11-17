const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAria2Config: () => ipcRenderer.invoke('aria2:getConfig'),
  syncTrackers: () => ipcRenderer.invoke('aria2:syncTrackers'),
  selectDownloadDir: () => ipcRenderer.invoke('aria2:selectDownloadDir'),
  selectTorrentFile: () => ipcRenderer.invoke('aria2:selectTorrentFile'),
  getStreamUrl: (filePath) => ipcRenderer.invoke('stream:getUrl', filePath),
  openPath: (filePath) => ipcRenderer.invoke('system:openPath', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('system:showItemInFolder', filePath),
  windowControl: (action) => ipcRenderer.invoke('system:windowControl', action),
  searchMagnet: (params) => ipcRenderer.invoke('magnet:search', params),
  
  // Netdisk features
  parseNetdiskShare: (params) => ipcRenderer.invoke('netdisk:parseShare', params),
  getQuarkDownloadUrl: (params) => ipcRenderer.invoke('netdisk:getQuarkDownloadUrl', params),
  getBaiduDownloadUrl: (params) => ipcRenderer.invoke('netdisk:getBaiduDownloadUrl', params),
  getNetdiskCookies: (domain) => ipcRenderer.invoke('netdisk:getCookies', domain),

  onMediaDetected: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('sniffer:mediaDetected', handler);
    return () => ipcRenderer.removeListener('sniffer:mediaDetected', handler);
  },

  onProtocolIntercepted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('sniffer:protocolIntercepted', handler);
    return () => ipcRenderer.removeListener('sniffer:protocolIntercepted', handler);
  }
});
