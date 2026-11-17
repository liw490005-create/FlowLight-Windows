export function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec) {
  if (!+bytesPerSec) return '0 B/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(totalBytes, completedBytes, speed) {
  if (!+speed || speed <= 0) return '计算中...';
  const remaining = totalBytes - completedBytes;
  if (remaining <= 0) return '即将完成';
  const seconds = Math.floor(remaining / speed);
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  return `${Math.floor(seconds / 3600)} 时 ${Math.floor((seconds % 3600) / 60)} 分`;
}

export function getTaskFileName(task) {
  if (task.bittorrent && task.bittorrent.info && task.bittorrent.info.name) {
    return task.bittorrent.info.name;
  }
  if (task.files && task.files.length > 0) {
    const filePath = task.files[0].path;
    if (filePath) {
      const parts = filePath.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1] || '未知任务';
    }
    const uris = task.files[0].uris;
    if (uris && uris.length > 0 && uris[0].uri) {
      const uri = uris[0].uri.split('?')[0];
      const parts = uri.split('/');
      return decodeURIComponent(parts[parts.length - 1] || '下载任务');
    }
  }
  return task.gid ? `任务_${task.gid.substring(0, 8)}` : '未知下载';
}

export function getTaskFilePath(task) {
  if (task.files && task.files.length > 0) {
    return task.files[0].path || '';
  }
  return '';
}

export function isVideoFile(fileName) {
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  return ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.m4v'].some(ext => lower.endsWith(ext));
}
