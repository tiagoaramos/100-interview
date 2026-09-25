import type { FeeStore } from "./fee-store.ts"
import type { StripeGateway } from "./stripe-gateway.ts"

export type ReconcileDeps = {
  db: FeeStore
  stripe: StripeGateway
}
