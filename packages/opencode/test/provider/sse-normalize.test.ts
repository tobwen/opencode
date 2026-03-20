import { test, expect } from "bun:test"
import { Provider } from "../../src/provider/provider"

const thinkingChunk = `data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":[{"type":"thinking","thinking":[{"type":"text","text":"I think"}]}]},"finish_reason":null}]}

data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":[{"type":"thinking","thinking":[{"type":"text","text":" about"}]}]},"finish_reason":null}]}

data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":"Hello World"},"finish_reason":null}]}

data: [DONE]
`

const textOnlyChunk = `data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" World"},"finish_reason":null}]}

data: [DONE]
`

const mixedChunk = `data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":[{"type":"thinking","thinking":[{"type":"text","text":"Thinking..."}]},{"type":"text","text":"Answer"}]},"finish_reason":null}]}

data: [DONE]
`

const thinkingOnlyChunk = `data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":[{"type":"thinking","thinking":[{"type":"text","text":"Only thinking"}]}]},"finish_reason":null}]}

data: [DONE]
`

const noThinkingArrayChunk = `data: {"id":"abc","object":"chat.completion.chunk","created":1,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":[{"type":"text","text":"A"},{"type":"text","text":"B"}]},"finish_reason":null}]}

data: [DONE]
`

test("extracts thinking into reasoning_content and normalizes content to string", () => {
  const result = Provider.normalizeSSEContent(thinkingChunk)
  const lines = result.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")

  const first = JSON.parse(lines[0].slice(6))
  expect(first.choices[0].delta.reasoning_content).toBe("I think")
  expect(first.choices[0].delta.content).toBeUndefined()

  const second = JSON.parse(lines[1].slice(6))
  expect(second.choices[0].delta.reasoning_content).toBe(" about")

  const third = JSON.parse(lines[2].slice(6))
  expect(third.choices[0].delta.content).toBe("Hello World")
  expect(third.choices[0].delta.reasoning_content).toBeUndefined()
})

test("passes through normal string content unchanged", () => {
  const result = Provider.normalizeSSEContent(textOnlyChunk)
  const lines = result.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")

  const first = JSON.parse(lines[0].slice(6))
  expect(first.choices[0].delta.content).toBe("Hello")
  expect(first.choices[0].delta.reasoning_content).toBeUndefined()

  const second = JSON.parse(lines[1].slice(6))
  expect(second.choices[0].delta.content).toBe(" World")
})

test("handles mixed thinking+text in single chunk", () => {
  const result = Provider.normalizeSSEContent(mixedChunk)
  const lines = result.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")

  const parsed = JSON.parse(lines[0].slice(6))
  expect(parsed.choices[0].delta.reasoning_content).toBe("Thinking...")
  expect(parsed.choices[0].delta.content).toBe("Answer")
})

test("thinking-only chunk has no content field", () => {
  const result = Provider.normalizeSSEContent(thinkingOnlyChunk)
  const lines = result.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")

  const parsed = JSON.parse(lines[0].slice(6))
  expect(parsed.choices[0].delta.reasoning_content).toBe("Only thinking")
  expect(parsed.choices[0].delta.content).toBeUndefined()
})

test("accumulates reasoning_content across multiple thinking chunks", () => {
  const result = Provider.normalizeSSEContent(thinkingChunk)
  const lines = result.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")

  const second = JSON.parse(lines[1].slice(6))
  expect(second.choices[0].delta.reasoning_content).toBe(" about")
})

test("normalizes non-stream content array into content + reasoning_content", () => {
  const input = JSON.stringify({
    id: "abc",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: [{ type: "text", text: "step" }] },
            { type: "text", text: "answer" },
          ],
        },
        finish_reason: "stop",
      },
    ],
  })

  const result = Provider.normalizeOpenAICompatibleResponse(input)
  const parsed = JSON.parse(result)
  expect(parsed.choices[0].message.content).toBe("answer")
  expect(parsed.choices[0].message.reasoning_content).toBe("step")
})

test("passes through non-stream response without choices", () => {
  const input = JSON.stringify({ foo: "bar" })
  const result = Provider.normalizeOpenAICompatibleResponse(input)
  expect(result).toBe(input)
})

test("passes through stream content arrays without thinking", () => {
  const result = Provider.normalizeSSEContent(noThinkingArrayChunk)
  const line = result.split("\n").find((l) => l.startsWith("data: {") && l !== "data: [DONE]")
  const parsed = JSON.parse(line!.slice(6))
  expect(Array.isArray(parsed.choices[0].delta.content)).toBe(true)
  expect(parsed.choices[0].delta.reasoning_content).toBeUndefined()
})

test("passes through non-stream content arrays without thinking", () => {
  const input = JSON.stringify({
    choices: [
      {
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "A" },
            { type: "text", text: "B" },
          ],
        },
      },
    ],
  })

  const result = Provider.normalizeOpenAICompatibleResponse(input)
  const parsed = JSON.parse(result)
  expect(Array.isArray(parsed.choices[0].message.content)).toBe(true)
  expect(parsed.choices[0].message.reasoning_content).toBeUndefined()
})
