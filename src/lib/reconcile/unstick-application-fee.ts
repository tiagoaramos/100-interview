import type { UnstickCommand } from "../domain/unstick-command.ts"
import type { ReconcileResult } from "../domain/reconcile-result.ts"
import type { ReconcileDeps } from "../ports/reconcile-deps.ts"
import { reconcileApplicationFee } from "./reconcile-application-fee.ts"

export async function unstickApplicationFee(
  deps: ReconcileDeps,
  command: UnstickCommand,
): Promise<ReconcileResult> {
  const invoice = await deps.db.getInvoice(command.applicationId)
  if (!invoice) {
    return "skipped"
  }

  return reconcileApplicationFee(deps, {
    applicationId: command.applicationId,
    paymentIntentId: invoice.currentPaymentIntentId,
    description: command.description === undefined ? "support unstick" : command.description,
  })
}
