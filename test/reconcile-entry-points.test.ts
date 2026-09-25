import { beforeEach, describe, expect, test } from "bun:test"

import {
  notifyStripePaymentSucceeded,
  unstickApplicationFee,
  type StripeSuccessNotification,
  type UnstickCommand,
} from "../src/index.ts"
import { buildIntent, buildInvoice } from "./support/fixtures.ts"
import { MemoryStore } from "./support/memory-store.ts"
import { MemoryStripe } from "./support/memory-stripe.ts"

let db: MemoryStore
let stripe: MemoryStripe

function invoice() {
  return db.invoices.get("app-1")
}

function notify(overrides: Partial<StripeSuccessNotification> = {}) {
  return notifyStripePaymentSucceeded(
    { db, stripe },
    {
      applicationId: "app-1",
      paymentIntentId: "pi_open",
      ...overrides,
    },
  )
}

function unstick(overrides: Partial<UnstickCommand> = {}) {
  return unstickApplicationFee({ db, stripe }, { applicationId: "app-1", ...overrides })
}

beforeEach(() => {
  db = new MemoryStore()
  stripe = new MemoryStripe()
  db.invoices.set("app-1", buildInvoice())
})

describe("Stripe success notification", () => {
  test("records the receipt and marks the application paid", async () => {
    stripe.intents = [buildIntent()]

    expect(await notify()).toBe("paid")
    expect(invoice()?.payment).toBe("paid")
    expect(db.receipts).toEqual([
      { paymentIntentId: "pi_open", applicationId: "app-1", note: "stripe webhook" },
    ])
  })

  test("stale payment intent is acknowledged without a receipt", async () => {
    db.invoices.set("app-1", buildInvoice({ currentPaymentIntentId: "pi_new" }))
    stripe.intents = [
      buildIntent({ id: "pi_voided" }),
      buildIntent({ id: "pi_new", status: "requires_payment_method" }),
    ]

    expect(await notify({ paymentIntentId: "pi_voided" })).toBe("skipped")
    expect(stripe.retrieveCalls).toBe(0)
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.insertCalls).toBe(0)
    expect(db.receipts).toHaveLength(0)
  })

  test("unknown Stripe status throws so the notification is retried", async () => {
    stripe.intents = [buildIntent({ status: "some_future_status" as never })]

    await expect(notify()).rejects.toThrow('Unhandled PaymentIntent status "some_future_status"')
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })
})

describe("support unstick action", () => {
  test("reconciles the invoice current payment intent", async () => {
    stripe.intents = [buildIntent()]

    expect(await unstick()).toBe("paid")
    expect(invoice()?.payment).toBe("paid")
    expect(db.receipts).toEqual([
      { paymentIntentId: "pi_open", applicationId: "app-1", note: "support unstick" },
    ])
  })

  test("uses the current payment intent after ops replaced a stuck one", async () => {
    db.invoices.set("app-1", buildInvoice({ currentPaymentIntentId: "pi_new" }))
    stripe.intents = [
      buildIntent({ id: "pi_voided" }),
      buildIntent({ id: "pi_new" }),
    ]

    expect(await unstick()).toBe("paid")
    expect(invoice()?.currentPaymentIntentId).toBe("pi_new")
    expect(invoice()?.payment).toBe("paid")
    expect(db.receipts.map((row) => row.paymentIntentId)).toEqual(["pi_new"])
  })

  test("missing invoice is skipped without calling Stripe", async () => {
    db.invoices.clear()

    expect(await unstick()).toBe("skipped")
    expect(stripe.retrieveCalls).toBe(0)
  })

  test("unpaid current payment intent does not mark the application paid", async () => {
    stripe.intents = [buildIntent({ status: "requires_payment_method" })]

    expect(await unstick()).toBe("awaiting_customer")
    expect(invoice()?.payment).toBe("unpaid")
    expect(db.receipts).toHaveLength(0)
  })
})

describe("notification and unstick together", () => {
  test("duplicate Stripe notification and support unstick record one receipt", async () => {
    stripe.intents = [buildIntent()]

    const results = await Promise.all([notify(), unstick(), notify(), unstick()])

    expect(new Set(results)).toEqual(new Set(["paid"]))
    expect(invoice()?.payment).toBe("paid")
    expect(db.receipts).toHaveLength(1)
    expect(["stripe webhook", "support unstick"]).toContain(db.receipts[0]!.note)
  })
})
