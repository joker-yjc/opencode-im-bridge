# 环境配置 (Environment & Config)

`opencode-lark` 支持多种配置方式，优先级从高到低为：**命令行参数 > 环境变量 > `opencode-lark.jsonc` 配置文件 > 默认值**。

## 1. 环境变量 (.env)

在项目根目录创建 `.env` 文件（可参考 `.env.example`）。

### 基础配置
| 变量名 | 必需 | 默认值 | 说明 |
|---|---|---|---|
| `OPENCODE_SERVER_URL` | 否 | `http://localhost:4096` | opencode server 的访问地址 |
| `OPENCODE_CWD` | 否 | `process.cwd()` | 用于 Session 自动发现的工作目录 |
| `LOG_LEVEL` | 否 | `info` | 日志级别 (debug, info, warn, error) |

### 飞书 (Feishu)
| 变量名 | 必需 | 说明 |
|---|---|---|
| `FEISHU_APP_ID` | 是* | 飞书应用的 App ID |
| `FEISHU_APP_SECRET` | 是* | 飞书应用的 App Secret |
| `FEISHU_WEBHOOK_PORT` | 否 | Webhook 模式下的监听端口 (默认 3001) |

### QQ 机器人
| 变量名 | 必需 | 说明 |
|---|---|---|
| `QQ_APP_ID` | 是* | QQ 机器人的 App ID |
| `QQ_SECRET` | 是* | QQ 机器人的 App Secret |

### Telegram
| 变量名 | 必需 | 说明 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | 是* | 从 @BotFather 获取的 Token |

### Discord
| 变量名 | 必需 | 说明 |
|---|---|---|
| `DISCORD_BOT_TOKEN` | 是* | Discord 开发者门户获取的 Bot Token |

### 微信 (WeChat)
| 变量名 | 必需 | 说明 |
|---|---|---|
| `WECHAT_ENABLED` | 是* | 设为 `true` 启用微信 |
| `WECHAT_SESSION_FILE` | 否 | 微信登录态保存路径，默认 `.opencode-lark/wechat-session.json` |

> \* 至少需要配置一个渠道。

---

## 2. JSONC 配置文件

项目支持使用 `opencode-lark.jsonc` 进行更精细的配置。支持注释和环境变量插值。

```jsonc
{
  "feishu": {
    "appId": "${FEISHU_APP_ID}",
    "appSecret": "${FEISHU_APP_SECRET}",
    "eventMode": "websocket" // 推荐使用 websocket
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

## 3. 数据目录

默认数据存储在项目根目录的 `./data` 下：
- `lark-im.db`: SQLite 数据库，保存会话映射与对话记忆。
- `cron-jobs.json`: 持久化的定时任务列表。
- `attachments/`: 自动下载的 IM 附件（图片、文件）。
