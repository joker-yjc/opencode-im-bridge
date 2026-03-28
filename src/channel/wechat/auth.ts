import fs from "node:fs"
import path from "node:path"
import {
  ILINK_BASE_URL,
  type WechatSession,
} from "./types.js"
import { getQrcode, getQrcodeStatus } from "./client.js"
import { createLogger } from "../../utils/logger.js"

const log = createLogger("wechat-auth")

export function getDefaultSessionFile(): string {
  const cwdBase = process.env["OPENCODE_CWD"] ?? process.cwd()
  return path.resolve(cwdBase, ".opencode-lark", "wechat-session.json")
}

export function getDefaultDataDir(): string {
  const cwdBase = process.env["OPENCODE_CWD"] ?? process.cwd()
  return path.resolve(cwdBase, ".opencode-lark")
}

export function loadSession(sessionFile?: string): WechatSession | null {
  const file = sessionFile ?? getDefaultSessionFile()
  if (!fs.existsSync(file)) return null
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as WechatSession
    if (!data.token || !data.baseUrl) return null
    return data
  } catch {
    return null
  }
}

export function saveSession(session: WechatSession, sessionFile?: string): void {
  const file = sessionFile ?? getDefaultSessionFile()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(file, JSON.stringify(session, null, 2), "utf-8")
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    // chmod not supported on Windows
  }
}

export function clearSession(sessionFile?: string): void {
  const file = sessionFile ?? getDefaultSessionFile()
  try {
    fs.unlinkSync(file)
  } catch {
    // Ignore if file doesn't exist
  }
}

export interface LoginCallbacks {
  onQrcode?: (qrcodeDataUrl: string) => void
  onStatus?: (message: string) => void
}

export async function login(
  baseUrl: string,
  sessionFile: string | undefined,
  callbacks: LoginCallbacks = {},
): Promise<WechatSession> {
  const onStatus = callbacks.onStatus ?? ((msg: string) => log.info(msg))

  onStatus("开始微信扫码登录...")

  const qrResp = await getQrcode(baseUrl)
  log.info(`[DEBUG] getQrcode 响应: qrcode=${qrResp.qrcode?.substring(0, 8)}..., qrcode_img_content 长度=${qrResp.qrcode_img_content?.length ?? 0}`)

  const dataDir = getDefaultDataDir()
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  onStatus(`二维码链接: ${qrResp.qrcode_img_content}`)
  onStatus("请用微信扫描上方二维码或在浏览器中打开链接（5分钟内有效）")

  if (callbacks.onQrcode) {
    if (qrResp.qrcode_img_content.startsWith("http")) {
      callbacks.onQrcode(qrResp.qrcode_img_content)
    } else {
      callbacks.onQrcode(`data:image/png;base64,${qrResp.qrcode_img_content}`)
    }
  }

  onStatus("等待扫码确认...")
  const deadline = Date.now() + 5 * 60 * 1000
  let currentQrcode = qrResp.qrcode
  let refreshCount = 0

  while (Date.now() < deadline) {
    const status = await getQrcodeStatus(baseUrl, currentQrcode)

    log.info(`[DEBUG] QR status: ${JSON.stringify(status)}`)

    if (status.status === "confirmed") {
      onStatus("登录成功！")
      const session: WechatSession = {
        token: status.bot_token!,
        baseUrl: status.baseurl || baseUrl,
        accountId: status.ilink_bot_id!,
        userId: status.ilink_user_id!,
        savedAt: new Date().toISOString(),
      }
      saveSession(session, sessionFile)
      log.info(`Bot ID: ${session.accountId}`)
      return session
    }

    switch (status.status) {
      case "wait":
        process.stdout.write(".")
        break
      case "scaned":
        onStatus("已在微信中点击确认，正在登录...")
        break
      case "expired": {
        refreshCount++
        if (refreshCount > 3) {
          throw new Error("二维码多次过期，请重新运行")
        }
        onStatus(`二维码过期，正在刷新 (${refreshCount}/3)...`)
        const newQr = await getQrcode(baseUrl)
        currentQrcode = newQr.qrcode
        onStatus(`新二维码链接: ${newQr.qrcode_img_content}`)
        if (callbacks.onQrcode) {
          if (newQr.qrcode_img_content.startsWith("http")) {
            callbacks.onQrcode(newQr.qrcode_img_content)
          } else {
            callbacks.onQrcode(`data:image/png;base64,${newQr.qrcode_img_content}`)
          }
        }
        onStatus("请重新扫描上方新二维码")
        break
      }
      default:
        log.warn(`[DEBUG] Unknown status: ${status.status}`)
        break
    }

    await new Promise((r) => setTimeout(r, 1000))
  }

  throw new Error("登录超时，请重新运行")
}

export async function ensureSession(
  sessionFile?: string,
  baseUrl = ILINK_BASE_URL,
  forceLogin = false,
  callbacks: LoginCallbacks = {},
): Promise<WechatSession> {
  if (!forceLogin) {
    const existing = loadSession(sessionFile)
    if (existing) {
      log.info(`已加载微信会话 (Bot: ${existing.accountId})`)
      return existing
    }
  }
  return login(baseUrl, sessionFile, callbacks)
}
