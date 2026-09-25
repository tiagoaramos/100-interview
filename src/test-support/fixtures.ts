import type { Invoice } from "../types/invoice"
import type { PaymentIntent } from "../types/payment-intent"
import type { ReconcileJob } from "../types/reconcile-job"

export function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "app-1",
    customerId: "cus-1",
    currentPaymentIntentId: "pi_open",
    chargeType: "application_fee",
    payment: "unpaid",
    ...overrides,
  }
}

export function buildIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: "pi_open",
    status: "succeeded",
    createdAt: "2026-09-20T12:00:00.000Z",
    chargeType: "application_fee",
    ...overrides,
  }
}

export function buildJob(overrides: Partial<ReconcileJob> = {}): ReconcileJob {
  return {
    applicationId: "app-1",
    paymentIntentId: "pi_open",
    description: "application fee",
    ...overrides,
  }
}
