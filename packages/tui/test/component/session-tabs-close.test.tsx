/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ConfigProvider } from "../../src/config"
import { ThemeProvider } from "../../src/context/theme"
import { Keymap } from "../../src/context/keymap"
import { DialogProvider } from "../../src/ui/dialog"
import { ToastProvider } from "../../src/ui/toast"
import { EMPTY_SESSION_TAB_STATUS, SessionTabs, type SessionTabsController } from "../../src/component/session-tabs"
import { emptyThemeSource } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

async function setup(input: { confirm: boolean }) {
  const closed: Array<string | undefined> = []
  const confirmers: Array<((sessionID: string) => void) | undefined> = []
  const controller = {
    tabs: () => [
      { sessionID: "first", title: "First" },
      { sessionID: "second", title: "Second" },
    ],
    current: () => "first",
    select: () => {},
    close: (sessionID?: string) => closed.push(sessionID),
    move() {},
    add() {},
    status: () => EMPTY_SESSION_TAB_STATUS,
    setCloseConfirmer: (confirm?: (sessionID: string) => void) => confirmers.push(confirm),
  } satisfies SessionTabsController

  const app = await testRender(
    () => (
      <TestTuiContexts>
        <ConfigProvider config={createTuiResolvedConfig({ session: { confirm_tab_close: input.confirm } })}>
          <ThemeProvider mode="dark" source={emptyThemeSource}>
            <ToastProvider>
              <Keymap.Provider>
                <DialogProvider>
                  <SessionTabs controller={controller} animations={false} />
                </DialogProvider>
              </Keymap.Provider>
            </ToastProvider>
          </ThemeProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: 60, height: 24 },
  )
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Second"))
  // The strip hands the callback to the controller, which is the only place that asks.
  const confirm = confirmers.at(-1)
  return { app, closed, confirm: () => confirm!("second") }
}

test("the tab strip hands a confirmation callback to the controller", async () => {
  const { app } = await setup({ confirm: true })

  try {
    expect(app.captureCharFrame()).toContain("Second")
  } finally {
    app.renderer.destroy()
  }
})

test("asking the confirmation keeps the tab open until Close is chosen", async () => {
  const { app, closed, confirm } = await setup({ confirm: true })

  try {
    confirm()
    await app.waitForFrame((frame) => frame.includes("Close tab"))
    expect(closed).toEqual([])

    app.mockInput.pressEnter()
    await app.renderOnce()
    expect(closed).toEqual([])
    expect(app.captureCharFrame()).not.toContain("Close tab")

    confirm()
    await app.waitForFrame((frame) => frame.includes("Close tab"))
    const rows = (await app.captureCharFrame()).split("\n")
    const row = rows.findIndex((line) => line.trim() === "Close")
    if (row < 0) throw new Error("Close option not rendered")
    await app.mockMouse.click(rows[row]!.indexOf("Close") + 1, row)
    await app.renderOnce()
    expect(closed).toEqual(["second"])
  } finally {
    app.renderer.destroy()
  }
})

test("with confirmation off the callback closes the tab right away", async () => {
  const { app, closed, confirm } = await setup({ confirm: false })

  try {
    confirm()
    await app.renderOnce()
    expect(closed).toEqual(["second"])
    expect(app.captureCharFrame()).not.toContain("Close tab")
  } finally {
    app.renderer.destroy()
  }
})
