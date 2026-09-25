import type { StatusHandler } from "../status-handler.ts"

export const handleSucceeded: StatusHandler = async ({ deps, job, intent }) => {
  if (intent.chargeType !== "application_fee") {
    return "skipped"
  }

  const latest = await deps.db.getInvoice(job.applicationId)
  if (
    !latest ||
    latest.chargeType !== "application_fee" ||
    latest.currentPaymentIntentId !== intent.id
  ) {
    return "skipped"
  }

  const existing = await deps.db.findReceipt(intent.id)
  if (!existing) {
    const accepted = await deps.db.insertReceiptIfCurrent(job.applicationId, {
      paymentIntentId: intent.id,
      applicationId: job.applicationId,
      note: job.description?.trim() ?? "",
    })
    if (!accepted) {
      return "skipped"
    }
  }

  const marked = await deps.db.markPaid(job.applicationId, intent.id)
  return marked ? "paid" : "skipped"
}
