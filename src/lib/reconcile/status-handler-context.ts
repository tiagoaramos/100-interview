import type { Invoice } from "../domain/invoice.ts"
import type { PaymentIntent } from "../domain/payment-intent.ts"
import type { ReconcileJob } from "../domain/reconcile-job.ts"
import type { ReconcileDeps } from "../ports/reconcile-deps.ts"

export type StatusHandlerContext = {
  deps: ReconcileDeps
  job: ReconcileJob
  invoice: Invoice
  intent: PaymentIntent
}
