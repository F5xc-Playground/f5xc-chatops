# F5 XC ChatOps Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Slack ChatOps bot that provides read-only operational visibility into F5 Distributed Cloud tenants via slash commands and natural language.

**Architecture:** Single Node.js process using Bolt.js (Socket Mode) for Slack, NLP.js for intent classification, and a plugin-based command system. Each command is a self-contained module auto-discovered from `src/commands/`. The bot talks to the XC REST API and AI Assistant API, with an in-memory TTL cache to reduce API load.

**Tech Stack:** Node.js, Bolt.js (`@slack/bolt`), NLP.js (`@nlpjs/core`, `@nlpjs/nlp`, `@nlpjs/lang-en`), mermaid-cli (`@mermaid-js/mermaid-cli`), Jest, nock, Docker

**Spec:** `docs/superpowers/specs/2026-04-28-f5xc-chatops-design.md`

---

## File Map

### Core Modules (`src/core/`)

| File | Responsibility | Dependencies |
|------|---------------|--------------|
| `cache.js` | In-memory TTL cache with get/set/invalidate/stats | None |
| `xc-client.js` | HTTP client for XC API — auth, retries, tenant profiles | None |
| `nlp-engine.js` | NLP.js wrapper — training, intent classification, entity extraction | `@nlpjs/core`, `@nlpjs/nlp`, `@nlpjs/lang-en` |
| `slack-formatter.js` | Slack Block Kit builders — tables, status lists, detail views, errors, footers | None |
| `ai-assistant.js` | XC AI Assistant API wrapper — query, feedback | `xc-client.js` |
| `diagram-renderer.js` | Mermaid syntax → PNG via `mmdc` child process | `@mermaid-js/mermaid-cli` |

### Orchestration (`src/`)

| File | Responsibility | Dependencies |
|------|---------------|--------------|
| `loader.js` | Scans `commands/`, validates exports, wires into Bolt.js + NLP.js | `nlp-engine.js` |
| `app.js` | Entry point — startup sequence, Bolt.js init, health endpoint | All core modules, `loader.js` |

### Commands (`src/commands/`)

| File | Slash | Cache Tier |
|------|-------|------------|
| `_template.js` | — | — |
| `help.js` | `/xc-help` | None |
| `whoami.js` | `/xc-whoami` | Static (1h) |
| `list-resources.js` | `/xc-list` | Warm (5m) |
| `namespace-summary.js` | `/xc-ns` | Warm (5m) |
| `quota-check.js` | `/xc-quota` | Warm (5m) |
| `quota-forecast.js` | `/xc-quota-forecast` | Warm (5m) |
| `lb-summary.js` | `/xc-lb` | Warm (5m) |
| `cert-status.js` | `/xc-certs` | Warm (5m) |
| `origin-health.js` | `/xc-origins` | Warm (5m) |
| `diagram-lb.js` | `/xc-diagram` | None |
| `security-event.js` | `/xc-event` | None |
| `waf-status.js` | `/xc-waf` | Warm (5m) |
| `service-policies.js` | `/xc-policies` | Warm (5m) |
| `bot-defense-status.js` | `/xc-bot` | Warm (5m) |
| `api-security-status.js` | `/xc-api-sec` | Warm (5m) |
| `ai-query.js` | `/xc-ask` | None |
| `ai-suggest.js` | `/xc-suggest` | None |
| `site-status.js` | `/xc-sites` | Warm (5m) |
| `site-detail.js` | `/xc-site` | Warm (5m) |
| `dns-status.js` | `/xc-dns` | Warm (5m) |
| `alert-status.js` | `/xc-alerts` | Warm (5m) |

### Config / Infra

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies, scripts |
| `.env.example` | Documented env var template |
| `.gitignore` | Node, env, temp files |
| `Dockerfile` | Production container |
| `docker-compose.yml` | Local dev with env file |
| `jest.config.js` | Test configuration |
| `README.md` | Setup, usage, contributing |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `jest.config.js`
- Create: `src/core/.gitkeep` (directory structure)
- Create: `src/commands/.gitkeep` (directory structure)
- Create: `training/.gitkeep` (directory structure)

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/kevin/Projects/f5xc-chatops
git init
```

- [ ] **Step 2: Create package.json**

Create `package.json`:

```json
{
  "name": "f5xc-chatops",
  "version": "0.1.0",
  "description": "Slack ChatOps agent for F5 Distributed Cloud operational visibility",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js",
    "test": "jest",
    "test:watch": "jest --watchAll",
    "test:coverage": "jest --coverage"
  },
  "keywords": ["f5", "xc", "chatops", "slack"],
  "license": "MIT",
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:

```
node_modules/
.env
*.png
*.tmp
coverage/
.DS_Store
```

- [ ] **Step 4: Create .env.example**

Create `.env.example`:

```bash
# Required — F5 XC tenant
F5XC_API_URL=https://your-tenant.console.ves.volterra.io
F5XC_API_TOKEN=your-api-token

# Required — Slack app
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token

# Optional — tuning
LOG_LEVEL=info
CACHE_WARM_TTL=300
CACHE_STATIC_TTL=3600
NLP_THRESHOLD=0.65
```

- [ ] **Step 5: Create jest.config.js**

Create `jest.config.js`:

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
};
```

- [ ] **Step 6: Create directory structure**

```bash
mkdir -p src/core src/commands training tests/core tests/commands
```

- [ ] **Step 7: Install dependencies**

```bash
npm install @slack/bolt @nlpjs/core @nlpjs/nlp @nlpjs/lang-en @mermaid-js/mermaid-cli
npm install --save-dev jest nock
```

- [ ] **Step 8: Verify setup**

Run: `npx jest --version`
Expected: Jest version prints without error.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example jest.config.js
git commit -m "$(cat <<'EOF'
chore: scaffold project with dependencies

Bolt.js for Slack, NLP.js for intent classification,
mermaid-cli for diagram rendering. Jest + nock for tests.
EOF
)"
```

---

## Task 2: Cache Module

**Files:**
- Create: `src/core/cache.js`
- Create: `tests/core/cache.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/cache.test.js`:

```js
const { Cache } = require('../../src/core/cache');

describe('Cache', () => {
  let cache;

  beforeEach(() => {
    cache = new Cache();
  });

  test('get returns null for missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  test('set and get returns value within TTL', () => {
    cache.set('key1', { data: 'hello' }, 60);
    expect(cache.get('key1')).toEqual({ data: 'hello' });
  });

  test('get returns null for expired key', () => {
    cache.set('key1', 'value', 0);
    expect(cache.get('key1')).toBeNull();
  });

  test('invalidate removes matching keys', () => {
    cache.set('tenant1:prod:http_loadbalancers:lb1', 'a', 60);
    cache.set('tenant1:prod:http_loadbalancers:lb2', 'b', 60);
    cache.set('tenant1:staging:http_loadbalancers:lb1', 'c', 60);
    cache.invalidate('tenant1:prod:*');
    expect(cache.get('tenant1:prod:http_loadbalancers:lb1')).toBeNull();
    expect(cache.get('tenant1:prod:http_loadbalancers:lb2')).toBeNull();
    expect(cache.get('tenant1:staging:http_loadbalancers:lb1')).toEqual('c');
  });

  test('stats tracks hits and misses', () => {
    cache.set('key1', 'value', 60);
    cache.get('key1');
    cache.get('key1');
    cache.get('missing');
    const s = cache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/core/cache.test.js`
Expected: FAIL — `Cannot find module '../../src/core/cache'`

- [ ] **Step 3: Implement cache.js**

Create `src/core/cache.js`:

```js
class Cache {
  constructor() {
    this._store = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  invalidate(pattern) {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    for (const key of this._store.keys()) {
      if (regex.test(key)) {
        this._store.delete(key);
      }
    }
  }

  stats() {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._store.size,
    };
  }
}

module.exports = { Cache };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/cache.test.js`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/cache.js tests/core/cache.test.js
git commit -m "feat: add in-memory TTL cache with glob invalidation"
```

---

## Task 3: XC API Client

**Files:**
- Create: `src/core/xc-client.js`
- Create: `tests/core/xc-client.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/xc-client.test.js`:

```js
const nock = require('nock');
const { XCClient, createTenantProfile } = require('../../src/core/xc-client');

const TENANT_URL = 'https://test-tenant.console.ves.volterra.io';

describe('createTenantProfile', () => {
  test('creates profile from url and token', () => {
    const profile = createTenantProfile({
      apiUrl: TENANT_URL,
      apiToken: 'test-token',
    });
    expect(profile.name).toBe('test-tenant');
    expect(profile.apiUrl).toBe(TENANT_URL);
    expect(profile.apiToken).toBe('test-token');
    expect(profile.client).toBeInstanceOf(XCClient);
  });
});

