import type { ChargeType } from "./charge-type.ts"

export type Invoice = {
  id: string
  customerId: string
  currentPaymentIntentId: string
  chargeType: ChargeType
  payment: "unpaid" | "paid"
}
