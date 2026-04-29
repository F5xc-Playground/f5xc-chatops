# Setup Guide

This walks through creating a Slack app, generating an F5 XC API token, and running the bot.

## 1. Create the Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**
3. Name it whatever you like (e.g. `XC Bot`) and pick your workspace
4. Click **Create App**

## 2. Enable Socket Mode

Socket Mode lets the bot connect to Slack over a WebSocket instead of requiring a public URL. This is what makes it easy to run from anywhere.

1. In the left sidebar, go to **Socket Mode**
2. Toggle **Enable Socket Mode** on
3. You'll be prompted to create an app-level token — name it `socket` (or anything)
4. Under **Scopes**, add `connections:write`
5. Click **Generate**
6. Copy the token that starts with `xapp-` — this is your `SLACK_APP_TOKEN`

## 3. Set Bot Token Scopes

1. In the left sidebar, go to **OAuth & Permissions**
2. Scroll down to **Scopes > Bot Token Scopes**
3. Add these scopes:

| Scope | What it's for |
|-------|--------------|
| `chat:write` | Send messages |
| `commands` | Respond to slash commands |
| `files:write` | Upload diagram PNGs |
| `app_mentions:read` | Respond when @mentioned |
| `im:history` | Read DMs sent to the bot |
| `reactions:read` | Capture thumbs-up/down feedback on AI responses |

4. Scroll up and click **Install to Workspace** (or **Reinstall** if already installed)
5. Authorize the app
6. Copy the **Bot User OAuth Token** that starts with `xoxb-` — this is your `SLACK_BOT_TOKEN`

## 4. Register Slash Commands

1. In the left sidebar, go to **Slash Commands**
2. Click **Create New Command** for each command below

For every command, set the **Request URL** to anything (Socket Mode ignores it, but the field is required — `https://localhost` works). Fill in the **Command** and **Short Description**:

| Command | Short Description |
|---------|------------------|
| `/xc-help` | List all commands |
| `/xc-whoami` | Bot identity and access |
| `/xc-ns` | Namespace summary |
| `/xc-list` | List resources by type |
| `/xc-lb` | Load balancer detail |
| `/xc-diagram` | LB chain diagram |
| `/xc-certs` | Certificate expiration scan |
| `/xc-origins` | Origin pool servers |
| `/xc-waf` | WAF status |
| `/xc-policies` | Service policies on an LB |
| `/xc-bot` | Bot defense status |
| `/xc-api-sec` | API security status |
| `/xc-event` | Explain a security event |
| `/xc-quota` | Quota utilization |
| `/xc-ask` | Ask the AI Assistant |
| `/xc-suggest` | AI LB suggestions |
| `/xc-sites` | All sites with health |
| `/xc-site` | Single site detail |
| `/xc-dns` | DNS zones |
| `/xc-alerts` | Alert policies |

You don't have to register all of them — the bot works with whatever subset you add. Natural language queries (@mentions and DMs) work regardless of which slash commands are registered.

## 5. Subscribe to Events

1. In the left sidebar, go to **Event Subscriptions**
2. Toggle **Enable Events** on
3. Under **Subscribe to bot events**, add:

| Event | What it's for |
|-------|--------------|
| `app_mention` | Respond to @mentions in channels |
| `message.im` | Respond to direct messages |
| `reaction_added` | Capture feedback reactions on AI responses |

4. Click **Save Changes**

## 6. Allow DMs (Optional but Recommended)

1. In the left sidebar, go to **App Home**
2. Scroll to **Show Tabs**
3. Toggle **Messages Tab** on
4. Check **Allow users to send Slash commands and messages from the messages tab**

This lets users DM the bot directly with natural language queries.

## 7. Create an F5 XC API Token

1. Log into your F5 Distributed Cloud console
2. Click your profile icon (top right) > **Account Settings**
3. Go to **Credentials** > **API Credentials**
4. Click **Create Credentials**
5. Choose **API Token** as the credential type
6. Give it a name (e.g. `chatops-bot`) and set an expiration
7. Click **Generate**
8. Copy the token — this is your `F5XC_API_TOKEN`

**Recommended:** Use a service account with read-only access. The bot only needs `GET` requests to read resources. The AI Assistant features (`/xc-ask`, `/xc-event`, `/xc-suggest`) additionally use `PUT` to send queries, but never modify tenant configuration.

Your `F5XC_API_URL` is your tenant console URL, e.g. `https://acme.console.ves.volterra.io`.

## 8. Configure Environment

Copy the example file and fill in the four required values:

```bash
cp .env.example .env
```

Edit `.env`:

```
F5XC_API_URL=https://your-tenant.console.ves.volterra.io
F5XC_API_TOKEN=your-api-token-here
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
```

Optional tuning:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `CACHE_WARM_TTL` | `300` | Seconds to cache frequently-changing data |
| `CACHE_STATIC_TTL` | `3600` | Seconds to cache rarely-changing data (namespaces, roles) |
| `NLP_THRESHOLD` | `0.65` | Confidence threshold for natural language intent matching |
| `PORT` | `3000` | Health endpoint port |

## 9. Run the Bot

### With Docker (recommended)

```bash
docker compose up -d
```

Check that it started:

```bash
docker compose logs -f
```

You should see:
```
{"level":"info","message":"Fetching whoami..."}
{"level":"info","message":"whoami complete","tenant":"acme","namespaces":5,...}
{"level":"info","message":"Loaded 21 commands"}
{"level":"info","message":"NLP trained",...}
{"level":"info","message":"Bot started",...}
```

### Without Docker

```bash
npm install
npm start
```

### Health Check

The bot exposes a health endpoint at `http://localhost:3000/healthz` (or whatever `PORT` is set to). It returns JSON with uptime, tenant name, loaded command count, and cache stats.

## Verify It Works

1. In Slack, type `/xc-whoami` in any channel the bot is in
2. You should see the bot's identity, accessible namespaces, and roles
3. Try a natural language query — DM the bot: *"what's in the prod namespace"*

## Troubleshooting

**Bot starts but slash commands don't respond:**
- Make sure Socket Mode is enabled and `SLACK_APP_TOKEN` starts with `xapp-`
- Verify each slash command is registered in App Settings > Slash Commands
- Reinstall the app to the workspace after adding scopes or commands

**"Authentication failed" errors:**
- The F5 XC API token may have expired — generate a new one
- Check that `F5XC_API_URL` matches your tenant (no trailing slash)

**"Permission denied" errors:**
- The API token's service account may lack access to the namespace you're querying

**Bot doesn't respond to @mentions or DMs:**
- Verify the event subscriptions (`app_mention`, `message.im`) are added
- Make sure the bot has been invited to the channel where you're @mentioning it

**Diagram commands fail:**
- The Docker image includes Chromium for rendering. If running without Docker, install Chromium and ensure `npx mmdc` works
