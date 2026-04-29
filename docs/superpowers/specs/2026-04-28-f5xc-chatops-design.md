# F5 XC ChatOps Agent — Design Spec

## Overview

A Slack-based ChatOps agent that provides read-only operational visibility into F5 Distributed Cloud tenants. Users interact via slash commands or natural language in Slack to query resource status, visualize load balancer chains, check quotas, investigate security events, and proxy questions to the XC AI Assistant.

The bot runs without an LLM. Intent classification and entity extraction are handled by NLP.js, a lightweight local NLU library. The XC AI Assistant integration is the one exception — it calls the XC-hosted `/api/gen-ai/` endpoint, which is F5's managed service, not an LLM we operate.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | Node.js | NLP.js is native; Bolt.js is Slack's official SDK |
| NLU | NLP.js v4 | Local, trains in <1s for 50 intents, 92-97% accuracy, built-in entity extraction |
| Slack SDK | Bolt.js (Socket Mode) | No public URL needed, works behind firewalls, simplest Docker deployment |
| Rendering | mermaid-cli (mmdc) | Generates PNG images uploaded to Slack inline |
| Caching | In-memory Map with TTL | Zero infra overhead; interface abstracted for Redis swap later |
| Deployment | Docker | Portable single container |
| Multi-tenant | Single tenant now, architecture supports multi | Tenant profile object passed through; not a singleton |
| Auth | Single shared XC API token | Read-only ops; per-user tokens not needed at this stage |
| Extensibility | Auto-discovered plugin modules | Drop a file in `commands/`, bot picks it up on restart |

## Project Structure

