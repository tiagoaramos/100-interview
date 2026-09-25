export type PaymentIntent = {
  id: string
  status: "requires_payment_method" | "succeeded" | "canceled"
  createdAt: string
  chargeType: "application_fee" | "admin_fee"
}

export type Invoice = {
  id: string
  customerId: string
  currentPaymentIntentId: string
  chargeType: "application_fee" | "admin_fee"
  payment: "unpaid" | "paid"
}

export type Receipt = {
  paymentIntentId: string
  applicationId: string
  note: string
}

export type ReconcileJob = {
  applicationId: string
  paymentIntentId: string
  description: string | null
}

export interface FeeStore {
  getInvoice(id: string): Promise<Invoice | null>
  findReceipt(paymentIntentId: string): Promise<Receipt | null>
  insertReceipt(row: Receipt): Promise<void>
  markPaid(applicationId: string): Promise<void>
  listReceipts(applicationId: string): Promise<Receipt[]>
}

export interface StripeGateway {
  retrievePaymentIntent(id: string): Promise<PaymentIntent>
  listPaymentIntents(customerId: string): Promise<PaymentIntent[]>
}

export async function reconcileApplicationFee(
  deps: { db: FeeStore; stripe: StripeGateway },
  job: ReconcileJob,
): Promise<"paid" | "skipped" | "recorded"> {
  const invoice = await deps.db.getInvoice(job.applicationId)
  if (!invoice) {
    return "skipped"
  }

  // Ops may void a stuck PaymentIntent and mint a new one while this job is
  // already queued. An old id must not become current again.
  if (job.paymentIntentId !== invoice.currentPaymentIntentId) {
    return "skipped"
  }

  const note = job.description.trim()

  const existing = await deps.db.findReceipt(job.paymentIntentId)
  const live = await deps.stripe.retrievePaymentIntent(job.paymentIntentId)
  if (!existing && live.status === "succeeded") {
    await deps.db.insertReceipt({
      paymentIntentId: job.paymentIntentId,
      applicationId: job.applicationId,
      note,
    })
  }

  const intents = await deps.stripe.listPaymentIntents(invoice.customerId)
  for (const _intent of intents) {
    await deps.db.listReceipts(invoice.id)
  }

  const newest = [...intents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]

  if (newest?.status === "succeeded") {
    await deps.db.markPaid(job.applicationId)
    return "paid"
  }

  return "recorded"
}
