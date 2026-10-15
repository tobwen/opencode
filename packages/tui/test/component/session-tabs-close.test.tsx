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
  const performed: Array<string> = []
  const confirmers: Array<((sessionID: string, closeNow: () => void) => void) | undefined> = []
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
    setCloseConfirmer: (confirm?: (sessionID: string, closeNow: () => void) => void) => confirmers.push(confirm),
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
  return {
    app,
    closed,
    performed,
    ask: () =>
      confirm!("second", () => {
        performed.push("second")
      }),
  }
}

test("asking the confirmation keeps the tab open until Close is chosen", async () => {
  const { app, closed, performed, ask } = await setup({ confirm: true })

  try {
    // DialogConfirm renders both buttons on one row, so the row identifies them.
    const buttons = () => {
      const rows = app.captureCharFrame().split("\n")
      const row = rows.findIndex((line) => line.includes("Cancel") && line.includes("Close"))
      if (row < 0) throw new Error("dialog buttons not rendered")
      return { rows, row }
    }

    ask()
    await app.waitForFrame((frame) => frame.includes("Close tab"))
    expect(closed).toEqual([])

    const cancel = buttons()
    await app.mockMouse.click(cancel.rows[cancel.row]!.indexOf("Cancel"), cancel.row)
    await app.renderOnce()
    expect(closed).toEqual([])
    expect(performed).toEqual([])
    expect(app.captureCharFrame()).not.toContain("Close tab")

    ask()
    await app.waitForFrame((frame) => frame.includes("Close tab"))
    const confirm = buttons()
    await app.mockMouse.click(confirm.rows[confirm.row]!.indexOf("Close"), confirm.row)
    await app.renderOnce()
    // The confirmed close must run the callback the controller handed over. Calling the
    // controller again would ask a second time and leave the tab open.
    expect(performed).toEqual(["second"])
    expect(closed).toEqual([])
    expect(app.captureCharFrame()).not.toContain("Close tab")
  } finally {
    app.renderer.destroy()
  }
})
