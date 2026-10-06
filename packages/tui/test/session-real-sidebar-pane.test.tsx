import { expect, test } from "bun:test"
import { BoxRenderable, EmbeddedTerminalRenderable, type Renderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"

// Matches the fixture height, so the tests can assert the footer owns the last content row.
const HEIGHT = 36
import { Effect, FileSystem } from "effect"
import { Global } from "@opencode/util/global"
import { SESSION_SIDEBAR_WIDTH } from "../src/ui/layout"
import { createEventStream, createFetch, directory, json } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"

async function setupTerminalSession(width: number, sidebar: "auto" | "hide" = "auto") {
  await using state = await tmpdir()
  const setup = await createTestRenderer({ width, height: 36, useThread: false, kittyKeyboard: true })
  setup.renderer.start()
  const session = {
    id: "ses_split",
    title: "Split fixture",
    projectID: "project",
    location: { directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
  }
  const pty = {
    id: "pty_fixture",
    sessionID: session.id,
    title: "Terminal",
    command: "/bin/sh",
    args: [],
    cwd: directory,
    status: "running",
    pid: 1,
    foregroundProcess: null,
    size: { cols: 48, rows: 30 },
    output: { head: 0, tail: 0 },
  }
  const text = Array.from({ length: 100 }, (_, index) => `Terminal line ${index}`).join("\r\n")
  const messages = [{ id: "m1", type: "user", text: "Hello", time: { created: 0 } }]
  const calls = createFetch((url, request) => {
    if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
    if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
    if (url.pathname === `/api/session/${session.id}/message`) return json({ data: messages.toReversed(), cursor: {} })
    if (url.pathname === `/api/session/${session.id}/inbox`) return json({ data: [] })
    if (url.pathname === `/api/session/${session.id}/permission`) return json({ data: [] })
    if (url.pathname === `/api/experimental/session/${session.id}/terminal`)
      return json({ data: request.method === "POST" ? pty : [pty] })
    if (url.pathname === "/api/experimental/persistent-pty/pty_fixture/snapshot")
      return json({
        data: { info: pty, text, checkpoint: Buffer.from(text).toString("base64"), cursor: { x: 16, y: 29 } },
      })
    if (url.pathname === "/api/experimental/persistent-pty/pty_fixture/connect-token")
      return json({ data: { ticket: "fixture" } })
    return undefined
  }, createEventStream())
  let configState = { animations: false, tabs: { mode: "off" as const }, session: { sidebar } }
  const server = Bun.serve({
    port: 0,
    idleTimeout: 0,
    fetch(request, server) {
      if (new URL(request.url).pathname.endsWith("/connect") && server.upgrade(request)) return undefined
      return calls.fetch(request)
    },
    websocket: {
      open(socket) {
        socket.send(JSON.stringify({ type: "attached", inputProtocol: 1, role: "controller", info: pty }))
        socket.send(JSON.stringify({ type: "replay_complete" }))
      },
      message() {},
    },
  })
  const { run } = await import("../src/app")
  const task = Effect.runPromise(
    run({
      app: { name: "test", version: "test", channel: "test" },
      server: { endpoint: { url: server.url.toString() } },
      config: {
        get: async () => configState,
        // Real persistence so the sidebar toggle can switch the setting off and on again.
        update: async (update) => {
          const draft = structuredClone(configState)
          update(draft)
          configState = draft
          return configState
        },
      },
      packages: { prepare: async () => ({ directory: "" }) },
      args: { sessionID: session.id },
      terminalHandoff: async () => ({ renderer: setup.renderer, mode: "dark", complete: () => {} }),
      log: () => {},
    }).pipe(Effect.provide(Global.layerWith({ state: state.path })), Effect.provide(FileSystem.layerNoop({}))),
  )
  const findAll = (root: Renderable, match: (node: Renderable) => boolean, out: Renderable[] = []) => {
    if (match(root)) out.push(root)
    root.getChildren().forEach((child) => findAll(child, match, out))
    return out
  }
  return { setup, task, server, findAll }
}

test.skipIf(process.platform === "win32").each([160, 200])(
  "the sidebar pane keeps the far right while a terminal sits next to it",
  async (width) => {
    const { setup, task, server, findAll } = await setupTerminalSession(width)
    try {
      await setup.waitForFrame((frame) => frame.includes("Hello"))
      await setup.mockInput.typeText("/terminal")
      await setup.waitForFrame((frame) => frame.includes("New terminal"))
      setup.mockInput.pressEnter()
      await setup.waitForVisualIdle()

      const terminal = findAll(setup.renderer.root, (node) => node instanceof EmbeddedTerminalRenderable)[0]
      if (!terminal) throw new Error("Terminal pane not found")
      const pane = terminal.parent as BoxRenderable
      const sidebar = findAll(
        setup.renderer.root,
        (node) => node instanceof BoxRenderable && node.width === SESSION_SIDEBAR_WIDTH && node.x > pane.x,
      )[0]
      if (!sidebar) throw new Error("Sidebar not found next to the terminal")

      // The sidebar owns the far right and the terminal keeps the resizable middle.
      expect(sidebar.x + sidebar.width).toBe(width)
      expect(pane.x).toBeGreaterThan(0)

      const handle = findAll(
        setup.renderer.root,
        (node) => node instanceof BoxRenderable && node.zIndex === 10 && node.width === 2,
      )[0]
      if (!handle) throw new Error("Resize handle not found")
      const line = handle.getChildren()[0] as BoxRenderable
      // The handle sits on the left edge of the terminal, not inside the sidebar.
      expect(handle.x + 1).toBe(pane.x)

      // Hover highlights on both hitbox columns, so the highlight stays visible over the terminal edge.
      for (const column of [handle.x, handle.x + 1]) {
        await setup.mockMouse.moveTo(column, 5)
        await setup.waitForVisualIdle()
        expect(line.backgroundColor.a).toBeGreaterThan(0)
      }
      await setup.mockMouse.moveTo(2, 5)
      await setup.waitForVisualIdle()
      expect(line.backgroundColor.a).toBe(0)

      // Dragging the left handle narrows the terminal and keeps the sidebar on the right edge.
      const start = handle.x
      const before = pane.width
      await setup.mockMouse.drag(start, 10, start + 10, 10)
      await setup.waitForVisualIdle()
      expect(handle.x).toBe(start + 10)
      expect(pane.width).toBe(before - 10)
      expect(sidebar.x + sidebar.width).toBe(width)
    } finally {
      setup.renderer.destroy()
      await task
      await server.stop()
    }
  },
)

test.skipIf(process.platform === "win32")("a hidden sidebar leaves the terminal its pane", async () => {
  const width = 200
  // The sidebar is off, so the terminal keeps the full right column instead of being deselected.
  const { setup, task, server, findAll } = await setupTerminalSession(width, "hide")
  const sidebarPanes = () =>
    findAll(setup.renderer.root, (node) => node instanceof BoxRenderable && node.width === SESSION_SIDEBAR_WIDTH).length
  const terminals = () => findAll(setup.renderer.root, (node) => node instanceof EmbeddedTerminalRenderable).length
  try {
    await setup.waitForFrame((frame) => frame.includes("Hello"))
    await setup.mockInput.typeText("/terminal")
    await setup.waitForFrame((frame) => frame.includes("New terminal"))
    setup.mockInput.pressEnter()
    await setup.waitForVisualIdle()

    expect(sidebarPanes()).toBe(0)
    expect(terminals()).toBe(1)
  } finally {
    setup.renderer.destroy()
    await task
    await server.stop()
  }
})

test.skipIf(process.platform === "win32")("the collapsed sidebar keeps the version row on the bottom row", async () => {
  const width = 200
  const { setup, task, server, findAll } = await setupTerminalSession(width)
  const versionRow = () =>
    findAll(setup.renderer.root, (node) => node instanceof BoxRenderable && node.id === "sidebar.footer.version")[0]
  try {
    await setup.waitForFrame((frame) => frame.includes("Hello"))
    const expanded = versionRow()
    if (!expanded) throw new Error("Version row not rendered")

    await setup.mockMouse.click(expanded.x + 1, expanded.y)
    await setup.waitForVisualIdle()

    const collapsed = versionRow()
    if (!collapsed) throw new Error("Version row not rendered after collapsing")
    // Guard: the click must actually have collapsed the sidebar, otherwise the position proves nothing.
    const wideSidebars = findAll(
      setup.renderer.root,
      (node) => node instanceof BoxRenderable && node.width === SESSION_SIDEBAR_WIDTH,
    ).length
    expect(wideSidebars).toBe(0)
    // The sidebar reserves one padding row at the bottom, so the version row owns row HEIGHT - 2.
    expect(collapsed.y + collapsed.height).toBe(HEIGHT - 1)
    expect(collapsed.y).toBe(expanded.y)
  } finally {
    setup.renderer.destroy()
    await task
    await server.stop()
  }
})
