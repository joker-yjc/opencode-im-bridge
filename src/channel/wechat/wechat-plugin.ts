import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { WeChatBot, type IncomingMessage } from "@wechatbot/wechatbot"
import QRCode from "qrcode"
import { BaseChannelPlugin } from "../base-plugin.js"
import type {
  ChannelId,
  ChannelMeta,
  ChannelConfigAdapter,
  ChannelGatewayAdapter,
  ChannelMessagingAdapter,
  ChannelOutboundAdapter,
  ChannelStreamingAdapter,
  NormalizedMessage,
  OutboundMessage,
  OutboundTarget,
  StreamTarget,
  StreamingSession,
  ThreadKey,
} from "../types.js"
import type { AppConfig } from "../../utils/config.js"
import type { Logger } from "../../utils/logger.js"

export interface WechatPluginDeps {
  appConfig: AppConfig
  logger: Logger
  onMessage?: (event: any) => Promise<void>
}

export class WechatPlugin extends BaseChannelPlugin {
  override id = "wechat" as ChannelId
  override meta: ChannelMeta = {
    id: "wechat" as ChannelId,
    label: "WeChat",
    description: "微信 iLink Bot API channel integration (via @wechatbot/wechatbot)",
  }

  private readonly appConfig: AppConfig
  private readonly logger: Logger
  private bot: WeChatBot | null = null

  override config: ChannelConfigAdapter
  override gateway: ChannelGatewayAdapter
  override messaging: ChannelMessagingAdapter
  override outbound: ChannelOutboundAdapter
  override streaming: ChannelStreamingAdapter
  override threading: {
    resolveThread: (inbound: NormalizedMessage) => ThreadKey
    mapSession: (threadKey: ThreadKey, sessionId: string) => void
    getSession: (threadKey: ThreadKey) => string | null
  }

  private readonly _threadMap = new Map<ThreadKey, string>()

