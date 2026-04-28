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
| `PORT` | No | Health endpoint port (default: `3000`) |
