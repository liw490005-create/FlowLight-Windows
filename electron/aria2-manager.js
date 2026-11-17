const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

class Aria2Manager {
  constructor() {
    this.process = null;
    this.port = 6800;
    // Fixed token so browser Tampermonkey/RPC extensions stay connected across app restarts
    this.secret = 'flowlight_rpc_2026';
    this.downloadDir = 'D:\\流光下载\\Downloads';
    this.binPath = path.join(__dirname, '..', 'bin', 'aria2c.exe');
    this.sessionPath = path.join(__dirname, '..', 'bin', 'aria2.session');
    this.dhtPath = path.join(__dirname, '..', 'bin', 'dht.dat');
    this.isStopping = false;
    this.restartTimer = null;

    // Default high-availability public trackers
    this.trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://open.tracker.cl:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.bittor.pw:1337/announce',
      'udp://tracker.dump.cl:6969/announce',
      'udp://tracker.moeking.me:6969/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://explodie.org:6969/announce',
      'udp://tracker.dler.org:6969/announce',
      'http://tracker.openbittorrent.com:80/announce',
      'udp://opentracker.i2p.rocks:6969/announce'
    ];
  }

  setDownloadDir(dir) {
    if (!dir) return;
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.downloadDir = dir;
    } catch (e) {
      console.error('[Aria2] Failed to create/set download dir:', e.message);
    }
  }

  async start() {
    this.isStopping = false;

    // 1. Ensure directories and session file exist
    try {
      const binDir = path.dirname(this.sessionPath);
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }
      if (!fs.existsSync(this.downloadDir)) {
        fs.mkdirSync(this.downloadDir, { recursive: true });
      }
      if (!fs.existsSync(this.sessionPath)) {
        fs.writeFileSync(this.sessionPath, '');
      }
    } catch (e) {
      console.warn('[Aria2] Directory init warning:', e.message);
    }

    // 2. Check if an existing Aria2 instance is already responding on this port
    const alreadyRunning = await this.pingRpc();
    if (alreadyRunning) {
      console.log('[Aria2] Existing RPC instance detected on port', this.port, '- reusing.');
      return true;
    }

    if (!fs.existsSync(this.binPath)) {
      console.error('[Aria2] Binary not found at:', this.binPath);
      return false;
    }

    const args = [
      '--enable-rpc=true',
      `--rpc-listen-port=${this.port}`,
      '--rpc-listen-all=false',
      '--rpc-allow-origin-all=true',
      `--rpc-secret=${this.secret}`,
      `--dir=${this.downloadDir}`,
      '--max-connection-per-server=16',
      '--split=16',
      '--min-split-size=1M',
      '--continue=true',
      '--max-concurrent-downloads=5',
      '--max-overall-download-limit=0',
      '--max-download-limit=0',
      '--file-allocation=none',
      '--enable-dht=true',
      '--enable-dht6=false',
      '--enable-peer-exchange=true',
      '--bt-enable-lpd=true',
      '--bt-prioritize-piece=head,tail',
      '--bt-save-metadata=true',
      '--bt-load-saved-metadata=true',
      '--peer-id-prefix=-FL1090-',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      `--bt-tracker=${this.trackers.join(',')}`,
      `--input-file=${this.sessionPath}`,
      `--save-session=${this.sessionPath}`,
      '--save-session-interval=15',
      `--dht-file-path=${this.dhtPath}`,
      '--check-certificate=false',
      '--quiet=false'
    ];

    console.log('[Aria2] Starting aria2c with port:', this.port);
    try {
      this.process = spawn(this.binPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) console.log(`[Aria2 stdout] ${msg}`);
      });

      this.process.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) console.error(`[Aria2 stderr] ${msg}`);
      });

      this.process.on('error', (err) => {
        console.error('[Aria2] Process spawn error:', err.message);
      });

      this.process.on('close', (code) => {
        console.log(`[Aria2] Process exited with code ${code}`);
        this.process = null;
        // Auto-restart watchdog if it crashed unexpectedly while app is running
        if (!this.isStopping && code !== 0 && code !== null) {
          console.warn('[Aria2] Unexpected exit detected, restarting in 1.5s...');
          clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (!this.isStopping) this.start();
          }, 1500);
        }
      });
    } catch (err) {
      console.error('[Aria2] Failed to spawn aria2c:', err.message);
      return false;
    }

    // Wait until RPC is reachable
    return await this.waitForRpcReady();
  }

  pingRpc() {
    return new Promise((resolve) => {
      const postData = JSON.stringify({
        jsonrpc: '2.0',
        id: 'ping',
        method: 'aria2.getVersion',
        params: [`token:${this.secret}`]
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/jsonrpc',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 400
      }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.write(postData);
      req.end();
    });
  }

  waitForRpcReady(maxRetries = 25) {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = async () => {
        attempts++;
        const ok = await this.pingRpc();
        if (ok) {
          console.log('[Aria2] RPC successfully verified!');
          resolve(true);
        } else if (attempts < maxRetries) {
          setTimeout(check, 250);
        } else {
          console.warn('[Aria2] RPC verification timed out after retries');
          resolve(false);
        }
      };
      check();
    });
  }

  async syncTrackers() {
    const urls = [
      'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt',
      'https://cf.trackerslist.com/best.txt',
      'https://ngosang.github.io/trackerslist/trackers_best.txt'
    ];

    for (const url of urls) {
      try {
        const text = await this.fetchText(url);
        const list = text
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l && (l.startsWith('udp://') || l.startsWith('http://') || l.startsWith('https://') || l.startsWith('wss://')));
        if (list.length >= 5) {
          this.trackers = Array.from(new Set([...list, ...this.trackers]));
          return this.trackers;
        }
      } catch (e) {
        // try next mirror
      }
    }
    return this.trackers;
  }

  fetchText(urlStr) {
    return new Promise((resolve, reject) => {
      const req = https.get(urlStr, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 6000
      }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  getRpcConfig() {
    return {
      port: this.port,
      secret: this.secret,
      downloadDir: this.downloadDir,
      endpoint: `http://127.0.0.1:${this.port}/jsonrpc`,
      trackers: this.trackers
    };
  }

  stop() {
    this.isStopping = true;
    clearTimeout(this.restartTimer);
    if (this.process) {
      console.log('[Aria2] Stopping aria2c process...');
      try {
        this.process.kill();
      } catch (e) {
        console.error('Error killing aria2 process:', e);
      }
      this.process = null;
    }
  }
}

module.exports = new Aria2Manager();
