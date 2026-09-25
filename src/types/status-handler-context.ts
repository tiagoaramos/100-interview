import type { Invoice } from "./invoice"
import type { PaymentIntent } from "./payment-intent"
import type { ReconcileDeps } from "./reconcile-deps"
import type { ReconcileJob } from "./reconcile-job"

export type StatusHandlerContext = {
  deps: ReconcileDeps
  job: ReconcileJob
  invoice: Invoice
  intent: PaymentIntent
}
