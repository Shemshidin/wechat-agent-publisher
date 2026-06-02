function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class WechatAPI {
  constructor(appId, appSecret, options = {}) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.proxyUrl = options.proxyUrl || '';
    this.accessToken = '';
    this.expireTime = 0;
  }

  validate() {
    if (!this.appId || !this.appSecret) {
      throw new Error('Missing WeChat credentials. Provide --app-id/--app-secret or WECHAT_APP_ID/WECHAT_APP_SECRET.');
    }
    if (this.proxyUrl && !String(this.proxyUrl).toLowerCase().startsWith('https://')) {
      throw new Error('Proxy URL must use HTTPS.');
    }
  }

  async requestWithRetry(operation, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (error.isFatal || this.isBusinessError(error) || this.isTokenError(error)) throw error;
        if (i < maxRetries - 1) await sleep(1000 * (i + 1));
      }
    }
    throw lastError;
  }

  isTokenError(error) {
    const message = String(error?.message || '');
    return message.includes('40001') || message.includes('42001') || message.includes('40014');
  }

  isBusinessError(error) {
    const message = String(error?.message || '');
    if (message.includes('45009')) {
      error.isFatal = true;
      return true;
    }
    if (message.includes('微信API报错') && !message.includes('(-1)')) return true;
    return false;
  }

  async sendRequest(url, options = {}) {
    this.validate();
    if (this.proxyUrl) {
      const proxyResponse = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: options.method || 'GET',
          data: options.body ? JSON.parse(options.body) : undefined,
        }),
      });
      return proxyResponse.json();
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || { 'Content-Type': 'application/json' },
      body: options.body,
    });
    return response.json();
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expireTime - 300000) return this.accessToken;
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(this.appId)}&secret=${encodeURIComponent(this.appSecret)}`;
    const data = await this.requestWithRetry(() => this.sendRequest(url));
    if (data.access_token) {
      this.accessToken = data.access_token;
      this.expireTime = Date.now() + Number(data.expires_in || 7200) * 1000;
      return this.accessToken;
    }
    throw new Error(`获取 Token 失败: ${data.errmsg || '未知错误'} (${data.errcode || '??'})`);
  }

  async actionWithTokenRetry(action) {
    try {
      return await action(await this.getAccessToken());
    } catch (error) {
      if (!this.isTokenError(error)) throw error;
      this.accessToken = '';
      return action(await this.getAccessToken());
    }
  }

  async uploadCover(blob, filename = 'cover.jpg') {
    return this.actionWithTokenRetry((token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`;
      return this.uploadMultipart(url, blob, 'media', filename);
    });
  }

  async uploadImage(blob, filename = 'image.jpg') {
    return this.actionWithTokenRetry((token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`;
      return this.uploadMultipart(url, blob, 'media', filename);
    });
  }

  async uploadMultipart(url, blob, fieldName, filename) {
    return this.requestWithRetry(async () => {
      if (this.proxyUrl) {
        const bytes = Buffer.from(await blob.arrayBuffer());
        const data = await this.sendRequest(url, {
          method: 'POST',
          body: JSON.stringify({
            url,
            method: 'UPLOAD',
            fileData: bytes.toString('base64'),
            fileName: filename,
            mimeType: blob.type || 'image/jpeg',
            fieldName,
          }),
        });
        if (data.media_id || data.url) return data;
        throw new Error(`微信API报错: ${data.errmsg || JSON.stringify(data)} (${data.errcode || 'N/A'})`);
      }

      const form = new FormData();
      form.append(fieldName, blob, filename);
      const response = await fetch(url, { method: 'POST', body: form });
      const data = await response.json();
      if (data.media_id || data.url) return data;
      throw new Error(`微信API报错: ${data.errmsg || JSON.stringify(data)} (${data.errcode || 'N/A'})`);
    });
  }

  async createDraft(articles) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
      const articleList = Array.isArray(articles) ? articles : [articles];
      const data = await this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ articles: articleList }),
      });
      if (data.media_id) return data;
      throw new Error(`创建草稿失败: ${data.errmsg || JSON.stringify(data)} (${data.errcode || 'N/A'})`);
    });
  }

  async updateDraft(mediaId, index, article) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/update?access_token=${token}`;
      const data = await this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ media_id: mediaId, index, articles: article }),
      });
      if (data.errcode === 0 || data.errmsg === 'ok') return { media_id: mediaId };
      throw new Error(`更新草稿失败: ${data.errmsg || JSON.stringify(data)} (${data.errcode || 'N/A'})`);
    });
  }
}

module.exports = {
  WechatAPI,
};
