const RETRYABLE_CODES = [429, 503];
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const DEFAULT_TIMEOUT_MS = 30000;

class XCClient {
  constructor(apiUrl, apiToken) {
    this._apiUrl = apiUrl.replace(/\/+$/, '');
    this._apiToken = apiToken;
  }

  async get(path, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    return this._request('GET', path, null, timeout);
  }

  async post(path, body, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    return this._request('POST', path, body, timeout);
  }

  async put(path, body, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    return this._request('PUT', path, body, timeout);
  }

  async _request(method, path, body, timeout) {
    const url = `${this._apiUrl}${path}`;
    const headers = {
      Authorization: `APIToken ${this._apiToken}`,
      'Content-Type': 'application/json',
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const options = { method, headers, signal: controller.signal };
        if (body) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (response.ok) {
          return await response.json();
        }

        if (RETRYABLE_CODES.includes(response.status) && attempt < MAX_RETRIES - 1) {
          await this._sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }

        const errorBody = await response.text().catch(() => '');
        const err = new Error(`XC API ${method} ${path} failed: ${response.status}`);
        err.status = response.status;
        err.body = errorBody;
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`XC API ${method} ${path} failed after ${MAX_RETRIES} retries`);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function createTenantProfile({ apiUrl, apiToken }) {
  const hostname = new URL(apiUrl).hostname;
  const name = hostname.split('.')[0];
  const client = new XCClient(apiUrl, apiToken);
  return { name, apiUrl, apiToken, client, cachedWhoami: null };
}

module.exports = { XCClient, createTenantProfile };
