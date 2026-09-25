# Exercise A — Sign-up fee reconciliation

**Time:** ~20 minutes. **AI:** use whatever you’d use at work; be ready to
justify anything you accept.

You are reviewing a PR from a teammate (AI-assisted). Tests in the PR pass.
Produce a ranked review: merge-blockers first, then wrong-but-not-blocking,
then things you would leave alone. Ask the interviewer any questions about
how this part of the product is supposed to work.

---

## Domain brief

Someone applying to rent pays a **sign-up fee** before we check income or
credit. It is the fee to apply, not rent and not a deposit. They cannot
continue until that fee is paid for *this* application. If we mark it paid
when they did not pay it, they skip a charge we owe the property.

- We take the money in **Stripe**. Stripe tells us when a payment succeeds,
  and keeps retrying until we say we got it.
- Support can also run this when someone says they paid and the app still
  shows the pay step.
- Starting a payment does not charge them. We only let them continue after
  we record a receipt and mark the application paid. Doing that for the
  wrong payment gives the fee away.
- The same customer can already have a successful payment from an earlier
  application, or a later **admin fee** (an extra charge, such as extra
  screening). Neither of those is this sign-up fee.

**What we store**

- One open invoice per application: the payment we currently expect
  (`currentPaymentIntentId`).
- `chargeType` is `application_fee` (the sign-up fee) or `admin_fee` (the
  extra charge).
- `payment` is `unpaid` or `paid`.
- A **receipt** is our record that one specific payment actually went
  through.

**The rule:** only a successful sign-up fee for this application marks it
paid.

**While a job is already queued,** ops can cancel a stuck payment and put a
new one on the invoice. The old job can still arrive. It must not treat the
old payment as the one we still expect.

---

## Ticket (CAV-9104)

Applicants get stuck on the pay step even when Stripe's dashboard shows a
succeeded PaymentIntent on the customer. Support has to mark them paid by
hand.

- Add `reconcileApplicationFee` and run it from the Stripe success
  notification and from a support “unstick” action.
- If the customer's **newest** PaymentIntent (by `createdAt`) has status
  `succeeded`, mark the application paid and move on. Do not make support
  inspect charge types.
- Constraint: if we already have a receipt for the PaymentIntent on the job,
  do not insert a second one.

---

## What to hand back

1. Ranked findings (severity first).
2. For each: what’s wrong, what happens in production, how you’d verify.
3. Anything you looked at and decided was fine - say why.
4. Final verdict: merge, request changes, or block.

---

## `reconcile-application-fee.ts`

```ts
export type PaymentIntent = {
  id: string
  status: "requires_payment_method" | "succeeded" | "canceled"
  createdAt: string
  chargeType: "application_fee" | "admin_fee"
}

export type Invoice = {
  id: string
  customerId: string
  currentPaymentIntentId: string
  chargeType: "application_fee" | "admin_fee"
  payment: "unpaid" | "paid"
}

export type Receipt = {
  paymentIntentId: string
  applicationId: string
  note: string
}

export type ReconcileJob = {
  applicationId: string
  paymentIntentId: string
  description: string | null
}

export interface FeeStore {
  getInvoice(id: string): Promise<Invoice | null>
  findReceipt(paymentIntentId: string): Promise<Receipt | null>
  insertReceipt(row: Receipt): Promise<void>
  markPaid(applicationId: string): Promise<void>
  listReceipts(applicationId: string): Promise<Receipt[]>
}

export interface StripeGateway {
  retrievePaymentIntent(id: string): Promise<PaymentIntent>
  listPaymentIntents(customerId: string): Promise<PaymentIntent[]>
}

export async function reconcileApplicationFee(
  deps: { db: FeeStore; stripe: StripeGateway },
  job: ReconcileJob,
): Promise<"paid" | "skipped" | "recorded"> {
  const invoice = await deps.db.getInvoice(job.applicationId)
  if (!invoice) {
    return "skipped"
  }

  // Ops may void a stuck PaymentIntent and mint a new one while this job is
  // already queued. An old id must not become current again.
  if (job.paymentIntentId !== invoice.currentPaymentIntentId) {
    return "skipped"
  }

  const note = job.description.trim()

  const existing = await deps.db.findReceipt(job.paymentIntentId)
  const live = await deps.stripe.retrievePaymentIntent(job.paymentIntentId)
  if (!existing && live.status === "succeeded") {
    await deps.db.insertReceipt({
      paymentIntentId: job.paymentIntentId,
      applicationId: job.applicationId,
      note,
    })
  }

  const intents = await deps.stripe.listPaymentIntents(invoice.customerId)
  for (const _intent of intents) {
    await deps.db.listReceipts(invoice.id)
  }

  const newest = [...intents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]

  if (newest?.status === "succeeded") {
    await deps.db.markPaid(job.applicationId)
    return "paid"
  }

  return "recorded"
}
```

