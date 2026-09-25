import type { StatusHandler } from "../status-handler.ts"

export const handleRequiresCapture: StatusHandler = async () => "awaiting_capture"
