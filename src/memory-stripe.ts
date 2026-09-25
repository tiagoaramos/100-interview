import type { PaymentIntent } from "./types/payment-intent"
import type { StripeGateway } from "./types/stripe-gateway"

export class MemoryStripe implements StripeGateway {
  intents: PaymentIntent[] = []
  latencyMs = 0
  failNextRetrieve = false
  retrieveCalls = 0
  onRetrieve: ((id: string) => void) | null = null

  async retrievePaymentIntent(id: string) {
    this.retrieveCalls++
    this.onRetrieve?.(id)
    await new Promise((resolve) => setTimeout(resolve, Math.random() * this.latencyMs))
    if (this.failNextRetrieve) {
      this.failNextRetrieve = false
      throw new Error("Stripe unavailable")
    }
    const found = this.intents.find((row) => row.id === id)
    if (!found) throw new Error(`missing intent ${id}`)
    return { ...found }
  }

  async listPaymentIntents() {
    return this.intents.map((row) => ({ ...row }))
  }
}
