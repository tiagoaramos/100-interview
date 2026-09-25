import { statusHandlers } from "./status-handlers/status-handlers"
import type { ReconcileDeps } from "./types/reconcile-deps"
import type { ReconcileJob } from "./types/reconcile-job"
import type { ReconcileResult } from "./types/reconcile-result"

export async function reconcileApplicationFee(
  deps: ReconcileDeps,
  job: ReconcileJob,
): Promise<ReconcileResult> {
  const invoice = await deps.db.getInvoice(job.applicationId)
  if (!invoice) {
    return "skipped"
  }

  // Ops may void a stuck PaymentIntent and mint a new one while this job is
  // already queued. An old id must not become current again.
  if (job.paymentIntentId !== invoice.currentPaymentIntentId) {
    return "skipped"
  }

  const intent = await deps.stripe.retrievePaymentIntent(job.paymentIntentId)
  if (intent.id !== job.paymentIntentId) {
    throw new Error(`Stripe returned ${intent.id} when ${job.paymentIntentId} was requested`)
  }

  // Stripe can introduce statuses the gateway does not know yet; fail loudly so
  // the notification is retried instead of silently acknowledged.
  const handler = statusHandlers[intent.status]
  if (!handler) {
    throw new Error(`Unhandled PaymentIntent status "${intent.status}" for ${intent.id}`)
  }

  return handler({ deps, job, invoice, intent })
}
