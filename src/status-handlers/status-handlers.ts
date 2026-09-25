import type { PaymentIntentStatus } from "../types/payment-intent-status"
import type { StatusHandler } from "../types/status-handler"
import { handleCanceled } from "./handle-canceled"
import { handleProcessing } from "./handle-processing"
import { handleRequiresAction } from "./handle-requires-action"
import { handleRequiresCapture } from "./handle-requires-capture"
import { handleRequiresConfirmation } from "./handle-requires-confirmation"
import { handleRequiresPaymentMethod } from "./handle-requires-payment-method"
import { handleSucceeded } from "./handle-succeeded"

export const statusHandlers: Record<PaymentIntentStatus, StatusHandler> = {
  requires_payment_method: handleRequiresPaymentMethod,
  requires_confirmation: handleRequiresConfirmation,
  requires_action: handleRequiresAction,
  processing: handleProcessing,
  requires_capture: handleRequiresCapture,
  canceled: handleCanceled,
  succeeded: handleSucceeded,
}
