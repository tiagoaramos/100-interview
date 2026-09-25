import type { ReconcileResult } from "../domain/reconcile-result.ts"
import type { StatusHandlerContext } from "./status-handler-context.ts"

export type StatusHandler = (context: StatusHandlerContext) => Promise<ReconcileResult>
