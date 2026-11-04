/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { Context } from "@opencode/plugin/tui/context"
import { createStore, produce } from "solid-js/store"
import { SidebarOnboarding, SidebarVersionToggle } from "../../src/feature-plugins/sidebar/footer"

function context(options?: {
  version?: string
  dismissed?: boolean
  integrations?: Array<{ connections: unknown[] }>
  dispatched?: string[]
  sessionID?: string
}) {
  const color = RGBA.fromInts(200, 200, 200)
  // Distinct so a test can tell base from muted.
  const strong = RGBA.fromInts(10, 10, 10)
  const [onboarding, setOnboarding] = createStore({ dismissed: options?.dismissed ?? false })
  const location = { directory: "/workspace" }
  return {
    location,
    app: { version: options?.version ?? "2.0.22" },
    theme: {
      background: { raised: { high: color } },
      text: { base: strong, muted: color },
    },
    storage: {
      store: () => [
        onboarding,
        (mutation: (draft: { dismissed: boolean }) => void) => {
          setOnboarding(produce(mutation))
          return Promise.resolve()
        },
      ],
    },
    keymap: {
      dispatch: (id: string) => options?.dispatched?.push(id),
    },
    ui: {
      format: { path: (value: string) => value },
    },
    data: {
      session: {
        get: () => ({ location }),
      },
      location: {
        integration: { list: () => options?.integrations },
        vcs: { info: () => undefined },
      },
    },
  } as unknown as Context
}

async function render(input: Context, height = 22) {
  const app = await testRender(
    () => (
      <box width={38}>
        <SidebarOnboarding context={input} sessionID="session" />
      </box>
    ),
    { width: 38, height },
  )
  await app.renderOnce()
  return app
}

test("sidebar waits for integrations before showing onboarding", async () => {
  const app = await render(context())

  try {
    expect(app.captureCharFrame()).not.toContain("Getting started")
  } finally {
    app.renderer.destroy()
  }
})

test("sidebar preserves the compact layout when the onboarding card cannot fit", async () => {
  const app = await render(context({ integrations: [] }), 21)

  try {
    expect(app.captureCharFrame()).not.toContain("Getting started")
  } finally {
    app.renderer.destroy()
  }
})

test("sidebar shows onboarding without a connected integration", async () => {
  const app = await render(context({ integrations: [] }))

  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("Getting started")
    expect(frame).toContain("OpenCode includes free models")
    expect(frame).toContain("Connect provider")
    expect(frame).toContain("/connect")
  } finally {
    app.renderer.destroy()
  }
})

test("sidebar hides onboarding after an integration is connected or the card is dismissed", async () => {
  const connected = await render(context({ integrations: [{ connections: [{}] }] }))
  const dismissed = await render(context({ integrations: [], dismissed: true }))

  try {
    expect(connected.captureCharFrame()).not.toContain("Getting started")
    expect(dismissed.captureCharFrame()).not.toContain("Getting started")
  } finally {
    connected.renderer.destroy()
    dismissed.renderer.destroy()
  }
})

test("sidebar onboarding opens integrations and can be dismissed", async () => {
  const dispatched: string[] = []
  const app = await render(context({ integrations: [], dispatched }))

  try {
    const connect = app.renderer.root.findDescendantById("sidebar.footer.getting-started.connect")!
    await app.mockMouse.click(connect.x, connect.y)
    expect(dispatched).toEqual(["provider.connect"])

    const dismiss = app.renderer.root.findDescendantById("sidebar.footer.getting-started.dismiss")!
    await app.mockMouse.click(dismiss.x, dismiss.y)
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("Getting started")
  } finally {
    app.renderer.destroy()
  }
})


async function renderVersion(context: Context, toggles: string[]) {
  const app = await testRender(
    () => (
      <box width={38}>
        <SidebarVersionToggle context={context} onToggle={() => toggles.push("toggle")} />
      </box>
    ),
    { width: 38, height: 2 },
  )
  await app.renderOnce()
  return app
}

test("clicking the version row asks for the width toggle", async () => {
  const toggles: string[] = []
  const app = await renderVersion(context(), toggles)
  try {
    const lines = (await app.captureCharFrame()).split("\n")
    const row = lines.findIndex((line) => line.includes("2.0.22"))
    const column = lines[row]!.indexOf("2.0.22") + 1
    await app.mockMouse.click(column, row)
    await app.renderOnce()
    expect(toggles).toEqual(["toggle"])
  } finally {
    app.renderer.destroy()
  }
})

test("hovering the version row highlights it and leaving restores it", async () => {
  const toggles: string[] = []
  const app = await renderVersion(context(), toggles)
  try {
    const lines = (await app.captureCharFrame()).split("\n")
    const row = lines.findIndex((line) => line.includes("2.0.22"))
    const column = lines[row]!.indexOf("2.0.22") + 1
    const before = versionForeground(app.renderer.root)
    await app.mockMouse.moveTo(column, row)
    await app.renderOnce()
    expect(versionForeground(app.renderer.root)).not.toEqual(before)
    await app.mockMouse.moveTo(0, 1)
    await app.renderOnce()
    expect(versionForeground(app.renderer.root)).toEqual(before)
  } finally {
    app.renderer.destroy()
  }
})

// opentui keeps the resolved foreground on the text node as _defaultFg; the row holds one text child.
type TextNode = { _defaultFg?: unknown }
type RowNode = { getChildren(): TextNode[] }

function versionForeground(root: { findDescendantById(id: string): unknown }): unknown {
  const row = root.findDescendantById("sidebar.footer.version") as RowNode | undefined
  return row?.getChildren()[0]?._defaultFg
}
