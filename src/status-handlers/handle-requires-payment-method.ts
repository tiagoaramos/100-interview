import type { StatusHandler } from "../types/status-handler"

export const handleRequiresPaymentMethod: StatusHandler = async () => "awaiting_customer"
