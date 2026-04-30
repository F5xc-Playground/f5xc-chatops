# Setup Guide

This walks through creating a Slack app, generating an F5 XC API token, and running the bot.

## 1. Create the Slack App (Manifest)

The fastest way to set up the Slack app is with the generated manifest. It configures everything — slash commands, scopes, event subscriptions, and Socket Mode — in one step.

1. Generate the manifest from the current command set:

```bash
npm run manifest
```

This reads every command file in `src/commands/` and writes `slack-manifest.json` with all slash commands, scopes, and events pre-configured. Run this again whenever you add or remove commands.

2. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
3. Choose **From an app manifest**
4. Pick your workspace
5. Paste the contents of `slack-manifest.json`
6. Click **Create**

### Get your tokens

After creating the app:

1. Go to **Settings > Basic Information > App-Level Tokens**
2. Click **Generate Token and Scopes**, name it `socket`, add the `connections:write` scope
3. Copy the token that starts with `xapp-` — this is your `SLACK_APP_TOKEN`
4. Go to **OAuth & Permissions** and click **Install to Workspace**
5. Copy the **Bot User OAuth Token** that starts with `xoxb-` — this is your `SLACK_BOT_TOKEN`

### Updating an existing app

If the app already exists and you've added new commands, regenerate the manifest and apply it:

```bash
npm run manifest
```

Then in **Settings > App Manifest**, paste the updated JSON and click **Save Changes**. Slack will show a diff of what changed.

**Important:** The manifest is the single source of truth. Once you use it, make all changes through the manifest (by editing command files and re-running `npm run manifest`), not through the Slack UI. Manual UI edits will be overwritten the next time the manifest is applied.

### Manual setup (alternative)

<details>
<summary>Click to expand manual setup steps</summary>

If you prefer to configure the Slack app manually instead of using the manifest:

**Create the app:**

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**
3. Name it whatever you like (e.g. `XC Bot`) and pick your workspace
4. Click **Create App**

**Enable Socket Mode:**

1. In the left sidebar, go to **Socket Mode**
2. Toggle **Enable Socket Mode** on
3. Create an app-level token — name it `socket`, add `connections:write` scope
4. Copy the `xapp-` token — this is your `SLACK_APP_TOKEN`

**Set bot token scopes** (OAuth & Permissions > Bot Token Scopes):

| Scope | What it's for |
|-------|--------------|
| `chat:write` | Send messages |
| `commands` | Respond to slash commands |
| `files:write` | Upload diagram PNGs |
| `app_mentions:read` | Respond when @mentioned |
| `im:history` | Read DMs sent to the bot |
| `reactions:read` | Capture thumbs-up/down feedback on AI responses |

Install to workspace and copy the `xoxb-` token — this is your `SLACK_BOT_TOKEN`.

**Register slash commands** (Slash Commands > Create New Command for each):

Set the Request URL to `https://localhost` (Socket Mode ignores it). Run `npm run manifest` and check `slack-manifest.json` for the current list of commands and descriptions, or register whichever subset you want.

**Subscribe to events** (Event Subscriptions > Subscribe to bot events):

`app_mention`, `message.im`, `reaction_added`

**Allow DMs** (App Home > Messages Tab > on, allow slash commands and messages)

</details>

You don't have to register all slash commands — the bot works with whatever subset you add. Natural language queries (@mentions and DMs) work regardless of which slash commands are registered.

## 2. Create an F5 XC API Token

1. Log into your F5 Distributed Cloud console
2. Click your profile icon (top right) > **Account Settings**
3. Go to **Credentials** > **API Credentials**
4. Click **Create Credentials**
5. Choose **API Token** as the credential type
6. Give it a name (e.g. `chatops-bot`) and set an expiration
7. Click **Generate**
8. Copy the token — this is your `F5XC_API_TOKEN`

**Recommended:** Use a service account with read-only access. The bot only needs `GET` requests to read resources. The AI Assistant features (`/xc-ask`, `/xc-event`, `/xc-suggest`) and the cross-namespace inventory (`/xc-list` without a namespace) use `POST`, but never modify tenant configuration.

Your `F5XC_API_URL` is your tenant console URL, e.g. `https://acme.console.ves.volterra.io`.

## 3. Environment Variables

The bot is configured entirely through environment variables. How you provide them depends on your deployment method.

### Required

| Variable | Description |
|----------|-------------|
| `F5XC_API_URL` | Your XC tenant URL (e.g. `https://acme.console.ves.volterra.io`) |
| `F5XC_API_TOKEN` | XC API token (read-only access recommended) |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack app-level token for Socket Mode (`xapp-...`) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `CACHE_WARM_TTL` | `300` | Seconds to cache frequently-changing data |
| `CACHE_STATIC_TTL` | `3600` | Seconds to cache rarely-changing data (namespaces, roles) |
| `NLP_THRESHOLD` | `0.75` | Confidence threshold for natural language intent matching |
| `PORT` | `3000` | Health endpoint port |

## 4. Run the Bot

### Docker Compose

Create a `.env` file (see `.env.example`) and run:

```bash
cp .env.example .env    # fill in the four required values
docker compose up -d
docker compose logs -f
```

### Docker

```bash
docker run -d \
  -e F5XC_API_URL=https://acme.console.ves.volterra.io \
  -e F5XC_API_TOKEN=your-token \
  -e SLACK_BOT_TOKEN=xoxb-your-token \
  -e SLACK_APP_TOKEN=xapp-your-token \
  -p 3000:3000 \
  ghcr.io/f5xc-playground/f5xc-chatops:0.5
```

### Kubernetes

Create a Secret with the required variables:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: xc-chatops
type: Opaque
stringData:
  F5XC_API_URL: https://acme.console.ves.volterra.io
  F5XC_API_TOKEN: your-token
  SLACK_BOT_TOKEN: xoxb-your-token
  SLACK_APP_TOKEN: xapp-your-token
```

Reference it in your Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xc-chatops
spec:
  replicas: 1
  selector:
    matchLabels:
      app: xc-chatops
  template:
    metadata:
      labels:
        app: xc-chatops
    spec:
      containers:
        - name: xc-chatops
          image: ghcr.io/f5xc-playground/f5xc-chatops:0.5
          envFrom:
            - secretRef:
                name: xc-chatops
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

Only run one replica — the bot uses Socket Mode, so multiple instances would receive duplicate events.

### Node.js (local development)

```bash
npm install
npm start
```

### Successful Startup

Regardless of deployment method, you should see these log lines:

```
{"level":"info","message":"Fetching whoami..."}
{"level":"info","message":"whoami complete","tenant":"acme","namespaces":5,...}
{"level":"info","message":"Loaded 23 commands"}
{"level":"info","message":"NLP trained",...}
{"level":"info","message":"Bot started",...}
```

### Health Check

The bot exposes `GET /healthz` on the configured `PORT` (default 3000). It returns JSON with uptime, tenant name, loaded command count, and cache stats. Use this for liveness probes and monitoring.

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
