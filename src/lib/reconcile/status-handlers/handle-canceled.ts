import type { StatusHandler } from "../status-handler.ts"

export const handleCanceled: StatusHandler = async () => "canceled"
