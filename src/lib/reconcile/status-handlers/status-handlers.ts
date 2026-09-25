import type { PaymentIntentStatus } from "../../domain/payment-intent-status.ts"
import type { StatusHandler } from "../status-handler.ts"
import { handleCanceled } from "./handle-canceled.ts"
import { handleProcessing } from "./handle-processing.ts"
import { handleRequiresAction } from "./handle-requires-action.ts"
import { handleRequiresCapture } from "./handle-requires-capture.ts"
import { handleRequiresConfirmation } from "./handle-requires-confirmation.ts"
import { handleRequiresPaymentMethod } from "./handle-requires-payment-method.ts"
import { handleSucceeded } from "./handle-succeeded.ts"

export const statusHandlers: Record<PaymentIntentStatus, StatusHandler> = {
  requires_payment_method: handleRequiresPaymentMethod,
  requires_confirmation: handleRequiresConfirmation,
  requires_action: handleRequiresAction,
  processing: handleProcessing,
  requires_capture: handleRequiresCapture,
  canceled: handleCanceled,
  succeeded: handleSucceeded,
}
