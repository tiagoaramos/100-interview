import type { FeeStore, Invoice, Receipt } from "../../src/index.ts"

export class MemoryStore implements FeeStore {
  invoices = new Map<string, Invoice>()
  receipts: Receipt[] = []
  latencyMs = 0
  failNext = new Set<keyof FeeStore>()

  async getInvoice(id: string): Promise<Invoice | null> {
    await this.pause("getInvoice")
    const invoice = this.invoices.get(id)
    return invoice ? { ...invoice } : null
  }

  async findReceipt(paymentIntentId: string): Promise<Receipt | null> {
    await this.pause("findReceipt")
    const receipt = this.receipts.find((row) => row.paymentIntentId === paymentIntentId)
    return receipt ? { ...receipt } : null
  }

  async insertReceipt(row: Receipt): Promise<void> {
    await this.pause("insertReceipt")
    if (this.receipts.some((existing) => existing.paymentIntentId === row.paymentIntentId)) {
      return
    }
    this.receipts.push({ ...row })
  }

  async markPaid(applicationId: string, paymentIntentId: string): Promise<boolean> {
    await this.pause("markPaid")
    const invoice = this.invoices.get(applicationId)
    if (!invoice || invoice.currentPaymentIntentId !== paymentIntentId) {
      return false
    }
    invoice.payment = "paid"
    return true
  }

  async listReceipts(applicationId: string): Promise<Receipt[]> {
    await this.pause("listReceipts")
    return this.receipts
      .filter((row) => row.applicationId === applicationId)
      .map((row) => ({ ...row }))
  }

  private async pause(operation: keyof FeeStore): Promise<void> {
    await Bun.sleep(Math.random() * this.latencyMs)
    if (this.failNext.delete(operation)) {
      throw new Error(`${operation} failed`)
    }
  }
}
