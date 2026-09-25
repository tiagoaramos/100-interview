import type { FeeStore } from "./fee-store"
import type { StripeGateway } from "./stripe-gateway"

export type ReconcileDeps = {
  db: FeeStore
  stripe: StripeGateway
}
