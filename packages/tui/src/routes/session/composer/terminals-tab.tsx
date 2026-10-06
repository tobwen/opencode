import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { Keymap } from "../../../context/keymap"
import { useSessionTerminals } from "../../../context/session-terminals"
import { useClient } from "../../../context/client"
import { useTheme } from "../../../context/theme"
import { useToast } from "../../../ui/toast"
import { useComposerTab } from "./context"

export function TerminalsTab(props: { sessionID: string; visibleTerminalID?: string }) {
  const composer = useComposerTab()
  const terminals = useSessionTerminals()
  const client = useClient()
  const theme = useTheme()
  const toast = useToast()
  const shortcuts = Keymap.useShortcuts()
  const allCommands = Keymap.useCommands()
  const failure = () => toast.show({ variant: "error", message: "Unable to load terminal" })
  const [selected, setSelected] = createSignal<number>()
  const session = () => terminals.get(props.sessionID)
  const entries = () => session()?.terminals ?? []
  const selectedTerminal = () => {
    const index = selected()
    return index === undefined ? undefined : entries()[index]
  }

  onMount(() => {
    const cleanup = composer.register({
      id: "terminals",
      label: "Terminals",
      paneHint: () => {
        const id = selectedTerminal()?.id
        // Nothing to toggle without a visible terminal, and the row the user picked is the one that closes.
        if (!id) return undefined
        // The command title flips between hide and show, so read it live instead of hard-coding a label.
        const title = allCommands().find((command) => command.id === "terminal.toggle")?.title
        if (!title) return undefined
        return {
          label: title.toLowerCase(),
          shortcut: shortcuts.get("terminal.toggle") ?? "",
          command: "terminal.toggle",
        }
      },
      // The trailing entry creates a terminal, so it has nothing to kill.
      hints: () =>
        selectedTerminal()
          ? [
              {
                label: "select",
                shortcut: shortcuts.get("composer.terminal.select") ?? "",
                command: "composer.terminal.select",
              },
              {
                label: "kill",
                shortcut: shortcuts.get("composer.terminal.kill") ?? "",
                command: "composer.terminal.kill",
              },
            ]
          : [],
    })
    onCleanup(cleanup)
  })

  createEffect(() => {
    if (!composer.active("terminals")) return
    const index = entries().findIndex((terminal) => terminal.id === props.visibleTerminalID)
    setSelected(index < 0 ? undefined : index)
  })

  const select = () => {
    const index = selected()
    if (index === undefined) return
    const terminal = entries()[index]
    composer.close()
    if (terminal) {
      void terminals.selectTerminal(props.sessionID, terminal.id).catch(failure)
      return
    }
    void terminals.newTerminal(props.sessionID).catch(failure)
  }

  Keymap.createLayer(() => ({
    mode: "composer",
    enabled: () => composer.active("terminals"),
    priority: 1,
    commands: [
      {
        id: "composer.terminal.up",
        title: "Previous terminal",
        group: "Composer",
        run: () => setSelected((index) => ((index ?? 0) + entries().length) % (entries().length + 1)),
      },
      {
        id: "composer.terminal.down",
        title: "Next terminal",
        group: "Composer",
        run: () => setSelected((index) => ((index ?? -1) + 1) % (entries().length + 1)),
      },
      {
        id: "composer.terminal.select",
        title: "Select terminal",
        group: "Composer",
        run: select,
      },
      {
        id: "composer.terminal.kill",
        title: "Kill terminal",
        group: "Composer",
        run() {
          const terminal = selectedTerminal()
          if (!terminal) return
          // Removing publishes persistent-pty.removed, which refreshes the list and drops the selection.
          client.api.experimental.persistentPty.remove({ ptyID: terminal.id }).catch(failure)
        },
      },
    ],
  }))

  return (
    <Show when={composer.active("terminals")}>
      <scrollbox scrollbarOptions={{ visible: false }} maxHeight={5}>
        <For each={[...entries(), undefined]}>
          {(terminal, index) => {
            const active = createMemo(() => index() === selected())
            const current = () => terminal !== undefined && terminal.id === props.visibleTerminalID
            return (
              <box
                flexDirection="row"
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={
                  active()
                    ? theme.background.action.primary.focused
                    : current()
                      ? theme.background.action.primary.selected
                      : theme.background.action.primary.base
                }
                onMouseMove={() => setSelected(index())}
                onMouseUp={() => {
                  setSelected(index())
                  select()
                }}
              >
                <text
                  fg={
                    active()
                      ? theme.text.action.primary.focused
                      : current()
                        ? theme.text.action.primary.selected
                        : theme.text.action.primary.base
                  }
                  attributes={active() ? TextAttributes.BOLD : undefined}
                  wrapMode="none"
                  truncate
                >
                  {terminal?.foregroundProcess ?? terminal?.title ?? "+ New terminal"}
                </text>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </Show>
  )
}
