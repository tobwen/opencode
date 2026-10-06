import { useData } from "../../context/data"
import { createMemo, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useConfig } from "../../config"
import { useTuiApp } from "../../context/runtime"
import { Slot } from "../../plugin/render"
import { withTimestampedFallback } from "@opencode/util/session-title-fallback"
import { TextAttributes } from "@opentui/core"
import "../../component/title-shimmer"

import { getScrollAcceleration } from "../../util/scroll"
import { collapsedSidebarWidth, SESSION_SIDEBAR_WIDTH } from "../../ui/layout"

export function Sidebar(props: { sessionID: string; collapsed: boolean; onToggleCollapsed: () => void }) {
  const data = useData()
  const theme = useTheme()
  const config = useConfig().data
  const app = useTuiApp()
  const session = createMemo(() => data.session.get(props.sessionID))
  const scrollAcceleration = createMemo(() => getScrollAcceleration(config))
  const width = createMemo(() => (props.collapsed ? collapsedSidebarWidth(app.version) : SESSION_SIDEBAR_WIDTH))

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.background.raised.base}
        width={width()}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position="relative"
      >
        <Show when={!props.collapsed}>
          <text fg={theme.text.muted} wrapMode="none" truncate>
            {props.sessionID}
          </text>
          <box flexShrink={0} paddingRight={2} paddingBottom={1}>
            <title_shimmer
              fg={theme.text.base}
              rename={{
                pending: data.session.title.pending(props.sessionID),
                title: withTimestampedFallback(session()),
              }}
              enabled={config.animations ?? true}
              backdrop={theme.background.raised.base}
              attributes={
                data.session.title.pending(props.sessionID) && config.animations === false
                  ? TextAttributes.DIM
                  : TextAttributes.BOLD
              }
            >
              {withTimestampedFallback(session())}
            </title_shimmer>
          </box>
          <scrollbox
            flexGrow={1}
            minHeight={0}
            scrollAcceleration={scrollAcceleration()}
            // The sidebar only scrolls vertically; a horizontal bar steals a row during initial layout.
            horizontalScrollbarOptions={{ visible: false }}
            verticalScrollbarOptions={{
              // Use the content's reserved right padding instead of changing its width when the bar toggles.
              position: "absolute",
              right: 0,
              top: 0,
              width: 1,
              height: "100%",
              trackOptions: {
                backgroundColor: theme.background.raised.base,
                foregroundColor: theme.scrollbar.base,
              },
            }}
          >
            <box flexShrink={0} gap={1} paddingRight={1}>
              <Slot path="sidebar.content" input={{ sessionID: props.sessionID }} />
            </box>
          </scrollbox>
        </Show>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <Slot
            path="sidebar.footer"
            // The slot input is read once when the slot mounts, so collapsed has to stay a getter
            // or the footer would keep rendering the width it saw at mount time.
            input={{
              sessionID: props.sessionID,
              get collapsed() {
                return props.collapsed
              },
              onToggleCollapsed: () => props.onToggleCollapsed(),
            }}
          />
        </box>
      </box>
    </Show>
  )
}