describe('XCClient', () => {
  let client;

  beforeEach(() => {
    client = new XCClient(TENANT_URL, 'test-token');
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  test('GET sends auth header and returns data', async () => {
    const scope = nock(TENANT_URL)
      .get('/api/config/namespaces/prod/http_loadbalancers')
      .matchHeader('Authorization', 'APIToken test-token')
      .reply(200, { items: ['lb1', 'lb2'] });

    const result = await client.get('/api/config/namespaces/prod/http_loadbalancers');
    expect(result).toEqual({ items: ['lb1', 'lb2'] });
    scope.done();
  });

  test('POST sends body and auth header', async () => {
    const body = { current_query: 'test', namespace: 'system' };
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query', body)
      .matchHeader('Authorization', 'APIToken test-token')
      .matchHeader('Content-Type', 'application/json')
      .reply(200, { query_id: 'abc' });

    const result = await client.post('/api/gen-ai/namespaces/system/query', body);
    expect(result).toEqual({ query_id: 'abc' });
    scope.done();
  });

  test('retries on 429 with backoff', async () => {
    const scope = nock(TENANT_URL)
      .get('/api/test')
      .reply(429)
      .get('/api/test')
      .reply(200, { ok: true });

    const result = await client.get('/api/test');
    expect(result).toEqual({ ok: true });
    scope.done();
  });

  test('retries on 503', async () => {
    const scope = nock(TENANT_URL)
      .get('/api/test')
      .reply(503)
      .get('/api/test')
      .reply(200, { ok: true });

    const result = await client.get('/api/test');
    expect(result).toEqual({ ok: true });
    scope.done();
  });

  test('throws after max retries', async () => {
    nock(TENANT_URL)
      .get('/api/test')
      .reply(429)
      .get('/api/test')
      .reply(429)
      .get('/api/test')
      .reply(429);

    await expect(client.get('/api/test')).rejects.toThrow('429');
  });

  test('throws immediately on 401', async () => {
    nock(TENANT_URL)
      .get('/api/test')
      .reply(401, { message: 'unauthorized' });

    await expect(client.get('/api/test')).rejects.toThrow('401');
  });

  test('throws immediately on 404', async () => {
    nock(TENANT_URL)
      .get('/api/test')
      .reply(404, { message: 'not found' });

    await expect(client.get('/api/test')).rejects.toThrow('404');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/core/xc-client.test.js`
Expected: FAIL — `Cannot find module '../../src/core/xc-client'`

- [ ] **Step 3: Implement xc-client.js**

Create `src/core/xc-client.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/xc-client.test.js`
Expected: All 7 tests PASS. The retry tests may take ~1s due to backoff sleeps.

- [ ] **Step 5: Commit**

```bash
git add src/core/xc-client.js tests/core/xc-client.test.js
git commit -m "feat: add XC API client with auth and retry logic"
```

---

## Task 4: Slack Formatter

**Files:**
- Create: `src/core/slack-formatter.js`
- Create: `tests/core/slack-formatter.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/slack-formatter.test.js`:

```js
const fmt = require('../../src/core/slack-formatter');

describe('slack-formatter', () => {
  describe('table', () => {
    test('renders monospace table with header separator', () => {
      const rows = [
        { name: 'http_loadbalancers', used: 12, limit: 25 },
        { name: 'origin_pools', used: 43, limit: 50 },
      ];
      const result = fmt.table(['name', 'used', 'limit'], rows);
      expect(result).toContain('http_loadbalancers');
      expect(result).toContain('origin_pools');
      expect(result).toContain('───');
    });

    test('truncates long values', () => {
      const rows = [{ name: 'a'.repeat(100), val: 'short' }];
      const result = fmt.table(['name', 'val'], rows, { maxColWidth: 20 });
      expect(result).toContain('…');
    });
  });

  describe('statusLine', () => {
    test('renders green status', () => {
      const result = fmt.statusLine('healthy', 'my-lb', 'some detail');
      expect(result).toContain('🟢');
      expect(result).toContain('my-lb');
    });

    test('renders red status', () => {
      const result = fmt.statusLine('critical', 'my-lb', 'down');
      expect(result).toContain('🔴');
    });

    test('renders yellow status', () => {
      const result = fmt.statusLine('warning', 'my-lb', 'degraded');
      expect(result).toContain('🟡');
    });

    test('renders unknown status', () => {
      const result = fmt.statusLine('unknown', 'my-lb', '');
      expect(result).toContain('⚪');
    });
  });

  describe('detailView', () => {
    test('returns blocks with header and fields', () => {
      const blocks = fmt.detailView('🔷 My LB', [
        { label: 'Namespace', value: 'prod' },
        { label: 'Domains', value: 'example.com' },
      ]);
      expect(blocks[0].type).toBe('header');
      expect(blocks[0].text.text).toBe('🔷 My LB');
      const fieldTexts = blocks[1].fields.map((f) => f.text);
      expect(fieldTexts).toContain('*Namespace*\nprod');
    });
  });

  describe('errorBlock', () => {
    test('returns context block with message', () => {
      const blocks = fmt.errorBlock('Something went wrong');
      expect(blocks[0].type).toBe('section');
      expect(blocks[0].text.text).toContain('Something went wrong');
    });
  });

  describe('footer', () => {
    test('includes duration and cache status', () => {
      const block = fmt.footer({ durationMs: 1200, cached: true, namespace: 'prod' });
      expect(block.type).toBe('context');
      expect(block.elements[0].text).toContain('1.2s');
      expect(block.elements[0].text).toContain('cached');
      expect(block.elements[0].text).toContain('prod');
    });
  });

  describe('namespacePicker', () => {
    test('renders buttons for each namespace', () => {
      const blocks = fmt.namespacePicker('quota.check', ['prod', 'staging', 'system']);
      const actions = blocks.find((b) => b.type === 'actions');
      expect(actions.elements).toHaveLength(3);
      expect(actions.elements[0].text.text).toBe('prod');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/core/slack-formatter.test.js`
Expected: FAIL — `Cannot find module '../../src/core/slack-formatter'`

- [ ] **Step 3: Implement slack-formatter.js**

Create `src/core/slack-formatter.js`:

```js
const STATUS_EMOJI = {
  healthy: '🟢',
  online: '🟢',
  valid: '🟢',
  warning: '🟡',
  degraded: '🟡',
  expiring: '🟡',
  critical: '🔴',
  down: '🔴',
  expired: '🔴',
  offline: '🔴',
  unknown: '⚪',
};

function table(columns, rows, { maxColWidth = 40 } = {}) {
  const widths = columns.map((col) => {
    const values = rows.map((r) => String(r[col] ?? ''));
    return Math.min(maxColWidth, Math.max(col.length, ...values.map((v) => v.length)));
  });

  const pad = (str, width) => {
    const s = String(str);
    if (s.length > width) return s.slice(0, width - 1) + '…';
    return s.padEnd(width);
  };

  const header = columns.map((col, i) => pad(col, widths[i])).join('  ');
  const separator = widths.map((w) => '─'.repeat(w)).join('──');
  const body = rows
    .map((row) => columns.map((col, i) => pad(row[col] ?? '', widths[i])).join('  '))
    .join('\n');

  return '```\n' + header + '\n' + separator + '\n' + body + '\n```';
}

function statusLine(status, name, detail) {
  const emoji = STATUS_EMOJI[status] || STATUS_EMOJI.unknown;
  const parts = [emoji, `*${name}*`];
  if (detail) parts.push(detail);
  return parts.join('  ');
}

function detailView(title, fields) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title } },
  ];

  const fieldPairs = [];
  for (const { label, value } of fields) {
    fieldPairs.push({ type: 'mrkdwn', text: `*${label}*\n${value}` });
  }

  for (let i = 0; i < fieldPairs.length; i += 10) {
    blocks.push({
      type: 'section',
      fields: fieldPairs.slice(i, i + 10),
    });
  }

  return blocks;
}

function errorBlock(message) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ ${message}` },
    },
  ];
}

function footer({ durationMs, cached, namespace }) {
  const parts = [];
  if (durationMs != null) parts.push(`${(durationMs / 1000).toFixed(1)}s`);
  parts.push(cached ? 'cached' : 'live');
  if (namespace) parts.push(`namespace: ${namespace}`);
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: parts.join(' · ') }],
  };
}

function namespacePicker(intentName, namespaces) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Which namespace?' },
    },
    {
      type: 'actions',
      elements: namespaces.slice(0, 20).map((ns) => ({
        type: 'button',
        text: { type: 'plain_text', text: ns },
        action_id: `ns_pick_${ns}`,
        value: JSON.stringify({ intent: intentName, namespace: ns }),
      })),
    },
  ];
}

module.exports = { table, statusLine, detailView, errorBlock, footer, namespacePicker };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/slack-formatter.test.js`
Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/slack-formatter.js tests/core/slack-formatter.test.js
git commit -m "feat: add Slack Block Kit formatter for tables, status, and detail views"
```

---

## Task 5: NLP Engine

**Files:**
- Create: `src/core/nlp-engine.js`
- Create: `tests/core/nlp-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/nlp-engine.test.js`:

```js
const { NLPEngine } = require('../../src/core/nlp-engine');

describe('NLPEngine', () => {
  let engine;

  beforeAll(async () => {
    engine = new NLPEngine({ threshold: 0.65 });

    engine.addIntents([
      { utterance: 'what quotas are running high', intent: 'quota.check' },
      { utterance: 'show me quota usage', intent: 'quota.check' },
      { utterance: 'are we near any limits', intent: 'quota.check' },
      { utterance: 'check quota utilization', intent: 'quota.check' },
      { utterance: 'list all load balancers', intent: 'list.resources' },
      { utterance: 'show me the load balancers', intent: 'list.resources' },
      { utterance: 'what LBs are configured', intent: 'list.resources' },
      { utterance: 'what can you do', intent: 'help' },
      { utterance: 'show me the help', intent: 'help' },
      { utterance: 'help me', intent: 'help' },
    ]);

    engine.addResourceTypeEntities([
      { name: 'load balancer', synonyms: ['LB', 'lbs', 'load balancers'] },
      { name: 'origin pool', synonyms: ['pool', 'pools', 'origin pools'] },
    ]);

    engine.addNamespaceEntities(['prod', 'staging', 'system']);

    await engine.train();
  });

  test('classifies a quota intent', async () => {
    const result = await engine.process('how are our quotas looking');
    expect(result.intent).toBe('quota.check');
    expect(result.confidence).toBeGreaterThan(0.65);
  });

  test('classifies a help intent', async () => {
    const result = await engine.process('what can you do for me');
    expect(result.intent).toBe('help');
    expect(result.confidence).toBeGreaterThan(0.65);
  });

  test('returns low confidence for gibberish', async () => {
    const result = await engine.process('asdfghjkl zxcvbnm');
    expect(result.confidence).toBeLessThan(0.65);
  });

  test('extracts namespace entity', async () => {
    const result = await engine.process('show quotas in prod');
    expect(result.entities.namespace).toBe('prod');
  });

  test('detects fresh modifier', async () => {
    const result = await engine.process('show quotas force refresh');
    expect(result.fresh).toBe(true);
  });

  test('getTopIntents returns ranked list', async () => {
    const result = await engine.process('asdfghjkl');
    expect(result.topIntents).toBeDefined();
    expect(Array.isArray(result.topIntents)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/core/nlp-engine.test.js`
Expected: FAIL — `Cannot find module '../../src/core/nlp-engine'`

- [ ] **Step 3: Implement nlp-engine.js**

Create `src/core/nlp-engine.js`:

```js
const { containerBootstrap } = require('@nlpjs/core');
const { Nlp } = require('@nlpjs/nlp');
const { LangEn } = require('@nlpjs/lang-en');

const FRESH_MODIFIERS = ['force refresh', 'fresh', 'no cache', 'live data', 'live'];

class NLPEngine {
  constructor({ threshold = 0.65 } = {}) {
    this._threshold = threshold;
    this._intents = [];
    this._namespaces = [];
    this._resourceTypes = [];
    this._nlp = null;
  }

  addIntents(intents) {
    this._intents.push(...intents);
  }

  addNamespaceEntities(namespaces) {
    this._namespaces = namespaces;
  }

  addResourceTypeEntities(resourceTypes) {
    this._resourceTypes = resourceTypes;
  }

  async train() {
    const container = await containerBootstrap();
    container.use(Nlp);
    container.use(LangEn);

    const nlp = container.get('nlp');
    nlp.settings.autoSave = false;
    nlp.settings.log = false;

    for (const { utterance, intent } of this._intents) {
      nlp.addDocument('en', utterance, intent);
    }

    await nlp.train();
    this._nlp = nlp;
  }

  async process(text) {
    const fresh = FRESH_MODIFIERS.some((mod) => text.toLowerCase().includes(mod));
    const cleanText = FRESH_MODIFIERS.reduce(
      (t, mod) => t.replace(new RegExp(mod, 'gi'), ''),
      text
    ).trim();

    const result = await this._nlp.process('en', cleanText);

    const entities = {};

    const lowerText = text.toLowerCase();
    for (const ns of this._namespaces) {
      const nsPatterns = [
        `in namespace ${ns}`,
        `in ns ${ns}`,
        `namespace ${ns}`,
        `ns ${ns}`,
        ` in ${ns}`,
        ` ${ns}`,
      ];
      for (const pattern of nsPatterns) {
        if (lowerText.includes(pattern.toLowerCase())) {
          entities.namespace = ns;
          break;
        }
      }
      if (entities.namespace) break;
    }

    for (const rt of this._resourceTypes) {
      const allNames = [rt.name, ...rt.synonyms].map((s) => s.toLowerCase());
      for (const name of allNames) {
        if (lowerText.includes(name)) {
          entities.resourceType = rt.name;
          break;
        }
      }
      if (entities.resourceType) break;
    }

    const topIntents = (result.classifications || [])
      .filter((c) => c.score > 0)
      .slice(0, 3)
      .map((c) => ({ intent: c.intent, confidence: c.score }));

    return {
      intent: result.score >= this._threshold ? result.intent : null,
      confidence: result.score || 0,
      entities,
      fresh,
      topIntents,
      raw: result,
    };
  }
}

module.exports = { NLPEngine };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/nlp-engine.test.js`
Expected: All 6 tests PASS. Training takes <1 second.

- [ ] **Step 5: Commit**

```bash
git add src/core/nlp-engine.js tests/core/nlp-engine.test.js
git commit -m "feat: add NLP.js engine for intent classification and entity extraction"
```

---

## Task 6: AI Assistant Client

**Files:**
- Create: `src/core/ai-assistant.js`
- Create: `tests/core/ai-assistant.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/ai-assistant.test.js`:

```js
const nock = require('nock');
const { AIAssistant } = require('../../src/core/ai-assistant');
const { XCClient } = require('../../src/core/xc-client');

const TENANT_URL = 'https://test-tenant.console.ves.volterra.io';

describe('AIAssistant', () => {
  let assistant;

  beforeEach(() => {
    const client = new XCClient(TENANT_URL, 'test-token');
    assistant = new AIAssistant(client);
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  test('query sends current_query and namespace', async () => {
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query', {
        current_query: 'explain event abc',
        namespace: 'system',
      })
      .reply(200, {
        query_id: 'q1',
        explain_log: { summary: 'WAF blocked request' },
        follow_up_queries: ['show more details'],
      });

    const result = await assistant.query('system', 'explain event abc');
    expect(result.query_id).toBe('q1');
    expect(result.explain_log.summary).toBe('WAF blocked request');
    expect(result.follow_up_queries).toEqual(['show more details']);
    scope.done();
  });

  test('feedback sends positive feedback', async () => {
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query_feedback', {
        namespace: 'system',
        query_id: 'q1',
        query: 'explain event abc',
        positive_feedback: {},
      })
      .reply(200, {});

    await assistant.feedback('system', 'q1', 'explain event abc', true);
    scope.done();
  });

  test('feedback sends negative feedback with remark', async () => {
    const scope = nock(TENANT_URL)
      .post('/api/gen-ai/namespaces/system/query_feedback', {
        namespace: 'system',
        query_id: 'q1',
        query: 'explain event abc',
        negative_feedback: { remarks: ['INACCURATE_DATA'] },
      })
      .reply(200, {});

    await assistant.feedback('system', 'q1', 'explain event abc', false, 'INACCURATE_DATA');
    scope.done();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/core/ai-assistant.test.js`
Expected: FAIL — `Cannot find module '../../src/core/ai-assistant'`

- [ ] **Step 3: Implement ai-assistant.js**

Create `src/core/ai-assistant.js`:

```js
class AIAssistant {
  constructor(xcClient) {
    this._client = xcClient;
  }

  async query(namespace, queryText) {
    return this._client.post(`/api/gen-ai/namespaces/${namespace}/query`, {
      current_query: queryText,
      namespace,
    });
  }

  async feedback(namespace, queryId, queryText, positive, remark) {
    const body = {
      namespace,
      query_id: queryId,
      query: queryText,
    };

    if (positive) {
      body.positive_feedback = {};
    } else {
      body.negative_feedback = {
        remarks: [remark || 'OTHER'],
      };
    }

    return this._client.post(
      `/api/gen-ai/namespaces/${namespace}/query_feedback`,
      body
    );
  }
}

module.exports = { AIAssistant };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/ai-assistant.test.js`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ai-assistant.js tests/core/ai-assistant.test.js
git commit -m "feat: add AI Assistant API client for query and feedback"
```

---

## Task 7: Diagram Renderer

**Files:**
- Create: `src/core/diagram-renderer.js`
- Create: `tests/core/diagram-renderer.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/diagram-renderer.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { DiagramRenderer } = require('../../src/core/diagram-renderer');

describe('DiagramRenderer', () => {
  const renderer = new DiagramRenderer();

  test('renderToFile generates a PNG from mermaid syntax', async () => {
    const mermaid = `graph TD
      A[User] --> B[Load Balancer]
      B --> C[Origin Pool]
    `;
    const outputPath = await renderer.renderToFile(mermaid);
    expect(outputPath).toMatch(/\.png$/);
    expect(fs.existsSync(outputPath)).toBe(true);
    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
    fs.unlinkSync(outputPath);
  }, 30000);

  test('renderToFile rejects on invalid mermaid', async () => {
    await expect(renderer.renderToFile('not valid mermaid {{{')).rejects.toThrow();
  }, 30000);

  test('cleanup removes temp file', async () => {
    const mermaid = `graph TD\n  A --> B`;
    const outputPath = await renderer.renderToFile(mermaid);
    expect(fs.existsSync(outputPath)).toBe(true);
    renderer.cleanup(outputPath);
    expect(fs.existsSync(outputPath)).toBe(false);
  }, 30000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/core/diagram-renderer.test.js --testTimeout=60000`
Expected: FAIL — `Cannot find module '../../src/core/diagram-renderer'`

- [ ] **Step 3: Implement diagram-renderer.js**

Create `src/core/diagram-renderer.js`:

```js
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MMDC_PATH = path.resolve(__dirname, '../../node_modules/.bin/mmdc');
const RENDER_TIMEOUT_MS = 60000;

class DiagramRenderer {
  async renderToFile(mermaidSyntax, { timeout = RENDER_TIMEOUT_MS } = {}) {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `xc-diagram-${Date.now()}.mmd`);
    const outputPath = path.join(tmpDir, `xc-diagram-${Date.now()}.png`);

    fs.writeFileSync(inputPath, mermaidSyntax, 'utf-8');

    try {
      await new Promise((resolve, reject) => {
        const proc = execFile(
          MMDC_PATH,
          ['-i', inputPath, '-o', outputPath, '-b', 'white', '-s', '2'],
          { timeout },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`Diagram render failed: ${error.message}\n${stderr}`));
            } else {
              resolve();
            }
          }
        );
      });
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('Diagram render produced no output');
    }

    return outputPath;
  }

  cleanup(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = { DiagramRenderer };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/diagram-renderer.test.js --testTimeout=60000`
Expected: All 3 tests PASS. Each test may take several seconds due to mmdc startup.

- [ ] **Step 5: Commit**

```bash
git add src/core/diagram-renderer.js tests/core/diagram-renderer.test.js
git commit -m "feat: add Mermaid diagram renderer with PNG output"
```

---

## Task 8: Plugin Loader

**Files:**
- Create: `src/loader.js`
- Create: `tests/loader.test.js`
- Create: `src/commands/_template.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/loader.test.js`:

```js
const path = require('path');
const { NLPEngine } = require('../src/core/nlp-engine');
const { loadCommands } = require('../src/loader');

describe('loadCommands', () => {
  test('loads command files from a directory', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  test('skips files prefixed with _', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    const names = result.commands.map((c) => c.meta.name);
    expect(names).not.toContain('template');
  });

  test('validates required exports', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    for (const cmd of result.commands) {
      expect(cmd.meta).toBeDefined();
      expect(cmd.meta.name).toBeDefined();
      expect(cmd.intents).toBeDefined();
      expect(cmd.handler).toBeDefined();
    }
  });

  test('builds intent-to-handler map', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.intentMap).toBeDefined();
    expect(typeof result.intentMap['test.hello']).toBe('object');
  });

  test('builds slash command map', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.slashMap['/xc-test']).toBeDefined();
  });

  test('collects all intents for NLP training', async () => {
    const commandsDir = path.join(__dirname, 'fixtures', 'commands');
    const result = await loadCommands(commandsDir);
    expect(result.allIntents.length).toBeGreaterThan(0);
    expect(result.allIntents[0]).toHaveProperty('utterance');
    expect(result.allIntents[0]).toHaveProperty('intent');
  });
});
```

- [ ] **Step 2: Create test fixtures**

```bash
mkdir -p tests/fixtures/commands
```

Create `tests/fixtures/commands/_skip-me.js`:

```js
module.exports = {
  meta: { name: 'template' },
  intents: [],
  handler: async () => {},
};
```

Create `tests/fixtures/commands/test-hello.js`:

```js
module.exports = {
  meta: {
    name: 'test-hello',
    description: 'A test command',
    slashCommand: '/xc-test',
  },
  intents: [
    { utterance: 'say hello', intent: 'test.hello' },
    { utterance: 'greet me', intent: 'test.hello' },
  ],
  entities: [],
  handler: async ({ say }) => {
    await say('Hello!');
  },
};
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest tests/loader.test.js`
Expected: FAIL — `Cannot find module '../src/loader'`

- [ ] **Step 4: Implement loader.js**

Create `src/loader.js`:

```js
const fs = require('fs');
const path = require('path');

async function loadCommands(commandsDir) {
  const files = fs.readdirSync(commandsDir).filter((f) => {
    return f.endsWith('.js') && !f.startsWith('_');
  });

  const commands = [];
  const intentMap = {};
  const slashMap = {};
  const allIntents = [];
  const errors = [];

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    let mod;

    try {
      mod = require(filePath);
    } catch (err) {
      errors.push({ file, error: `Failed to require: ${err.message}` });
      continue;
    }

    if (!mod.meta || !mod.meta.name || !mod.intents || !mod.handler) {
      errors.push({ file, error: 'Missing required exports: meta, intents, handler' });
      continue;
    }

    commands.push(mod);

    for (const intent of mod.intents) {
      intentMap[intent.intent] = mod;
      allIntents.push(intent);
    }

    if (mod.meta.slashCommand) {
      slashMap[mod.meta.slashCommand] = mod;
    }
  }

  return { commands, intentMap, slashMap, allIntents, errors };
}

module.exports = { loadCommands };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/loader.test.js`
Expected: All 6 tests PASS.

- [ ] **Step 6: Create _template.js**

Create `src/commands/_template.js`:

```js
// Command Plugin Template
//
// Copy this file, rename it, and implement your command.
// The bot auto-discovers all .js files in this directory (except files starting with _).
//
// Usage: save as src/commands/your-command.js, restart the bot.

module.exports = {
  meta: {
    name: 'your-command-name',
    description: 'One-line description shown in /xc-help',
    slashCommand: '/xc-yourcommand', // optional — remove if NL-only
    cacheTTL: 300, // optional — seconds. 0 or omit = no caching
  },

  // Training utterances for NLP.js (5-10 per intent).
  // The intent name should be unique: 'domain.action' format.
  intents: [
    { utterance: 'example phrase one', intent: 'your.intent' },
    { utterance: 'example phrase two', intent: 'your.intent' },
  ],

  // Entity types this command uses. Namespace is handled globally.
  entities: [],

  // Handler receives: { tenant, cache, say, args, formatter }
  // - tenant.client: XCClient instance for API calls
  // - cache: Cache instance
  // - say: Slack say() function
  // - args: { namespace, resourceName, resourceType, fresh, raw }
  // - formatter: slack-formatter module
  handler: async ({ tenant, cache, say, args, formatter }) => {
    // Your implementation here
    await say('Not implemented yet');
  },
};
```

- [ ] **Step 7: Commit**

```bash
git add src/loader.js tests/loader.test.js src/commands/_template.js tests/fixtures/
git commit -m "feat: add plugin loader with auto-discovery and validation"
```

---

## Task 9: App Entry Point

**Files:**
- Create: `src/app.js`
- Create: `tests/app.test.js`

This task wires everything together: Bolt.js init, startup sequence, message routing, slash command registration, health endpoint.

- [ ] **Step 1: Write the failing tests**

Create `tests/app.test.js`:

```js
const { buildConfig, validateEnv } = require('../src/app');

describe('validateEnv', () => {
  test('throws if F5XC_API_URL is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_TOKEN: 'x', SLACK_BOT_TOKEN: 'x', SLACK_APP_TOKEN: 'x' })
    ).toThrow('F5XC_API_URL');
  });

  test('throws if F5XC_API_TOKEN is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_URL: 'x', SLACK_BOT_TOKEN: 'x', SLACK_APP_TOKEN: 'x' })
    ).toThrow('F5XC_API_TOKEN');
  });

  test('throws if SLACK_BOT_TOKEN is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_URL: 'x', F5XC_API_TOKEN: 'x', SLACK_APP_TOKEN: 'x' })
    ).toThrow('SLACK_BOT_TOKEN');
  });

  test('throws if SLACK_APP_TOKEN is missing', () => {
    expect(() =>
      validateEnv({ F5XC_API_URL: 'x', F5XC_API_TOKEN: 'x', SLACK_BOT_TOKEN: 'x' })
    ).toThrow('SLACK_APP_TOKEN');
  });

  test('passes with all required vars', () => {
    expect(() =>
      validateEnv({
        F5XC_API_URL: 'https://test.console.ves.volterra.io',
        F5XC_API_TOKEN: 'tok',
        SLACK_BOT_TOKEN: 'xoxb-test',
        SLACK_APP_TOKEN: 'xapp-test',
      })
    ).not.toThrow();
  });
});

describe('buildConfig', () => {
  test('uses defaults for optional vars', () => {
    const config = buildConfig({
      F5XC_API_URL: 'https://test.console.ves.volterra.io',
      F5XC_API_TOKEN: 'tok',
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_APP_TOKEN: 'xapp-test',
    });
    expect(config.logLevel).toBe('info');
    expect(config.cacheWarmTTL).toBe(300);
    expect(config.cacheStaticTTL).toBe(3600);
    expect(config.nlpThreshold).toBe(0.65);
  });

  test('overrides defaults with env vars', () => {
    const config = buildConfig({
      F5XC_API_URL: 'https://test.console.ves.volterra.io',
      F5XC_API_TOKEN: 'tok',
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_APP_TOKEN: 'xapp-test',
      LOG_LEVEL: 'debug',
      CACHE_WARM_TTL: '120',
      CACHE_STATIC_TTL: '7200',
      NLP_THRESHOLD: '0.8',
    });
    expect(config.logLevel).toBe('debug');
    expect(config.cacheWarmTTL).toBe(120);
    expect(config.cacheStaticTTL).toBe(7200);
    expect(config.nlpThreshold).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/app.test.js`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Implement app.js**

Create `src/app.js`:

```js
const { App } = require('@slack/bolt');
const http = require('http');
const path = require('path');
const { Cache } = require('./core/cache');
const { createTenantProfile } = require('./core/xc-client');
const { AIAssistant } = require('./core/ai-assistant');
const { NLPEngine } = require('./core/nlp-engine');
const { DiagramRenderer } = require('./core/diagram-renderer');
const formatter = require('./core/slack-formatter');
const { loadCommands } = require('./loader');

const REQUIRED_VARS = ['F5XC_API_URL', 'F5XC_API_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'];

function validateEnv(env) {
  for (const key of REQUIRED_VARS) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

function buildConfig(env) {
  return {
    xcApiUrl: env.F5XC_API_URL,
    xcApiToken: env.F5XC_API_TOKEN,
    slackBotToken: env.SLACK_BOT_TOKEN,
    slackAppToken: env.SLACK_APP_TOKEN,
    logLevel: env.LOG_LEVEL || 'info',
    cacheWarmTTL: parseInt(env.CACHE_WARM_TTL, 10) || 300,
    cacheStaticTTL: parseInt(env.CACHE_STATIC_TTL, 10) || 3600,
    nlpThreshold: parseFloat(env.NLP_THRESHOLD) || 0.65,
  };
}

function log(level, message, data = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...data };
  console.log(JSON.stringify(entry));
}

async function start() {
  validateEnv(process.env);
  const config = buildConfig(process.env);

  const cache = new Cache();
  const tenant = createTenantProfile({
    apiUrl: config.xcApiUrl,
    apiToken: config.xcApiToken,
  });
  const aiAssistant = new AIAssistant(tenant.client);
  const diagramRenderer = new DiagramRenderer();

  // Startup: whoami
  log('info', 'Fetching whoami...');
  try {
    const whoami = await tenant.client.get('/api/web/custom/namespaces/system/whoami');
    tenant.cachedWhoami = whoami;
    cache.set(`${tenant.name}:whoami`, whoami, config.cacheStaticTTL);
    const nsRoles = whoami.namespace_access?.namespace_role_map || {};
    const namespaces = Object.keys(nsRoles);
    cache.set(`${tenant.name}:namespaces`, namespaces, config.cacheStaticTTL);
    log('info', 'whoami complete', {
      tenant: tenant.name,
      namespaces: namespaces.length,
      email: whoami.email,
    });
  } catch (err) {
    log('error', 'whoami failed — cannot start', { error: err.message });
    process.exit(1);
  }

  // Load commands
  const commandsDir = path.join(__dirname, 'commands');
  const { commands, intentMap, slashMap, allIntents, errors } = await loadCommands(commandsDir);
  if (errors.length > 0) {
    for (const e of errors) {
      log('warn', `Skipped command: ${e.file}`, { error: e.error });
    }
  }
  log('info', `Loaded ${commands.length} commands`);

  // Train NLP
  const nlp = new NLPEngine({ threshold: config.nlpThreshold });
  nlp.addIntents(allIntents);
  const namespaces = cache.get(`${tenant.name}:namespaces`) || [];
  nlp.addNamespaceEntities(namespaces);
  nlp.addResourceTypeEntities([
    { name: 'http_loadbalancer', synonyms: ['load balancer', 'LB', 'lbs', 'load balancers', 'http lb'] },
    { name: 'tcp_loadbalancer', synonyms: ['tcp load balancer', 'tcp lb'] },
    { name: 'udp_loadbalancer', synonyms: ['udp load balancer', 'udp lb'] },
    { name: 'origin_pool', synonyms: ['origin pool', 'pool', 'pools', 'origin pools'] },
    { name: 'app_firewall', synonyms: ['WAF', 'firewall', 'app firewall', 'web application firewall'] },
    { name: 'service_policy', synonyms: ['service policy', 'policy', 'policies'] },
    { name: 'certificate', synonyms: ['cert', 'certs', 'certificates', 'TLS cert'] },
    { name: 'healthcheck', synonyms: ['health check', 'health checks', 'healthchecks'] },
    { name: 'dns_zone', synonyms: ['DNS zone', 'dns zones', 'zone'] },
    { name: 'dns_load_balancer', synonyms: ['DNS load balancer', 'GSLB', 'dns lb'] },
    { name: 'rate_limiter', synonyms: ['rate limiter', 'rate limit', 'rate limiting'] },
    { name: 'alert_policy', synonyms: ['alert', 'alerts', 'alert policy'] },
  ]);
  await nlp.train();
  log('info', 'NLP trained', { intents: allIntents.length });

  // Build handler context
  function makeHandlerContext(say) {
    return { tenant, cache, say, aiAssistant, diagramRenderer, formatter, config };
  }

  // Bolt.js app
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    socketMode: true,
  });

  // Register slash commands
  for (const [cmd, mod] of Object.entries(slashMap)) {
    app.command(cmd, async ({ command, ack, say }) => {
      await ack();
      const startTime = Date.now();
      const rawArgs = command.text || '';
      const parts = rawArgs.split(/\s+/).filter(Boolean);
      const args = {
        namespace: parts[0] || null,
        resourceName: parts[1] || null,
        raw: rawArgs,
        fresh: false,
      };
      try {
        await mod.handler({ ...makeHandlerContext(say), args });
      } catch (err) {
        log('error', `Command ${cmd} failed`, { error: err.message });
        await say({ blocks: formatter.errorBlock(`Command failed: ${err.message}`) });
      }
    });
  }

  // Handle @mentions and DMs via NLP
  app.event('app_mention', async ({ event, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    await handleNaturalLanguage(text, say);
  });

  app.message(async ({ message, say }) => {
    if (message.channel_type !== 'im') return;
    await handleNaturalLanguage(message.text, say);
  });

  async function handleNaturalLanguage(text, say) {
    const result = await nlp.process(text);

    if (!result.intent) {
      const suggestions = result.topIntents.slice(0, 3);
      if (suggestions.length > 0) {
        const blocks = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: "I'm not sure what you mean. Did you mean one of these?" },
          },
          {
            type: 'actions',
            elements: suggestions.map((s) => ({
              type: 'button',
              text: { type: 'plain_text', text: s.intent.replace('.', ': ') },
              action_id: `suggest_${s.intent}`,
              value: s.intent,
            })),
          },
        ];
        await say({ blocks });
      } else {
        await say({ blocks: formatter.errorBlock("I didn't understand that. Try `/xc-help` to see what I can do.") });
      }
      return;
    }

    const mod = intentMap[result.intent];
    if (!mod) {
      await say({ blocks: formatter.errorBlock(`Matched intent "${result.intent}" but no handler found.`) });
      return;
    }

    const args = {
      namespace: result.entities.namespace || null,
      resourceName: result.entities.resourceName || null,
      resourceType: result.entities.resourceType || null,
      fresh: result.fresh,
      raw: text,
    };

    try {
      await mod.handler({ ...makeHandlerContext(say), args });
    } catch (err) {
      log('error', `NL handler failed`, { intent: result.intent, error: err.message });
      await say({ blocks: formatter.errorBlock(`Something went wrong: ${err.message}`) });
    }
  }

  // Namespace picker button handler
  app.action(/^ns_pick_/, async ({ action, ack, say }) => {
    await ack();
    const { intent, namespace } = JSON.parse(action.value);
    const mod = intentMap[intent];
    if (!mod) return;
    const args = { namespace, fresh: false, raw: '' };
    try {
      await mod.handler({ ...makeHandlerContext(say), args });
    } catch (err) {
      await say({ blocks: formatter.errorBlock(`Command failed: ${err.message}`) });
    }
  });

  // Health endpoint
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      const health = {
        status: 'ok',
        uptime: process.uptime(),
        tenant: tenant.name,
        commands: commands.length,
        cache: cache.stats(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(3000);

  await app.start();
  log('info', 'Bot started', {
    tenant: tenant.name,
    commands: commands.length,
    namespaces: namespaces.length,
  });
}

// Only auto-start if run directly (not when required by tests)
if (require.main === module) {
  start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { validateEnv, buildConfig, start };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/app.test.js`
Expected: All 6 tests PASS (only testing validateEnv and buildConfig — the pure functions).

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/app.test.js
git commit -m "feat: add app entry point with Bolt.js, NLP routing, and health endpoint"
```

---

## Task 10: Core Commands — help, whoami

**Files:**
- Create: `src/commands/help.js`
- Create: `src/commands/whoami.js`
- Create: `tests/commands/help.test.js`
- Create: `tests/commands/whoami.test.js`

These are the first real commands — they validate the entire plugin pipeline end-to-end.

- [ ] **Step 1: Write help tests**

Create `tests/commands/help.test.js`:

```js
const help = require('../../src/commands/help');

describe('help command', () => {
  test('exports required plugin contract', () => {
    expect(help.meta.name).toBe('help');
    expect(help.meta.slashCommand).toBe('/xc-help');
    expect(help.intents.length).toBeGreaterThanOrEqual(3);
    expect(typeof help.handler).toBe('function');
  });

  test('handler sends blocks listing commands', async () => {
    const messages = [];
    const say = (msg) => messages.push(msg);
    const mockLoader = {
      commands: [
        { meta: { name: 'help', description: 'Show help', slashCommand: '/xc-help', category: 'core' } },
        { meta: { name: 'whoami', description: 'Show bot identity', slashCommand: '/xc-whoami', category: 'core' } },
        { meta: { name: 'quota-check', description: 'Check quotas', slashCommand: '/xc-quota', category: 'quotas' } },
      ],
    };
    await help.handler({
      say,
      args: { raw: '' },
      commandRegistry: mockLoader,
      formatter: require('../../src/core/slack-formatter'),
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('help');
    expect(text).toContain('whoami');
    expect(text).toContain('quota-check');
  });

  test('handler with argument shows detail for specific command', async () => {
    const messages = [];
    const say = (msg) => messages.push(msg);
    const mockLoader = {
      commands: [
        {
          meta: { name: 'quota-check', description: 'Check quotas', slashCommand: '/xc-quota', category: 'quotas' },
          intents: [{ utterance: 'show quotas', intent: 'quota.check' }],
        },
      ],
    };
    await help.handler({
      say,
      args: { raw: 'quota-check' },
      commandRegistry: mockLoader,
      formatter: require('../../src/core/slack-formatter'),
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('quota-check');
    expect(text).toContain('show quotas');
  });
});
```

- [ ] **Step 2: Write whoami tests**

Create `tests/commands/whoami.test.js`:

```js
const whoami = require('../../src/commands/whoami');

describe('whoami command', () => {
  test('exports required plugin contract', () => {
    expect(whoami.meta.name).toBe('whoami');
    expect(whoami.meta.slashCommand).toBe('/xc-whoami');
    expect(whoami.intents.length).toBeGreaterThanOrEqual(3);
    expect(typeof whoami.handler).toBe('function');
  });

  test('handler displays tenant info and namespace roles', async () => {
    const messages = [];
    const say = (msg) => messages.push(msg);
    const tenant = {
      name: 'test-tenant',
      cachedWhoami: {
        email: 'bot@example.com',
        tenant: 'test-tenant',
        namespace_access: {
          namespace_role_map: {
            prod: { roles: ['ves-io-monitor-role'] },
            staging: { roles: ['ves-io-monitor-role'] },
          },
        },
      },
    };
    await whoami.handler({
      say,
      tenant,
      args: {},
      formatter: require('../../src/core/slack-formatter'),
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('test-tenant');
    expect(text).toContain('prod');
    expect(text).toContain('staging');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest tests/commands/`
Expected: FAIL — cannot find modules.

- [ ] **Step 4: Implement help.js**

Create `src/commands/help.js`:

```js
module.exports = {
  meta: {
    name: 'help',
    description: 'List all commands or get detail on a specific command',
    slashCommand: '/xc-help',
    category: 'core',
  },

  intents: [
    { utterance: 'what can you do', intent: 'help' },
    { utterance: 'show me the help', intent: 'help' },
    { utterance: 'help me', intent: 'help' },
    { utterance: 'list commands', intent: 'help' },
    { utterance: 'how do I use this', intent: 'help' },
  ],

  entities: [],

  handler: async ({ say, args, commandRegistry, formatter }) => {
    const query = (args.raw || '').trim();

    if (query) {
      const cmd = commandRegistry.commands.find((c) => c.meta.name === query);
      if (!cmd) {
        await say({ blocks: formatter.errorBlock(`Unknown command: "${query}". Try \`/xc-help\` to see all commands.`) });
        return;
      }
      const fields = [
        { label: 'Description', value: cmd.meta.description },
      ];
      if (cmd.meta.slashCommand) {
        fields.push({ label: 'Slash Command', value: `\`${cmd.meta.slashCommand}\`` });
      }
      if (cmd.intents && cmd.intents.length > 0) {
        fields.push({
          label: 'Example Phrases',
          value: cmd.intents.map((i) => `"${i.utterance}"`).join('\n'),
        });
      }
      await say({ blocks: formatter.detailView(`📖 ${cmd.meta.name}`, fields) });
      return;
    }

    const grouped = {};
    for (const cmd of commandRegistry.commands) {
      const cat = cmd.meta.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(cmd);
    }

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '📖 Available Commands' } },
    ];

    for (const [category, cmds] of Object.entries(grouped)) {
      const lines = cmds.map((c) => {
        const slash = c.meta.slashCommand ? `\`${c.meta.slashCommand}\`` : '';
        return `*${c.meta.name}* ${slash} — ${c.meta.description}`;
      });
      blocks.push(
        { type: 'section', text: { type: 'mrkdwn', text: `*${category.toUpperCase()}*\n${lines.join('\n')}` } },
        { type: 'divider' }
      );
    }

    await say({ blocks });
  },
};
```

- [ ] **Step 5: Implement whoami.js**

Create `src/commands/whoami.js`:

```js
module.exports = {
  meta: {
    name: 'whoami',
    description: 'Show bot identity, accessible namespaces, and roles',
    slashCommand: '/xc-whoami',
    category: 'core',
  },

  intents: [
    { utterance: 'what namespaces can you see', intent: 'whoami' },
    { utterance: 'who are you', intent: 'whoami' },
    { utterance: 'show me your access', intent: 'whoami' },
    { utterance: 'what can you access', intent: 'whoami' },
    { utterance: 'what roles do you have', intent: 'whoami' },
  ],

  entities: [],

  handler: async ({ say, tenant, formatter }) => {
    const whoami = tenant.cachedWhoami;
    if (!whoami) {
      await say({ blocks: formatter.errorBlock('No whoami data available. Bot may not be fully initialized.') });
      return;
    }

    const nsRoleMap = whoami.namespace_access?.namespace_role_map || {};
    const fields = [
      { label: 'Tenant', value: tenant.name },
      { label: 'Email', value: whoami.email || 'N/A' },
      { label: 'Namespaces', value: String(Object.keys(nsRoleMap).length) },
    ];

    const blocks = formatter.detailView('🤖 Bot Identity', fields);

    const nsEntries = Object.entries(nsRoleMap);
    if (nsEntries.length > 0) {
      const rows = nsEntries.map(([ns, info]) => ({
        namespace: ns,
        roles: (info.roles || []).join(', '),
      }));
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: formatter.table(['namespace', 'roles'], rows) },
      });
    }

    await say({ blocks });
  },
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/commands/`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/commands/help.js src/commands/whoami.js tests/commands/
git commit -m "feat: add help and whoami commands"
```

---

## Task 11: Resource Commands — list-resources, namespace-summary, quota-check, quota-forecast

**Files:**
- Create: `src/commands/list-resources.js`
- Create: `src/commands/namespace-summary.js`
- Create: `src/commands/quota-check.js`
- Create: `src/commands/quota-forecast.js`
- Create: `tests/commands/resource-commands.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/commands/resource-commands.test.js`:

```js
const listResources = require('../../src/commands/list-resources');
const namespaceSummary = require('../../src/commands/namespace-summary');
const quotaCheck = require('../../src/commands/quota-check');
const quotaForecast = require('../../src/commands/quota-forecast');
const { Cache } = require('../../src/core/cache');
const formatter = require('../../src/core/slack-formatter');

function mockTenant(getResponse) {
  return {
    name: 'test',
    client: {
      get: jest.fn().mockResolvedValue(getResponse),
    },
    cachedWhoami: {
      namespace_access: { namespace_role_map: { prod: {}, staging: {} } },
    },
  };
}

describe('list-resources', () => {
  test('exports valid plugin contract', () => {
    expect(listResources.meta.name).toBe('list-resources');
    expect(listResources.meta.slashCommand).toBe('/xc-list');
  });

  test('lists resources by type in namespace', async () => {
    const messages = [];
    const tenant = mockTenant({ items: [{ name: 'lb1' }, { name: 'lb2' }] });
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceType: 'http_loadbalancer', raw: 'http_loadbalancer prod' },
      formatter,
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('lb1');
    expect(text).toContain('lb2');
  });

  test('prompts for namespace if missing', async () => {
    const messages = [];
    const tenant = mockTenant({});
    await listResources.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: null, resourceType: 'http_loadbalancer', raw: '' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('namespace');
  });
});

describe('quota-check', () => {
  test('exports valid plugin contract', () => {
    expect(quotaCheck.meta.name).toBe('quota-check');
    expect(quotaCheck.meta.slashCommand).toBe('/xc-quota');
  });

  test('displays color-coded quota usage', async () => {
    const messages = [];
    const tenant = mockTenant({
      items: [
        { kind: 'http_loadbalancer', current_count: 12, max_allowed: 25 },
        { kind: 'origin_pool', current_count: 48, max_allowed: 50 },
        { kind: 'service_policy', current_count: 15, max_allowed: 15 },
      ],
    });
    await quotaCheck.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod' },
      formatter,
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('http_loadbalancer');
  });
});

describe('namespace-summary', () => {
  test('exports valid plugin contract', () => {
    expect(namespaceSummary.meta.name).toBe('namespace-summary');
  });
});

describe('quota-forecast', () => {
  test('exports valid plugin contract', () => {
    expect(quotaForecast.meta.name).toBe('quota-forecast');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/resource-commands.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement list-resources.js**

Create `src/commands/list-resources.js`:

```js
const RESOURCE_PATHS = {
  http_loadbalancer: 'http_loadbalancers',
  tcp_loadbalancer: 'tcp_loadbalancers',
  udp_loadbalancer: 'udp_loadbalancers',
  origin_pool: 'origin_pools',
  app_firewall: 'app_firewalls',
  service_policy: 'service_policys',
  certificate: 'certificates',
  healthcheck: 'healthchecks',
  rate_limiter: 'rate_limiters',
  dns_zone: 'dns_zones',
  dns_load_balancer: 'dns_load_balancers',
  alert_policy: 'alert_policys',
  route: 'routes',
  virtual_network: 'virtual_networks',
  network_policy: 'network_policys',
  ip_prefix_set: 'ip_prefix_sets',
};

module.exports = {
  meta: {
    name: 'list-resources',
    description: 'List resources of a given type in a namespace',
    slashCommand: '/xc-list',
    cacheTTL: 300,
    category: 'core',
  },

  intents: [
    { utterance: 'list all load balancers in prod', intent: 'list.resources' },
    { utterance: 'show me all origin pools in staging', intent: 'list.resources' },
    { utterance: 'what resources are in namespace prod', intent: 'list.resources' },
    { utterance: 'list certificates in prod', intent: 'list.resources' },
    { utterance: 'show WAF policies in staging', intent: 'list.resources' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('list.resources', Object.keys(nsRoleMap)) });
      return;
    }

    const resourceType = args.resourceType || args.raw?.split(/\s+/)[0] || 'http_loadbalancer';
    const apiPath = RESOURCE_PATHS[resourceType];

    if (!apiPath) {
      const known = Object.keys(RESOURCE_PATHS).join(', ');
      await say({ blocks: formatter.errorBlock(`Unknown resource type: "${resourceType}". Known types: ${known}`) });
      return;
    }

    const cacheKey = `${tenant.name}:${args.namespace}:${resourceType}:list`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderList(say, formatter, resourceType, args.namespace, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const prefix = resourceType.startsWith('dns_') ? 'dns' : 'config';
    const data = await tenant.client.get(`/api/${prefix}/namespaces/${args.namespace}/${apiPath}`);
    const items = data.items || [];
    cache.set(cacheKey, items, 300);

    await renderList(say, formatter, resourceType, args.namespace, items, false, Date.now() - startTime);
  },
};

async function renderList(say, formatter, resourceType, namespace, items, cached, durationMs) {
  if (items.length === 0) {
    await say({
      blocks: [
        ...formatter.errorBlock(`No ${resourceType} resources found in namespace \`${namespace}\`.`),
        formatter.footer({ durationMs, cached, namespace }),
      ],
    });
    return;
  }

  const rows = items.map((item) => ({
    name: item.name || item.metadata?.name || 'unknown',
    labels: Object.keys(item.labels || item.metadata?.labels || {}).length,
  }));

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📋 ${resourceType} — ${namespace}` } },
    { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['name', 'labels'], rows) } },
    formatter.footer({ durationMs, cached, namespace }),
  ];

  await say({ blocks });
}
```

- [ ] **Step 4: Implement namespace-summary.js**

Create `src/commands/namespace-summary.js`:

```js
const RESOURCE_TYPES = [
  'http_loadbalancers', 'tcp_loadbalancers', 'origin_pools',
  'app_firewalls', 'service_policys', 'certificates', 'healthchecks',
];

module.exports = {
  meta: {
    name: 'namespace-summary',
    description: 'Resource counts and health overview for a namespace',
    slashCommand: '/xc-ns',
    cacheTTL: 300,
    category: 'core',
  },

  intents: [
    { utterance: 'summarize namespace prod', intent: 'namespace.summary' },
    { utterance: 'what is in namespace staging', intent: 'namespace.summary' },
    { utterance: 'namespace overview for prod', intent: 'namespace.summary' },
    { utterance: 'give me a summary of namespace system', intent: 'namespace.summary' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('namespace.summary', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:summary`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderSummary(say, formatter, ns, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const counts = {};
    const results = await Promise.allSettled(
      RESOURCE_TYPES.map(async (rt) => {
        const data = await tenant.client.get(`/api/config/namespaces/${ns}/${rt}`);
        counts[rt] = (data.items || []).length;
      })
    );

    cache.set(cacheKey, counts, 300);
    await renderSummary(say, formatter, ns, counts, false, Date.now() - startTime);
  },
};

async function renderSummary(say, formatter, namespace, counts, cached, durationMs) {
  const rows = Object.entries(counts).map(([type, count]) => ({
    resource: type,
    count: String(count),
  }));

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📊 Namespace Summary — ${namespace}` } },
    { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['resource', 'count'], rows) } },
    formatter.footer({ durationMs, cached, namespace }),
  ];

  await say({ blocks });
}
```

- [ ] **Step 5: Implement quota-check.js**

Create `src/commands/quota-check.js`:

```js
module.exports = {
  meta: {
    name: 'quota-check',
    description: 'Check XC resource quota utilization',
    slashCommand: '/xc-quota',
    cacheTTL: 300,
    category: 'quotas',
  },

  intents: [
    { utterance: 'what quotas are running high', intent: 'quota.check' },
    { utterance: 'show me quota usage', intent: 'quota.check' },
    { utterance: 'are we near any limits', intent: 'quota.check' },
    { utterance: 'check quota utilization', intent: 'quota.check' },
    { utterance: 'how much capacity do we have left', intent: 'quota.check' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('quota.check', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:quotas`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderQuotas(say, formatter, ns, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const data = await tenant.client.get(`/api/web/namespaces/${ns}/quotas`);
    const items = data.items || [];
    cache.set(cacheKey, items, 300);

    await renderQuotas(say, formatter, ns, items, false, Date.now() - startTime);
  },
};

function quotaIndicator(used, limit) {
  if (limit === 0) return '';
  const pct = (used / limit) * 100;
  if (pct >= 100) return '🔴';
  if (pct >= 80) return '⚠️';
  return '';
}

async function renderQuotas(say, formatter, namespace, items, cached, durationMs) {
  if (items.length === 0) {
    await say({ blocks: formatter.errorBlock(`No quota data found for namespace \`${namespace}\`.`) });
    return;
  }

  const rows = items
    .filter((q) => q.max_allowed > 0)
    .sort((a, b) => (b.current_count / b.max_allowed) - (a.current_count / a.max_allowed))
    .map((q) => ({
      resource: q.kind || q.resource_type || 'unknown',
      usage: `${q.current_count} / ${q.max_allowed}`,
      pct: `${Math.round((q.current_count / q.max_allowed) * 100)}%`,
      status: quotaIndicator(q.current_count, q.max_allowed),
    }));

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📊 Quota Usage — ${namespace}` } },
    { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['resource', 'usage', 'pct', 'status'], rows) } },
    formatter.footer({ durationMs, cached, namespace }),
  ];

  await say({ blocks });
}
```

- [ ] **Step 6: Implement quota-forecast.js**

Create `src/commands/quota-forecast.js`:

```js
module.exports = {
  meta: {
    name: 'quota-forecast',
    description: 'Flag resources approaching quota limits (above 80%)',
    slashCommand: '/xc-quota-forecast',
    cacheTTL: 300,
    category: 'quotas',
  },

  intents: [
    { utterance: 'will we hit any limits soon', intent: 'quota.forecast' },
    { utterance: 'are we approaching any quota limits', intent: 'quota.forecast' },
    { utterance: 'which quotas are almost full', intent: 'quota.forecast' },
    { utterance: 'quota forecast', intent: 'quota.forecast' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('quota.forecast', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:quotas`;
    let items = cache.get(cacheKey);

    if (!items || args.fresh) {
      const data = await tenant.client.get(`/api/web/namespaces/${ns}/quotas`);
      items = data.items || [];
      cache.set(cacheKey, items, 300);
    }

    const atRisk = items
      .filter((q) => q.max_allowed > 0 && (q.current_count / q.max_allowed) >= 0.8)
      .sort((a, b) => (b.current_count / b.max_allowed) - (a.current_count / a.max_allowed));

    if (atRisk.length === 0) {
      await say({
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `🟢 No resources above 80% utilization in namespace \`${ns}\`.` } },
        ],
      });
      return;
    }

    const lines = atRisk.map((q) => {
      const pct = Math.round((q.current_count / q.max_allowed) * 100);
      const indicator = pct >= 100 ? '🔴' : '⚠️';
      return `${indicator} *${q.kind || q.resource_type}* — ${q.current_count}/${q.max_allowed} (${pct}%)`;
    });

    await say({
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `⚠️ Approaching Limits — ${ns}` } },
        { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      ],
    });
  },
};
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest tests/commands/resource-commands.test.js`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/commands/list-resources.js src/commands/namespace-summary.js src/commands/quota-check.js src/commands/quota-forecast.js tests/commands/resource-commands.test.js
git commit -m "feat: add list-resources, namespace-summary, quota-check, quota-forecast commands"
```

---

## Task 12: LB & App Delivery Commands — lb-summary, cert-status, origin-health

**Files:**
- Create: `src/commands/lb-summary.js`
- Create: `src/commands/cert-status.js`
- Create: `src/commands/origin-health.js`
- Create: `tests/commands/lb-commands.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/commands/lb-commands.test.js`:

```js
const lbSummary = require('../../src/commands/lb-summary');
const certStatus = require('../../src/commands/cert-status');
const originHealth = require('../../src/commands/origin-health');
const { Cache } = require('../../src/core/cache');
const formatter = require('../../src/core/slack-formatter');

function mockTenant(responses) {
  let callCount = 0;
  return {
    name: 'test',
    client: {
      get: jest.fn().mockImplementation(() => {
        const resp = Array.isArray(responses) ? responses[callCount++] : responses;
        return Promise.resolve(resp);
      }),
    },
    cachedWhoami: {
      namespace_access: { namespace_role_map: { prod: {} } },
    },
  };
}

describe('lb-summary', () => {
  test('exports valid plugin contract', () => {
    expect(lbSummary.meta.name).toBe('lb-summary');
    expect(lbSummary.meta.slashCommand).toBe('/xc-lb');
  });

  test('displays LB detail view', async () => {
    const messages = [];
    const tenant = mockTenant({
      metadata: { name: 'prod-lb' },
      spec: {
        domains: ['app.example.com'],
        advertise_on_public_default_vip: {},
        app_firewall: { name: 'prod-waf', namespace: 'prod' },
        default_route_pools: [{ pool: { name: 'pool-1', namespace: 'prod' } }],
        routes: [],
        disable_bot_defense: {},
      },
    });
    await lbSummary.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'prod-lb' },
      formatter,
    });
    expect(messages.length).toBe(1);
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('prod-lb');
    expect(text).toContain('app.example.com');
    expect(text).toContain('prod-waf');
  });
});

describe('cert-status', () => {
  test('exports valid plugin contract', () => {
    expect(certStatus.meta.name).toBe('cert-status');
    expect(certStatus.meta.slashCommand).toBe('/xc-certs');
  });
});

describe('origin-health', () => {
  test('exports valid plugin contract', () => {
    expect(originHealth.meta.name).toBe('origin-health');
    expect(originHealth.meta.slashCommand).toBe('/xc-origins');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/lb-commands.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement lb-summary.js**

Create `src/commands/lb-summary.js`:

```js
module.exports = {
  meta: {
    name: 'lb-summary',
    description: 'Detailed view of a single load balancer',
    slashCommand: '/xc-lb',
    cacheTTL: 300,
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'tell me about the load balancer', intent: 'lb.summary' },
    { utterance: 'show load balancer details', intent: 'lb.summary' },
    { utterance: 'LB summary', intent: 'lb.summary' },
    { utterance: 'describe the load balancer', intent: 'lb.summary' },
    { utterance: 'what is configured on the LB', intent: 'lb.summary' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('lb.summary', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify a load balancer name. Example: `/xc-lb prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const startTime = Date.now();
    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    const domains = (spec.domains || []).join(', ') || 'none';
    const advertise = spec.advertise_on_public_default_vip ? 'Public (default VIP)'
      : spec.advertise_on_public ? 'Public (custom)'
      : spec.advertise_custom ? 'Custom'
      : 'Private';

    const waf = spec.app_firewall ? spec.app_firewall.name : (spec.disable_waf ? 'Disabled' : 'None');
    const botDefense = spec.bot_defense ? 'Enabled' : 'Disabled';
    const pools = (spec.default_route_pools || []).map((p) => p.pool?.name).filter(Boolean);
    const routeCount = (spec.routes || []).length;

    const fields = [
      { label: 'Namespace', value: ns },
      { label: 'Domains', value: domains },
      { label: 'Advertise', value: advertise },
      { label: 'WAF', value: waf },
      { label: 'Bot Defense', value: botDefense },
      { label: 'Default Pools', value: pools.join(', ') || 'none' },
      { label: 'Routes', value: String(routeCount) },
    ];

    if (spec.active_service_policies?.policies?.length) {
      const policyNames = spec.active_service_policies.policies.map((p) => p.name);
      fields.push({ label: 'Service Policies', value: policyNames.join(', ') });
    }

    const blocks = [
      ...formatter.detailView(`🔷 ${lb.metadata?.name || name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 4: Implement cert-status.js**

Create `src/commands/cert-status.js`:

```js
module.exports = {
  meta: {
    name: 'cert-status',
    description: 'Certificate expiration status across LBs in a namespace',
    slashCommand: '/xc-certs',
    cacheTTL: 300,
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'any certs expiring soon', intent: 'cert.status' },
    { utterance: 'show certificate status', intent: 'cert.status' },
    { utterance: 'check certificate expiration', intent: 'cert.status' },
    { utterance: 'are any certificates expired', intent: 'cert.status' },
    { utterance: 'TLS cert status', intent: 'cert.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('cert.status', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const startTime = Date.now();
    const lbData = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers`);
    const lbs = lbData.items || [];

    const certLines = [];
    for (const lb of lbs) {
      const name = lb.name || lb.metadata?.name;
      const timestamps = lb.spec?.downstream_tls_certificate_expiration_timestamps || {};
      for (const [domain, expiry] of Object.entries(timestamps)) {
        const expDate = new Date(expiry);
        const now = new Date();
        const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

        let status;
        if (daysLeft < 0) status = 'expired';
        else if (daysLeft < 30) status = 'expiring';
        else status = 'valid';

        const detail = daysLeft < 0
          ? `expired ${expDate.toISOString().split('T')[0]}`
          : `expires ${expDate.toISOString().split('T')[0]} (${daysLeft} days)`;

        certLines.push(formatter.statusLine(status, `${name} — ${domain}`, detail));
      }
    }

    if (certLines.length === 0) {
      await say({ blocks: formatter.errorBlock(`No certificate data found for LBs in namespace \`${ns}\`.`) });
      return;
    }

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🔒 Certificate Status — ${ns}` } },
      { type: 'section', text: { type: 'mrkdwn', text: certLines.join('\n') } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 5: Implement origin-health.js**

Create `src/commands/origin-health.js`:

```js
module.exports = {
  meta: {
    name: 'origin-health',
    description: 'Health check status for origin pool servers',
    slashCommand: '/xc-origins',
    cacheTTL: 300,
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'are all origins healthy', intent: 'origin.health' },
    { utterance: 'show origin pool health', intent: 'origin.health' },
    { utterance: 'check backend server status', intent: 'origin.health' },
    { utterance: 'which origins are down', intent: 'origin.health' },
    { utterance: 'origin pool status', intent: 'origin.health' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('origin.health', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an origin pool name. Example: `/xc-origins prod my-pool`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const startTime = Date.now();
    const pool = await tenant.client.get(`/api/config/namespaces/${ns}/origin_pools/${name}`);
    const servers = pool.spec?.origin_servers || [];

    if (servers.length === 0) {
      await say({ blocks: formatter.errorBlock(`Origin pool \`${name}\` has no configured servers.`) });
      return;
    }

    const lines = servers.map((srv) => {
      let addr = 'unknown';
      if (srv.public_ip?.ip) addr = srv.public_ip.ip;
      else if (srv.private_ip?.ip) addr = srv.private_ip.ip;
      else if (srv.public_name?.dns_name) addr = srv.public_name.dns_name;
      else if (srv.private_name?.dns_name) addr = srv.private_name.dns_name;
      else if (srv.k8s_service?.service_name) addr = srv.k8s_service.service_name;

      const site = srv.site_locator?.site?.name || '';
      const detail = site ? `${addr} (${site})` : addr;
      return formatter.statusLine('healthy', detail, '');
    });

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🏥 Origin Pool: ${name} — ${ns}` } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/commands/lb-commands.test.js`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/commands/lb-summary.js src/commands/cert-status.js src/commands/origin-health.js tests/commands/lb-commands.test.js
git commit -m "feat: add lb-summary, cert-status, origin-health commands"
```

---

## Task 13: Diagram Command

**Files:**
- Create: `src/commands/diagram-lb.js`
- Create: `tests/commands/diagram-lb.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/commands/diagram-lb.test.js`:

```js
const diagramLb = require('../../src/commands/diagram-lb');
const { Cache } = require('../../src/core/cache');
const formatter = require('../../src/core/slack-formatter');

describe('diagram-lb', () => {
  test('exports valid plugin contract', () => {
    expect(diagramLb.meta.name).toBe('diagram-lb');
    expect(diagramLb.meta.slashCommand).toBe('/xc-diagram');
    expect(diagramLb.intents.length).toBeGreaterThanOrEqual(3);
  });

  test('buildMermaid generates valid mermaid syntax from LB data', () => {
    const lb = {
      metadata: { name: 'test-lb' },
      spec: {
        domains: ['app.example.com'],
        advertise_on_public_default_vip: {},
        app_firewall: { name: 'prod-waf' },
        disable_bot_defense: {},
        default_route_pools: [
          { pool: { name: 'pool-1', namespace: 'prod' } },
        ],
        routes: [],
      },
    };
    const pools = {
      'pool-1': {
        spec: {
          origin_servers: [
            { public_ip: { ip: '10.0.0.1' } },
          ],
        },
      },
    };
    const mermaid = diagramLb.buildMermaid(lb, pools);
    expect(mermaid).toContain('graph TD');
    expect(mermaid).toContain('test-lb');
    expect(mermaid).toContain('pool-1');
    expect(mermaid).toContain('10.0.0.1');
    expect(mermaid).toContain('prod-waf');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/diagram-lb.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement diagram-lb.js**

Create `src/commands/diagram-lb.js`:

```js
function escapeLabel(str) {
  return String(str).replace(/\./g, '#46;').replace(/"/g, '#34;');
}

function buildMermaid(lb, pools) {
  const name = lb.metadata?.name || 'unknown';
  const spec = lb.spec || {};
  const lines = ['graph TD'];
  let nodeId = 0;
  const id = () => `n${nodeId++}`;

  const userId = id();
  const lbId = id();
  const isPublic = !!(spec.advertise_on_public_default_vip || spec.advertise_on_public);
  const lbType = isPublic ? 'Public' : 'Private';
  lines.push(`  ${userId}([User])`);
  lines.push(`  ${lbId}["${escapeLabel(name)}<br/>${lbType} LB"]`);
  lines.push(`  ${userId} --> ${lbId}`);

  // Domains
  const domains = spec.domains || [];
  for (const domain of domains) {
    const dId = id();
    lines.push(`  ${dId}["${escapeLabel(domain)}"]`);
    lines.push(`  ${lbId} --> ${dId}`);
  }

  // Security subgraph
  const secItems = [];
  if (spec.app_firewall) {
    secItems.push(`WAF: ${escapeLabel(spec.app_firewall.name)}`);
  }
  if (spec.active_service_policies?.policies?.length) {
    const names = spec.active_service_policies.policies.map((p) => p.name).join(', ');
    secItems.push(`Policies: ${escapeLabel(names)}`);
  }
  if (spec.service_policies_from_namespace) {
    secItems.push('Policies: namespace default');
  }
  if (spec.bot_defense) {
    secItems.push('Bot Defense: Enabled');
  }
  if (spec.enable_malicious_user_detection) {
    secItems.push('Malicious User Detection: Enabled');
  }
  if (spec.api_protection_rules) {
    secItems.push('API Protection: Enabled');
  }
  if (spec.enable_api_discovery) {
    secItems.push('API Discovery: Enabled');
  }
  if (spec.data_guard_rules) {
    secItems.push('Data Guard: Enabled');
  }
  if (spec.client_side_defense) {
    secItems.push('Client-Side Defense: Enabled');
  }

  if (secItems.length > 0) {
    const secId = id();
    lines.push(`  subgraph sec["Security Controls"]`);
    lines.push(`    ${secId}["${secItems.join('<br/>')}"]`);
    lines.push(`  end`);
    lines.push(`  ${lbId} --> ${secId}`);
  }

  // Routes hub
  const routesId = id();
  lines.push(`  ${routesId}{"Routes"}`);
  lines.push(`  ${lbId} --> ${routesId}`);

  // Default route pools
  const defaultPools = spec.default_route_pools || [];
  if (defaultPools.length > 0) {
    const defId = id();
    lines.push(`  ${defId}["Default Route"]`);
    lines.push(`  ${routesId} --> ${defId}`);
    for (const poolRef of defaultPools) {
      const poolName = poolRef.pool?.name;
      if (poolName) {
        renderPool(lines, id, defId, poolName, pools[poolName]);
      }
    }
  }

  // Named routes
  for (const route of (spec.routes || [])) {
    const sr = route.simple_route || route;
    const match = sr.path?.prefix || sr.path?.regex || sr.path?.exact || '/';
    const routeId = id();
    lines.push(`  ${routeId}["Route: ${escapeLabel(match)}"]`);
    lines.push(`  ${routesId} --> ${routeId}`);

    if (sr.advanced_options?.app_firewall) {
      const wafId = id();
      lines.push(`  ${wafId}["WAF Override: ${escapeLabel(sr.advanced_options.app_firewall.name)}"]`);
      lines.push(`  ${routeId} --> ${wafId}`);
    }

    for (const poolRef of (sr.origin_pools || [])) {
      const poolName = poolRef.pool?.name;
      if (poolName) {
        renderPool(lines, id, routeId, poolName, pools[poolName]);
      }
    }
  }

  // Redirect routes
  for (const route of (spec.routes || [])) {
    if (!route.redirect_route) continue;
    const rr = route.redirect_route;
    const match = rr.path?.prefix || rr.path?.regex || '/';
    const target = rr.host_redirect || rr.path_redirect || 'redirect';
    const rrId = id();
    lines.push(`  ${rrId}["Redirect: ${escapeLabel(match)} → ${escapeLabel(target)}"]`);
    lines.push(`  ${routesId} --> ${rrId}`);
  }

  return lines.join('\n');
}

function renderPool(lines, id, parentId, poolName, poolData) {
  const poolId = id();
  lines.push(`  ${poolId}[["${escapeLabel(poolName)}"]]`);
  lines.push(`  ${parentId} --> ${poolId}`);

  if (!poolData?.spec?.origin_servers) {
    const errId = id();
    lines.push(`  ${errId}["unavailable"]:::error`);
    lines.push(`  ${poolId} --> ${errId}`);
    return;
  }

  for (const srv of poolData.spec.origin_servers) {
    const srvId = id();
    let addr = 'unknown';
    if (srv.public_ip?.ip) addr = srv.public_ip.ip;
    else if (srv.private_ip?.ip) addr = srv.private_ip.ip;
    else if (srv.public_name?.dns_name) addr = srv.public_name.dns_name;
    else if (srv.private_name?.dns_name) addr = srv.private_name.dns_name;
    else if (srv.k8s_service?.service_name) addr = srv.k8s_service.service_name;

    const site = srv.site_locator?.site?.name || '';
    const label = site ? `${escapeLabel(addr)}<br/>${escapeLabel(site)}` : escapeLabel(addr);
    lines.push(`  ${srvId}(["${label}"])`);
    lines.push(`  ${poolId} --> ${srvId}`);
  }
}

module.exports = {
  meta: {
    name: 'diagram-lb',
    description: 'Generate a visual diagram of an LB chain',
    slashCommand: '/xc-diagram',
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'diagram the load balancer chain', intent: 'diagram.lb' },
    { utterance: 'show me a map of the LB', intent: 'diagram.lb' },
    { utterance: 'visualize the load balancer', intent: 'diagram.lb' },
    { utterance: 'draw the LB topology', intent: 'diagram.lb' },
    { utterance: 'generate a diagram for the load balancer', intent: 'diagram.lb' },
  ],

  entities: [],

  buildMermaid,

  handler: async ({ say, tenant, cache, args, formatter, diagramRenderer }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('diagram.lb', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify a load balancer name. Example: `/xc-diagram prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;

    await say(`Generating diagram for \`${name}\` in namespace \`${ns}\`...`);

    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    // Collect unique pool names
    const poolNames = new Set();
    for (const p of (spec.default_route_pools || [])) {
      if (p.pool?.name) poolNames.add(p.pool.name);
    }
    for (const route of (spec.routes || [])) {
      const sr = route.simple_route || route;
      for (const p of (sr.origin_pools || [])) {
        if (p.pool?.name) poolNames.add(p.pool.name);
      }
    }

    // Fetch pools in parallel
    const pools = {};
    const poolResults = await Promise.allSettled(
      [...poolNames].map(async (poolName) => {
        const poolData = await tenant.client.get(`/api/config/namespaces/${ns}/origin_pools/${poolName}`);
        pools[poolName] = poolData;
      })
    );

    const mermaid = buildMermaid(lb, pools);
    let outputPath;
    try {
      outputPath = await diagramRenderer.renderToFile(mermaid);
      const fs = require('fs');
      await say({
        text: `LB diagram: ${name}`,
        files: [{ file: fs.createReadStream(outputPath), filename: `${name}-diagram.png` }],
      });
    } catch (err) {
      await say({ blocks: formatter.errorBlock(`Diagram render failed: ${err.message}. Try \`/xc-lb ${ns} ${name}\` for a text summary.`) });
    } finally {
      if (outputPath) diagramRenderer.cleanup(outputPath);
    }
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/commands/diagram-lb.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/diagram-lb.js tests/commands/diagram-lb.test.js
git commit -m "feat: add diagram-lb command with Mermaid-based LB chain visualization"
```

---

## Task 14: Security Commands — waf-status, service-policies, bot-defense-status, api-security-status, security-event

**Files:**
- Create: `src/commands/waf-status.js`
- Create: `src/commands/service-policies.js`
- Create: `src/commands/bot-defense-status.js`
- Create: `src/commands/api-security-status.js`
- Create: `src/commands/security-event.js`
- Create: `tests/commands/security-commands.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/commands/security-commands.test.js`:

```js
const wafStatus = require('../../src/commands/waf-status');
const servicePolicies = require('../../src/commands/service-policies');
const botDefense = require('../../src/commands/bot-defense-status');
const apiSecurity = require('../../src/commands/api-security-status');
const securityEvent = require('../../src/commands/security-event');
const formatter = require('../../src/core/slack-formatter');
const { Cache } = require('../../src/core/cache');

describe('security commands plugin contracts', () => {
  test('waf-status', () => {
    expect(wafStatus.meta.name).toBe('waf-status');
    expect(wafStatus.meta.slashCommand).toBe('/xc-waf');
    expect(wafStatus.intents.length).toBeGreaterThanOrEqual(3);
  });

  test('service-policies', () => {
    expect(servicePolicies.meta.name).toBe('service-policies');
    expect(servicePolicies.meta.slashCommand).toBe('/xc-policies');
  });

  test('bot-defense-status', () => {
    expect(botDefense.meta.name).toBe('bot-defense-status');
    expect(botDefense.meta.slashCommand).toBe('/xc-bot');
  });

  test('api-security-status', () => {
    expect(apiSecurity.meta.name).toBe('api-security-status');
    expect(apiSecurity.meta.slashCommand).toBe('/xc-api-sec');
  });

  test('security-event', () => {
    expect(securityEvent.meta.name).toBe('security-event');
    expect(securityEvent.meta.slashCommand).toBe('/xc-event');
  });
});

describe('security-event handler', () => {
  test('proxies to AI assistant', async () => {
    const messages = [];
    const aiAssistant = {
      query: jest.fn().mockResolvedValue({
        query_id: 'q1',
        explain_log: { summary: 'WAF blocked a SQL injection attempt' },
        follow_up_queries: ['show more'],
      }),
    };
    await securityEvent.handler({
      say: (msg) => messages.push(msg),
      aiAssistant,
      args: { raw: 'abc-123', namespace: 'system' },
      formatter,
      cache: new Cache(),
      tenant: { name: 'test', cachedWhoami: { namespace_access: { namespace_role_map: {} } } },
    });
    expect(aiAssistant.query).toHaveBeenCalledWith('system', expect.stringContaining('abc-123'));
    expect(messages.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/security-commands.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement waf-status.js**

Create `src/commands/waf-status.js`:

```js
module.exports = {
  meta: {
    name: 'waf-status',
    description: 'WAF policy details for a load balancer',
    slashCommand: '/xc-waf',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'what mode is the WAF in', intent: 'waf.status' },
    { utterance: 'show WAF status', intent: 'waf.status' },
    { utterance: 'is the WAF in blocking mode', intent: 'waf.status' },
    { utterance: 'WAF configuration', intent: 'waf.status' },
    { utterance: 'check the web application firewall', intent: 'waf.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('waf.status', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an LB name. Example: `/xc-waf prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const startTime = Date.now();

    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    if (spec.disable_waf || !spec.app_firewall) {
      await say({
        blocks: [
          ...formatter.errorBlock(`No WAF configured on LB \`${name}\` in namespace \`${ns}\`.`),
          formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
        ],
      });
      return;
    }

    const fwName = spec.app_firewall.name;
    const fw = await tenant.client.get(`/api/config/namespaces/${ns}/app_firewalls/${fwName}`);
    const fwSpec = fw.spec || {};

    const mode = fwSpec.blocking ? 'Blocking' : 'Monitoring';
    const detectionLevel = fwSpec.detection_settings?.signature_selection_setting?.default_attack_type_settings
      ? 'Default' : 'Custom';

    const fields = [
      { label: 'LB', value: name },
      { label: 'Firewall', value: fwName },
      { label: 'Mode', value: mode },
      { label: 'Detection Level', value: detectionLevel },
    ];

    const blocks = [
      ...formatter.detailView(`🛡️ WAF Status — ${ns}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 4: Implement service-policies.js**

Create `src/commands/service-policies.js`:

```js
module.exports = {
  meta: {
    name: 'service-policies',
    description: 'List service policies attached to a load balancer',
    slashCommand: '/xc-policies',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'what service policies are on the LB', intent: 'service.policies' },
    { utterance: 'show service policies', intent: 'service.policies' },
    { utterance: 'list attached policies', intent: 'service.policies' },
    { utterance: 'what policies are applied', intent: 'service.policies' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('service.policies', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an LB name. Example: `/xc-policies prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const startTime = Date.now();

    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    if (spec.service_policies_from_namespace) {
      await say({
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `🛡️ LB \`${name}\` uses *namespace-level service policies* from \`${ns}\`.` } },
          formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
        ],
      });
      return;
    }

    const policies = spec.active_service_policies?.policies || [];
    if (policies.length === 0) {
      await say({
        blocks: [
          ...formatter.errorBlock(`No service policies configured on LB \`${name}\`.`),
          formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
        ],
      });
      return;
    }

    const rows = policies.map((p) => ({
      name: p.name || 'unknown',
      namespace: p.namespace || ns,
    }));

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🛡️ Service Policies — ${name}` } },
      { type: 'section', text: { type: 'mrkdwn', text: formatter.table(['name', 'namespace'], rows) } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 5: Implement bot-defense-status.js**

Create `src/commands/bot-defense-status.js`:

```js
module.exports = {
  meta: {
    name: 'bot-defense-status',
    description: 'Bot defense configuration status per LB',
    slashCommand: '/xc-bot',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'is bot defense enabled', intent: 'bot.defense.status' },
    { utterance: 'check bot defense', intent: 'bot.defense.status' },
    { utterance: 'bot defense status', intent: 'bot.defense.status' },
    { utterance: 'show bot protection', intent: 'bot.defense.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('bot.defense.status', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an LB name. Example: `/xc-bot prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const startTime = Date.now();

    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    const enabled = !!spec.bot_defense;
    const status = enabled ? 'healthy' : 'unknown';

    const fields = [
      { label: 'LB', value: name },
      { label: 'Bot Defense', value: enabled ? 'Enabled' : 'Disabled' },
    ];

    if (enabled && spec.bot_defense.regional_endpoint) {
      fields.push({ label: 'Endpoint', value: spec.bot_defense.regional_endpoint });
    }

    const blocks = [
      ...formatter.detailView(`🤖 Bot Defense — ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 6: Implement api-security-status.js**

Create `src/commands/api-security-status.js`:

```js
module.exports = {
  meta: {
    name: 'api-security-status',
    description: 'API discovery and protection status',
    slashCommand: '/xc-api-sec',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'show api discovery findings', intent: 'api.security' },
    { utterance: 'api security status', intent: 'api.security' },
    { utterance: 'are there any shadow APIs', intent: 'api.security' },
    { utterance: 'check API protection', intent: 'api.security' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('api.security', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const startTime = Date.now();

    const lbData = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers`);
    const lbs = lbData.items || [];

    const lines = [];
    for (const lb of lbs) {
      const name = lb.name || lb.metadata?.name;
      const spec = lb.spec || {};
      const apiDiscovery = spec.enable_api_discovery ? '🟢 Discovery' : '';
      const apiProtection = spec.api_protection_rules ? '🟢 Protection' : '';
      const apiDef = spec.api_specification ? '🟢 Spec' : '';
      const features = [apiDiscovery, apiProtection, apiDef].filter(Boolean).join(', ');
      const status = features || '⚪ None';
      lines.push(`*${name}* — ${status}`);
    }

    if (lines.length === 0) {
      await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${ns}\`.`) });
      return;
    }

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🔐 API Security — ${ns}` } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 7: Implement security-event.js**

Create `src/commands/security-event.js`:

```js
module.exports = {
  meta: {
    name: 'security-event',
    description: 'Explain a security event by support ID via AI Assistant',
    slashCommand: '/xc-event',
    category: 'security',
  },

  intents: [
    { utterance: 'explain security event', intent: 'security.event' },
    { utterance: 'what happened with security event', intent: 'security.event' },
    { utterance: 'investigate security event', intent: 'security.event' },
    { utterance: 'look up this security event', intent: 'security.event' },
    { utterance: 'tell me about this event', intent: 'security.event' },
  ],

  entities: [],

  handler: async ({ say, aiAssistant, args, formatter }) => {
    const supportId = args.resourceName || args.raw || '';
    if (!supportId.trim()) {
      await say({ blocks: formatter.errorBlock('Please provide a support ID. Example: `/xc-event abc-123`') });
      return;
    }

    const ns = args.namespace || 'system';

    await say(`🔍 Looking up security event \`${supportId.trim()}\`...`);

    const result = await aiAssistant.query(ns, `Explain security event ${supportId.trim()}`);

    const blocks = [];
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `🔒 Security Event: ${supportId.trim()}` } });

    if (result.explain_log) {
      const log = result.explain_log;
      if (log.summary) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: log.summary } });
      }
      if (log.actions?.length) {
        blocks.push({ type: 'divider' });
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: '*Recommended Actions:*\n' + log.actions.map((a) => `• ${a}`).join('\n') },
        });
      }
    } else if (result.generic_response) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: result.generic_response.summary || 'No details available.' },
      });
    }

    // Follow-up queries as buttons
    if (result.follow_up_queries?.length) {
      blocks.push({
        type: 'actions',
        elements: result.follow_up_queries.slice(0, 5).map((q, i) => ({
          type: 'button',
          text: { type: 'plain_text', text: q.length > 75 ? q.slice(0, 72) + '...' : q },
          action_id: `followup_${i}`,
          value: JSON.stringify({ query: q, namespace: ns }),
        })),
      });
    }

    await say({ blocks });
  },
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest tests/commands/security-commands.test.js`
Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/commands/waf-status.js src/commands/service-policies.js src/commands/bot-defense-status.js src/commands/api-security-status.js src/commands/security-event.js tests/commands/security-commands.test.js
git commit -m "feat: add security commands — WAF, policies, bot defense, API security, events"
```

---

## Task 15: AI Assistant Commands — ai-query, ai-suggest

**Files:**
- Create: `src/commands/ai-query.js`
- Create: `src/commands/ai-suggest.js`
- Create: `tests/commands/ai-commands.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/commands/ai-commands.test.js`:

```js
const aiQuery = require('../../src/commands/ai-query');
const aiSuggest = require('../../src/commands/ai-suggest');
const formatter = require('../../src/core/slack-formatter');

describe('ai-query', () => {
  test('exports valid plugin contract', () => {
    expect(aiQuery.meta.name).toBe('ai-query');
    expect(aiQuery.meta.slashCommand).toBe('/xc-ask');
  });

  test('forwards query to AI assistant and formats response', async () => {
    const messages = [];
    const aiAssistant = {
      query: jest.fn().mockResolvedValue({
        query_id: 'q1',
        generic_response: { summary: 'Rate limiting helps protect your APIs.' },
        follow_up_queries: ['How do I configure rate limiting?'],
      }),
    };
    await aiQuery.handler({
      say: (msg) => messages.push(msg),
      aiAssistant,
      args: { raw: 'tell me about rate limiting', namespace: 'system' },
      formatter,
      tenant: { name: 'test', cachedWhoami: { namespace_access: { namespace_role_map: {} } } },
    });
    expect(aiAssistant.query).toHaveBeenCalledWith('system', 'tell me about rate limiting');
    const text = JSON.stringify(messages);
    expect(text).toContain('Rate limiting');
  });
});

describe('ai-suggest', () => {
  test('exports valid plugin contract', () => {
    expect(aiSuggest.meta.name).toBe('ai-suggest');
    expect(aiSuggest.meta.slashCommand).toBe('/xc-suggest');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/ai-commands.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement ai-query.js**

Create `src/commands/ai-query.js`:

```js
module.exports = {
  meta: {
    name: 'ai-query',
    description: 'Ask the XC AI Assistant a free-form question',
    slashCommand: '/xc-ask',
    category: 'ai-assistant',
  },

  intents: [
    { utterance: 'ask the assistant', intent: 'ai.query' },
    { utterance: 'ask about', intent: 'ai.query' },
    { utterance: 'I have a question for the assistant', intent: 'ai.query' },
    { utterance: 'can you ask the AI', intent: 'ai.query' },
  ],

  entities: [],

  handler: async ({ say, aiAssistant, args, formatter }) => {
    const query = args.raw || '';
    if (!query.trim()) {
      await say({ blocks: formatter.errorBlock('Please provide a question. Example: `/xc-ask how do I configure rate limiting`') });
      return;
    }

    const ns = args.namespace || 'system';
    await say(`🤖 Asking the AI Assistant...`);

    const result = await aiAssistant.query(ns, query.trim());
    const blocks = [];

    if (result.explain_log) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: result.explain_log.summary || 'No summary.' } });
    } else if (result.gen_dashboard_filter) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: result.gen_dashboard_filter.event_summary || 'Dashboard filter generated.' } });
    } else if (result.list_response) {
      const items = result.list_response.items || [];
      const text = items.map((i) => `• ${i.title || i}`).join('\n');
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: text || 'No items.' } });
    } else if (result.widget_response) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: result.widget_response.summary || 'Widget data returned.' } });
    } else if (result.site_analysis_response) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Site analysis data returned.' } });
    } else if (result.generic_response) {
      if (result.generic_response.is_error) {
        blocks.push(...formatter.errorBlock(result.generic_response.summary || 'AI Assistant returned an error.'));
      } else {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: result.generic_response.summary || 'No response.' } });
      }
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Received a response but could not parse it.' } });
    }

    if (result.follow_up_queries?.length) {
      blocks.push({
        type: 'actions',
        elements: result.follow_up_queries.slice(0, 5).map((q, i) => ({
          type: 'button',
          text: { type: 'plain_text', text: q.length > 75 ? q.slice(0, 72) + '...' : q },
          action_id: `ai_followup_${i}`,
          value: JSON.stringify({ query: q, namespace: ns }),
        })),
      });
    }

    await say({ blocks });
  },
};
```

- [ ] **Step 4: Implement ai-suggest.js**

Create `src/commands/ai-suggest.js`:

```js
module.exports = {
  meta: {
    name: 'ai-suggest',
    description: 'Ask the AI Assistant for LB optimization suggestions',
    slashCommand: '/xc-suggest',
    category: 'ai-assistant',
  },

  intents: [
    { utterance: 'suggest improvements for the load balancer', intent: 'ai.suggest' },
    { utterance: 'how can I optimize my LB', intent: 'ai.suggest' },
    { utterance: 'give me recommendations', intent: 'ai.suggest' },
    { utterance: 'what should I improve', intent: 'ai.suggest' },
  ],

  entities: [],

  handler: async ({ say, aiAssistant, tenant, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('ai.suggest', Object.keys(nsRoleMap)) });
      return;
    }
    if (!args.resourceName) {
      await say({ blocks: formatter.errorBlock('Please specify an LB name. Example: `/xc-suggest prod my-lb`') });
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;

    await say(`🤖 Asking for suggestions on \`${name}\`...`);

    const query = `Suggest improvements and optimizations for HTTP load balancer "${name}" in namespace "${ns}"`;
    const result = await aiAssistant.query(ns, query);

    const blocks = [];
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `💡 Suggestions — ${name}` } });

    const summary = result.generic_response?.summary
      || result.explain_log?.summary
      || 'No suggestions available.';
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: summary } });

    if (result.follow_up_queries?.length) {
      blocks.push({
        type: 'actions',
        elements: result.follow_up_queries.slice(0, 5).map((q, i) => ({
          type: 'button',
          text: { type: 'plain_text', text: q.length > 75 ? q.slice(0, 72) + '...' : q },
          action_id: `suggest_followup_${i}`,
          value: JSON.stringify({ query: q, namespace: ns }),
        })),
      });
    }

    await say({ blocks });
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/commands/ai-commands.test.js`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/ai-query.js src/commands/ai-suggest.js tests/commands/ai-commands.test.js
git commit -m "feat: add AI assistant proxy commands — ai-query and ai-suggest"
```