  constructor(deps: WechatPluginDeps) {
    super()
    this.appConfig = deps.appConfig
    this.logger = deps.logger

    const wechatConfig = deps.appConfig.wechat
    if (!wechatConfig?.enabled) {
      throw new Error("WeChat config is missing or disabled but WechatPlugin was instantiated")
    }

    this.config = {
      listAccountIds: () => ["default"],
      resolveAccount: (_id: string) => this.appConfig,
    }

    this.gateway = {
      startAccount: async (_accountId: string, signal: AbortSignal): Promise<void> => {
        const wechatConfig = this.appConfig.wechat!

        this.bot = new WeChatBot({
          storage: "file",
          storageDir: wechatConfig.sessionFile
            ? this.getDirName(wechatConfig.sessionFile)
            : undefined,
          logLevel: "info",
        })

        try {
          await this.bot.login({
            callbacks: {
              onQrUrl: async (url: string) => {
                this.logger.info(`[WechatPlugin] QR Code URL: ${url}`)
                console.log("\n" + "=".repeat(60))
                console.log("  请使用微信扫描下方二维码登录")
                console.log("  (二维码链接有效期5分钟)")
                console.log("=".repeat(60))

                // 生成ASCII二维码
                try {
                  const asciiQR = await QRCode.toString(url, {
                    type: 'terminal',
                    small: true,
                    margin: 2,
                    width: 40
                  })
                  console.log(asciiQR)
                } catch (err) {
                  // 如果ASCII生成失败，只显示链接
                }

                // 始终显示链接（终端二维码可能无法扫描）
                console.log(`\n  📎 链接: ${url}\n`)
                console.log("  💡 提示: 如果终端二维码无法扫描，请复制上方链接到微信")
                console.log("          然后在微信中访问该链接进行登录\n")
                console.log("=".repeat(60) + "\n")
              },
              onScanned: () => {
                this.logger.info(`[WechatPlugin] QR Code scanned, please confirm on device`)
                console.log("  ✓ 已扫描，请在微信中点击确认")
              },
              onExpired: () => {
                this.logger.warn(`[WechatPlugin] QR Code expired, please try again`)
                console.log("  ⚠ 二维码已过期，请重新运行")
              },
            },
          })
          this.logger.info(`[WechatPlugin] Login successful`)
        } catch (err) {
          this.logger.error(`[WechatPlugin] Login failed: ${err}`)
          throw err
        }

        this.bot.onMessage(async (msg: IncomingMessage) => {
          this.logger.info(`[WechatPlugin] Received message: userId=${msg.userId}, type=${msg.type}, text="${msg.text}"`)

          if (deps.onMessage) {
            const event = {
              event_id: msg.raw.message_id?.toString() || crypto.randomUUID(),
              event_type: "message",
              chat_id: msg.userId,
              chat_type: "p2p",
              message_id: msg.raw.message_id?.toString() || crypto.randomUUID(),
              sender: {
                sender_id: { open_id: msg.userId },
                sender_type: "user",
                tenant_key: "wechat",
              },
              message: {
                message_type: msg.type,
                content: JSON.stringify({
                  text: msg.text,
                  context_token: msg._contextToken,
                }),
              },
              _channelId: "wechat",
              _rawMessage: msg,
            }
            this.logger.info(`[WechatPlugin] Calling onMessage handler...`)
            try {
              await deps.onMessage(event)
              this.logger.info(`[WechatPlugin] onMessage handler completed`)
            } catch (err) {
              this.logger.error(`[WechatPlugin] onMessage handler error: ${err}`)
            }
          } else {
            this.logger.warn(`[WechatPlugin] onMessage not configured`)
          }
        })

        if (signal.aborted) {
          this.logger.info("[WechatPlugin] Aborted before starting polling")
          return
        }

        try {
          await this.bot.start()
          this.logger.info("[WechatPlugin] Message polling started")
        } catch (err) {
          this.logger.error(`[WechatPlugin] Failed to start polling: ${err}`)
          throw err
        }

        signal.addEventListener("abort", () => {
          this.logger.info("[WechatPlugin] Stopping message polling...")
          this.bot?.stop()
        })
      },
    }

    this.messaging = {
      normalizeInbound: (raw: any): NormalizedMessage => {
        const msg = raw._rawMessage as IncomingMessage
        return {
          messageId: msg.raw.message_id?.toString() || "",
          senderId: msg.userId,
          text: msg.text,
          chatId: msg.userId,
          threadId: msg.userId,
          timestamp: msg.timestamp.getTime(),
          messageType: msg.type,
        }
      },

      formatOutbound: (msg: OutboundMessage): unknown => {
        return msg.text
      },
    }

    this.outbound = {
      sendText: async (target: OutboundTarget, text: string): Promise<void> => {
        if (!this.bot) {
          this.logger.error("[WechatPlugin] Bot not initialized")
          return
        }

        try {
          await this.bot.send(target.address, text)
        } catch (err) {
          this.logger.error(`[WechatPlugin] Failed to send text: ${err}`)
          throw err
        }
      },

      sendImage: async (target: OutboundTarget, filePath: string): Promise<void> => {
        if (!this.bot) {
          this.logger.error("[WechatPlugin] Bot not initialized")
          return
        }

        try {
          const buffer = await readFile(filePath)
          await this.bot.send(target.address, { image: buffer })
          this.logger.info(`[WechatPlugin] Image sent to ${target.address}: ${filePath}`)
        } catch (err) {
          this.logger.error(`[WechatPlugin] Failed to send image: ${err}`)
          throw err
        }
      },

      sendFile: async (target: OutboundTarget, filePath: string): Promise<void> => {
        if (!this.bot) {
          this.logger.error("[WechatPlugin] Bot not initialized")
          return
        }

        try {
          const buffer = await readFile(filePath)
          const fileName = basename(filePath)
          await this.bot.send(target.address, { file: buffer, fileName })
          this.logger.info(`[WechatPlugin] File sent to ${target.address}: ${filePath}`)
        } catch (err) {
          this.logger.error(`[WechatPlugin] Failed to send file: ${err}`)
          throw err
        }
      },

      sendAudio: async (target: OutboundTarget, filePath: string): Promise<void> => {
        if (!this.bot) {
          this.logger.error("[WechatPlugin] Bot not initialized")
          return
        }

        try {
          const buffer = await readFile(filePath)
          const fileName = basename(filePath)
          await this.bot.send(target.address, { file: buffer, fileName })
          this.logger.info(`[WechatPlugin] Audio sent to ${target.address}: ${filePath}`)
        } catch (err) {
          this.logger.error(`[WechatPlugin] Failed to send audio: ${err}`)
          throw err
        }
      },

      sendVideo: async (target: OutboundTarget, filePath: string): Promise<void> => {
        if (!this.bot) {
          this.logger.error("[WechatPlugin] Bot not initialized")
          return
        }

        try {
          const buffer = await readFile(filePath)
          await this.bot.send(target.address, { video: buffer })
          this.logger.info(`[WechatPlugin] Video sent to ${target.address}: ${filePath}`)
        } catch (err) {
          this.logger.error(`[WechatPlugin] Failed to send video: ${err}`)
          throw err
        }
      },

      sendTyping: async (target: OutboundTarget): Promise<void> => {
        if (!this.bot) {
          this.logger.error("[WechatPlugin] Bot not initialized")
          return
        }

        try {
          await this.bot.sendTyping(target.address)
          this.logger.info(`[WechatPlugin] Typing status sent to ${target.address}`)
        } catch (err) {
          this.logger.error(`[WechatPlugin] sendTyping failed: ${err}`)
        }
      },
    }

    this.streaming = {
      createStreamingSession: (target: StreamTarget): StreamingSession => {
        const sessionId = `wechat_stream_${Date.now()}`
        const session: StreamingSession = {
          sessionId,
          target,
          pendingUpdates: [],
          createdAt: Date.now(),
          flush: async () => { },
        }
        return session
      },
    }

    this.threading = {
      resolveThread: (inbound: NormalizedMessage): ThreadKey => {
        return inbound.chatId as ThreadKey
      },
      mapSession: (threadKey: ThreadKey, sessionId: string): void => {
        this._threadMap.set(threadKey, sessionId)
      },
      getSession: (threadKey: ThreadKey): string | null => {
        return this._threadMap.get(threadKey) ?? null
      },
    }
  }

  private getDirName(filePath: string): string {
    const parts = filePath.replace(/\\/g, "/").split("/")
    parts.pop()
    return parts.join("/") || "."
  }
}
