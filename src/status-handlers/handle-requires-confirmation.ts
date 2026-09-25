import type { StatusHandler } from "../types/status-handler"

export const handleRequiresConfirmation: StatusHandler = async () => "awaiting_customer"