```
f5xc-chatops/
├── src/
│   ├── app.js                    # Entry point — boots Bolt.js, loads plugins, trains NLP
│   ├── core/
│   │   ├── xc-client.js          # XC API HTTP client (auth, retries, tenant config)
│   │   ├── ai-assistant.js       # XC AI Assistant API wrapper (/api/gen-ai/)
│   │   ├── nlp-engine.js         # NLP.js setup, training, intent resolution
│   │   ├── cache.js              # In-memory TTL cache (swappable to Redis later)
│   │   ├── slack-formatter.js    # Shared Slack Block Kit formatting helpers
│   │   └── diagram-renderer.js   # Mermaid -> PNG via mmdc child process
│   ├── commands/                  # Auto-discovered plugin directory
│   │   ├── _template.js          # Documented template for contributors
│   │   ├── help.js
│   │   ├── whoami.js
│   │   ├── namespace-summary.js
│   │   ├── list-resources.js
│   │   ├── quota-check.js
│   │   ├── quota-forecast.js
│   │   ├── diagram-lb.js
│   │   ├── lb-summary.js
│   │   ├── cert-status.js
│   │   ├── origin-health.js
│   │   ├── security-event.js
│   │   ├── waf-status.js
│   │   ├── service-policies.js
│   │   ├── bot-defense-status.js
│   │   ├── api-security-status.js
│   │   ├── ai-query.js
│   │   ├── ai-suggest.js
│   │   ├── site-status.js
│   │   ├── site-detail.js
│   │   ├── dns-status.js
│   │   └── alert-status.js
│   └── loader.js                 # Scans commands/, validates exports, wires into Bolt+NLP
├── training/                      # Optional JSON overrides for intent training data
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

## Plugin Architecture

### Plugin Contract

Every file in `commands/` exports a standard interface:

```js
module.exports = {
  meta: {
    name: 'quota-check',
    description: 'Check XC resource quota utilization',
    slashCommand: '/xc-quota',        // optional
    cacheTTL: 300,                     // optional, seconds. 0 = no cache
  },
  intents: [
    { utterance: 'what quotas are running high', intent: 'quota.check' },
    { utterance: 'show me quota usage', intent: 'quota.check' },
    { utterance: 'are we near any limits', intent: 'quota.check' },
  ],
  entities: [
    { name: 'namespace', examples: ['system', 'prod', 'staging'] }
  ],
  handler: async ({ tenant, cache, say, args }) => {
    // Implementation
  }
}
```

### Loader Behavior (startup)

1. Scans `commands/` for all `.js` files (skips files prefixed with `_`)
2. Validates each export has `meta`, `intents`, and `handler`
3. Registers slash commands with Bolt.js
4. Feeds all intents + entities into NLP.js and trains the model
5. Builds the intent-to-handler routing map

### Adding a New Command

A contributor forks the repo, creates a new file in `commands/` following the contract, and restarts the bot. No router changes, no central registry edits.

The `training/` directory supports optional JSON files that augment or override a command's built-in training utterances without modifying the command source.

## Command Catalog

### Core Operations

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| help | `/xc-help` | "what can you do", "how do I check quotas" | Lists all commands grouped by domain. With an argument, shows detail for one command. Auto-generated from plugin meta. |
| whoami | `/xc-whoami` | "what namespaces can you see" | Shows the bot's identity, accessible namespaces, and roles per namespace. Sourced from cached whoami API call. |
| namespace-summary | `/xc-ns <ns>` | "summarize namespace prod" | Resource counts, recent changes, and health overview for a namespace. |
| list-resources | `/xc-list <type> <ns>` | "show me all origin pools in staging" | Lists resources of a given type in a namespace. |

### Load Balancing & App Delivery

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| diagram-lb | `/xc-diagram <ns> <lb>` | "diagram the LB chain for app-payments in prod" | Full object graph rendered as PNG: LB -> domains/certs -> security -> routes -> pools -> origins. |
| lb-summary | `/xc-lb <ns> <lb>` | "tell me about the prod-payments load balancer in namespace prod" | Single LB detail: domains, TLS, routes, pools, attached security controls. |
| cert-status | `/xc-certs <ns>` | "any certs expiring soon in prod" | Scans all LBs in a namespace, reports cert expiration status with color-coded indicators. |
| origin-health | `/xc-origins <ns> <pool>` | "are all origins healthy for prod-api in namespace prod" | Health check status per origin pool — which servers are up/down. |

### Security

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| security-event | `/xc-event <support-id>` | "explain security event abc-123" | Proxies to the XC AI Assistant to explain a security event by support ID. |
| waf-status | `/xc-waf <ns> <lb>` | "what mode is the WAF in for prod-app in ns prod" | WAF policy details: mode (monitoring/blocking), signature sets, exclusion count. |
| service-policies | `/xc-policies <ns> <lb>` | "what service policies are on the payments LB in prod" | Lists attached service policies with rule summaries. |
| bot-defense-status | `/xc-bot <ns> <lb>` | "is bot defense enabled on prod-app in namespace prod" | Bot defense configuration status per LB. |
| api-security-status | `/xc-api-sec <ns>` | "show api discovery findings in namespace prod" | API discovery/protection status — endpoints found, shadow APIs, schema violations. |

### Quotas & Capacity

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| quota-check | `/xc-quota <ns>` | "what quotas are running high in prod" | Color-coded quota utilization across all resource types (green/yellow/red). |
| quota-forecast | `/xc-quota-forecast <ns>` | "will we hit any limits soon in prod" | Compares current quota usage against the limit and flags resources above 80%. Not a true time-series forecast — it's a point-in-time "approaching limit" check. Future enhancement could persist snapshots for trend analysis. |

### AI Assistant Proxy

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| ai-query | `/xc-ask <text>` | "ask the assistant about rate limiting best practices" | Free-form proxy to the XC AI Assistant API. Formats the structured response for Slack. Renders follow-up suggestions as buttons. |
| ai-suggest | `/xc-suggest <ns> <lb>` | "suggest improvements for prod-lb in namespace prod" | Asks the AI assistant for configuration optimization suggestions on a specific LB. |

### Sites

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| site-status | `/xc-sites` | "show me all sites", "what's the status of site dallas-ce" | Lists sites with health/connectivity status (online/degraded/offline), software version, provider, region. |
| site-detail | `/xc-site <site>` | "details on site aws-prod-east" | Single site deep-dive: node count, OS/SW version, interfaces, tunnel status, resource utilization (CPU/mem/disk). |

### DNS

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| dns-status | `/xc-dns <ns>` | "show DNS zones in namespace prod" | Lists DNS zones, record counts, GSLB load balancer status. |

### Observability

| Command | Slash | NL Examples | What it does |
|---------|-------|-------------|--------------|
| alert-status | `/xc-alerts <ns>` | "any active alerts in prod" | Lists configured alert policies and recent firings. |

**Total: 21 commands.** All are read-only. No create, update, or delete operations.

## Namespace Resolution

The bot operates across an entire tenant. Users must specify a namespace for resource-specific queries.

### Resolution Order

1. **Explicit in message** — NLP.js extracts `namespace` as an entity from phrases like "in namespace prod", "in ns prod", "in prod"
2. **Slash command positional arg** — `/xc-quota prod`
3. **Prompt if missing** — Bot replies with a list of accessible namespaces as Slack buttons. One tap completes the query.

### Namespace Awareness

On startup, the bot calls `GET /api/web/custom/namespaces/{namespace}/whoami` to retrieve its `namespace_role_map`. This tells it which namespaces the token can access and what roles it holds.

- The namespace list is cached (1 hour TTL, static tier)
- NLP.js entity examples are trained from this list so it recognizes namespace names in natural language
- If a user requests a namespace the bot can't access, it responds with an explicit message listing what it can access

## XC API Client

### Tenant Profile

```js
{
  name: 'lab-mcn',
  apiUrl: 'https://f5-xc-lab-mcn.console.ves.volterra.io',
  apiToken: 'xxx',
  cachedWhoami: null
}
```

Today: one profile, loaded from env vars. Multi-tenant: an array of profiles loaded from config, each with its own URL + token. Client methods take a tenant profile as a parameter — they never reach into env vars directly after initialization.

Command handlers receive the tenant profile:

```js
handler: async ({ tenant, cache, say, args }) => {
  const lbs = await tenant.client.get(
    `/api/config/namespaces/${args.namespace}/http_loadbalancers`
  );
}
```

### HTTP Behavior

- **Auth**: `Authorization: APIToken <token>` header
- **Retries**: 429 and 503 retried up to 3 times with exponential backoff
- **Timeout**: 30 seconds default, configurable per-request
- **No PATCH**: XC API is PUT-only for updates (not relevant for read-only bot, but noted for future contributors)

## AI Assistant Integration

### Endpoint

`POST /api/gen-ai/namespaces/{namespace}/query`

```json
{
  "current_query": "Explain security event 07e03bc6-81d4-4c86-a865-67b5763fe294",
  "namespace": "system"
}
```

### Response Types

The API returns one of six typed responses. Each gets its own Slack formatter:

| Response Type | Slack Rendering |
|---------------|-----------------|
| `explain_log` | Header + narrative sections + action items as bulleted list |
| `gen_dashboard_filter` | Summary + clickable console dashboard links |
| `list_response` | Table or bullet list depending on item count |
| `widget_response` | Text summary describing the data (charts can't render in Slack) |
| `generic_response` | Simple text block |
| `site_analysis_response` | Table + console links |

All responses include `follow_up_queries` — rendered as Slack buttons so users can drill deeper without retyping.

### Feedback

The bot captures thumbs-up/thumbs-down reactions on AI assistant responses and submits them back via the feedback endpoint (`/api/gen-ai/namespaces/{namespace}/query_feedback`) using the `query_id` from the original response.

## Diagram Generation

### Object Graph Traversal

Starting from an LB name + namespace, walks the API top-down:

1. **Fetch LB** — `GET /api/config/namespaces/{ns}/http_loadbalancers/{name}`. Also supports `tcp_loadbalancers` and `udp_loadbalancers`.
2. **Extract from LB spec** (no extra API calls):
   - Domains + TLS cert status + expiration dates
   - Advertise config (public VIP, private sites)
   - All attached security: WAF, service policies, bot defense, rate limiting, API protection, malicious user detection, data guard, client-side defense
   - Routes (simple + redirect)
3. **Fan out to origin pools** — deduplicated, fetched in parallel within the same namespace
4. **Extract origins** per pool — private IP, public IP, public DNS, private DNS, K8s service, each with site locator

### Rendering Pipeline

```
API traversal -> Mermaid syntax (in memory) -> mmdc child process -> PNG temp file -> Slack upload -> cleanup
```

- `mmdc` runs as a spawned child process (does not block the event loop)
- PNG format (Slack renders inline; SVGs require download)
- Temp files cleaned up immediately after upload
- Mermaid `neutral` theme with custom CSS: green/yellow/red for cert status, red fill for missing WAF on public LBs
- 60 second timeout for the full pipeline
- LBs with more than 50 origin pools get split into overview + per-pool detail diagrams

### Improvements Over xcshowmap Reference

- Supports HTTP, TCP, and UDP load balancers (not just HTTP)
- Renders all security controls (xcshowmap only renders 5 of many)
- Includes redirect routes (xcshowmap silently skips them)
- Graceful degradation on API errors (marks failed nodes as "unavailable" instead of exiting)
- Outputs rendered PNG images (xcshowmap outputs raw Mermaid text)

## Data Visualization & Slack Formatting

### Response Types

**Tables** — Slack Block Kit with `mrkdwn` monospace grids. The `slack-formatter.js` module provides a table builder that auto-calculates column widths, truncates long values, aligns columns, and adds header separators.

Example (quota check):
```
Resource              Used / Limit   Util
---------------------------------------------
http_loadbalancers      12 / 25      48%
origin_pools            43 / 50      86%  ⚠️
service_policies        14 / 15      93%  🔴
```

**Status lists** — Block Kit `section` blocks with emoji indicators:
- 🟢 Healthy / Valid / Online
- 🟡 Degraded / Expiring / Warning
- 🔴 Down / Expired / Critical
- ⚪ Unknown / N/A

**Single-resource detail** — Block Kit `header` + `section` + `fields` layout (2-column field pairs for key-value data, dividers between sections).

**Diagrams** — PNG image upload via `files.uploadV2` with a brief text summary above the image.

**AI Assistant responses** — Adaptive formatting per response type (see AI Assistant Integration section).

**Errors** — `context` block with descriptive message and suggestions.

### Shared Formatting Principles

- Every response starts with an emoji + title identifying the command and scope
- Max 20 items per message; longer lists paginate with a "Show more" button (Slack `actions` block)
- Timestamps rendered as Slack `<!date>` format for local timezone display
- Resource names link to the XC console where applicable: `https://{tenant}.console.ves.volterra.io/web/...`
- Footer `context` block on every response: `Fetched in 1.2s · cached · namespace: prod`

