const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Local Streaming Server with HTTP 206 Partial Content (Range) support.
 * Enables in-app streaming and "边下边播" (Play while downloading) with safe stream cleanup.
 */
class StreamServer {
  constructor() {
    this.port = 6889;
    this.server = null;
  }

  start(maxRetries = 10) {
    if (this.server) {
      return Promise.resolve(this.port);
    }

    return new Promise((resolve) => {
      const tryListen = (portToTry, retriesLeft) => {
        const srv = http.createServer((req, res) => this.handleRequest(req, res));

        srv.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
            console.warn(`[StreamServer] Port ${portToTry} in use, trying ${portToTry + 1}...`);
            tryListen(portToTry + 1, retriesLeft - 1);
          } else {
            console.error('[StreamServer] Listen error:', err.message);
            resolve(this.port);
          }
        });

        srv.listen(portToTry, '127.0.0.1', () => {
          this.port = portToTry;
          this.server = srv;
          console.log(`[StreamServer] Running on http://127.0.0.1:${this.port}`);
          resolve(this.port);
        });
      };

      tryListen(this.port, maxRetries);
    });
  }

  handleRequest(req, res) {
    try {
      const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
      const filePath = parsedUrl.searchParams.get('path');

      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('文件不存在或尚未创建');
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      if (fileSize === 0) {
        res.writeHead(204);
        res.end();
        return;
      }

      const range = req.headers.range;
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.m4v': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.flv': 'video/x-flv',
        '.mp3': 'audio/mpeg',
        '.flac': 'audio/flac',
        '.m4a': 'audio/mp4'
      };
      const contentType = mimeTypes[ext] || 'video/mp4';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const rawStart = parseInt(parts[0], 10);
        const start = isNaN(rawStart) ? 0 : Math.max(0, Math.min(rawStart, fileSize - 1));
        const rawEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const end = isNaN(rawEnd) ? fileSize - 1 : Math.max(start, Math.min(rawEnd, fileSize - 1));
        const chunksize = (end - start) + 1;

        const stream = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });

        stream.on('error', (err) => {
          console.error('[StreamServer] ReadStream error:', err.message);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });

        req.on('close', () => {
          stream.destroy();
        });

        stream.pipe(res);
      } else {
        const stream = fs.createReadStream(filePath);
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        });

        stream.on('error', (err) => {
          console.error('[StreamServer] ReadStream error:', err.message);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });

        req.on('close', () => {
          stream.destroy();
        });

        stream.pipe(res);
      }
    } catch (err) {
      console.error('[StreamServer] Error serving file:', err);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end(err.message);
    }
  }

  getStreamUrl(filePath) {
    return `http://127.0.0.1:${this.port}/stream?path=${encodeURIComponent(filePath)}`;
  }

  stop() {
    if (this.server) {
      try {
        this.server.close();
      } catch (e) {}
      this.server = null;
    }
  }
}

module.exports = new StreamServer();
