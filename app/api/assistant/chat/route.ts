import Anthropic from "@anthropic-ai/sdk"

import { NextResponse } from "next/server"

import { authorizeApi, canViewCosts } from "@/lib/auth"
import {
  ASSISTANT_MODEL,
  MAX_DETAIL_IDS,
  MAX_HISTORY_TURNS,
  MAX_TOKENS,
  MAX_TOOL_LOOPS,
  type AssistantVariant,
} from "@/lib/assistant/config"
import { getPinnedIndex } from "@/lib/assistant/index-cache"
import type { ProjectIndex } from "@/lib/assistant/index-builder"
import { systemPromptFor } from "@/lib/assistant/system-prompt"
import { PROPOSE_TOOL_NAMES, toolsFor } from "@/lib/assistant/tools"
import { describeProposal, ProposalError } from "@/lib/assistant/proposals"
import type {
  ChatRequestBody,
  ChatWireMessage,
  Proposal,
  StreamEvent,
} from "@/lib/assistant/protocol"

// pg is Node-only, so this cannot run on the edge runtime.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

type ToolUse = { id: string; name: string; input: unknown }
type ToolResult = { toolUseId: string; content: string }

function toAnthropicMessages(
  messages: ChatWireMessage[],
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []

  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.text })
      continue
    }

    if (message.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = []
      if (message.text.trim()) content.push({ type: "text", text: message.text })
      for (const use of message.toolUses) {
        content.push({
          type: "tool_use",
          id: use.id,
          name: use.name,
          input: (use.input ?? {}) as Record<string, unknown>,
        })
      }
      // An assistant turn with no content at all is rejected by the API.
      if (content.length > 0) out.push({ role: "assistant", content })
      continue
    }

    out.push({
      role: "user",
      content: message.results.map((result) => ({
        type: "tool_result" as const,
        tool_use_id: result.toolUseId,
        content: result.content,
      })),
    })
  }

  return out
}

/**
 * `get_detail` is served entirely from the index snapshot, which already carries
 * the long-text fields it exposes. That keeps it a zero-I/O lookup — no database
 * round-trip, and in particular no pg connection held while a model call is in
 * flight (the pool is capped at 5 process-wide).
 */
function runGetDetail(index: ProjectIndex, rawInput: unknown): string {
  const refs = (rawInput as { refs?: unknown })?.refs
  if (!Array.isArray(refs) || refs.length === 0) {
    return "Error: `refs` must be a non-empty array of index refs."
  }

  const lines: string[] = []
  for (const ref of refs.slice(0, MAX_DETAIL_IDS)) {
    const entity = index.entities.get(String(ref))
    if (!entity) {
      lines.push(`${ref}: not found`)
      continue
    }
    const fields = Object.entries(entity.detail)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => `${key}=${value}`)
      .join("|")
    lines.push(`${entity.handle}|${entity.kind}|${fields}`)
  }

  if (refs.length > MAX_DETAIL_IDS) {
    lines.push(`(truncated: max ${MAX_DETAIL_IDS} refs per call)`)
  }

  return lines.join("\n")
}

