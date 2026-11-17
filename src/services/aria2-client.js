class Aria2Client {
  constructor() {
    this.endpoint = '';
    this.secret = '';
    this.idCounter = 1;
  }

  init(config) {
    this.endpoint = config.endpoint || 'http://127.0.0.1:6800/jsonrpc';
    this.secret = config.secret || '';
  }

  async call(method, params = []) {
    const payload = {
      jsonrpc: '2.0',
      id: `fl_${Date.now()}_${this.idCounter++}`,
      method: `aria2.${method}`,
      params: this.secret ? [`token:${this.secret}`, ...params] : params
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Aria2 RPC error: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message || 'RPC Call Failed');
    }
    return data.result;
  }

  // Task creation
  async addUri(uris, options = {}) {
    const uriList = Array.isArray(uris) ? uris : [uris];
    return await this.call('addUri', [uriList, options]);
  }

  async addTorrent(base64Torrent, options = {}) {
    return await this.call('addTorrent', [base64Torrent, [], options]);
  }

  // Task control
  async pause(gid) {
    return await this.call('pause', [gid]);
  }

  async unpause(gid) {
    return await this.call('unpause', [gid]);
  }

  async remove(gid) {
    try {
      return await this.call('remove', [gid]);
    } catch (e) {
      return await this.call('forceRemove', [gid]);
    }
  }

  async removeResult(gid) {
    return await this.call('removeDownloadResult', [gid]);
  }

  // Status queries
  async getActive() {
    return await this.call('tellActive');
  }

  async getWaiting(offset = 0, num = 100) {
    return await this.call('tellWaiting', [offset, num]);
  }

  async getStopped(offset = 0, num = 100) {
    return await this.call('tellStopped', [offset, num]);
  }

  async getGlobalStat() {
    return await this.call('getGlobalStat');
  }

  async getGlobalOption() {
    return await this.call('getGlobalOption');
  }

  async changeGlobalOption(options) {
    return await this.call('changeGlobalOption', [options]);
  }
}

export const aria2 = new Aria2Client();