---

## `reconcile-application-fee.test.ts`

```ts
import { beforeEach, expect, test } from "bun:test"

import {
  reconcileApplicationFee,
  type FeeStore,
  type Invoice,
  type PaymentIntent,
  type Receipt,
  type StripeGateway,
} from "./reconcile-application-fee"

class MemoryStore implements FeeStore {
  invoice: Invoice | null = null
  receipts: Receipt[] = []

  async getInvoice() {
    return this.invoice
  }
  async findReceipt(paymentIntentId: string) {
    return this.receipts.find((row) => row.paymentIntentId === paymentIntentId) ?? null
  }
  async insertReceipt(row: Receipt) {
    this.receipts.push(row)
  }
  async markPaid() {
    if (this.invoice) this.invoice.payment = "paid"
  }
  async listReceipts(applicationId: string) {
    return this.receipts.filter((row) => row.applicationId === applicationId)
  }
}

class MemoryStripe implements StripeGateway {
  intents: PaymentIntent[] = []
  async retrievePaymentIntent(id: string) {
    const found = this.intents.find((row) => row.id === id)
    if (!found) throw new Error(`missing intent ${id}`)
    return found
  }
  async listPaymentIntents() {
    return this.intents
  }
}

let db: MemoryStore
let stripe: MemoryStripe

beforeEach(() => {
  db = new MemoryStore()
  stripe = new MemoryStripe()
  db.invoice = {
    id: "app-1",
    customerId: "cus-1",
    currentPaymentIntentId: "pi_open",
    chargeType: "application_fee",
    payment: "unpaid",
  }
})

test("signup application fee success marks the application paid", async () => {
  stripe.intents = [
    {
      id: "pi_open",
      status: "succeeded",
      createdAt: "2026-09-20T12:00:00.000Z",
      chargeType: "application_fee",
    },
  ]

  const status = await reconcileApplicationFee(
    { db, stripe },
    { applicationId: "app-1", paymentIntentId: "pi_open", description: "application fee" },
  )

  expect(status).toBe("paid")
  expect(db.invoice?.payment).toBe("paid")
  expect(db.receipts).toHaveLength(1)
})

test("newest succeeded intent marks the application paid", async () => {
  stripe.intents = [
    {
      id: "pi_open",
      status: "requires_payment_method",
      createdAt: "2026-09-20T12:00:00.000Z",
      chargeType: "application_fee",
    },
    {
      id: "pi_old_admin",
      status: "succeeded",
      createdAt: "2026-09-21T09:00:00.000Z",
      chargeType: "admin_fee",
    },
  ]

  const status = await reconcileApplicationFee(
    { db, stripe },
    { applicationId: "app-1", paymentIntentId: "pi_open", description: "application fee" },
  )

  expect(status).toBe("paid")
  expect(db.invoice?.payment).toBe("paid")
  expect(db.receipts).toHaveLength(0)
})

test("does not insert a second receipt for the same payment intent", async () => {
  stripe.intents = [
    {
      id: "pi_open",
      status: "succeeded",
      createdAt: "2026-09-20T12:00:00.000Z",
      chargeType: "application_fee",
    },
  ]
  db.receipts.push({
    paymentIntentId: "pi_open",
    applicationId: "app-1",
    note: "application fee",
  })

  await reconcileApplicationFee(
    { db, stripe },
    { applicationId: "app-1", paymentIntentId: "pi_open", description: "application fee" },
  )

  expect(db.receipts).toHaveLength(1)
})

test("stale payment intent does not overwrite the current charge", async () => {
  db.invoice!.currentPaymentIntentId = "pi_new"
  stripe.intents = [
    {
      id: "pi_voided",
      status: "canceled",
      createdAt: "2026-09-20T11:00:00.000Z",
      chargeType: "application_fee",
    },
    {
      id: "pi_new",
      status: "requires_payment_method",
      createdAt: "2026-09-20T12:00:00.000Z",
      chargeType: "application_fee",
    },
  ]

  const status = await reconcileApplicationFee(
    { db, stripe },
    { applicationId: "app-1", paymentIntentId: "pi_voided", description: "application fee" },
  )

  expect(status).toBe("skipped")
  expect(db.invoice?.currentPaymentIntentId).toBe("pi_new")
  expect(db.invoice?.payment).toBe("unpaid")
  expect(db.receipts).toHaveLength(0)
})
```
