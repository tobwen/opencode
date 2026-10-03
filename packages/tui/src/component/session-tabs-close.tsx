import { useConfig } from "../config"
import type { SessionTabsController } from "./session-tabs"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"

// The tab controller cannot open dialogs itself, so the strip registers this once and the
// controller asks before every close it performs.
export function useCloseSessionTab(tabs: SessionTabsController) {
  const dialog = useDialog()
  const config = useConfig().data
  return (sessionID: string) => {
    if (!config.session.confirm_tab_close) {
      tabs.close(sessionID)
      return
    }
    dialog.replace(() => (
      <DialogSelect
        title="Close tab"
        renderFilter={false}
        // DialogSelect routes mouse and keyboard through these two, so the window always closes.
        onCancel={dialog.clear}
        onSelect={(option) => {
          dialog.clear()
          if (option.value === "close") tabs.close(sessionID)
        }}
        options={[
          { title: "Cancel", value: "cancel" },
          { title: "Close", value: "close" },
        ]}
      />
    ))
  }
}
