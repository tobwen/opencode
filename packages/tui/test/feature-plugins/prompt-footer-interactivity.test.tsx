/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { Context } from "@opencode/plugin/tui/context"
import { InteractivityProvider } from "../../src/context/interactivity"
import { PromptFooter } from "../../src/feature-plugins/prompt/footer"

// The commands hint used to pass an empty object as the span color while the
// prompt was not interactive, which crashed the renderer. Opening a pane
// focuses it and drops prompt interactivity, so this path runs in normal use.
test("prompt footer renders while the prompt is not interactive", async () => {
  const color = RGBA.fromInts(200, 200, 200)
  const context = {
    location: { directory: "/workspace" },
    theme: {
      text: {
        base: color,
        muted: color,
        action: { primary: { disabled: color, hovered: color } },
      },
    },
    keymap: { shortcuts: (id: string) => (id === "command.palette.show" ? ["ctrl+p"] : []) },
    data: {
      session: {
        family: () => ["session"],
        status: () => "idle",
        get: () => ({ id: "session", location: { directory: "/workspace" } }),
        cost: () => 0,
        message: { list: () => [] },
      },
      shell: { list: () => [] },
      location: { model: { list: () => [] } },
    },
  } as unknown as Context
  const app = await testRender(
    () => (
      <InteractivityProvider enabled={false}>
        <PromptFooter context={context} sessionID="session" mode="normal" showDetails={true} />
      </InteractivityProvider>
    ),
    { width: 80, height: 2 },
  )

  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("commands")
  } finally {
    app.renderer.destroy()
  }
})
