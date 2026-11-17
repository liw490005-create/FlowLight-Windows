const https = require('https');
const http = require('http');

/**
 * Magnet search aggregator service.
 * Combines multiple live public torrent index APIs and mirrors.
 */
class MagnetSearchService {
  constructor() {
    this.timeout = 8000;
  }

  formatSize(bytes) {
    if (!+bytes) return '未知大小';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  formatDate(unixSec) {
    if (!unixSec) return '近期';
    try {
      const d = new Date(unixSec * 1000);
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '近期';
    }
  }

  async search(keyword, page = 1) {
    if (!keyword || !keyword.trim()) return [];

    const encoded = encodeURIComponent(keyword.trim());
    const results = [];
    const seenHashes = new Set();

    // 1. Primary Engine: Torrents-CSV Open JSON API (Fast & Reliable)
    try {
      const csvData = await this.fetchJson(`https://torrents-csv.com/service/search?q=${encoded}&size=30`);
      const list = (csvData && Array.isArray(csvData.torrents)) ? csvData.torrents : [];
      for (const item of list) {
        if (!item.infohash) continue;
        const hash = item.infohash.toLowerCase();
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        const name = item.name || '未知资源';
        const dn = encodeURIComponent(name);
        results.push({
          name,
          size: this.formatSize(item.size_bytes),
          magnet: `magnet:?xt=urn:btih:${hash}&dn=${dn}`,
          date: this.formatDate(item.created_unix),
          hot: item.seeders ?? 1,
          leechers: item.leechers ?? 0,
          source: 'TorrentsCSV 索引'
        });
      }
    } catch (err) {
      console.warn('[MagnetSearch] Engine 1 (TorrentsCSV) warning:', err.message);
    }

    // 2. Secondary Engine: PirateProxy HTML Indexer
    if (results.length < 15) {
      try {
        const html = await this.fetchText(`https://pirateproxy.live/search/${encoded}/${page}/99/0`);
        const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
        const rows = html.match(rowRegex) || [];
        for (const row of rows) {
          const magnetMatch = row.match(/href="(magnet:\?xt=urn:btih:([a-fA-F0-9]{40})[^"]*)"/i);
          if (!magnetMatch) continue;
          const magnet = magnetMatch[1].replace(/&amp;/g, '&');
          const hash = magnetMatch[2].toLowerCase();
          if (seenHashes.has(hash)) continue;

          const titleMatch = row.match(/title="Details for ([^"]+)"/i) || row.match(/class="detLink"[^>]*>([^<]+)</i);
          const name = titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : `磁力资源_${hash.substring(0, 8)}`;

          const sizeMatch = row.match(/Size\s+([0-9.]+\s*[KMGT]?i?B)/i) || row.match(/([0-9.]+\s*(?:GB|MB|KB|GiB|MiB|KiB))/i);
          const size = sizeMatch ? sizeMatch[1].replace(/&nbsp;/g, ' ') : '未知大小';

          const tds = [...row.matchAll(/<td[^>]*align="right"[^>]*>(\d+)<\/td>/gi)];
          const seeders = tds.length > 0 ? parseInt(tds[0][1], 10) : 1;

          seenHashes.add(hash);
          results.push({
            name,
            size,
            magnet,
            date: '近期',
            hot: seeders,
            source: 'TPB 镜像索引'
          });
        }
      } catch (err) {
        console.warn('[MagnetSearch] Engine 2 (PirateProxy) warning:', err.message);
      }
    }

    // 3. Tertiary Fallback Engine
    if (results.length < 5) {
      try {
        const res3 = await this.fetchJson(`https://api.apiv.top/torrent/search?kw=${encoded}&page=${page}`);
        if (res3 && res3.data && Array.isArray(res3.data.list)) {
          res3.data.list.forEach(item => {
            const magnet = item.magnet || (item.hash ? `magnet:?xt=urn:btih:${item.hash}` : '');
            if (magnet && magnet.startsWith('magnet:?xt=urn:btih:')) {
              results.push({
                name: item.title || item.name || '未知资源',
                size: item.size || '未知大小',
                magnet,
                date: item.date || item.created_at || '近期',
                hot: item.seeds || item.hot || 1,
                source: '聚合源 C'
              });
            }
          });
        }
      } catch (e) {
        // ignore
      }
    }

    return results;
  }

  fetchText(urlStr) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? https : http;
      const req = client.get(urlStr, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/json,*/*'
        },
        timeout: this.timeout
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, urlStr).toString();
          return this.fetchText(redirectUrl).then(resolve).catch(reject);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => resolve(rawData));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
    });
  }

  async fetchJson(urlStr) {
    const raw = await this.fetchText(urlStr);
    return JSON.parse(raw);
  }
}

module.exports = new MagnetSearchService();
