# F5 XC ChatOps

Operational visibility into F5 Distributed Cloud — from Slack.

Get answers about your tenant without opening the console. Check what's deployed, see if certs are expiring, visualize load balancer chains, investigate security events, monitor quota usage, and ask the XC AI Assistant — all without leaving the conversation.

## Commands

Every slash command also works as a natural language query — @mention the bot or DM it. Add `--help` to any slash command to see its description and example phrases.

### See what's running

| Command | Description | Example phrases |
|---------|-------------|-----------------|
| `/xc-ns <namespace>` | Namespace resource summary | *"what's in the prod namespace"* · *"summary of namespace staging"* |
| `/xc-list [namespace] [type]` | List resources by type | *"list all load balancers"* · *"show WAF policies in staging"* |
| `/xc-whoami` | Bot identity and accessible namespaces | *"what namespaces can you see"* · *"what roles do you have"* |

### Inspect load balancers

| Command | Description | Example phrases |
|---------|-------------|-----------------|
| `/xc-lb <namespace> <lb>` | LB detail (domains, WAF, bot defense, routes, pools) | *"tell me about the load balancer"* · *"what is configured on the LB"* |
| `/xc-diagram <namespace> <lb>` | Visual LB chain diagram (PNG) | *"diagram the load balancer chain"* · *"show me a diagram of demo-shop-fe"* |
| `/xc-origins <namespace> <pool>` | Origin pool servers | *"show origin pool health"* · *"which origins are down"* |

### Certificates and quotas

| Command | Description | Example phrases |
|---------|-------------|-----------------|
| `/xc-certs <namespace>` | Certificate expiration scan (green/yellow/red) | *"any certs expiring soon"* · *"are any certificates expired"* |
| `/xc-quota [filter]` | Tenant-wide quota utilization | *"show me quota usage"* · *"show me critical quotas"* · *"quota usage for dns"* |

### Security posture

| Command | Description | Example phrases |
|---------|-------------|-----------------|
| `/xc-security <namespace> <lb>` | All security controls at a glance | *"what security is on this LB"* · *"security posture for my LB"* |
| `/xc-waf <namespace> <lb>` | WAF policy and mode | *"is the WAF in blocking mode"* · *"check the web application firewall"* |
| `/xc-bot <namespace> <lb>` | Bot defense status | *"is bot defense enabled"* · *"check bot defense"* |
| `/xc-ratelimit <namespace> <lb>` | Rate limiting configuration | *"is rate limiting enabled"* · *"show me the rate limit on my LB"* |
| `/xc-maluser <namespace> <lb>` | Malicious user detection/mitigation | *"is MUD enabled"* · *"check malicious user detection"* |
| `/xc-policies <namespace> <lb>` | Service policies on an LB | *"what service policies are on the LB"* · *"what policies are applied"* |
| `/xc-api-sec <namespace>` | API discovery and protection per LB | *"api security status"* · *"are there any shadow APIs"* |

### Security events and AI Assistant

| Command | Description | Example phrases |
|---------|-------------|-----------------|
| `/xc-event <support-id>` | AI-powered security event explanation | *"explain security event abc-123"* · *"look up request id abc-123"* |
| `/xc-ask <question>` | Free-form AI Assistant query | *"how do I configure rate limiting"* · *"ask about DDoS protection"* |
| `/xc-suggest <namespace> <lb>` | AI-powered LB optimization suggestions | *"suggest improvements for the LB"* · *"how can I optimize my LB"* |

### Infrastructure

| Command | Description | Example phrases |
|---------|-------------|-----------------|
| `/xc-sites` | Site status (CE default, `re` or `all` for more) | *"show me all sites"* · *"are all sites online"* |
| `/xc-site <name>` | Single site detail | *"details on site dallas-ce"* · *"describe site"* |
| `/xc-dns <namespace>` | DNS zones and GSLB | *"show DNS zones"* · *"what DNS zones are configured"* |
| `/xc-alerts [namespace]` | Active firing alerts | *"any alerts firing"* · *"are there any active alerts"* |

### Help

| Command | Description | Example phrases |
|---------|-------------|-----------------|
| `/xc-help [command]` | List all commands or get detail on one | *"what can you do"* · *"how do I use this"* |

## How It Works

If the bot isn't sure what you mean, it suggests the closest matches as buttons. If a required detail is missing (like namespace), the bot replies with a searchable dropdown — type to filter, then select to complete the query.

Results are cached for 5 minutes to avoid hammering the API. Add `--fresh` to any slash command (or say "force refresh", "no cache", "live data") to bypass the cache.

```
/xc-list prod http_loadbalancer --fresh
```

## How Output Looks

**Tables** — Native Slack table blocks. Large results are capped and a full CSV file is uploaded to the channel.

**Status indicators** — Color-coded emoji: 🟢 healthy · 🟡 warning · 🔴 critical · ⚪ unknown

**Detail views** — Key-value layouts for single-resource inspection.

**Diagrams** — PNG images rendered and uploaded inline in the channel.

**AI responses** — Formatted answers from the XC AI Assistant. Thumbs-up/thumbs-down reactions are sent back as feedback.

Every response includes a footer with fetch time, cache status, and namespace.

## Setup

See [SETUP.md](SETUP.md) for the full walkthrough — creating the Slack app, generating an F5 XC API token, registering commands, and running the bot.

Quick start if you've done this before:

```bash
cp .env.example .env   # fill in the four required tokens
docker compose up -d
```

## Adding Commands

Drop a new `.js` file in `src/commands/` and restart. The bot auto-discovers it — no registry, no config changes. Copy `src/commands/_template.js` to get started.
