/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { ConfigProvider } from "../../src/config"
import { EMPTY_SESSION_TAB_STATUS, SessionTabs, type SessionTabsController } from "../../src/component/session-tabs"
import { ClientProvider } from "../../src/context/client"
import { DataProvider } from "../../src/context/data"
import { Keymap } from "../../src/context/keymap"
import { LocationProvider } from "../../src/context/location"
import { RouteProvider } from "../../src/context/route"
import { TuiAppProvider } from "../../src/context/runtime"
import { SessionTabsProvider } from "../../src/context/session-tabs"
import { StorageProvider } from "../../src/context/storage"
import { ThemeProvider } from "../../src/context/theme"
import { DialogProvider } from "../../src/ui/dialog"
import { ToastProvider } from "../../src/ui/toast"
import { emptyThemeSource, tmpdir } from "../fixture/fixture"
import { createApi, createEventStream, createFetch } from "../fixture/tui-client"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

async function renderApp(input: { path: string; removed: string[]; confirmDefault?: "cancel" | "confirm" }) {
  const fetch = createFetch((url, request) => {
    if (request.method === "DELETE" && /^\/api\/session\/[^/]+$/.test(url.pathname)) {
      input.removed.push(decodeURIComponent(url.pathname.split("/").pop()!))
      return new Response(null, { status: 204 })
    }
    return undefined
  }, createEventStream())
  const controller = {
    tabs: () => [{ sessionID: "first", title: "First" }],
    current: () => "first",
    select: () => {},
    close: () => {},
    move() {},
    add() {},
    status: () => EMPTY_SESSION_TAB_STATUS,
  } satisfies SessionTabsController

  return testRender(
    () => (
      <TestTuiContexts paths={{ state: input.path }}>
        <TuiAppProvider value={{ name: "test", version: "test", channel: "test" }}>
          <StorageProvider>
            <ConfigProvider
              config={createTuiResolvedConfig({
                tabs: { mode: "on" },
                dialog: { confirm_default: input.confirmDefault ?? "cancel" },
              })}
            >
              <RouteProvider initialRoute={{ type: "home" }}>
                <ClientProvider api={createApi(fetch.fetch)}>
                  <DataProvider directory={input.path}>
                    <LocationProvider>
                      <SessionTabsProvider>
                        <ThemeProvider mode="dark" source={emptyThemeSource}>
                          <Keymap.Provider>
                            <ToastProvider>
                              <DialogProvider>
                                <box width="100%" height="100%">
                                  <SessionTabs controller={controller} animations={false} />
                                </box>
                              </DialogProvider>
                            </ToastProvider>
                          </Keymap.Provider>
                        </ThemeProvider>
                      </SessionTabsProvider>
                    </LocationProvider>
                  </DataProvider>
                </ClientProvider>
              </RouteProvider>
            </ConfigProvider>
          </StorageProvider>
        </TuiAppProvider>
      </TestTuiContexts>
    ),
    { width: 60, height: 20 },
  )
}

function tabMenu(app: Awaited<ReturnType<typeof renderApp>>) {
  const rows = () => app.captureCharFrame().split("\n")
  return {
    open: async () => {
      const frame = rows()
      const row = frame.findIndex((line) => line.includes("First"))
      if (row < 0) throw new Error("tab not rendered")
      await app.mockMouse.click(frame[row]!.indexOf("First"), row, MouseButton.RIGHT)
      await app.waitForFrame((frame) => frame.includes("Remove session"))
    },
    clickEntry: async () => {
      const frame = rows()
      const row = frame.findIndex((line) => line.trim() === "Remove session")
      if (row < 0) throw new Error("menu entry not rendered")
      await app.mockMouse.click(frame[row]!.indexOf("Remove session"), row)
      await app.renderOnce()
    },
    // DialogConfirm renders both buttons on one row, so the row identifies them.
    clickButton: async (label: string) => {
      const frame = rows()
      const row = frame.findIndex((line) => line.includes("Cancel") && line.includes("Remove"))
      if (row < 0) throw new Error("dialog buttons not rendered")
      await app.mockMouse.click(frame[row]!.indexOf(label), row)
      await app.renderOnce()
    },
  }
}

test("the tab menu removes a session only after confirmation", async () => {
  await using temporary = await tmpdir()
  const removed: string[] = []
  const app = await renderApp({ path: temporary.path, removed })
  try {
    app.renderer.start()
    await app.waitForFrame((frame) => frame.includes("First"))
    const menu = tabMenu(app)

    await menu.open()
    await menu.clickEntry()
    await app.waitForFrame((frame) => frame.includes("Remove session"))

    // Enter takes the default, which is cancel, so nothing is removed.
    app.mockInput.pressEnter()
    await app.renderOnce()
    expect(removed).toEqual([])
    expect(app.captureCharFrame()).not.toContain("Remove session")

    // Cancel keeps the session.
    await menu.open()
    await menu.clickEntry()
    await app.waitForFrame((frame) => frame.includes("Remove session"))
    await menu.clickButton("Cancel")
    await app.renderOnce()
    expect(removed).toEqual([])

    // Confirming deletes it.
    await menu.open()
    await menu.clickEntry()
    await app.waitForFrame((frame) => frame.includes("Remove session"))
    await menu.clickButton("Remove")
    await wait(() => removed.length > 0)
    expect(removed).toEqual(["first"])
  } finally {
    app.renderer.destroy()
  }
})

test("Enter runs the action when the dialog default is confirm", async () => {
  await using temporary = await tmpdir()
  const removed: string[] = []
  const app = await renderApp({ path: temporary.path, removed, confirmDefault: "confirm" })
  try {
    app.renderer.start()
    await app.waitForFrame((frame) => frame.includes("First"))
    const menu = tabMenu(app)

    await menu.open()
    await menu.clickEntry()
    await app.waitForFrame((frame) => frame.includes("Remove session"))
    app.mockInput.pressEnter()
    await wait(() => removed.length > 0)
    expect(removed).toEqual(["first"])
  } finally {
    app.renderer.destroy()
  }
})
