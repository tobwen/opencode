import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../../context/theme"
import { SplitBorder } from "../../../ui/border"
import { Keymap } from "../../../context/keymap"
import { SubagentsTab } from "./subagents-tab"
import { ShellTab } from "./shell-tab"
import { TerminalsTab } from "./terminals-tab"
import { ComposerContext, type ComposerTab } from "./context"

export type ComposerProps = {
  sessionID: string
  open: boolean
  defaultTab?: string
  onClose?: () => void
  terminals?: boolean
  visibleTerminalID?: string
}

function ComposerHintText(props: { label: string; shortcut: string; onRun?: () => void }) {
  const theme = useTheme()
  const [hovered, setHovered] = createSignal(false)
  const clickable = () => props.onRun !== undefined
  return (
    <text
      fg={hovered() && clickable() ? theme.text.action.primary.hovered : theme.text.muted}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={() => {
        if (hovered()) props.onRun?.()
      }}
    >
      <span style={{ fg: theme.text.base }}>
        <b>{props.label}</b>{" "}
      </span>
      <span style={{ fg: theme.text.muted }}>{props.shortcut}</span>
    </text>
  )
}

export function Composer(props: ComposerProps) {
  const theme = useTheme()

  const [escHover, setEscHover] = createSignal(false)
  const [store, setStore] = createStore({
    tabs: {} as Record<string, ComposerTab>,
    active: "",
  })

  const tabList = createMemo(() => Object.values(store.tabs))
  const activeTab = createMemo(() => tabList().find((t) => t.id === store.active))
  const footerHints = createMemo(() => activeTab()?.hints?.() ?? [])
  const paneHint = createMemo(() => activeTab()?.paneHint?.())

  // Set active tab when opened
  createEffect(() => {
    if (!props.open) return
    const tabs = tabList()
    if (tabs.length === 0) return
    const match = props.defaultTab && tabs.find((t) => t.id === props.defaultTab)
    setStore("active", match ? match.id : tabs[0].id)
  })

  function close() {
    props.onClose?.()
  }

  const ctx = {
    register(tab: ComposerTab) {
      setStore("tabs", tab.id, tab)
      if (!store.active) setStore("active", tab.id)
      return () => setStore("tabs", tab.id, undefined!)
    },
    active(id: string) {
      return props.open && store.active === id
    },
    close,
  }

  const keymap = Keymap.use()
  createEffect(() => {
    if (!props.open) return
    const popMode = keymap.mode.push("composer")
    onCleanup(popMode)
  })

  const switchTab = (dir: number) => {
    const tabs = tabList()
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((t) => t.id === store.active)
    setStore("active", tabs[(idx + dir + tabs.length) % tabs.length].id)
  }

  Keymap.createLayer(() => ({
    mode: "composer",
    enabled: () => props.open,
    priority: 1,
    commands: [
      { bind: "left", title: "Previous tab", group: "Composer", run: () => switchTab(-1) },
      { bind: "right", title: "Next tab", group: "Composer", run: () => switchTab(1) },
      { bind: "escape", title: "Close composer", group: "Composer", run: close },
      { bind: "ctrl+c", title: "Close composer", group: "Composer", run: close },
    ],
  }))

  return (
    <ComposerContext.Provider value={ctx}>
      <box flexShrink={0} visible={props.open}>
        <box
          {...SplitBorder}
          border={["left"]}
          borderColor={theme.border.base}
          backgroundColor={theme.background.raised.base}
          paddingLeft={1}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <box gap={1}>
            <box flexDirection="row" justifyContent="space-between" paddingLeft={1}>
              <Show
                when={tabList().length > 1}
                fallback={
                  <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
                    {tabList()[0]?.label ?? ""}
                  </text>
                }
              >
                <box flexDirection="row" gap={2}>
                  <For each={tabList()}>
                    {(t) => {
                      const isActive = createMemo(() => store.active === t.id)
                      const [hover, setHover] = createSignal(false)
                      return (
                        <box
                          onMouseOver={() => setHover(true)}
                          onMouseOut={() => setHover(false)}
                          onMouseUp={() => setStore("active", t.id)}
                        >
                          <text
                            fg={
                              isActive()
                                ? theme.text.base
                                : hover()
                                  ? theme.text.action.primary.hovered
                                  : theme.text.muted
                            }
                            attributes={isActive() ? TextAttributes.BOLD : undefined}
                          >
                            {t.label}
                          </text>
                        </box>
                      )
                    }}
                  </For>
                </box>
              </Show>
              <text
                fg={escHover() ? theme.text.action.primary.hovered : theme.text.muted}
                onMouseOver={() => setEscHover(true)}
                onMouseOut={() => setEscHover(false)}
                onMouseUp={close}
              >
                esc
              </text>
            </box>
            <SubagentsTab sessionID={props.sessionID} />
            <ShellTab sessionID={props.sessionID} />
            <Show when={props.terminals}>
              <TerminalsTab sessionID={props.sessionID} visibleTerminalID={props.visibleTerminalID} />
            </Show>
            <box flexDirection="row" gap={2} justifyContent="space-between" paddingLeft={1} flexShrink={0}>
              <box flexDirection="row" gap={2}>
                <For each={footerHints()}>
                  {(hint) => (
                    <ComposerHintText
                      label={hint.label}
                      shortcut={hint.shortcut}
                      onRun={hint.command ? () => keymap.dispatch(hint.command!) : undefined}
                    />
                  )}
                </For>
                <Show when={tabList().length > 1}>
                  <ComposerHintText label="tabs" shortcut="←/→" onRun={() => switchTab(-1)} />
                </Show>
              </box>
              <Show when={paneHint()}>
                {(hint) => (
                  <ComposerHintText
                    label={hint().label}
                    shortcut={hint().shortcut}
                    onRun={hint().command ? () => keymap.dispatch(hint().command!) : undefined}
                  />
                )}
              </Show>
            </box>
          </box>
        </box>
      </box>
    </ComposerContext.Provider>
  )
}
