import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect, FileSystem } from "effect"
import { Global } from "@opencode/util/global"
import { createEventStream, createFetch, directory, json } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"

test.skipIf(process.platform === "win32")("composer header switches tabs and shows hover", async () => {
  await using state = await tmpdir()
  const setup = await createTestRenderer({ width: 100, height: 30, useThread: false, kittyKeyboard: true })
  setup.renderer.start()
  const session = {
    id: "ses_tabs",
    title: "Tabs fixture",
    projectID: "project",
    location: { directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
  }
  const calls = createFetch((url) => {
    if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
    if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
    if (url.pathname === `/api/session/${session.id}/message`) return json({ data: [], cursor: {} })
    if (url.pathname === `/api/session/${session.id}/inbox`) return json({ data: [] })
    if (url.pathname === `/api/session/${session.id}/permission`) return json({ data: [] })
    if (url.pathname === `/api/experimental/session/${session.id}/terminal`) return json({ data: [] })
    return undefined
  }, createEventStream())
  const server = Bun.serve({ port: 0, idleTimeout: 0, fetch: (request) => calls.fetch(request) })
  const { run } = await import("../src/app")
  const task = Effect.runPromise(
    run({
      app: { name: "test", version: "test", channel: "test" },
      server: { endpoint: { url: server.url.toString() } },
      config: {
        get: async () => ({ animations: false, tabs: { mode: "off" }, keybinds: { "terminal.select": "f6" } }),
        update: async () => ({}),
      },
      packages: { prepare: async () => ({ directory: "" }) },
      args: { sessionID: session.id },
      terminalHandoff: async () => ({ renderer: setup.renderer, mode: "dark", complete: () => {} }),
      log: () => {},
    }).pipe(Effect.provide(Global.layerWith({ state: state.path })), Effect.provide(FileSystem.layerNoop({}))),
  )

  const header = async () => {
    const lines = (await setup.captureCharFrame()).split("\n")
    const row = lines.findIndex((line) => line.includes("Subagents") && line.includes("Terminals"))
    if (row < 0) throw new Error("Composer tab header not found")
    return { line: lines[row]!, row }
  }

  const foreground = (label: string) => {
    const line = setup
      .captureSpans()
      .lines.find((candidate) => candidate.spans.some((span) => span.text.includes("Subagents")))
    const span = line?.spans.find((candidate) => candidate.text.includes(label))
    if (!span) throw new Error(`Header span not found: ${label}`)
    return span.fg
  }

  const hover = async (label: string) => {
    const before = foreground(label)
    const { line, row } = await header()
    await setup.mockMouse.moveTo(line.indexOf(label) + 1, row)
    await setup.renderOnce()
    expect(foreground(label)).not.toEqual(before)
    await setup.mockMouse.moveTo(0, 0)
    await setup.renderOnce()
    expect(foreground(label)).toEqual(before)
  }

  try {
    await setup.waitForFrame((frame) => frame.includes("ctrl+p commands"))
    // The picker only exists after the server reports persistent PTY support, which arrives
    // asynchronously. Pressing again is safe because the command always opens the composer.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      setup.mockInput.pressKey("F6")
      const opened = await setup
        .waitForFrame((frame) => frame.includes("+ New terminal"))
        .then(() => true)
        .catch(() => false)
      if (opened) break
      await setup.renderOnce()
    }
    // Terminals is the default tab, so every other header has to switch away from it.
    expect(await setup.captureCharFrame()).toContain("+ New terminal")

    await hover("Subagents")
    await hover("Shell")
    await hover("esc")

    const click = async (label: string) => {
      const { line, row } = await header()
      await setup.mockMouse.click(line.indexOf(label) + 1, row)
    }

    await click("Shell")
    await setup.waitForFrame((frame) => frame.includes("No shell commands"))

    await click("Subagents")
    await setup.waitForFrame((frame) => frame.includes("No active subagents"))

    await click("Terminals")
    await setup.waitForFrame((frame) => frame.includes("+ New terminal"))

    // Clicking the header of the open tab keeps the composer open.
    await click("Terminals")
    await setup.renderOnce()
    expect((await setup.captureCharFrame()).includes("+ New terminal")).toBe(true)

    await setup.mockMouse.click((await header()).line.indexOf("esc") + 1, (await header()).row)
    await setup.waitForFrame((frame) => !frame.includes("+ New terminal"))
  } finally {
    setup.renderer.destroy()
    await task
    await server.stop()
  }
})
