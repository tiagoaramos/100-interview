import type { StatusHandler } from "../types/status-handler"

export const handleSucceeded: StatusHandler = async ({ deps, job, invoice, intent }) => {
  if (invoice.chargeType !== "application_fee" || intent.chargeType !== "application_fee") {
    return "skipped"
  }

  await deps.db.insertReceipt({
    paymentIntentId: intent.id,
    applicationId: job.applicationId,
    note: job.description?.trim() ?? "",
  })

  const marked = await deps.db.markPaid(job.applicationId, intent.id)
  return marked ? "paid" : "skipped"
}
