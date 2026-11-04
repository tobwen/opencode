import type { SessionTabsController } from "./session-tabs"
import { useDialog } from "../ui/dialog"
import { DialogConfirm } from "../ui/dialog-confirm"

// The tab controller cannot open dialogs itself, so the strip registers this once and the
// controller asks before every close it performs.
export function useCloseSessionTab(tabs: SessionTabsController) {
  const dialog = useDialog()
  return (sessionID: string, closeNow: () => void) => {
    dialog.replace(() => (
      <DialogConfirm
        title="Close tab"
        message="The session stays available in Recently closed tabs."
        label={{ cancel: "Cancel", confirm: "Close" }}
        onConfirm={closeNow}
      />
    ))
  }
}
