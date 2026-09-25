import type { StripeSuccessNotification } from "../domain/stripe-success-notification.ts"
import type { ReconcileResult } from "../domain/reconcile-result.ts"
import type { ReconcileDeps } from "../ports/reconcile-deps.ts"
import { reconcileApplicationFee } from "./reconcile-application-fee.ts"

// Returning a result acknowledges the Stripe success notification.
// Throwing asks Stripe to retry until we accept the delivery.
export async function notifyStripePaymentSucceeded(
  deps: ReconcileDeps,
  notification: StripeSuccessNotification,
): Promise<ReconcileResult> {
  return reconcileApplicationFee(deps, {
    applicationId: notification.applicationId,
    paymentIntentId: notification.paymentIntentId,
    description:
      notification.description === undefined ? "stripe webhook" : notification.description,
  })
}
