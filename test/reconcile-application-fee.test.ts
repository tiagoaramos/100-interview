import { beforeEach, describe, expect, test } from "bun:test"

import {
  reconcileApplicationFee,
  type ChargeType,
  type PaymentIntentStatus,
  type ReconcileJob,
  type ReconcileResult,
} from "../src/index.ts"
import { buildIntent, buildInvoice, buildJob } from "./support/fixtures.ts"
import { MemoryStore } from "./support/memory-store.ts"
import { MemoryStripe } from "./support/memory-stripe.ts"

let db: MemoryStore
let stripe: MemoryStripe

function invoice() {
  return db.invoices.get("app-1")
}

function reconcile(overrides: Partial<ReconcileJob> = {}) {
  return reconcileApplicationFee({ db, stripe }, buildJob(overrides))
}

beforeEach(() => {
  db = new MemoryStore()
  stripe = new MemoryStripe()
  db.invoices.set("app-1", buildInvoice())
})

describe("succeeded sign-up fee", () => {
  test("records one receipt and marks the application paid", async () => {
    stripe.intents = [buildIntent()]

    expect(await reconcile()).toBe("paid")
    expect(invoice()?.payment).toBe("paid")
    expect(db.receipts).toEqual([
      { paymentIntentId: "pi_open", applicationId: "app-1", note: "application fee" },
    ])
  })

  test("null description is stored as an empty note", async () => {
    stripe.intents = [buildIntent()]

    expect(await reconcile({ description: null })).toBe("paid")
    expect(db.receipts[0]?.note).toBe("")
  })

  test("description whitespace is trimmed", async () => {
    stripe.intents = [buildIntent()]

    await reconcile({ description: "   support unstick \n" })

    expect(db.receipts[0]?.note).toBe("support unstick")
  })

  test("does not insert a second receipt when one already exists", async () => {
    stripe.intents = [buildIntent()]
    db.receipts.push({ paymentIntentId: "pi_open", applicationId: "app-1", note: "application fee" })

    expect(await reconcile()).toBe("paid")
    expect(db.receipts).toHaveLength(1)
  })

  test("repeated deliveries after paid stay paid with a single receipt", async () => {
    stripe.intents = [buildIntent()]

    const results = [await reconcile(), await reconcile(), await reconcile()]

    expect(results).toEqual(["paid", "paid", "paid"])
    expect(db.receipts).toHaveLength(1)
  })
})

describe("charge type guards", () => {
  test("a newer succeeded admin fee on the customer does not mark the application paid", async () => {
    stripe.intents = [
      buildIntent({ status: "requires_payment_method" }),
      buildIntent({
        id: "pi_admin",
        createdAt: "2026-09-21T09:00:00.000Z",
        chargeType: "admin_fee",
      }),
    ]

    expect(await reconcile()).toBe("awaiting_customer")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })

  test("a succeeded fee from an earlier application does not mark this one paid", async () => {
    stripe.intents = [
      buildIntent({ id: "pi_previous_application", createdAt: "2026-01-10T12:00:00.000Z" }),
      buildIntent({ status: "requires_payment_method" }),
    ]

    expect(await reconcile()).toBe("awaiting_customer")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })

  test.each<[ChargeType | null]>([["admin_fee"], [null]])(
    "succeeded intent with charge type %p does not mark paid",
    async (chargeType) => {
      stripe.intents = [buildIntent({ chargeType })]

      expect(await reconcile()).toBe("skipped")
      expect(invoice()?.payment).toBe("unpaid")
      expect(db.receipts).toHaveLength(0)
    },
  )

  test("admin fee invoice is not marked paid by a succeeded sign-up intent", async () => {
    db.invoices.set("app-1", buildInvoice({ chargeType: "admin_fee" }))
    stripe.intents = [buildIntent()]

    expect(await reconcile()).toBe("skipped")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })
})

