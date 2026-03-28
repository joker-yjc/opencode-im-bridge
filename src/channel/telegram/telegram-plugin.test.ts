import { beforeEach, describe, expect, it, vi } from "vitest"
import { TelegramPlugin, mdToMarkdownV2, createTelegramInlineCard } from "./telegram-plugin.js"
import { createMockLogger } from "../../__tests__/setup.js"

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
}))

function createPlugin(overrides: Partial<ConstructorParameters<typeof TelegramPlugin>[0]> = {}) {
  return new TelegramPlugin({
    appConfig: {
      defaultAgent: "build",
      telegram: {
        botToken: "token",
        allowedChatIds: [],
      },
    } as any,
    logger: createMockLogger(),
    ...overrides,
  })
}

describe("TelegramPlugin", () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as any
    vi.clearAllMocks()
  })

  it("normalizes message updates", () => {
    const plugin = createPlugin()
    const normalized = plugin.messaging.normalizeInbound({
      update_id: 1,
      message: {
        message_id: 12,
        chat: { id: 42 },
        from: { id: 7, first_name: "Ada" },
        text: "/help",
        date: 1_700_000_000,
      },
    })

    expect(normalized).toMatchObject({
      messageId: "12",
      senderId: "7",
      chatId: "42",
      text: "/help",
    })
  })

  it("normalizes callback query messages", () => {
    const plugin = createPlugin()
    const normalized = plugin.messaging.normalizeInbound({
      update_id: 2,
      callback_query: {
        id: "cb-1",
        from: { id: 7, first_name: "Ada" },
        data: "tg1|cmd|/new",
        message: {
          message_id: 33,
          chat: { id: 42 },
          text: "prompt",
          date: 1_700_000_001,
        },
      },
    })

    expect(normalized).toMatchObject({
      messageId: "33",
      senderId: "7",
      chatId: "42",
      text: "prompt",
    })
  })

  it("sends InlineKeyboard payloads via sendCard", async () => {
    const plugin = createPlugin()
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    })

    const card = createTelegramInlineCard("Choose", [[{
      text: "Connect",
      payload: { action: "cmd", command: "/connect ses-1" },
    }]])

    await plugin.outbound.sendCard!({ address: "42" }, card)

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/sendMessage",
      expect.objectContaining({
        method: "POST",
      }),
    )
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string)
    expect(body.reply_markup.inline_keyboard[0][0]).toMatchObject({
      text: "Connect",
      callback_data: "tg1|cmd|/connect ses-1",
    })
  })

  it("handles command callback queries by acknowledging and routing to onMessage", async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined)
    const plugin = createPlugin({ onMessage })
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: true }),
    })

    await (plugin as any).handleCallbackQuery({
      id: "cb-1",
      from: { id: 7, first_name: "Ada" },
      data: "tg1|cmd|/new",
      message: {
        message_id: 33,
        chat: { id: 42 },
        text: "ignored",
        date: 1_700_000_001,
      },
    })

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: "42",
      message: expect.objectContaining({
        content: JSON.stringify({ text: "/new" }),
      }),
      _channelId: "telegram",
    }))
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/answerCallbackQuery",
      expect.any(Object),
    )
  })

  it("handles permission callback queries by routing to onCardAction", async () => {
    const onCardAction = vi.fn().mockResolvedValue(undefined)
    const plugin = createPlugin({ onCardAction })
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: true }),
    })

    await (plugin as any).handleCallbackQuery({
      id: "cb-2",
      from: { id: 7, first_name: "Ada" },
      data: "tg1|pr|req-1|once",
      message: {
        message_id: 33,
        chat: { id: 42 },
        text: "ignored",
        date: 1_700_000_001,
      },
    })

    expect(onCardAction).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({
        value: expect.objectContaining({
          action: "permission_reply",
          requestId: "req-1",
          reply: "once",
        }),
      }),
      open_chat_id: "42",
    }))
  })

  it("renders markdown to Telegram MarkdownV2", () => {
    const md = mdToMarkdownV2("**bold**\n_italic_\n[link](https://example.com)\n```ts\nconst x = 1\n```")
    expect(md).toContain("*bold*")
    expect(md).toContain("_italic_")
    expect(md).toContain("[link](")
    expect(md).toContain("```ts")
    expect(md).toContain("const x = 1")
  })

  it("sends file via sendDocument API", async () => {
    const plugin = createPlugin()
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    })

    await plugin.outbound.sendFile!({ address: "42" }, "F:/test/document.pdf")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/sendDocument",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })
})
