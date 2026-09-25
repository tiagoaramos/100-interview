import type { Invoice } from "../domain/invoice.ts"
import type { Receipt } from "../domain/receipt.ts"

export interface FeeStore {
  getInvoice(id: string): Promise<Invoice | null>
  findReceipt(paymentIntentId: string): Promise<Receipt | null>
  // Must be atomic and idempotent per paymentIntentId (unique constraint +
  // insert-or-ignore); concurrent deliveries rely on it to avoid duplicates.
  insertReceipt(row: Receipt): Promise<void>
  // Inserts only while the invoice still expects this PaymentIntent. Returns
  // false without writing when ops swapped currentPaymentIntentId.
  insertReceiptIfCurrent(applicationId: string, row: Receipt): Promise<boolean>
  // Compare-and-set: only marks paid while the invoice still expects
  // paymentIntentId. Returns false when ops swapped the payment in between.
  markPaid(applicationId: string, paymentIntentId: string): Promise<boolean>
  listReceipts(applicationId: string): Promise<Receipt[]>
}
