import type { ChargeType } from "./charge-type"

export type Invoice = {
  id: string
  customerId: string
  currentPaymentIntentId: string
  chargeType: ChargeType
  payment: "unpaid" | "paid"
}
