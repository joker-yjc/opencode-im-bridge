[中文版](README.zh-CN.md)

# opencode-im-bridge

> Bridge Feishu\QQ\Telegram\Discord\WeChat chats to opencode TUI sessions with real-time two-way messaging.

![CI](https://github.com/ET06731/opencode-im-bridge/actions/workflows/ci.yml/badge.svg)
![npm](https://img.shields.io/npm/v/opencode-im-bridge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## Features

- **Real-time bridging** — Messages sent in Feishu arrive in your opencode TUI instantly. Agent replies stream back as live-updating cards with **Markdown rendering support** (headings, lists, code blocks, etc.).
- **Multi-channel support** — Now supports bridging QQ, Telegram, Discord, and WeChat messages via official platform APIs. WeChat uses Tencent's official `@wechatbot/wechatbot` SDK with QR code login.
- **Interactive cards** — Agent questions and permission requests appear as clickable Feishu cards. Answer or approve directly from the chat — no need to switch to the TUI. (Currently supported primarily for Feishu)
- **WebSocket connection** — Uses Feishu's long-lived WebSocket mode. No webhook polling, no public IP required.
- **SSE streaming** — Consumes the opencode SSE event stream and debounces card updates to stay within rate limits.
- **Conversation memory** — SQLite-backed per-thread history is prepended to each message, giving the agent context across turns.
- **Session auto-discovery** — Finds and binds to the latest opencode TUI session for a working directory. Survives restarts.
- **Graceful recovery** — Reconnects to the opencode server with exponential backoff (up to 10 attempts) on startup.
- **Extensible channel layer** — `ChannelPlugin` interface lets you add any platform without touching core logic.
- **File and image support** — Handles image and file messages (not just text). Downloads attachments to `${OPENCODE_CWD}/.opencode-im-bridge/attachments/` and forwards the local path to opencode for analysis. 50 MB size limit, streaming download, filename sanitization included.

---

### Supported Message Types

| Message Type | Feishu | QQ | Telegram | Discord | WeChat | Notes |
|---|---|---|---|---|---|---|
| `text` | ✅ | ✅ | ✅ | ✅ | ✅ | Plain text messages |
| `post` | ✅ | ✅ | ❌ | ❌ | ❌ | Rich text / multi-paragraph |
| `image` | ✅ | ✅ | ✅ | ✅ | ✅ | Photos and screenshots |
| `file` | ✅ | ✅ | ✅ | ✅ | ✅ | Documents, code files |
| `audio` | ✅ | ✅ | ✅ | ✅ | ✅ | Voice messages with transcription |
| `video` | ✅ | ✅ | ✅ | ✅ | ✅ | Video messages |
| `sticker` | ❌ | ❌ | ❌ | ❌ | ❌ | Not supported |

> ⏳ = In development

Downloaded files are saved to `${OPENCODE_CWD}/.opencode-lark/attachments/` (falls back to the system temp directory if that path isn't writable).

### Platform Comparison

| Platform | Protocol | Auth | Markdown | Rich Media | Streaming |
|----------|----------|------|----------|------------|-----------|
| Feishu | WebSocket | App ID + Secret | ✅ | ✅ Cards | ✅ Cards |
| QQ | WebSocket | App ID + Secret | ✅ | ✅ | ❌ |
| Telegram | HTTP Bot API | Bot Token | ✅ | ✅ | ❌ |
| Discord | HTTP Bot API | Bot Token | ✅ | ✅ | ❌ |
| WeChat | HTTP Long Polling | QR Code | ✅ | ✅ | ❌ |

#### Slash Commands

Type slash commands directly in the chat to manage opencode sessions:
- `/new`: Create a new session (and bind it to the current chat)
- `/sessions`: List recent sessions and current bound status (Interactive card in Feishu, text list in QQ)
- `/connect {session_id}`: Connect/bind the current chat to a specific historical session
- `/compact`: Compact context history (equivalent to `session.compact`)
- `/share`: Share the current session (equivalent to `session.share`)
- `/abort`: Abort the currently executing task
- `/model` or `/models`: Switch model (Interactive card with dropdown pagination in Feishu)
- `/agent`: Switch agent (Interactive card in Feishu)
- `/status`: View current status (server, model, session, context usage, etc.)
- `/help` or `/`: Show the command help menu

![Slash Commands Demo](screenshot/slash.png)

---

## Install

> **Note**: [Bun](https://bun.sh) is the required runtime — this project uses `bun:sqlite` which is Bun-only.

```bash
# Global install
npm install -g opencode-im-bridge
# or
bun add -g opencode-im-bridge
```

Or clone and run from source:

```bash
git clone https://github.com/ET06731/opencode-im-bridge.git
cd opencode-im-bridge
bun install
```

---

## Quick Start

Get up and running in 5 minutes. You'll need a Feishu Open Platform app with bot capability — see [Feishu App Setup](#feishu-app-setup) below for the detailed walkthrough if you haven't created one yet.

### Prerequisites

- **[Bun](https://bun.sh)** (required runtime — this project uses `bun:sqlite` which is Bun-only)
- **[opencode](https://opencode.ai)** installed locally
- A **Feishu Open Platform app** or **QQ Official Bot** with credentials (see setup guides below)

### Steps

**1. Install**

```bash
bun add -g opencode-im-bridge
# or: npm install -g opencode-im-bridge
```

**2. Start opencode server**

```bash
# macOS / Linux
OPENCODE_SERVER_PORT=4096 opencode serve

# Windows (PowerShell)
$env:OPENCODE_SERVER_PORT=4096; opencode serve
```

**3. Start opencode-im-bridge**

In a second terminal:

```bash
opencode-im-bridge
```

On first run with no configuration, an interactive setup wizard guides you through:
- Selecting channels (Feishu, QQ, Telegram, Discord, WeChat, or all)
- Entering your platform App ID and App Secret/Token (masked input)
- Validating the opencode server connection
- Saving credentials to corresponding `.env.{appId}` files

The service starts automatically after setup completes.

> **Tip**: To re-run the wizard later, use `opencode-im-bridge init`.
>
> To configure manually instead, create a `.env` file with relevant credentials before starting:
> - Feishu: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`
> - QQ: `QQ_APP_ID`, `QQ_SECRET`
> - Telegram: `TELEGRAM_BOT_TOKEN`
> - Discord: `DISCORD_BOT_TOKEN`
> - WeChat: `WECHAT_ENABLED=true`

**4. Send a test message**

Send any message to your Feishu bot. On first contact it auto-discovers the latest TUI session and replies:

> Connected to session: ses_xxxxx

After that, Feishu and the TUI share a live two-way channel. To attach the TUI:
```bash
opencode attach http://127.0.0.1:4096 --session {session_id}
```
The `session_id` is shown in opencode-im-bridge's startup logs (e.g. `Bound to TUI session: ... → ses_xxxxx`).

---

## Bot Configuration

We support multiple platforms including Feishu, QQ, Telegram, and Discord.

👉 **[Read the Bot Configuration Guide](docs/CONFIGURATION.md)**

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FEISHU_APP_ID` | no | | Feishu App ID |
| `FEISHU_APP_SECRET` | no | | Feishu App Secret |
| `QQ_APP_ID` | no | | QQ App ID |
| `QQ_SECRET` | no | | QQ App Secret |
| `TELEGRAM_BOT_TOKEN` | no | | Telegram Bot Token |
| `DISCORD_BOT_TOKEN` | no | | Discord Bot Token |
| `WECHAT_ENABLED` | no | | Set to `true` to enable WeChat |
| `WECHAT_SESSION_FILE` | no | `.opencode-lark/wechat-session.json` | WeChat session file path |
| `OPENCODE_SERVER_URL` | no | `http://localhost:4096` | opencode server URL |
| `FEISHU_WEBHOOK_PORT` | no | `3001` | HTTP webhook fallback port (only needed if not using WebSocket for card callbacks) |
| `OPENCODE_CWD` | no | `process.cwd()` | Override session discovery directory |
| `FEISHU_VERIFICATION_TOKEN` | no | | Event subscription verification token |
| `FEISHU_ENCRYPT_KEY` | no | | Event encryption key |

### JSONC Config

`opencode-im-bridge.jsonc` (gitignored; copy from `opencode-im-bridge.example.jsonc`):
(also supports `opencode-lark.jsonc` and `opencode-feishu.jsonc` for backward compatibility)

```jsonc
// opencode-im-bridge.jsonc
{
  "feishu": {
    "appId": "${FEISHU_APP_ID}",
    "appSecret": "${FEISHU_APP_SECRET}",
    "verificationToken": "${FEISHU_VERIFICATION_TOKEN}",
    "webhookPort": 3001,
    "encryptKey": "${FEISHU_ENCRYPT_KEY}"
  },
  "qq": {
    "appId": "${QQ_APP_ID}",
    "secret": "${QQ_SECRET}",
    "sandbox": false
  },
  "wechat": {
    "enabled": true,
    "sessionFile": "./data/wechat-session.json"
  },
  // Default opencode agent name. This should match an agent configured in your opencode setup.
  // Common values: "build", "claude", "code" — check your opencode config for available agents.
  "defaultAgent": "build",
  "dataDir": "./data",
  "progress": {
    "debounceMs": 500,
    "maxDebounceMs": 3000
  },
  "messageDebounceMs": 10000
}
```

Supports `${ENV_VAR}` interpolation and JSONC comments. If no config file is found, the app builds a default config from `.env` values directly.

### WeChat Configuration

WeChat uses Tencent's official **`@wechatbot/wechatbot` SDK**, with a different authentication flow:

**Enable WeChat:**
```bash
export WECHAT_ENABLED=true
# or in config
"wechat": { "enabled": true }
```

**Login Flow:**
1. On first run, a QR code is displayed in the terminal
2. Open WeChat → Settings → ClawBot
3. Click "Connect" and scan the QR code
4. Session is saved to `wechat-session.json`

**Technical Details:**
- HTTP long polling (35s timeout) for receiving messages
- `context_token` for message correlation and replies
- Supports text, images, voice (with transcription), files

> **Note**: If the QR code scan fails, use the QR Code URL printed in the console to complete the binding directly.

---

## Lark MCP Tools

opencode-im-bridge pairs with [lark-openapi-mcp](https://github.com/larksuite/lark-openapi-mcp) to give the opencode agent direct access to Feishu's cloud document ecosystem — read/write docs, upload files, query Bitable tables, and search the wiki, all from within a single conversation.

### Supported Capabilities

| Category | Capabilities |
|----------|-------------|
| **Docs** (docx) | Create doc, write Markdown, read Markdown, get raw text content, search docs, import file as doc |
| **Drive** | Upload local file to cloud drive, download file from cloud drive |
| **Bitable** | Create Bitable app, manage tables, list fields, record CRUD |
| **Messaging** (im) | List chats the bot belongs to, get chat members |
| **Wiki** | Search wiki nodes, get node details |

### Required User Scopes

When calling tools with `user_access_token` (i.e. `useUAT: true`), enable the following scopes in **Permissions & Scopes** in the Feishu Open Platform console:

| Scope | Purpose |
|-------|---------|
| `drive:drive` | Cloud drive read/write |
| `docx:document` | Document read/write |
| `bitable:app` | Bitable CRUD |
| `im:chat:readonly` | Query chat/group info |
| `wiki:wiki:readonly` | Wiki search and read |

### Configuration

Add a `lark-mcp` entry to the `mcp` section of your opencode config (`~/.config/opencode/config.json`):

```jsonc
{
  "mcp": {
    "lark-mcp": {
      "type": "local",
      "command": ["node", "/path/to/lark-openapi-mcp/dist/cli.js", "mcp", "-a", "${FEISHU_APP_ID}", "-s", "${FEISHU_APP_SECRET}", "--oauth", "--token-mode", "user_access_token", "-l", "zh"],
      "enabled": true
    }
  }
}
```

> **Note**: Pass `--token-mode user_access_token` to call tools on behalf of a user (required for drive uploads, wiki operations, etc.). Replace `/path/to/lark-openapi-mcp` with the actual install path after cloning/installing the package.

---

## Project Structure

```
src/
├── index.ts         # Entry point, 9-phase startup + graceful shutdown
├── types.ts         # Shared type definitions
├── channel/         # ChannelPlugin interface, ChannelManager, FeishuPlugin
├── feishu/          # Feishu REST client, CardKit, WebSocket, message dedup
├── handler/         # MessageHandler (inbound pipeline) + StreamingBridge (SSE → cards)
├── session/         # TUI session discovery, thread→session mapping, progress cards
├── streaming/       # EventProcessor (SSE parsing), SessionObserver, SubAgentTracker
├── cron/            # CronService (scheduled jobs) + HeartbeatService
├── utils/           # Config loader, logger, SQLite init, EventListenerMap
```

---

## Development

```bash
bun run dev          # Watch mode, auto-restart on changes
bun run start        # Production mode
bun run test:run     # Run all tests (vitest)
bun run build        # Compile TypeScript to dist/
```

> **Note:** Use `bun run test:run` rather than `bun test`. The latter picks up both `src/` and `dist/` test files; `vitest` is configured to scope to `src/` only.

---

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines on issues, pull requests, and code style.

---

## Acknowledgements

The development for this project were made reference to the following open-source projects:

- [guazi04/opencode-lark](https://github.com/guazi04/opencode-lark)
- [op7418/Claude-to-IM-skill](https://github.com/op7418/Claude-to-IM-skill)

---
## License

[MIT](LICENSE) © 2026 opencode-im-bridge contributors
