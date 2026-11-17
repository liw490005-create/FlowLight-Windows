const https = require('https');
const http = require('http');

/**
 * Netdisk Service (Baidu Wangpan & Quark Netdisk).
 * Implements share link parsing, deduplicated auto-transfer (转存),
 * PCS multi-CDN locatedownload + /api/download sign2 extraction, and Aria2 dispatch.
 */
class NetdiskService {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    this.baiduPcsUa = 'netdisk;P2SP;3.0.0.123';
  }

  detectNetdiskType(url) {
    if (!url) return null;
    if (url.includes('pan.baidu.com') || url.includes('yun.baidu.com')) return 'baidu';
    if (url.includes('pan.quark.cn') || url.includes('quark.cn')) return 'quark';
    return null;
  }

  extractPasscode(text) {
    if (!text) return '';
    const match = text.match(/(?:提取码|密码|pwd|code|passcode)[:：=\s]*([a-zA-Z0-9]{4,8})/i);
    return match ? match[1] : '';
  }

  computeBaiduSign(j, r) {
    if (!j || !r) return '';
    const a = [];
    const p = [];
    let o = '';
    const v = j.length;
    for (let q = 0; q < 256; q++) {
      a[q] = j.charCodeAt(q % v);
      p[q] = q;
    }
    for (let u = 0, q = 0; q < 256; q++) {
      u = (u + p[q] + a[q]) % 256;
      const t = p[q];
      p[q] = p[u];
      p[u] = t;
    }
    for (let i = 0, u = 0, q = 0; q < r.length; q++) {
      i = (i + 1) % 256;
      u = (u + p[i]) % 256;
      const t = p[i];
      p[i] = p[u];
      p[u] = t;
      const k = p[(p[i] + p[u]) % 256];
      o += String.fromCharCode(r.charCodeAt(q) ^ k);
    }
    return Buffer.from(o, 'binary').toString('base64');
  }

  // --- Quark Netdisk Implementation ---

  extractQuarkPwdId(url) {
    if (!url) return '';
    const match = url.match(/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/);
    return match ? match[1] : '';
  }

  async parseQuarkShare(shareUrl, inputPasscode = '', userCookie = '', pdir_fid = '0') {
    const pwd_id = this.extractQuarkPwdId(shareUrl);
    if (!pwd_id) {
      throw new Error('未识别到有效的夸克网盘分享链接 (格式应为 https://pan.quark.cn/s/xxxx)');
    }

    const passcode = (inputPasscode || '').trim() || this.extractPasscode(shareUrl);

    const tokenPayload = JSON.stringify({
      pwd_id,
      passcode
    });

    const tokenRes = await this.requestJson('https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
        'Referer': 'https://pan.quark.cn/',
        'Cookie': userCookie || ''
      },
      body: tokenPayload
    });

    if (tokenRes.status !== 200 || !tokenRes.data || !tokenRes.data.stoken) {
      throw new Error(tokenRes.message || '获取夸克分享 Token 失败，请检查分享是否已过期或提取码是否正确');
    }

    const stoken = tokenRes.data.stoken;

    const detailUrl = `https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail?pwd_id=${pwd_id}&stoken=${encodeURIComponent(stoken)}&pdir_fid=${pdir_fid}&page=1&size=100`;
    const detailRes = await this.requestJson(detailUrl, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Referer': 'https://pan.quark.cn/',
        'Cookie': userCookie || ''
      }
    });

    if (detailRes.status !== 200 || !detailRes.data) {
      throw new Error(detailRes.message || '获取夸克文件列表失败');
    }

    const shareData = detailRes.data;
    const rawList = shareData.list || [];

    const files = rawList.map(item => ({
      fid: String(item.fid),
      file_name: item.file_name,
      size: Number(item.size || 0),
      format_type: item.format_type || (item.dir ? 'dir' : 'file'),
      is_dir: Boolean(item.dir || item.is_dir),
      updated_at: item.updated_at || '',
      share_id: pwd_id,
      stoken: stoken
    }));

    return {
      type: 'quark',
      title: shareData.title || (files[0] ? files[0].file_name : `夸克分享_${pwd_id}`),
      pwd_id,
      passcode,
      stoken,
      shareUrl: `https://pan.quark.cn/s/${pwd_id}`,
      files
    };
  }

  async getQuarkDownloadUrl(pwd_id, stoken, fid, userCookie = '') {
    if (!userCookie || !userCookie.includes('__puus')) {
      throw new Error('夸克网盘下载需先登录账号：请点击右上角【在内置浏览器登录】登录您的夸克网盘，登录完成后返回此处点击下载即可！');
    }

    const payload = JSON.stringify({
      fids: [fid],
      pwd_id: pwd_id,
      stoken: stoken
    });

    const res = await this.requestJson('https://drive-pc.quark.cn/1/clouddrive/share/sharepage/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
        'Referer': 'https://pan.quark.cn/',
        'Cookie': userCookie || ''
      },
      body: payload
    });

    if (res.status === 200 && res.data && res.data[0] && res.data[0].download_url) {
      return {
        downloadUrl: res.data[0].download_url,
        downloadUrls: [res.data[0].download_url],
        headers: [
          `User-Agent: ${this.userAgent}`,
          'Referer: https://pan.quark.cn/',
          `Cookie: ${userCookie}`
        ]
      };
    } else {
      throw new Error(res.message || '获取夸克直链失败，请先点击右上角“在内置浏览器登录”登录夸克账号');
    }
  }

  // --- Baidu Wangpan Implementation ---

  extractBaiduSurl(url) {
    if (!url) return '';
    const m1 = url.match(/pan\.baidu\.com\/s\/1([a-zA-Z0-9_\-]+)/);
    if (m1) return m1[1];
    const m2 = url.match(/surl=([a-zA-Z0-9_\-]+)/);
    if (m2) return m2[1].replace(/^1/, '');
    const m3 = url.match(/pan\.baidu\.com\/s\/([a-zA-Z0-9_\-]+)/);
    return m3 ? m3[1].replace(/^1/, '') : '';
  }

  async parseBaiduShare(shareUrl, inputPasscode = '', userCookie = '', dirPath = '') {
    const surl = this.extractBaiduSurl(shareUrl);
    if (!surl) {
      throw new Error('未识别到有效的百度网盘分享链接 (格式应为 https://pan.baidu.com/s/1xxxx)');
    }

    const pwd = (inputPasscode || '').trim() || this.extractPasscode(shareUrl);
    let randsk = '';
    let extraCookies = [];

    // 1. Verify extraction passcode (pwd) and obtain BDCLND (randsk) + BAIDUID cookies
    if (pwd) {
      const verifyUrl = `https://pan.baidu.com/share/verify?surl=${surl}&t=${Date.now()}&channel=chunlei&web=1&clienttype=0`;
      const verifyRes = await this.requestRaw(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
          'Referer': `https://pan.baidu.com/share/init?surl=${surl}`,
          'Cookie': userCookie || ''
        },
        body: `pwd=${encodeURIComponent(pwd)}&vcode=&vcode_str=`
      });

      const setCookies = verifyRes.headers['set-cookie'] || [];
      for (const sc of setCookies) {
        const kv = sc.split(';')[0];
        if (kv && !kv.endsWith('=')) {
          extraCookies.push(kv);
        }
      }

      if (verifyRes.json) {
        if (verifyRes.json.errno !== 0) {
          if (verifyRes.json.errno === -12 || verifyRes.json.errno === -9) {
            throw new Error('提取码错误，请核对百度网盘提取码');
          }
          throw new Error(`百度网盘提取码校验失败 (错误码: ${verifyRes.json.errno})`);
        }
        randsk = verifyRes.json.randsk || '';
        if (randsk && !extraCookies.some(c => c.startsWith('BDCLND='))) {
          extraCookies.push(`BDCLND=${randsk}`);
        }
      }
    }

    const combinedCookie = [userCookie, ...extraCookies].filter(Boolean).join('; ');

    // 2. Fetch share file list
    let listUrl = `https://pan.baidu.com/share/list?channel=chunlei&clienttype=0&web=1&page=1&num=100&order=time&desc=1&shorturl=${surl}`;
    if (dirPath) {
      listUrl += `&dir=${encodeURIComponent(dirPath)}&root=0`;
    } else {
      listUrl += `&root=1`;
    }
    if (randsk) {
      listUrl += `&sekey=${randsk}`;
    }

    const res = await this.requestJson(listUrl, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Referer': `https://pan.baidu.com/s/1${surl}`,
        'Cookie': combinedCookie
      }
    });

    if (res.errno !== 0 && res.errno !== undefined) {
      if (res.errno === 2) throw new Error('参数或提取码错误，请检查分享链接');
      if (res.errno === -9) throw new Error('该分享需要提取码，请输入正确的 4 位提取码');
      if (res.errno === 4 || res.errno === 117) throw new Error('该分享链接已失效或已被分享者取消');
      throw new Error(`百度网盘返回错误码: ${res.errno} (${res.show_msg || '解析受限'})`);
    }

    const list = res.list || [];
    const files = list.map(item => ({
      fid: String(item.fs_id),
      file_name: item.server_filename,
      size: Number(item.size || 0),
      path: item.path || '',
      format_type: Number(item.isdir) === 1 ? 'dir' : 'file',
      is_dir: Number(item.isdir) === 1,
      share_id: String(res.share_id || ''),
      uk: String(res.uk || ''),
      surl,
      randsk,
      md5: item.md5 || ''
    }));

    let cleanTitle = res.title || `百度网盘分享_${surl}`;
    if (cleanTitle.includes('/')) {
      const parts = cleanTitle.split('/').filter(Boolean);
      cleanTitle = parts[parts.length - 1] || cleanTitle;
    }

    return {
      type: 'baidu',
      title: cleanTitle,
      surl,
      pwd,
      randsk,
      share_id: String(res.share_id || ''),
      uk: String(res.uk || ''),
      shareUrl: `https://pan.baidu.com/s/1${surl}${pwd ? '?pwd=' + pwd : ''}`,
      files
    };
  }

  /**
   * Complete Baidu Direct-Link Pipeline (without needing Baidu PC Client / baiduyunguanjia://):
   * 1. Check BDUSS login cookie
   * 2. Fetch bdstoken, sign1, sign3, timestamp from /api/gettemplatevariable
   * 3. Check if file already exists in user's root (/); if not, auto-transfer via /share/transfer
   * 4. Extract multi-CDN direct URLs via PCS locatedownload (app_id=250528 / 778750) + fallback /api/download
   */
  async getBaiduDownloadUrl(params, userCookie = '') {
    const { surl, randsk, share_id, uk, fid, file_name } = params;

    if (!userCookie || !userCookie.includes('BDUSS=')) {
      throw new Error('NEED_BAIDU_LOGIN:百度网盘大于 50MB 的文件需要登录百度账号才能免客户端提取直链。请点击上方【在内置浏览器登录】登录您的百度网盘账号，登录成功后点击下载即可自动转存并直推 Aria2！');
    }

    const cookieHeader = [
      userCookie,
      randsk && !userCookie.includes('BDCLND=') ? `BDCLND=${randsk}` : ''
    ].filter(Boolean).join('; ');

    // Step 1: Get bdstoken, sign1, sign3, timestamp of logged-in user
    const tplVarUrl = 'https://pan.baidu.com/api/gettemplatevariable?fields=%5B%22bdstoken%22%2C%22token%22%2C%22uk%22%2C%22isdocuser%22%2C%22sign1%22%2C%22sign2%22%2C%22sign3%22%2C%22timestamp%22%5D&channel=chunlei&web=1&app_id=250528&clienttype=0';
    const varRes = await this.requestJson(tplVarUrl, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Referer': 'https://pan.baidu.com/disk/main',
        'Cookie': cookieHeader
      }
    });

    const { bdstoken, sign1, sign3, timestamp } = varRes?.result || {};
    if (!bdstoken) {
      throw new Error('NEED_BAIDU_LOGIN:百度网盘登录状态已过期，请点击【在内置浏览器登录】重新登录您的百度账号');
    }

    let targetFsId = null;
    let targetPath = null;

    // Step 2a: Check if the file is already in user's root directory (/) to avoid duplicate transfers
    const userListUrl = `https://pan.baidu.com/api/list?order=time&desc=1&num=100&page=1&dir=%2F&web=1&app_id=250528&bdstoken=${bdstoken}&clienttype=0`;
    const initialListRes = await this.requestJson(userListUrl, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Referer': 'https://pan.baidu.com/disk/main',
        'Cookie': cookieHeader
      }
    }).catch(() => null);

    if (initialListRes && Array.isArray(initialListRes.list)) {
      const existing = initialListRes.list.find(f => Number(f.isdir) === 0 && f.server_filename === file_name);
      if (existing) {
        targetFsId = String(existing.fs_id);
        targetPath = existing.path;
      }
    }

    // Step 2b: If not yet in root directory, auto-transfer from share
    if (!targetFsId || !targetPath) {
      const transferUrl = `https://pan.baidu.com/share/transfer?shareid=${share_id}&from=${uk}&ondup=newcopy&async=0&channel=chunlei&web=1&app_id=250528&bdstoken=${bdstoken}&clienttype=0${randsk ? '&sekey=' + randsk : ''}`;
      const transferRes = await this.requestJson(transferUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': this.userAgent,
          'Referer': `https://pan.baidu.com/s/1${surl}`,
          'Cookie': cookieHeader
        },
        body: `fsidlist=%5B${fid}%5D&path=%2F`
      });

      if (transferRes && transferRes.errno === 0 && transferRes.extra && Array.isArray(transferRes.extra.list) && transferRes.extra.list[0]) {
        const transferredItem = transferRes.extra.list[0];
        if (transferredItem.to_fs_id) targetFsId = String(transferredItem.to_fs_id);
        if (transferredItem.to) targetPath = transferredItem.to;
      }

      if (!targetFsId || !targetPath) {
        const afterListRes = await this.requestJson(userListUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.userAgent,
            'Referer': 'https://pan.baidu.com/disk/main',
            'Cookie': cookieHeader
          }
        });
        if (afterListRes && Array.isArray(afterListRes.list)) {
          const baseName = file_name ? file_name.replace(/\.[^.]+$/, '') : '';
          const found = afterListRes.list.find(
            f => Number(f.isdir) === 0 && (f.server_filename === file_name || (baseName && f.server_filename.startsWith(baseName)))
          );
          if (found) {
            targetFsId = String(found.fs_id);
            targetPath = found.path;
          }
        }
      }
    }

    if (!targetPath && file_name) {
      targetPath = `/${file_name}`;
    }

    // Step 3A: Primary Engine - PCS Multi-CDN locatedownload (returns HTTP 206 Partial Content multi-mirror URLs!)
    for (const appId of ['250528', '778750']) {
      if (!targetPath) break;
      try {
        const locateUrl = `https://d.pcs.baidu.com/rest/2.0/pcs/file?method=locatedownload&app_id=${appId}&ver=4.0&vip=2&path=${encodeURIComponent(targetPath)}`;
        const locateRes = await this.requestJson(locateUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.baiduPcsUa,
            'Cookie': cookieHeader
          }
        });

        if (locateRes && Array.isArray(locateRes.urls) && locateRes.urls.length > 0) {
          const allUrls = locateRes.urls.map(u => u.url).filter(Boolean);
          if (allUrls.length > 0) {
            return {
              downloadUrl: allUrls[0],
              downloadUrls: allUrls,
              headers: [
                `User-Agent: ${this.baiduPcsUa}`,
                `Cookie: ${cookieHeader}`
              ]
            };
          }
        }
      } catch (e) {
        // try next
      }
    }

    // Step 3B: Secondary Engine - Web /api/download with RC4 sign2(sign3, sign1)
    if (targetFsId && sign1 && sign3) {
      const sign = this.computeBaiduSign(sign3, sign1);
      const apiDlUrl = `https://pan.baidu.com/api/download?sign=${encodeURIComponent(sign)}&timestamp=${timestamp}&fidlist=%5B${targetFsId}%5D&type=dlink&vip=2&channel=chunlei&web=1&app_id=250528&bdstoken=${bdstoken}&clienttype=0`;
      const apiDlRes = await this.requestJson(apiDlUrl, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Referer': 'https://pan.baidu.com/disk/main',
          'Cookie': cookieHeader
        }
      });

      const dlinkItem = Array.isArray(apiDlRes?.dlink) ? apiDlRes.dlink[0]?.dlink : apiDlRes?.dlink;
      if (dlinkItem && typeof dlinkItem === 'string') {
        return {
          downloadUrl: dlinkItem,
          downloadUrls: [dlinkItem],
          headers: [
            'User-Agent: pan.baidu.com',
            'Referer: https://pan.baidu.com/disk/home',
            `Cookie: ${cookieHeader}`
          ]
        };
      }
    }

    throw new Error('提取百度网盘直链失败，请确认网盘空间充足且账号处于正常登录状态');
  }

  // --- Generic HTTP/HTTPS Request Helpers ---
  requestRaw(urlStr, options = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(urlStr);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;

      const reqOpts = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: 12000
      };

      const req = transport.request(reqOpts, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw.trim());
          } catch (e) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            rawText: raw,
            json
          });
        });
      });

      req.on('error', (err) => reject(new Error(`网络请求失败: ${err.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async requestJson(urlStr, options = {}) {
    const res = await this.requestRaw(urlStr, options);
    return res.json || { status: res.status, rawText: res.rawText };
  }
}

module.exports = new NetdiskService();
