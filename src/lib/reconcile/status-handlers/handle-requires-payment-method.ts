import type { StatusHandler } from "../status-handler.ts"

export const handleRequiresPaymentMethod: StatusHandler = async () => "awaiting_customer"