---

## Task 16: Site, DNS, Alert Commands

**Files:**
- Create: `src/commands/site-status.js`
- Create: `src/commands/site-detail.js`
- Create: `src/commands/dns-status.js`
- Create: `src/commands/alert-status.js`
- Create: `tests/commands/infra-commands.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/commands/infra-commands.test.js`:

```js
const siteStatus = require('../../src/commands/site-status');
const siteDetail = require('../../src/commands/site-detail');
const dnsStatus = require('../../src/commands/dns-status');
const alertStatus = require('../../src/commands/alert-status');
const formatter = require('../../src/core/slack-formatter');
const { Cache } = require('../../src/core/cache');

describe('infra commands plugin contracts', () => {
  test('site-status', () => {
    expect(siteStatus.meta.name).toBe('site-status');
    expect(siteStatus.meta.slashCommand).toBe('/xc-sites');
    expect(siteStatus.intents.length).toBeGreaterThanOrEqual(3);
  });

  test('site-detail', () => {
    expect(siteDetail.meta.name).toBe('site-detail');
    expect(siteDetail.meta.slashCommand).toBe('/xc-site');
  });

  test('dns-status', () => {
    expect(dnsStatus.meta.name).toBe('dns-status');
    expect(dnsStatus.meta.slashCommand).toBe('/xc-dns');
  });

  test('alert-status', () => {
    expect(alertStatus.meta.name).toBe('alert-status');
    expect(alertStatus.meta.slashCommand).toBe('/xc-alerts');
  });
});

describe('site-status handler', () => {
  test('lists sites with status', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          items: [
            { metadata: { name: 'site-1' }, spec: { site_type: 'CUSTOMER_EDGE' }, status: { software_version: '7.2.1' } },
            { metadata: { name: 'site-2' }, spec: { site_type: 'RE' }, status: { software_version: '7.2.1' } },
          ],
        }),
      },
    };
    await siteStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: {},
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('site-1');
    expect(text).toContain('site-2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/infra-commands.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement site-status.js**

Create `src/commands/site-status.js`:

```js
module.exports = {
  meta: {
    name: 'site-status',
    description: 'List all sites with health and connectivity status',
    slashCommand: '/xc-sites',
    cacheTTL: 300,
    category: 'sites',
  },

  intents: [
    { utterance: 'show me all sites', intent: 'site.status' },
    { utterance: 'what is the status of sites', intent: 'site.status' },
    { utterance: 'list sites', intent: 'site.status' },
    { utterance: 'are all sites online', intent: 'site.status' },
    { utterance: 'site health', intent: 'site.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    const cacheKey = `${tenant.name}:sites:list`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderSites(say, formatter, cached, true);
        return;
      }
    }

    const startTime = Date.now();
    const data = await tenant.client.get('/api/config/namespaces/system/sites');
    const sites = data.items || [];
    cache.set(cacheKey, sites, 300);

    await renderSites(say, formatter, sites, false, Date.now() - startTime);
  },
};

