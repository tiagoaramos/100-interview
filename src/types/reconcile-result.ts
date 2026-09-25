export type ReconcileResult =
  | "paid"
  | "skipped"
  | "pending"
  | "awaiting_capture"
  | "awaiting_customer"
  | "canceled"
