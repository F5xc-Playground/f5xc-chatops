# F5 XC ChatOps

Operational visibility into F5 Distributed Cloud — from Slack.

Get answers about your tenant without opening the console. Check what's deployed, see if certs are expiring, visualize load balancer chains, investigate security events, monitor quota usage, and ask the XC AI Assistant follow-up questions — all without leaving the conversation.

## What It Does

### See what's running

Check namespace contents, list resources by type, and get a quick count of what's deployed where.

```
/xc-ns prod
/xc-list http_loadbalancer prod
```

Or ask naturally: *"what's in the prod namespace"*

### Inspect load balancers

Get the full picture for any LB: domains, advertise mode, WAF policy, bot defense, service policies, default pools, and route count.

```
/xc-lb prod my-app-lb
```

### Visualize LB chains

Generate a diagram showing the full path from user to origin: LB → security controls → routes → origin pools → servers. Uploaded as a PNG image directly in the channel.

```
/xc-diagram prod my-app-lb
```

The diagram includes WAF policies, service policies, bot defense, API protection, per-route overrides, redirect routes, and origin server details with site locations.

### Monitor certificates

Scan all LBs in a namespace for certificate expiration. Color-coded: green for valid, yellow for expiring within 30 days, red for expired.

```
/xc-certs prod
```

### Check quota utilization

See how close you are to resource limits. Color-coded warnings at 80% and 100% utilization, with a forecast view filtering to just the resources approaching their limits.

```
/xc-quota prod
/xc-quota-forecast prod
```

### Review security posture

Check WAF mode (blocking vs monitoring), list service policies on an LB, see bot defense status, and scan all LBs for API discovery and protection configuration.

```
/xc-waf prod my-app-lb
/xc-policies prod my-app-lb
/xc-bot prod my-app-lb
/xc-api-sec prod
```

### Investigate security events

Pass a support ID to the XC AI Assistant for an explanation of what happened, with recommended actions and follow-up buttons for deeper investigation.

```
/xc-event abc-123-def
```

### Ask the AI Assistant

Proxy any question to the XC AI Assistant and get the response formatted in Slack. Follow-up suggestions appear as buttons so you can drill deeper without retyping.

```
/xc-ask how do I configure rate limiting for my API
/xc-suggest prod my-app-lb
```

### Monitor infrastructure

List all sites with connectivity status, get details on a specific site, check DNS zone configuration, and review alert policies.

```
/xc-sites
/xc-site dallas-ce
/xc-dns prod
/xc-alerts prod
```

### See the bot's access

Check which namespaces the bot can see and what roles it has.

```
/xc-whoami
```

## Using Natural Language

Every command also works as a natural language query — @mention the bot or DM it:

- *"what quotas are running high in prod"*
- *"diagram the LB chain for app-payments in namespace prod"*
- *"any certs expiring soon in staging"*
- *"explain security event abc-123"*
- *"is bot defense enabled on my-app-lb in prod"*
- *"show me all sites"*

If the bot isn't sure what you mean, it suggests the closest matches as buttons.

If a required detail is missing (like namespace), the bot replies with a picker showing all accessible namespaces — one tap completes the query.

### Cache and freshness

Results are cached for 5 minutes to avoid hammering the API. Add `--fresh` to any slash command (or say "force refresh", "no cache", "live data") to bypass the cache and get live results.

```
/xc-quota prod --fresh
```

## How Output Looks

**Tables** — Monospace grids with auto-sized columns and header separators. Used for quota checks, resource lists, DNS zones.

**Status indicators** — Color-coded emoji for at-a-glance health:
- 🟢 Healthy / valid / connected
- 🟡 Degraded / expiring / warning
- 🔴 Down / expired / critical
- ⚪ Unknown

**Detail views** — Two-column key-value layouts for single-resource inspection (LB details, site details, WAF status).

**Diagrams** — PNG images rendered and uploaded inline in the channel.

**AI responses** — Adaptive formatting based on the XC AI Assistant response type, with follow-up query buttons. Thumbs-up/thumbs-down reactions on AI responses are sent back as feedback.

Every response includes a footer: fetch time, whether the result was cached or live, and the namespace.

## Setup

1. **Create a Slack App** at https://api.slack.com/apps with Socket Mode enabled
2. Copy `.env.example` to `.env` and fill in your tokens
3. Run:

```bash
docker compose up -d
```

Or without Docker:

```bash
npm install
npm start
```

### Slack App Configuration

**Bot Token Scopes:** `chat:write`, `commands`, `files:write`, `app_mentions:read`, `im:history`, `reactions:read`

**Socket Mode:** Enabled (generates the `SLACK_APP_TOKEN` — no public URL needed)

**Slash Commands:** Register each `/xc-*` command in App Settings > Slash Commands

**Event Subscriptions:** Subscribe to `app_mention`, `message.im`, and `reaction_added`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `F5XC_API_URL` | Yes | Your XC tenant URL (e.g. `https://acme.console.ves.volterra.io`) |
| `F5XC_API_TOKEN` | Yes | XC API token (read-only access recommended) |
| `SLACK_BOT_TOKEN` | Yes | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Yes | Slack app-level token for Socket Mode (`xapp-...`) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, or `error` (default: `info`) |
| `CACHE_WARM_TTL` | No | Cache duration in seconds (default: `300`) |
| `CACHE_STATIC_TTL` | No | Cache duration for rarely-changing data (default: `3600`) |
| `NLP_THRESHOLD` | No | Confidence threshold for intent matching (default: `0.65`) |
| `PORT` | No | Health endpoint port (default: `3000`) |

## All Commands

| Command | What it does |
|---------|-------------|
| `/xc-help` | List all commands or get detail on one |
| `/xc-whoami` | Bot identity and accessible namespaces |
| `/xc-ns <ns>` | Namespace resource summary |
| `/xc-list <type> <ns>` | List resources by type |
| `/xc-lb <ns> <lb>` | Load balancer detail |
| `/xc-diagram <ns> <lb>` | Visual LB chain diagram (PNG) |
| `/xc-certs <ns>` | Certificate expiration scan |
| `/xc-origins <ns> <pool>` | Origin pool servers |
| `/xc-waf <ns> <lb>` | WAF policy and mode |
| `/xc-policies <ns> <lb>` | Service policies on an LB |
| `/xc-bot <ns> <lb>` | Bot defense status |
| `/xc-api-sec <ns>` | API discovery/protection per LB |
| `/xc-event <id>` | AI-powered security event explanation |
| `/xc-quota <ns>` | Quota utilization |
| `/xc-quota-forecast <ns>` | Resources approaching limits |
| `/xc-ask <question>` | Free-form AI Assistant query |
| `/xc-suggest <ns> <lb>` | AI-powered LB optimization suggestions |
| `/xc-sites` | All sites with health status |
| `/xc-site <name>` | Single site detail |
| `/xc-dns <ns>` | DNS zones and GSLB |
| `/xc-alerts <ns>` | Alert policies and receivers |

## Adding Commands

Drop a new `.js` file in `src/commands/` and restart. The bot auto-discovers it — no registry, no config changes. Copy `src/commands/_template.js` to get started.