## Caching Strategy

### Cache Tiers

| Tier | TTL | What gets cached | Rationale |
|------|-----|------------------|-----------|
| Static | 1 hour | Namespace list, whoami/roles, site list, resource type metadata | Changes rarely |
| Warm | 5 min | Quota usage, resource lists, cert expiration data, site status | Changes periodically but not interactively |
| None | 0 | AI assistant queries, security event lookups, diagram generation | Inherently interactive or user-specific |

### Implementation

In-memory `Map` with per-entry TTL. The `cache.js` module exposes:
- `get(key)` — returns value or `null` if expired
- `set(key, value, ttlSeconds)`
- `invalidate(pattern)` — glob-match key invalidation
- `stats()` — hit/miss counts

Cache keys: `{tenant}:{namespace}:{resource_type}:{identifier}` (multi-tenant ready).

### Population

- **Startup warmup**: Proactively fetches and caches the static tier (whoami, namespace list, site list)
- **Lazy for warm tier**: Cached on first request; subsequent requests within TTL are instant
- **No background polling**: When an entry expires, the next request fetches fresh data

### Cache Bypass

Every cached command supports a `--fresh` flag or natural language modifiers ("force refresh", "no cache", "live data"). NLP.js is trained to recognize freshness modifiers.

## NLP Engine & Intent Routing

