import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onCleanup } from "solid-js"
import { ConfigProvider } from "../src/config"
import { ClientProvider } from "../src/context/client"
import { Keymap } from "../src/context/keymap"
import { LogProvider } from "../src/context/log"
import { SessionTerminalsContext } from "../src/context/session-terminals"
import { ThemeProvider } from "../src/context/theme"
import { ComposerContext, type ComposerTab } from "../src/routes/session/composer/context"
import { TerminalsTab } from "../src/routes/session/composer/terminals-tab"
import { ToastProvider } from "../src/ui/toast"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createApi } from "./fixture/tui-client"

const sessionID = "ses_terminal_kill"
const targetID = "pty_target"

const target = {
  id: targetID,
  title: "Terminal",
  command: "bash",
  args: [],
  cwd: "/tmp/opencode",
  status: "running" as const,
  pid: 4242,
  sessionID,
  foregroundProcess: "vim",
  size: { cols: 80, rows: 24 },
  output: { head: 0, tail: 0 },
}

async function renderTab(input: { visibleTerminalID?: string } = {}) {
  const calls: string[] = []
  const fetch = async (url: URL, request: Request) => {
    if (request.method === "DELETE" && url.pathname.startsWith("/api/experimental/persistent-pty/")) {
      calls.push(url.pathname)
      return new Response(null, { status: 204 })
    }
    return undefined
  }
  let registered: ComposerTab | undefined

  // The tab registers its commands in composer mode, which the real composer pushes when it opens.
  function ComposerMode() {
    onCleanup(Keymap.use().mode.push("composer"))
    return <box />
  }

  const setup = await testRender(
    () => (
      <LogProvider log={() => {}}>
        <ConfigProvider config={createTuiResolvedConfig()}>
          <Keymap.Provider>
            <ComposerMode />
            <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
              <ToastProvider>
                <ClientProvider api={createApi(fetch as unknown as typeof globalThis.fetch)}>
                  {/* The list comes from the context, so the test needs no terminal server. */}
                  <SessionTerminalsContext.Provider
                    value={{
                      available: () => true,
                      get: () => ({ terminals: [target], selectedTerminalID: input.visibleTerminalID ?? null }),
                      refresh: async () => {},
                      selectTerminal: async () => {},
                      newTerminal: async () => target,
                      shouldFocus: () => false,
                      clearFocus: () => {},
                    }}
                  >
                    <ComposerContext.Provider
                      value={{
                        register: (tab) => {
                          registered = tab
                          return () => {}
                        },
                        active: (id) => id === "terminals",
                        close: () => {},
                      }}
                    >
                      <TerminalsTab sessionID={sessionID} visibleTerminalID={input.visibleTerminalID} />
                    </ComposerContext.Provider>
                  </SessionTerminalsContext.Provider>
                </ClientProvider>
              </ToastProvider>
            </ThemeProvider>
          </Keymap.Provider>
        </ConfigProvider>
      </LogProvider>
    ),
    { width: 100, height: 30, kittyKeyboard: true },
  )
  setup.renderer.start()
  return { ...setup, calls, registered: () => registered }
}

test("the terminals tab offers select and kill for the selected terminal", async () => {
  const setup = await renderTab({ visibleTerminalID: targetID })
  try {
    await setup.waitForFrame((frame) => frame.includes("vim"))
    expect(setup.registered()?.id).toBe("terminals")
    expect(setup.registered()?.hints?.()).toEqual([
      { label: "select", shortcut: "enter", command: "composer.terminal.select" },
      { label: "kill", shortcut: "ctrl+d", command: "composer.terminal.kill" },
    ])
  } finally {
    setup.renderer.destroy()
  }
})

test("the terminals tab offers no hints for the new terminal row", async () => {
  const setup = await renderTab()
  try {
    await setup.waitForFrame((frame) => frame.includes("+ New terminal"))
    expect(setup.registered()?.hints?.()).toEqual([])
  } finally {
    setup.renderer.destroy()
  }
})

test("ctrl+d removes the selected terminal", async () => {
  const setup = await renderTab({ visibleTerminalID: targetID })
  try {
    await setup.waitForFrame((frame) => frame.includes("vim"))
    setup.mockInput.pressKey("d", { ctrl: true })
    await setup.waitFor(() => setup.calls.length > 0)
    expect(setup.calls).toEqual([`/api/experimental/persistent-pty/${targetID}`])
  } finally {
    setup.renderer.destroy()
  }
})
