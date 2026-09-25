import type { ChargeType } from "./charge-type"
import type { PaymentIntentStatus } from "./payment-intent-status"

export type PaymentIntent = {
  id: string
  status: PaymentIntentStatus
  createdAt: string
  // Comes from Stripe metadata, which may be missing or unrecognized.
  chargeType: ChargeType | null
}