export async function POST(request: Request) {
  const auth = await authorizeApi("dashboard:view")
  if (auth.response) return auth.response
  const viewer = auth.viewer

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The assistant is not configured — ANTHROPIC_API_KEY is not set." },
      { status: 503 },
    )
  }

  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "No messages supplied." }, { status: 400 })
  }

  const variant: AssistantVariant = canViewCosts(viewer) ? "admin" : "architect"
  const index = await getPinnedIndex(variant, body.indexHash)

  // Trim from the front so the newest turns survive. Tool-result turns must
  // stay adjacent to the assistant turn that produced them, so trimming is done
  // on whole user-turn boundaries.
  const trimmed = body.messages.slice(-MAX_HISTORY_TURNS * 3)
  while (trimmed.length > 0 && trimmed[0].role !== "user") trimmed.shift()

  const client = new Anthropic()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      const conversation = toAnthropicMessages(trimmed)
      let assistantText = ""
      const allToolUses: ToolUse[] = []
      const allToolResults: ToolResult[] = []
      const usage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      }

      try {
        for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop += 1) {
          const response = await client.messages
            .stream({
              model: ASSISTANT_MODEL,
              max_tokens: MAX_TOKENS,
              system: [
                { type: "text", text: systemPromptFor(variant) },
                {
                  type: "text",
                  text: index.text,
                  // One breakpoint, on the last system block. Render order is
                  // tools -> system -> messages, so this single marker caches
                  // the tool schemas and both system blocks together. A second
                  // breakpoint on the last turn would cost a write premium every
                  // turn to cache ~200 tokens — not worth it.
                  cache_control: { type: "ephemeral" },
                },
              ],
              tools: toolsFor(variant),
              messages: conversation,
            })
            .on("text", (delta) => {
              assistantText += delta
              send({ t: "d", v: delta })
            })
            .finalMessage()

          usage.inputTokens += response.usage.input_tokens ?? 0
          usage.outputTokens += response.usage.output_tokens ?? 0
          usage.cacheCreationInputTokens +=
            response.usage.cache_creation_input_tokens ?? 0
          usage.cacheReadInputTokens += response.usage.cache_read_input_tokens ?? 0

          const toolUses = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          )
          if (toolUses.length === 0) break

          for (const use of toolUses) {
            allToolUses.push({ id: use.id, name: use.name, input: use.input })
          }

          const results: Anthropic.ToolResultBlockParam[] = []
          let needsAnotherPass = false

          for (const use of toolUses) {
            let content: string

            if (use.name === "get_detail") {
              content = runGetDetail(index, use.input)
              // The model asked for detail because it does not yet have the
              // answer, so it needs another pass to use what came back.
              needsAnotherPass = true
            } else if (PROPOSE_TOOL_NAMES.has(use.name)) {
              try {
                const proposalValue: Proposal = describeProposal(
                  index,
                  viewer,
                  use.name,
                  use.input,
                )
                send({ t: "p", v: proposalValue })
                // Nothing is written here. Acknowledge so the conversation
                // stays well-formed — an unmatched tool_use block on the next
                // request is a 400 — and so the model does not re-propose.
                content = JSON.stringify({
                  ok: true,
                  status: "shown to the user, awaiting their confirmation",
                })
              } catch (error) {
                if (!(error instanceof ProposalError)) throw error
                content = `Error: ${error.message}`
                // Give the model exactly one chance to correct itself rather
                // than surfacing a broken card.
                needsAnotherPass = true
              }
            } else {
              content = `Error: unknown tool "${use.name}".`
              needsAnotherPass = true
            }

            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content,
            })
            allToolResults.push({ toolUseId: use.id, content })
          }

          if (!needsAnotherPass || loop === MAX_TOOL_LOOPS) break

          conversation.push({ role: "assistant", content: response.content })
          conversation.push({ role: "user", content: results })
        }

        send({
          t: "end",
          v: {
            indexHash: index.hash,
            assistantText,
            toolUses: allToolUses,
            toolResults: allToolResults,
            usage,
          },
        })

        if (process.env.NODE_ENV !== "production") {
          // The one reliable signal that prompt caching is working. A zero read
          // on turn 2 of a conversation means a silent invalidator has crept
          // into the system prompt or the tool array.
          console.log(
            `[assistant] variant=${variant} cache_write=${usage.cacheCreationInputTokens} cache_read=${usage.cacheReadInputTokens} input=${usage.inputTokens} output=${usage.outputTokens}`,
          )
        }
      } catch (error) {
        console.error("[assistant] chat failed", error)
        send({
          t: "e",
          v:
            error instanceof Anthropic.APIError
              ? `The assistant service returned an error (${error.status}).`
              : "The assistant could not complete that request.",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  })
}
