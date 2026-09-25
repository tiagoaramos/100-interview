import type { StatusHandler } from "../status-handler.ts"

export const handleRequiresConfirmation: StatusHandler = async () => "awaiting_customer"
