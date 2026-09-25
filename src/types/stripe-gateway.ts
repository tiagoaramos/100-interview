import type { PaymentIntent } from "./payment-intent"

export interface StripeGateway {
  retrievePaymentIntent(id: string): Promise<PaymentIntent>
  listPaymentIntents(customerId: string): Promise<PaymentIntent[]>
}