async function renderSites(say, formatter, sites, cached, durationMs) {
  if (sites.length === 0) {
    await say({ blocks: formatter.errorBlock('No sites found.') });
    return;
  }

  const lines = sites.map((site) => {
    const name = site.metadata?.name || site.name || 'unknown';
    const siteType = site.spec?.site_type || 'unknown';
    const version = site.status?.software_version || 'N/A';
    return formatter.statusLine('healthy', name, `${siteType} · v${version}`);
  });

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🏢 Sites' } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    formatter.footer({ durationMs, cached }),
  ];

  await say({ blocks });
}
```

- [ ] **Step 4: Implement site-detail.js**

Create `src/commands/site-detail.js`:

```js
module.exports = {
  meta: {
    name: 'site-detail',
    description: 'Detailed view of a single site',
    slashCommand: '/xc-site',
    cacheTTL: 300,
    category: 'sites',
  },

  intents: [
    { utterance: 'details on site', intent: 'site.detail' },
    { utterance: 'show site details', intent: 'site.detail' },
    { utterance: 'site info', intent: 'site.detail' },
    { utterance: 'describe site', intent: 'site.detail' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    const name = args.resourceName || args.raw?.trim();
    if (!name) {
      await say({ blocks: formatter.errorBlock('Please specify a site name. Example: `/xc-site dallas-ce`') });
      return;
    }

    const startTime = Date.now();
    const site = await tenant.client.get(`/api/config/namespaces/system/sites/${name}`);
    const spec = site.spec || {};
    const status = site.status || {};

    const fields = [
      { label: 'Name', value: site.metadata?.name || name },
      { label: 'Type', value: spec.site_type || 'N/A' },
      { label: 'SW Version', value: status.software_version || 'N/A' },
      { label: 'OS Version', value: status.os_version || 'N/A' },
    ];

    if (status.node_info?.length) {
      fields.push({ label: 'Nodes', value: String(status.node_info.length) });
    }

    const blocks = [
      ...formatter.detailView(`🏢 Site: ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false }),
    ];

    await say({ blocks });
  },
};
```

- [ ] **Step 5: Implement dns-status.js**

Create `src/commands/dns-status.js`:

```js
module.exports = {
  meta: {
    name: 'dns-status',
    description: 'List DNS zones and GSLB status',
    slashCommand: '/xc-dns',
    cacheTTL: 300,
    category: 'dns',
  },

  intents: [
    { utterance: 'show DNS zones', intent: 'dns.status' },
    { utterance: 'list DNS zones', intent: 'dns.status' },
    { utterance: 'DNS status', intent: 'dns.status' },
    { utterance: 'what DNS zones are configured', intent: 'dns.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('dns.status', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const startTime = Date.now();

    const [zoneData, gslbData] = await Promise.all([
      tenant.client.get(`/api/config/dns/namespaces/${ns}/dns_zones`).catch(() => ({ items: [] })),
      tenant.client.get(`/api/config/dns/namespaces/${ns}/dns_load_balancers`).catch(() => ({ items: [] })),
    ]);

    const zones = zoneData.items || [];
    const gslbs = gslbData.items || [];

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🌐 DNS — ${ns}` } },
    ];

    if (zones.length > 0) {
      const rows = zones.map((z) => ({
        name: z.name || z.metadata?.name || 'unknown',
        type: z.spec?.zone_type || 'primary',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*DNS Zones (${zones.length})*\n` + formatter.table(['name', 'type'], rows) } });
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No DNS zones configured.' } });
    }

    if (gslbs.length > 0) {
      blocks.push({ type: 'divider' });
      const rows = gslbs.map((g) => ({
        name: g.name || g.metadata?.name || 'unknown',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*DNS Load Balancers (${gslbs.length})*\n` + formatter.table(['name'], rows) } });
    }

    blocks.push(formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }));
    await say({ blocks });
  },
};
```

- [ ] **Step 6: Implement alert-status.js**

Create `src/commands/alert-status.js`:

```js
module.exports = {
  meta: {
    name: 'alert-status',
    description: 'List configured alert policies',
    slashCommand: '/xc-alerts',
    cacheTTL: 300,
    category: 'observability',
  },

  intents: [
    { utterance: 'any active alerts', intent: 'alert.status' },
    { utterance: 'show alert policies', intent: 'alert.status' },
    { utterance: 'check alerts', intent: 'alert.status' },
    { utterance: 'list alert configurations', intent: 'alert.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      const nsRoleMap = tenant.cachedWhoami?.namespace_access?.namespace_role_map || {};
      await say({ blocks: formatter.namespacePicker('alert.status', Object.keys(nsRoleMap)) });
      return;
    }

    const ns = args.namespace;
    const startTime = Date.now();

    const [policyData, receiverData] = await Promise.all([
      tenant.client.get(`/api/config/namespaces/${ns}/alert_policys`).catch(() => ({ items: [] })),
      tenant.client.get(`/api/config/namespaces/${ns}/alert_receivers`).catch(() => ({ items: [] })),
    ]);

    const policies = policyData.items || [];
    const receivers = receiverData.items || [];

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🔔 Alerts — ${ns}` } },
    ];

    if (policies.length > 0) {
      const rows = policies.map((p) => ({
        name: p.name || p.metadata?.name || 'unknown',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Alert Policies (${policies.length})*\n` + formatter.table(['name'], rows) } });
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No alert policies configured.' } });
    }

    if (receivers.length > 0) {
      blocks.push({ type: 'divider' });
      const rows = receivers.map((r) => ({
        name: r.name || r.metadata?.name || 'unknown',
      }));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Alert Receivers (${receivers.length})*\n` + formatter.table(['name'], rows) } });
    }

    blocks.push(formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }));
    await say({ blocks });
  },
};
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest tests/commands/infra-commands.test.js`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/commands/site-status.js src/commands/site-detail.js src/commands/dns-status.js src/commands/alert-status.js tests/commands/infra-commands.test.js
git commit -m "feat: add site-status, site-detail, dns-status, alert-status commands"
```

---

## Task 17: Docker & README

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `README.md`

- [ ] **Step 1: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ src/
COPY training/ training/

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node
CMD ["node", "src/app.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
services:
  bot:
    build: .
    env_file: .env
    restart: unless-stopped
    ports:
      - "3000:3000"
```

- [ ] **Step 3: Create README.md**

Create `README.md`:

```markdown
# F5 XC ChatOps Agent

A Slack bot providing read-only operational visibility into F5 Distributed Cloud tenants. Query resource status, visualize load balancer chains, check quotas, investigate security events, and ask the XC AI Assistant — all from Slack.

## Quick Start

1. **Create a Slack App** at https://api.slack.com/apps with Socket Mode enabled
2. **Copy `.env.example` to `.env`** and fill in your tokens
3. **Run with Docker:**

```bash
docker compose up -d
```

Or run directly:

```bash
npm install
npm start
```

## Slack App Setup

Your Slack app needs these scopes and features:

**Bot Token Scopes:** `chat:write`, `commands`, `files:write`, `app_mentions:read`, `im:history`, `reactions:read`

**Socket Mode:** Enabled (generates the `SLACK_APP_TOKEN`)

**Slash Commands:** Register each `/xc-*` command in App Settings > Slash Commands

**Event Subscriptions:** Subscribe to `app_mention` and `message.im`

## Commands

### Core
| Command | Description |
|---------|-------------|
| `/xc-help` | List all commands |
| `/xc-whoami` | Show bot identity and accessible namespaces |
| `/xc-ns <ns>` | Namespace summary |
| `/xc-list <type> <ns>` | List resources by type |

### App Delivery
| Command | Description |
|---------|-------------|
| `/xc-diagram <ns> <lb>` | Visual LB chain diagram |
| `/xc-lb <ns> <lb>` | Load balancer detail |
| `/xc-certs <ns>` | Certificate expiration status |
| `/xc-origins <ns> <pool>` | Origin pool health |

### Security
| Command | Description |
|---------|-------------|
| `/xc-event <support-id>` | Explain a security event |
| `/xc-waf <ns> <lb>` | WAF status |
| `/xc-policies <ns> <lb>` | Service policies |
| `/xc-bot <ns> <lb>` | Bot defense status |
| `/xc-api-sec <ns>` | API security status |

### Quotas
| Command | Description |
|---------|-------------|
| `/xc-quota <ns>` | Quota utilization |
| `/xc-quota-forecast <ns>` | Resources approaching limits |

### AI Assistant
| Command | Description |
|---------|-------------|
| `/xc-ask <question>` | Free-form AI assistant query |
| `/xc-suggest <ns> <lb>` | LB optimization suggestions |

### Infrastructure
| Command | Description |
|---------|-------------|
| `/xc-sites` | All sites with status |
| `/xc-site <name>` | Site detail |
| `/xc-dns <ns>` | DNS zones and GSLB |
| `/xc-alerts <ns>` | Alert policies |

## Natural Language

You can also @mention the bot or DM it with natural language:
- "what quotas are running high in prod"
- "diagram the LB chain for app-payments in namespace prod"
- "any certs expiring soon in staging"
- "explain security event abc-123"

## Adding a New Command

1. Copy `src/commands/_template.js` to `src/commands/your-command.js`
2. Implement the plugin contract (meta, intents, handler)
3. Restart the bot

The bot auto-discovers all `.js` files in `src/commands/` on startup.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `F5XC_API_URL` | Yes | XC tenant URL |
| `F5XC_API_TOKEN` | Yes | XC API token |
| `SLACK_BOT_TOKEN` | Yes | Slack bot OAuth token |
| `SLACK_APP_TOKEN` | Yes | Slack app-level token |
| `LOG_LEVEL` | No | `debug\|info\|warn\|error` (default: `info`) |
| `CACHE_WARM_TTL` | No | Warm cache TTL seconds (default: `300`) |
| `CACHE_STATIC_TTL` | No | Static cache TTL seconds (default: `3600`) |
| `NLP_THRESHOLD` | No | NLP confidence threshold (default: `0.65`) |
```

- [ ] **Step 4: Run full test suite**

Run: `npx jest --coverage`
Expected: All tests pass.

- [ ] **Step 5: Build Docker image**

Run: `docker build -t f5xc-chatops .`
Expected: Image builds successfully.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml README.md
git commit -m "feat: add Dockerfile, docker-compose, and README"
```

- [ ] **Step 7: Run full test suite one final time**

Run: `npx jest`
Expected: All tests pass. Zero failures.
