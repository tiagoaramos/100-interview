import type { PaymentIntent, StripeGateway } from "../../src/index.ts"

export class MemoryStripe implements StripeGateway {
  intents: PaymentIntent[] = []
  latencyMs = 0
  failNextRetrieve = false
  retrieveCalls = 0
  onRetrieve: ((id: string) => void) | null = null

  async retrievePaymentIntent(id: string): Promise<PaymentIntent> {
    this.retrieveCalls++
    this.onRetrieve?.(id)
    await Bun.sleep(Math.random() * this.latencyMs)
    if (this.failNextRetrieve) {
      this.failNextRetrieve = false
      throw new Error("Stripe unavailable")
    }
    const found = this.intents.find((row) => row.id === id)
    if (!found) throw new Error(`missing intent ${id}`)
    return { ...found }
  }

  async listPaymentIntents(_customerId: string): Promise<PaymentIntent[]> {
    return this.intents.map((row) => ({ ...row }))
  }
}
