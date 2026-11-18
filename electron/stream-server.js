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
  registerNetdiskProxy({ urls, userAgent, cookie, referer, fileName, fileSize }) {
    const id = `nd_${Date.now()}_${this.proxyCounter++}`;
    const validUrls = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    this.proxyMap.set(id, {
      urls: validUrls,
      userAgent: userAgent || 'netdisk;P2SP;3.0.0.123',
      cookie: cookie || '',
      referer: referer || '',
      fileName: fileName || 'download.bin',
      totalSize: fileSize ? Number(fileSize) : undefined,
      rrIndex: 0
    });

    // Provide a single robust local proxy URL to Aria2.
    // Aria2 can open 8~16 concurrent chunk connections to this URL;
    // the proxy internally round-robins connections across all CDN mirrors and auto-fails-over.
    const singleProxyUrl = `http://127.0.0.1:${this.port}/proxy?id=${id}`;
    return {
      id,
      proxyUrl: singleProxyUrl,
      proxyUrls: [singleProxyUrl]
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
    const entry = this.proxyMap.get(id);

    if (!entry || !entry.urls || entry.urls.length === 0) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy task not found');
      return;
    }

    const mParam = parseInt(parsedUrl.searchParams.get('m') || '', 10);
    const startIdx = parsedUrl.searchParams.has('m') && !isNaN(mParam)
      ? (mParam % entry.urls.length)
      : ((entry.rrIndex++) % entry.urls.length);

    let isBaiduPcsCdn = false;
    try {
      isBaiduPcsCdn = new URL(entry.urls[startIdx]).hostname.endsWith('baidupcs.com');
    } catch (_) {}

    if (isBaiduPcsCdn) {
      this.handleBaiduChunkedProxy(entry, startIdx, req, res);
      return;
    }

    const clientSentRange = Boolean(req.headers.range);
    this.forwardUpstream(entry, startIdx, entry.urls[startIdx], req, res, clientSentRange, 0, 0);
  }

  /**
   * Baidu PCS CDN enforces a strict per-Range size cap (~4-8MB) and returns 403 (hitcode:104)
   * on large or open-ended Range requests. This method transparently slices any client Range
   * into 2MB upstream sub-requests and streams them seamlessly as a single HTTP response.
   */
  async handleBaiduChunkedProxy(entry, startIdx, clientReq, clientRes) {
    const SLICE_SIZE = 2 * 1024 * 1024; // 2MB per upstream request (verified safe under Baidu PCS cap)
    let aborted = false;
    let activeUpReq = null;

    const onClientClose = () => {
      aborted = true;
      if (activeUpReq) {
        try { activeUpReq.destroy(); } catch (_) {}
      }
    };
    clientReq.once('close', onClientClose);

    const requestSlice = (targetUrl, rangeHeader) => {
      return new Promise((resolve, reject) => {
        if (aborted || clientReq.destroyed) return reject(new Error('CLIENT_ABORTED'));
        const follow = (urlStr, depth) => {
          if (depth > 5) return reject(new Error('TOO_MANY_REDIRECTS'));
          let parsed;
          try {
            parsed = new URL(urlStr);
          } catch (e) {
            return reject(e);
          }
          const isHttps = parsed.protocol === 'https:';
          const transport = isHttps ? https : http;
          const headers = {
            'User-Agent': entry.userAgent,
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Range': rangeHeader
          };
          if (entry.cookie) headers['Cookie'] = entry.cookie;

          const req = transport.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers,
            timeout: 15000
          }, (upRes) => {
            if ([301, 302, 303, 307, 308].includes(upRes.statusCode) && upRes.headers.location) {
              upRes.resume();
              return follow(new URL(upRes.headers.location, urlStr).toString(), depth + 1);
            }
            resolve({ req, upRes });
          });

          activeUpReq = req;
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('UPSTREAM_TIMEOUT'));
          });
          req.end();
        };
        follow(targetUrl, 0);
      });
    };

    try {
      // Step 1: Ensure totalSize is known (probe 0-1 if needed or if HEAD)
      if (!entry.totalSize || clientReq.method === 'HEAD') {
        let probed = false;
        let mirrorIdx = startIdx;
        for (let attempt = 0; attempt < entry.urls.length * 3; attempt++) {
          if (aborted) return;
          try {
            const { upRes } = await requestSlice(entry.urls[mirrorIdx], 'bytes=0-1');
            if (upRes.headers['content-range']) {
              const m = upRes.headers['content-range'].match(/\/(\d+)$/);
              if (m) entry.totalSize = parseInt(m[1], 10);
            }
            if (upRes.headers['content-type']) {
              entry.contentType = upRes.headers['content-type'];
            }
            upRes.resume();
            if (upRes.statusCode === 206 || upRes.statusCode === 200) {
              probed = true;
              break;
            }
          } catch (e) {
            if (e.message === 'CLIENT_ABORTED') return;
          }
          mirrorIdx = (mirrorIdx + 1) % entry.urls.length;
          await new Promise(r => setTimeout(r, 150));
        }

        if (!probed || !entry.totalSize) {
          if (!clientRes.headersSent) clientRes.writeHead(403);
          if (!clientRes.writableEnded) clientRes.end();
          return;
        }

        if (clientReq.method === 'HEAD') {
          if (!clientRes.headersSent) {
            clientRes.writeHead(200, {
              'Accept-Ranges': 'bytes',
              'Content-Length': String(entry.totalSize),
              'Content-Type': entry.contentType || 'application/octet-stream',
              'Access-Control-Allow-Origin': '*'
            });
          }
          clientRes.end();
          return;
        }
      }

      // Step 2: Parse requested [reqStart, reqEnd]
      const total = entry.totalSize;
      let reqStart = 0;
      let reqEnd = total - 1;
      const clientSentRange = Boolean(clientReq.headers.range);

      if (clientSentRange) {
        const m = String(clientReq.headers.range).match(/bytes=(\d*)-(\d*)/i);
        if (m) {
          if (m[1] !== '') reqStart = parseInt(m[1], 10);
          if (m[2] !== '') reqEnd = Math.min(parseInt(m[2], 10), total - 1);
        }
        if (reqStart > reqEnd || reqStart >= total) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(416, { 'Content-Range': `bytes */${total}` });
          }
          clientRes.end();
          return;
        }
      }

      // Step 3: Stream [reqStart, reqEnd] in 2MB slices
      let cursor = reqStart;
      let mirrorIdx = startIdx;
      const maxRetries = entry.urls.length * 4;

      while (cursor <= reqEnd && !aborted && !clientReq.destroyed && !clientRes.writableEnded) {
        const sliceEnd = Math.min(cursor + SLICE_SIZE - 1, reqEnd);
        let sliceDone = false;
        let lastStatus = 502;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          if (aborted || clientReq.destroyed || clientRes.writableEnded) return;
          const rangeHdr = `bytes=${cursor}-${sliceEnd}`;
          try {
            const { req, upRes } = await requestSlice(entry.urls[mirrorIdx], rangeHdr);
            if (upRes.statusCode >= 400) {
              lastStatus = upRes.statusCode;
              upRes.resume();
              mirrorIdx = (mirrorIdx + 1) % entry.urls.length;
              await new Promise(r => setTimeout(r, 150));
              continue;
            }

            if (upRes.headers['content-type'] && !entry.contentType) {
              entry.contentType = upRes.headers['content-type'];
            }

            if (!clientRes.headersSent) {
              if (clientSentRange) {
                clientRes.writeHead(206, {
                  'Accept-Ranges': 'bytes',
                  'Content-Type': entry.contentType || 'application/octet-stream',
                  'Content-Length': String(reqEnd - reqStart + 1),
                  'Content-Range': `bytes ${reqStart}-${reqEnd}/${total}`,
                  'Access-Control-Allow-Origin': '*'
                });
              } else {
                clientRes.writeHead(200, {
                  'Accept-Ranges': 'bytes',
                  'Content-Type': entry.contentType || 'application/octet-stream',
                  'Content-Length': String(total),
                  'Access-Control-Allow-Origin': '*'
                });
              }
            }

            await new Promise((resolveSlice, rejectSlice) => {
              const onDrain = () => {
                if (!upRes.destroyed) upRes.resume();
              };
              upRes.on('data', (chunk) => {
                if (aborted || clientReq.destroyed || clientRes.writableEnded) {
                  req.destroy();
                  return resolveSlice();
                }
                cursor += chunk.length;
                if (!clientRes.write(chunk)) {
                  upRes.pause();
                  clientRes.once('drain', onDrain);
                }
              });
              upRes.on('end', () => {
                clientRes.removeListener('drain', onDrain);
                resolveSlice();
              });
              upRes.on('error', (err) => {
                clientRes.removeListener('drain', onDrain);
                rejectSlice(err);
              });
            });

            if (cursor > sliceEnd || aborted) {
              sliceDone = true;
              mirrorIdx = (mirrorIdx + 1) % entry.urls.length;
              break;
            }
            // Partial slice ended early: continue from updated cursor on next mirror
            mirrorIdx = (mirrorIdx + 1) % entry.urls.length;
          } catch (e) {
            if (e.message === 'CLIENT_ABORTED') return;
            mirrorIdx = (mirrorIdx + 1) % entry.urls.length;
            await new Promise(r => setTimeout(r, 150));
          }
        }

        if (!sliceDone && cursor <= sliceEnd) {
          if (!clientRes.headersSent) clientRes.writeHead(lastStatus);
          if (!clientRes.writableEnded) clientRes.end();
          return;
        }
      }

      if (!clientRes.writableEnded) clientRes.end();
    } finally {
      clientReq.removeListener('close', onClientClose);
    }
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

    // Baidu PCS CDN strictly rejects open-ended "bytes=0-" or requests without Range with 403 (hitcode:104).
    // If client does not send a range or sends an open-ended range, we boundedly probe with bytes=0-1
    // to discover total file size, then serve HEAD/GET properly.
    let effectiveRange = clientReq.headers.range;
    if (isBaiduPcsCdn) {
      if (!effectiveRange || clientReq.method === 'HEAD') {
        effectiveRange = 'bytes=0-1';
      } else if (effectiveRange.endsWith('-')) {
        if (entry.totalSize) {
          effectiveRange = `${effectiveRange}${entry.totalSize - 1}`;
        } else {
          effectiveRange = 'bytes=0-1';
        }
      }
    } else {
      effectiveRange = effectiveRange || 'bytes=0-';
    }

    const upstreamHeaders = {
      'User-Agent': entry.userAgent,
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Range': effectiveRange
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

    let cleanupClientListener = null;

    const upReq = transport.request(reqOpts, (upRes) => {
      // Follow 301/302/303/307/308 redirects automatically
      if ([301, 302, 303, 307, 308].includes(upRes.statusCode) && upRes.headers.location) {
        if (cleanupClientListener) cleanupClientListener();
        upRes.resume();
        const nextUrl = new URL(upRes.headers.location, targetUrl).toString();
        return this.forwardUpstream(entry, urlIndex, nextUrl, clientReq, clientRes, clientSentRange, redirectDepth + 1, retryCount);
      }

      // Parse and cache total file size from Content-Range
      if (upRes.headers['content-range']) {
        const m = upRes.headers['content-range'].match(/\/(\d+)$/);
        if (m) {
          entry.totalSize = parseInt(m[1], 10);
        }
      }

      // If this was a probe request (HEAD or client without range) on Baidu PCS
      if (isBaiduPcsCdn && (!clientSentRange || clientReq.method === 'HEAD') && (upRes.statusCode === 206 || upRes.statusCode === 200)) {
        if (cleanupClientListener) cleanupClientListener();
        upRes.resume();
        const totalLen = entry.totalSize ? String(entry.totalSize) : (upRes.headers['content-length'] || '0');
        if (!clientRes.headersSent) {
          clientRes.writeHead(200, {
            'Accept-Ranges': 'bytes',
            'Content-Length': totalLen,
            'Content-Type': upRes.headers['content-type'] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*'
          });
        }
        clientRes.end();
        return;
      }

      // If this CDN mirror returned 403/503 due to per-node connection concurrency limit,
      // rotate to the next CDN mirror after a short backoff so Aria2 never aborts!
      if (upRes.statusCode >= 400 && retryCount < entry.urls.length * 3) {
        if (cleanupClientListener) cleanupClientListener();
        upRes.resume();
        const nextIdx = (urlIndex + 1) % entry.urls.length;
        const nextMirror = entry.urls[nextIdx];
        setTimeout(() => {
          if (!clientReq.destroyed && !clientRes.headersSent) {
            this.forwardUpstream(entry, nextIdx, nextMirror, clientReq, clientRes, clientSentRange, 0, retryCount + 1);
          }
        }, 200);
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
      if (cleanupClientListener) cleanupClientListener();
      if (retryCount < entry.urls.length * 3 && !clientRes.headersSent && !clientReq.destroyed) {
        const nextIdx = (urlIndex + 1) % entry.urls.length;
        const nextMirror = entry.urls[nextIdx];
        setTimeout(() => {
          if (!clientReq.destroyed && !clientRes.headersSent) {
            this.forwardUpstream(entry, nextIdx, nextMirror, clientReq, clientRes, clientSentRange, 0, retryCount + 1);
          }
        }, 200);
        return;
      }
      if (!clientRes.headersSent) {
        clientRes.writeHead(502);
      }
      clientRes.end();
    });

    upReq.on('timeout', () => {
      if (cleanupClientListener) cleanupClientListener();
      upReq.destroy();
      if (!clientRes.headersSent) {
        clientRes.writeHead(504);
      }
      clientRes.end();
    });

    const closeHandler = () => {
      upReq.destroy();
    };
    clientReq.once('close', closeHandler);
    cleanupClientListener = () => {
      clientReq.removeListener('close', closeHandler);
    };

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
