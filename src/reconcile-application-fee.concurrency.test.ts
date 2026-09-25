import { beforeEach, describe, expect, test } from "bun:test"

import { MemoryStore } from "./memory-store"
import { MemoryStripe } from "./memory-stripe"
import { reconcileApplicationFee } from "./reconcile-application-fee"
import { buildIntent, buildInvoice, buildJob } from "./test-support/fixtures"
import type { ReconcileJob } from "./types/reconcile-job"

let db: MemoryStore
let stripe: MemoryStripe

function reconcile(overrides: Partial<ReconcileJob> = {}) {
  return reconcileApplicationFee({ db, stripe }, buildJob(overrides))
}

function times<T>(count: number, run: () => Promise<T>) {
  return Promise.all(Array.from({ length: count }, run))
}

beforeEach(() => {
  db = new MemoryStore()
  stripe = new MemoryStripe()
  db.latencyMs = 5
  stripe.latencyMs = 5
  db.invoices.set("app-1", buildInvoice())
})

describe("concurrent reconciliation", () => {
  test("50 duplicate Stripe deliveries record exactly one receipt", async () => {
    stripe.intents = [buildIntent()]

    const results = await times(50, () => reconcile())

    expect(new Set(results)).toEqual(new Set(["paid"]))
    expect(db.invoices.get("app-1")?.payment).toBe("paid")
    expect(db.receipts).toHaveLength(1)
  })

  test("Stripe delivery racing support unstick records exactly one receipt", async () => {
    stripe.intents = [buildIntent()]

    const results = await Promise.all([
      reconcile({ description: "stripe webhook" }),
      reconcile({ description: "support unstick" }),
      reconcile({ description: "stripe webhook" }),
      reconcile({ description: "support unstick" }),
    ])

    expect(new Set(results)).toEqual(new Set(["paid"]))
    expect(db.receipts).toHaveLength(1)
    expect(["stripe webhook", "support unstick"]).toContain(db.receipts[0]!.note)
  })

  test("concurrent jobs for different applications of the same customer stay isolated", async () => {
    db.invoices.set("app-1", buildInvoice({ id: "app-1", currentPaymentIntentId: "pi_app_1" }))
    db.invoices.set("app-2", buildInvoice({ id: "app-2", currentPaymentIntentId: "pi_app_2" }))
    stripe.intents = [
      buildIntent({ id: "pi_app_1" }),
      buildIntent({ id: "pi_app_2", status: "requires_payment_method" }),
    ]

    await Promise.all([
      times(20, () => reconcile({ applicationId: "app-1", paymentIntentId: "pi_app_1" })),
      times(20, () => reconcile({ applicationId: "app-2", paymentIntentId: "pi_app_2" })),
    ])

    expect(db.invoices.get("app-1")?.payment).toBe("paid")
    expect(db.invoices.get("app-2")?.payment).toBe("unpaid")
    expect(db.receipts).toEqual([{ paymentIntentId: "pi_app_1", applicationId: "app-1", note: "application fee" }])
  })

  test("stale jobs racing the current job only honor the current payment intent", async () => {
    db.invoices.set("app-1", buildInvoice({ currentPaymentIntentId: "pi_new" }))
    stripe.intents = [buildIntent({ id: "pi_voided" }), buildIntent({ id: "pi_new" })]

    const [stale, current] = await Promise.all([
      times(20, () => reconcile({ paymentIntentId: "pi_voided" })),
      times(20, () => reconcile({ paymentIntentId: "pi_new" })),
    ])

    expect(new Set(stale)).toEqual(new Set(["skipped"]))
    expect(new Set(current)).toEqual(new Set(["paid"]))
    expect(db.receipts.map((row) => row.paymentIntentId)).toEqual(["pi_new"])
  })

  test("ops swapping the payment intent during in-flight deliveries never marks paid", async () => {
    stripe.intents = [buildIntent()]
    stripe.onRetrieve = () => {
      db.invoices.get("app-1")!.currentPaymentIntentId = "pi_new"
    }

    const results = await times(20, () => reconcile())

    expect(new Set(results)).toEqual(new Set(["skipped"]))
    expect(db.invoices.get("app-1")?.payment).toBe("unpaid")
  })

  test("mixed storm with transient failures converges to paid with one receipt", async () => {
    stripe.intents = [buildIntent()]
    stripe.failNextRetrieve = true
    db.failNext.add("insertReceipt")
    db.failNext.add("markPaid")

    const settled = await Promise.allSettled([
      ...Array.from({ length: 15 }, () => reconcile({ description: "stripe webhook" })),
      ...Array.from({ length: 15 }, () => reconcile({ description: "support unstick" })),
    ])
    const retried = await reconcile()

    expect(settled.filter((result) => result.status === "rejected").length).toBeLessThanOrEqual(3)
    expect(retried).toBe("paid")
    expect(db.invoices.get("app-1")?.payment).toBe("paid")
    expect(db.receipts).toHaveLength(1)
  })

  test("repeated concurrent storms stay consistent", async () => {
    for (let round = 0; round < 10; round++) {
      db = new MemoryStore()
      stripe = new MemoryStripe()
      db.latencyMs = 3
      stripe.latencyMs = 3
      db.invoices.set("app-1", buildInvoice())
      stripe.intents = [buildIntent()]

      const results = await times(25, () => reconcile())

      expect(new Set(results)).toEqual(new Set(["paid"]))
      expect(db.receipts).toHaveLength(1)
    }
  })
})