### Message Routing

```
User message in Slack
        |
Is it a slash command? --> Yes --> direct route to handler
        | No
Is the bot @mentioned or DM'd? --> Yes --> run through NLP.js
        | No
Ignore (bot does not eavesdrop on channel messages)
```

### NLP.js Configuration

- Single NLP manager trained on startup from all command module `intents` arrays
- Language: English only
- Confidence threshold: 0.65 — below this, the bot suggests the top 3 closest intents as Slack buttons
- Entity extraction for: `namespace` (trained from whoami list), `resource_name` (unclassified nouns), `resource_type` (fixed synonym list: "load balancer"/"LB", "origin pool"/"pool", "WAF"/"firewall", etc.)

### Slash Commands vs Natural Language

Both paths produce the same `args` object and call the same handler. Slash commands parse arguments positionally; natural language extracts them via NLP.js entities.

### Ambiguity Handling

If an intent is classified but a required entity is missing (e.g., no namespace), the handler replies with a Slack interactive message listing accessible namespaces as buttons. One tap completes the query.

## Error Handling

| Error | Bot Response | Log Level |
|-------|-------------|-----------|
| Auth failure (401/403) | "I don't have access to namespace X. My token has access to: [list]" | warn |
| Resource not found (404) | "Couldn't find LB `name` in namespace `ns`. Here's what I found: [list]" | debug |
| Rate limited (429) | Retries silently up to 3x. If still failing: "XC API is rate limiting me, try again in a minute" | warn |
| XC API error (5xx) | "XC API returned an error. Details: [status]" | error |
| NLP low confidence | "Not sure what you mean. Did you mean one of these?" + top 3 buttons | info |
| Missing entity | Interactive prompt for the missing value | none |
| Diagram render timeout | "This LB has a complex config and the diagram timed out. Try `/xc-lb` for a text summary instead" | warn |

