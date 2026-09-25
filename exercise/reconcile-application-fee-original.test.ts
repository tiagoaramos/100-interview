import { beforeEach, describe, expect, test } from "bun:test"

import {
  reconcileApplicationFee as reconcileFixed,
  type FeeStore as FixedFeeStore,
  type StripeGateway as FixedStripeGateway,
} from "../src/index.ts"
import {
  reconcileApplicationFee,
  type FeeStore,
  type Invoice,
  type PaymentIntent,
  type Receipt,
  type StripeGateway,
} from "./reconcile-application-fee-original.ts"

let invoice: Invoice
let receipts: Receipt[]
let retrieveCalls: number
let db: FixedFeeStore
let stripe: FixedStripeGateway

beforeEach(() => {
  invoice = {
    id: "app-1",
    customerId: "cus-1",
    currentPaymentIntentId: "pi_open",
    chargeType: "application_fee",
    payment: "unpaid",
  }
  receipts = []
  retrieveCalls = 0

  const intents: PaymentIntent[] = [
    {
      id: "pi_open",
      status: "succeeded",
      createdAt: "2026-09-20T12:00:00.000Z",
      chargeType: "application_fee",
    },
  ]

  db = {
    async getInvoice() {
      return invoice
    },
    async findReceipt(paymentIntentId) {
      return receipts.find((row) => row.paymentIntentId === paymentIntentId) ?? null
    },
    async insertReceipt(row) {
      receipts.push(row)
    },
    async markPaid(_applicationId, paymentIntentId) {
      if (invoice.currentPaymentIntentId !== paymentIntentId) {
        return false
      }
      invoice.payment = "paid"
      return true
    },
    async listReceipts(applicationId) {
      return receipts.filter((row) => row.applicationId === applicationId)
    },
  }

  stripe = {
    async retrievePaymentIntent(id) {
      retrieveCalls++
      const found = intents.find((row) => row.id === id)
      if (!found) throw new Error(`missing intent ${id}`)
      return found
    },
    async listPaymentIntents() {
      return intents
    },
  }
})

const nullDescriptionJob = {
  applicationId: "app-1",
  paymentIntentId: "pi_open",
  description: null,
}

describe("null description", () => {
  test("original fails before a receipt is recorded", async () => {
    await expect(
      reconcileApplicationFee(
        { db: db as FeeStore, stripe: stripe as StripeGateway },
        nullDescriptionJob,
      ),
    ).rejects.toThrow(TypeError)

    expect(invoice.payment).toBe("unpaid")
    expect(receipts).toHaveLength(0)
    expect(retrieveCalls).toBe(0)
  })

  test("fixed version stores an empty note and marks the application paid", async () => {
    expect(await reconcileFixed({ db, stripe }, nullDescriptionJob)).toBe("paid")

    expect(invoice.payment).toBe("paid")
    expect(receipts).toEqual([{ paymentIntentId: "pi_open", applicationId: "app-1", note: "" }])
    expect(retrieveCalls).toBe(1)
  })
})
