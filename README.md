# F5 XC ChatOps

Operational visibility into F5 Distributed Cloud — from Slack.

Get answers about your tenant without opening the console. Check what's deployed, see if certs are expiring, visualize load balancer chains, investigate security events, monitor quota usage, and ask the XC AI Assistant follow-up questions — all without leaving the conversation.

## Commands

Every slash command also works as a natural language query — @mention the bot or DM it.

### See what's running

`/xc-ns <namespace>` — Namespace resource summary
> *"what's in the prod namespace"* · *"give me a summary of namespace staging"*

`/xc-list <namespace> <type>` — List resources by type
> *"list all load balancers in prod"* · *"show WAF policies in staging"*

`/xc-whoami` — Bot identity and accessible namespaces
> *"what namespaces can you see"* · *"what roles do you have"*

### Inspect load balancers

`/xc-lb <namespace> <lb>` — Load balancer detail (domains, WAF, bot defense, routes, pools)
> *"tell me about the load balancer"* · *"what is configured on the LB"*

`/xc-diagram <namespace> <lb>` — Visual LB chain diagram (PNG uploaded to channel)
> *"diagram the load balancer chain"* · *"visualize the load balancer"*

`/xc-origins <namespace> <pool>` — Origin pool servers
> *"show origin pool health"* · *"which origins are down"*

### Monitor certificates

`/xc-certs <namespace>` — Certificate expiration scan (color-coded: green/yellow/red)
> *"any certs expiring soon"* · *"are any certificates expired"*

### Check quota utilization

`/xc-quota <namespace>` — Quota utilization (color-coded at 80% and 100%)
> *"show me quota usage"* · *"how much capacity do we have left"*

`/xc-quota-forecast <namespace>` — Resources approaching limits
> *"which quotas are almost full"* · *"will we hit any limits soon"*

### Review security posture

`/xc-waf <namespace> <lb>` — WAF policy and mode
> *"is the WAF in blocking mode"* · *"check the web application firewall"*

`/xc-policies <namespace> <lb>` — Service policies on an LB
> *"what service policies are on the LB"* · *"what policies are applied"*

`/xc-bot <namespace> <lb>` — Bot defense status
> *"is bot defense enabled"* · *"check bot defense"*

`/xc-api-sec <namespace>` — API discovery and protection per LB
> *"api security status"* · *"are there any shadow APIs"*

### Investigate security events

`/xc-event <support-id>` — AI-powered security event explanation with follow-up buttons
> *"explain security event abc-123"* · *"investigate security event"*

### Ask the AI Assistant

`/xc-ask <question>` — Free-form AI Assistant query
> *"how do I configure rate limiting for my API"* · *"ask the assistant about DDoS protection"*

`/xc-suggest <namespace> <lb>` — AI-powered LB optimization suggestions
> *"suggest improvements for the load balancer"* · *"how can I optimize my LB"*

### Monitor infrastructure

`/xc-sites` — All sites with connectivity status
> *"show me all sites"* · *"are all sites online"*

`/xc-site <name>` — Single site detail
> *"details on site dallas-ce"* · *"describe site"*

`/xc-dns <namespace>` — DNS zones and GSLB
> *"show DNS zones"* · *"what DNS zones are configured"*

`/xc-alerts <namespace>` — Alert policies and receivers
> *"any active alerts"* · *"check alerts"*

### Help

`/xc-help` — List all commands or get detail on one
> *"what can you do"* · *"how do I use this"*

## How It Works

If the bot isn't sure what you mean, it suggests the closest matches as buttons. If a required detail is missing (like namespace), the bot replies with a picker showing all accessible namespaces — one tap completes the query.

Results are cached for 5 minutes to avoid hammering the API. Add `--fresh` to any slash command (or say "force refresh", "no cache", "live data") to bypass the cache.

```
/xc-quota prod --fresh
```

## How Output Looks

**Tables** — Monospace grids with auto-sized columns. Used for quota checks, resource lists, DNS zones.

**Status indicators** — Color-coded emoji: 🟢 healthy · 🟡 warning · 🔴 critical · ⚪ unknown

**Detail views** — Key-value layouts for single-resource inspection.

**Diagrams** — PNG images rendered and uploaded inline in the channel.

**AI responses** — Formatted responses with follow-up query buttons. Thumbs-up/thumbs-down reactions are sent back as feedback.

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
