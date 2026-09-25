import type { ReconcileResult } from "./reconcile-result"
import type { StatusHandlerContext } from "./status-handler-context"

export type StatusHandler = (context: StatusHandlerContext) => Promise<ReconcileResult>
