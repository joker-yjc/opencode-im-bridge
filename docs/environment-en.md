# Environment & Configuration

`opencode-lark` supports multiple configuration methods. The priority order is: **CLI Arguments > Environment Variables > `opencode-lark.jsonc` Config File > Defaults**.

## 1. Environment Variables (.env)

Create a `.env` file in the project root (refer to `.env.example`).

### Core Settings
| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENCODE_SERVER_URL` | No | `http://localhost:4096` | URL of the opencode server |
| `OPENCODE_CWD` | No | `process.cwd()` | Working directory for session discovery |
| `LOG_LEVEL` | No | `info` | Log level (debug, info, warn, error) |

### Feishu
| Variable | Required | Description |
|---|---|---|
| `FEISHU_APP_ID` | Yes* | Feishu App ID |
| `FEISHU_APP_SECRET` | Yes* | Feishu App Secret |
| `FEISHU_WEBHOOK_PORT` | No | Port for Webhook mode (default: 3001) |

### QQ Bot
| Variable | Required | Description |
|---|---|---|
| `QQ_APP_ID` | Yes* | QQ Bot App ID |
| `QQ_SECRET` | Yes* | QQ Bot App Secret |

### Telegram
| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes* | Bot Token from @BotFather |

### Discord
| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Yes* | Bot Token from Discord Developer Portal |

### WeChat
| Variable | Required | Description |
|---|---|---|
| `WECHAT_ENABLED` | Yes* | Set to `true` to enable WeChat |
| `WECHAT_SESSION_FILE` | No | WeChat session file path, default `.opencode-lark/wechat-session.json` |

> \* At least one channel must be configured.

---

## 2. JSONC Configuration

Advanced users can use `opencode-lark.jsonc` for more granular control. Supports comments and `${VAR}` interpolation.

```jsonc
{
  "feishu": {
    "appId": "${FEISHU_APP_ID}",
    "appSecret": "${FEISHU_APP_SECRET}",
    "eventMode": "websocket" // "websocket" is recommended
  },
  "qq": {
    "appId": "${QQ_APP_ID}",
    "secret": "${QQ_SECRET}"
  },
  "cron": {
    "enabled": true,
    "jobsFile": "./data/cron-jobs.json",
    "apiEnabled": true,
    "apiPort": 3005
  },
  "reliability": {
    "proactiveHeartbeatEnabled": false,
    "intervalMs": 300000
  }
}
```

---

## 3. Data Directory

Default data is stored in `./data`:
- `lark-im.db`: SQLite database for session mappings and memory.
- `cron-jobs.json`: Persisted list of cron tasks.
- `attachments/`: Locally downloaded IM attachments (images, files).
