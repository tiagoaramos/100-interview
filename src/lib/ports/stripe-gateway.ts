import type { PaymentIntent } from "../domain/payment-intent.ts"

export interface StripeGateway {
  retrievePaymentIntent(id: string): Promise<PaymentIntent>
  listPaymentIntents(customerId: string): Promise<PaymentIntent[]>
}
