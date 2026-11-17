const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Local Streaming & Cloud-Drive Accelerator Proxy Server.
 * 1. /stream : HTTP 206 Partial Content local file streaming for "边下边播"
 * 2. /proxy  : Local HTTP-to-HTTPS multi-CDN Range proxy for Baidu/Quark Netdisk,
 *              distributing connections across CDN mirrors and auto-retrying on 403 concurrency limits.
 */
class StreamServer {
  constructor() {
    this.port = 6889;
    this.server = null;
    this.proxyMap = new Map();
    this.proxyCounter = 1;
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

  /**
   * Registers a netdisk download task in the local proxy and returns local mirror URLs for Aria2.
   */
  registerNetdiskProxy({ urls, userAgent, cookie, referer, fileName }) {
    const id = `nd_${Date.now()}_${this.proxyCounter++}`;
    const validUrls = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    this.proxyMap.set(id, {
      urls: validUrls,
      userAgent: userAgent || 'netdisk;P2SP;3.0.0.123',
      cookie: cookie || '',
      referer: referer || '',
      fileName: fileName || 'download.bin',
      rrIndex: 0
    });

    const mirrorCount = Math.max(1, validUrls.length);
    const proxyUrls = [];
    for (let i = 0; i < mirrorCount; i++) {
      proxyUrls.push(`http://127.0.0.1:${this.port}/proxy?id=${id}&m=${i}`);
    }
    return {
      id,
      proxyUrl: proxyUrls[0],
      proxyUrls
    };
  }

  handleRequest(req, res) {
    try {
      const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
      if (parsedUrl.pathname === '/proxy') {
        return this.handleProxyRequest(req, res, parsedUrl);
      }
      return this.handleStreamRequest(req, res, parsedUrl);
    } catch (err) {
      if (!res.headersSent) res.writeHead(500);
      res.end(err.message);
    }
  }

  handleProxyRequest(req, res, parsedUrl) {
    const id = parsedUrl.searchParams.get('id');
    const mParam = parseInt(parsedUrl.searchParams.get('m') || '0', 10);
    const entry = this.proxyMap.get(id);

    if (!entry || !entry.urls || entry.urls.length === 0) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy task not found');
      return;
    }

    const startIdx = (isNaN(mParam) ? entry.rrIndex++ : mParam) % entry.urls.length;
    const clientSentRange = Boolean(req.headers.range);
    this.forwardUpstream(entry, startIdx, entry.urls[startIdx], req, res, clientSentRange, 0, 0);
  }

  forwardUpstream(entry, urlIndex, targetUrl, clientReq, clientRes, clientSentRange, redirectDepth, retryCount) {
    if (clientReq.destroyed) return;
    if (redirectDepth > 5) {
      if (!clientRes.headersSent) clientRes.writeHead(502);
      clientRes.end('Too many redirects');
      return;
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      if (!clientRes.headersSent) clientRes.writeHead(400);
      clientRes.end('Invalid upstream URL');
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const isBaiduPcsCdn = parsed.hostname.endsWith('baidupcs.com');

    const upstreamHeaders = {
      'User-Agent': entry.userAgent,
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Range': clientReq.headers.range || 'bytes=0-'
    };
    if (entry.cookie) {
      upstreamHeaders['Cookie'] = entry.cookie;
    }
    if (!isBaiduPcsCdn && entry.referer) {
      upstreamHeaders['Referer'] = entry.referer;
    }

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: upstreamHeaders,
      timeout: 15000
    };

    const upReq = transport.request(reqOpts, (upRes) => {
      // Follow 301/302/303/307/308 redirects automatically
      if ([301, 302, 303, 307, 308].includes(upRes.statusCode) && upRes.headers.location) {
        upRes.resume();
        const nextUrl = new URL(upRes.headers.location, targetUrl).toString();
        return this.forwardUpstream(entry, urlIndex, nextUrl, clientReq, clientRes, clientSentRange, redirectDepth + 1, retryCount);
      }

      // If this CDN mirror returned 403/503 due to per-node connection concurrency limit,
      // rotate to the next CDN mirror after a short backoff so Aria2 never aborts!
      if (upRes.statusCode >= 400 && retryCount < entry.urls.length * 2) {
        upRes.resume();
        const nextIdx = (urlIndex + 1) % entry.urls.length;
        const nextMirror = entry.urls[nextIdx];
        setTimeout(() => {
          if (!clientReq.destroyed && !clientRes.headersSent) {
            this.forwardUpstream(entry, nextIdx, nextMirror, clientReq, clientRes, clientSentRange, 0, retryCount + 1);
          }
        }, 250);
        return;
      }

      const status = upRes.statusCode || 200;
      const outStatus = (!clientSentRange && status === 206) ? 200 : status;

      const outHeaders = {
        'Accept-Ranges': 'bytes',
        'Content-Type': upRes.headers['content-type'] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      };

      if (upRes.headers['content-length']) {
        outHeaders['Content-Length'] = upRes.headers['content-length'];
      }
      if (clientSentRange && upRes.headers['content-range']) {
        outHeaders['Content-Range'] = upRes.headers['content-range'];
      }

      if (!clientRes.headersSent) {
        clientRes.writeHead(outStatus, outHeaders);
      }

      if (clientReq.method === 'HEAD') {
        upReq.destroy();
        clientRes.end();
        return;
      }

      upRes.pipe(clientRes);

      upRes.on('error', () => {
        try { clientRes.end(); } catch (_) {}
      });
    });

    upReq.on('error', () => {
      if (retryCount < entry.urls.length * 2 && !clientRes.headersSent && !clientReq.destroyed) {
        const nextIdx = (urlIndex + 1) % entry.urls.length;
        const nextMirror = entry.urls[nextIdx];
        setTimeout(() => {
          if (!clientReq.destroyed && !clientRes.headersSent) {
            this.forwardUpstream(entry, nextIdx, nextMirror, clientReq, clientRes, clientSentRange, 0, retryCount + 1);
          }
        }, 250);
        return;
      }
      if (!clientRes.headersSent) {
        clientRes.writeHead(502);
      }
      clientRes.end();
    });

    upReq.on('timeout', () => {
      upReq.destroy();
      if (!clientRes.headersSent) {
        clientRes.writeHead(504);
      }
      clientRes.end();
    });

    clientReq.on('close', () => {
      upReq.destroy();
    });

    upReq.end();
  }

  handleStreamRequest(req, res, parsedUrl) {
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

      stream.on('error', () => {
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

      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });

      req.on('close', () => {
        stream.destroy();
      });

      stream.pipe(res);
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