describe("non-succeeded statuses", () => {
  test.each<[PaymentIntentStatus, ReconcileResult]>([
    ["requires_payment_method", "awaiting_customer"],
    ["requires_confirmation", "awaiting_customer"],
    ["requires_action", "awaiting_customer"],
    ["processing", "pending"],
    ["requires_capture", "awaiting_capture"],
    ["canceled", "canceled"],
  ])("%s returns %s without marking paid", async (status, expected) => {
    stripe.intents = [buildIntent({ status })]

    expect(await reconcile()).toBe(expected)
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })

  test("processing that later succeeds is marked paid on the next delivery", async () => {
    stripe.intents = [buildIntent({ status: "processing" })]
    expect(await reconcile()).toBe("pending")

    stripe.intents = [buildIntent({ status: "succeeded" })]
    expect(await reconcile()).toBe("paid")
    expect(db.receipts).toHaveLength(1)
  })

  test("unknown status from Stripe throws so the notification is retried", async () => {
    stripe.intents = [buildIntent({ status: "some_future_status" as never })]

    await expect(reconcile()).rejects.toThrow('Unhandled PaymentIntent status "some_future_status"')
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })
})

describe("stale and mismatched jobs", () => {
  test("missing invoice is skipped without calling Stripe", async () => {
    db.invoices.clear()

    expect(await reconcile()).toBe("skipped")
    expect(stripe.retrieveCalls).toBe(0)
  })

  test("voided payment intent is skipped even if it succeeded", async () => {
    db.invoices.set("app-1", buildInvoice({ currentPaymentIntentId: "pi_new" }))
    stripe.intents = [
      buildIntent({ id: "pi_voided" }),
      buildIntent({ id: "pi_new", status: "requires_payment_method" }),
    ]

    expect(await reconcile({ paymentIntentId: "pi_voided" })).toBe("skipped")
    expect(stripe.retrieveCalls).toBe(0)
    expect(invoice()?.currentPaymentIntentId).toBe("pi_new")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })

  test("ops swapping the payment intent while Stripe responds prevents marking paid", async () => {
    stripe.intents = [buildIntent()]
    stripe.onRetrieve = () => {
      db.invoices.get("app-1")!.currentPaymentIntentId = "pi_new"
    }

    expect(await reconcile()).toBe("skipped")
    expect(invoice()?.payment).toBe("unpaid")
    expect(invoice()?.currentPaymentIntentId).toBe("pi_new")
  })

  test("Stripe returning a different payment intent throws", async () => {
    stripe.retrievePaymentIntent = async () => buildIntent({ id: "pi_other" })

    await expect(reconcile()).rejects.toThrow("Stripe returned pi_other when pi_open was requested")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })
})

describe("failures and retries", () => {
  test("Stripe outage throws without side effects and the retry succeeds", async () => {
    stripe.intents = [buildIntent()]
    stripe.failNextRetrieve = true

    await expect(reconcile()).rejects.toThrow("Stripe unavailable")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)

    expect(await reconcile()).toBe("paid")
    expect(db.receipts).toHaveLength(1)
  })

  test("receipt insert failure leaves the application unpaid and the retry succeeds", async () => {
    stripe.intents = [buildIntent()]
    db.failNext.add("insertReceipt")

    await expect(reconcile()).rejects.toThrow("insertReceipt failed")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)

    expect(await reconcile()).toBe("paid")
    expect(db.receipts).toHaveLength(1)
  })

  test("markPaid failure after the receipt is recorded is healed by the retry", async () => {
    stripe.intents = [buildIntent()]
    db.failNext.add("markPaid")

    await expect(reconcile()).rejects.toThrow("markPaid failed")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(1)

    expect(await reconcile()).toBe("paid")
    expect(invoice()?.payment).toBe("paid")
    expect(db.receipts).toHaveLength(1)
  })

  test("invoice lookup failure throws before touching Stripe", async () => {
    stripe.intents = [buildIntent()]
    db.failNext.add("getInvoice")

    await expect(reconcile()).rejects.toThrow("getInvoice failed")
    expect(stripe.retrieveCalls).toBe(0)
  })
})
