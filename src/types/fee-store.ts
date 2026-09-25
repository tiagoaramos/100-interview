import type { Invoice } from "./invoice"
import type { Receipt } from "./receipt"

export interface FeeStore {
  getInvoice(id: string): Promise<Invoice | null>
  findReceipt(paymentIntentId: string): Promise<Receipt | null>
  // Must be atomic and idempotent per paymentIntentId (unique constraint +
  // insert-or-ignore); concurrent deliveries rely on it to avoid duplicates.
  insertReceipt(row: Receipt): Promise<void>
  // Compare-and-set: only marks paid while the invoice still expects
  // paymentIntentId. Returns false when ops swapped the payment in between.
  markPaid(applicationId: string, paymentIntentId: string): Promise<boolean>
  listReceipts(applicationId: string): Promise<Receipt[]>
}
