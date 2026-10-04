import type { SessionTabsController } from "./session-tabs"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"

// The tab controller cannot open dialogs itself, so the strip registers this once and the
// controller asks before every close it performs.
export function useCloseSessionTab(tabs: SessionTabsController) {
  const dialog = useDialog()
  return (sessionID: string, closeNow: () => void) => {
    dialog.replace(() => (
      <DialogSelect
        title="Close tab"
        renderFilter={false}
        // DialogSelect routes mouse and keyboard through these two, so the window always closes.
        onCancel={dialog.clear}
        onSelect={(option) => {
          dialog.clear()
          // closeNow skips the controller entry point, which would ask again.
          if (option.value === "close") closeNow()
        }}
        options={[
          { title: "Cancel", value: "cancel" },
          { title: "Close", value: "close" },
        ]}
      />
    ))
  }
}