## Operational Concerns

### Logging

Structured JSON to stdout. Fields: timestamp, level, command name, namespace, duration, cache hit/miss, error detail. No sensitive data (no tokens, no request bodies).

### Health Endpoint

`/healthz` HTTP endpoint alongside Socket Mode. Returns: Slack connection status, XC API reachability, cache stats, uptime. Used for Docker `HEALTHCHECK`.

### Startup Sequence

1. Validate env vars: `F5XC_API_URL`, `F5XC_API_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`
2. Call whoami — validate token, cache namespace/role map
3. Fetch and cache namespace list, site list (static tier warmup)
4. Scan `commands/`, validate exports
5. Train NLP.js from combined intents + entities
6. Register slash commands with Bolt.js
7. Connect Socket Mode
8. Log ready with namespace count and command count

Fails fast on any startup error. No partial boot.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `F5XC_API_URL` | Yes | XC tenant URL (e.g., `https://f5-xc-lab-mcn.console.ves.volterra.io`) |
| `F5XC_API_TOKEN` | Yes | XC API token |
| `SLACK_BOT_TOKEN` | Yes | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Yes | Slack app-level token for Socket Mode (`xapp-...`) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error`. Default: `info` |
| `CACHE_WARM_TTL` | No | Warm cache TTL in seconds. Default: `300` |
| `CACHE_STATIC_TTL` | No | Static cache TTL in seconds. Default: `3600` |
| `NLP_THRESHOLD` | No | NLP.js confidence threshold. Default: `0.65` |

## XC API Gotchas

Documented here for contributors building new commands:

- **No PATCH** — all updates are PUT (full object replacement). Not relevant for read-only bot, but important if write operations are ever added.
- **Inconsistent pluralization** — some resource kinds use non-standard plural forms (`service_policys`, `discoverys`). Commands must use the correct API path per resource.
- **Views create auto-children** — creating an `http_loadbalancer` auto-creates `virtual_host`, `route`, `cluster` objects. These are managed by the parent and should not be queried independently.
- **OneOf field groups** — mutually exclusive field sets (e.g., `disable_waf` vs `app_firewall`). Commands should check which variant is set.
- **No webhooks/events** — XC does not push events. All monitoring is poll-based via the cache.
- **Undocumented rate limits** — the API has rate limits but they are not published. The retry-with-backoff strategy in `xc-client.js` handles this.
