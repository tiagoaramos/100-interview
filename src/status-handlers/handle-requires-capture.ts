import type { StatusHandler } from "../types/status-handler"

export const handleRequiresCapture: StatusHandler = async () => "awaiting_capture"
