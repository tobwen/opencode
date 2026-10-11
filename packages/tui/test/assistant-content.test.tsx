import { expect, test } from "bun:test"
import { MarkdownRenderable, SyntaxStyle } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render } from "@opentui/solid"
import { assistantContent } from "../src/routes/session/message-parts"

test("drops a section tag that would hide block syntax from the parser", () => {
  expect(assistantContent("\u00a712\u00a7 # Title")).toBe("# Title")
  expect(assistantContent("\u00a712\u00a7 1. one\n2. two")).toBe("1. one\n2. two")
  expect(assistantContent("\u00a712\u00a7 > quoted")).toBe("> quoted")
  expect(assistantContent("\u00a712\u00a7 | a | b |\n|---|---|\n| 1 | 2 |")).toBe("| a | b |\n|---|---|\n| 1 | 2 |")
  expect(assistantContent("\u00a712\u00a7 ```ts\nconst x = 1\n```")).toBe("```ts\nconst x = 1\n```")
})

test("drops one tag per line and keeps the indentation around it", () => {
  expect(assistantContent("\u00a71\u00a7 first\n\u00a72\u00a7 second")).toBe("first\nsecond")
  expect(assistantContent("\u00a71\u00a7 - one\n  \u00a72\u00a7 - nested")).toBe("- one\n  - nested")
})

test("keeps a tag the model wrote inside a line", () => {
  expect(assistantContent("See \u00a73\u00a7 for details")).toBe("See \u00a73\u00a7 for details")
  expect(assistantContent("The \u00a7N\u00a7 format")).toBe("The \u00a7N\u00a7 format")
})

test("keeps the drop placeholder the context plugin injects", () => {
  expect(assistantContent("[dropped \u00a712\u00a7]")).toBe("[dropped \u00a712\u00a7]")
  expect(assistantContent("Result: [dropped \u00a73\u00a7] and more")).toBe("Result: [dropped \u00a73\u00a7] and more")
})

test("keeps a section number a code comment relies on", () => {
  expect(assistantContent("See section \u00a75.1 for details")).toBe("See section \u00a75.1 for details")
  expect(assistantContent("  \u00a75.1 stays indented")).toBe("\u00a75.1 stays indented")
})

test("leaves untagged text and trims like the markdown input did", () => {
  expect(assistantContent("  plain text  ")).toBe("plain text")
  expect(assistantContent("\u00a712\u00a7")).toBe("")
})

test("the rendered transcript turns a tagged bullet list back into one block", async () => {
  const tagged = "\u00a712\u00a7 - one\n- two"
  const blocks = async (content: string) => {
    const output = await createTestRenderer({ width: 40, height: 10, remote: true, useThread: false })
    await render(
      () => (
        <markdown
          syntaxStyle={SyntaxStyle.fromStyles({ default: { fg: "#ffffff" } })}
          content={content}
          streaming={false}
          internalBlockMode="top-level"
        />
      ),
      output.renderer,
    )
    try {
      output.renderer.start()
      await output.waitForFrame((frame) => frame.includes("one"))
      const markdown = output.renderer.root.getChildren()[0]
      if (!(markdown instanceof MarkdownRenderable)) throw new Error("Expected Markdown")
      return { count: markdown.getChildren().length, frame: output.captureCharFrame() }
    } finally {
      output.renderer.destroy()
    }
  }

  // The tag pushes the list off the line start, so the first item parses as prose.
  expect((await blocks(tagged)).count).toBe(2)
  const stripped = await blocks(assistantContent(tagged))
  expect(stripped.count).toBe(1)
  expect(stripped.frame).not.toContain("\u00a7")
})