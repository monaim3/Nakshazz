"use client";

import { useState } from "react";
import { useRecordPaymentMutation, useRefundOrderMutation, useReturnOrderItemsMutation, useVerifyPaymentMutation } from "@/store/admin/ordersApi";
import { newIdempotencyKey } from "@/lib/admin-api-client";
import { PAYMENT_METHODS } from "@/lib/admin-options";
import { formatBDT } from "@/lib/format";
import { Button, Input, Modal, Select, useToast } from "@/components/admin/ui";

/*
 * These modals are mounted only while open, so each opening starts with a fresh form and a
 * fresh idempotency key. The key is reused for retries of the same submit (the server does it
 * once) and a new one comes with the next opening after a success.
 */

function firstError(error) {
  return error?.errors ? Object.values(error.errors)[0][0] : error?.message;
}

/** Methods where the money goes through a wallet and has its own TrxID. */
const MOBILE_METHODS = ["bkash", "mobile_banking"];

export const REFUND_REASONS = [
  { value: "compensation", label: "Goodwill / compensation" },
  { value: "cancellation", label: "Cancellation refund" },
];

function ErrorNote({ error, className = "" }) {
  if (!error) return null;
  return <p role="alert" className={`rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}>{error}</p>;
}

/** Partial or full return. Damaged units are written off instead of going back to stock. */
export function ReturnModal({ order, isOwner, onClose }) {
  const [returnItems, { isLoading }] = useReturnOrderItemsMutation();
  const { notify } = useToast();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [lines, setLines] = useState({});
  const [refund, setRefund] = useState({ amount: "", method: "cash", transaction_id: "" });
  const [error, setError] = useState(null);

  const refundable = order.money ? Number(order.money.refundable) : null;
  const returnable = order.items.filter((item) => item.quantity - item.returned_quantity > 0);
  const setLine = (id, key, value) => setLines((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));

  async function submit() {
    setError(null);
    const items = Object.entries(lines)
      .map(([id, line]) => ({ order_item_id: Number(id), quantity: Number(line.quantity || 0), damaged: Number(line.damaged || 0) }))
      .filter((line) => line.quantity > 0);

    if (items.length === 0) {
      setError("Enter how many of at least one item came back.");
      return;
    }
    if (isOwner && refundable !== null && Number(refund.amount) > refundable) {
      setError(`Only ${formatBDT(refundable, { exact: true })} can be refunded.`);
      return;
    }

    const withRefund = isOwner && Number(refund.amount) > 0;
    try {
      await returnItems({
        id: order.id,
        idempotencyKey,
        items,
        ...(withRefund
          ? {
              refund: {
                amount: refund.amount,
                method: refund.method,
                ...(MOBILE_METHODS.includes(refund.method) && refund.transaction_id.trim() ? { transaction_id: refund.transaction_id.trim() } : {}),
              },
            }
          : {}),
      }).unwrap();
      notify("Return recorded. Stock updated.");
      onClose();
    } catch (err) {
      setError(firstError(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Return items"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Record return
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-ink-100 rounded-lg ring-1 ring-ink-100">
          {returnable.map((item) => {
            const max = item.quantity - item.returned_quantity;
            return (
              <li key={item.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div className="text-sm">
                  <p className="font-medium text-ink-900">{item.product_name}</p>
                  <p className="text-xs text-ink-400">
                    {item.variant_title !== "Default" && `${item.variant_title} · `}up to {max} can be returned
                  </p>
                </div>
                <Input className="sm:w-28" label="Returned" type="number" min="0" max={max} inputMode="numeric" value={lines[item.id]?.quantity ?? ""} onChange={(event) => setLine(item.id, "quantity", event.target.value)} />
                <Input className="sm:w-28" label="Of which damaged" type="number" min="0" max={max} inputMode="numeric" value={lines[item.id]?.damaged ?? ""} onChange={(event) => setLine(item.id, "damaged", event.target.value)} />
              </li>
            );
          })}
        </ul>

        {isOwner ? (
          <div className="grid gap-4 rounded-lg bg-cream-100 p-3 sm:grid-cols-2">
            <Input
              label="Refund amount (optional)"
              type="number"
              min="0"
              max={refundable ?? undefined}
              step="0.01"
              inputMode="decimal"
              value={refund.amount}
              onChange={(event) => setRefund({ ...refund, amount: event.target.value })}
              hint={refundable !== null ? `Only if money was already received. Refundable: ${formatBDT(refundable, { exact: true })}` : "Only if money was already received."}
            />
            <Select label="Refund method" options={PAYMENT_METHODS} value={refund.method} onChange={(event) => setRefund({ ...refund, method: event.target.value })} />
            {MOBILE_METHODS.includes(refund.method) && Number(refund.amount) > 0 && (
              <Input className="sm:col-span-2" label="TrxID of the money sent back (optional)" value={refund.transaction_id} onChange={(event) => setRefund({ ...refund, transaction_id: event.target.value })} />
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-400">Refunds are handled by the owner.</p>
        )}

        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}

export function RecordPaymentModal({ order, onClose }) {
  const [record, { isLoading }] = useRecordPaymentMutation();
  const { notify } = useToast();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const due = order.money ? Number(order.money.amount_due) : Number(order.grand_total);
  const [form, setForm] = useState({ method: "bkash", amount: String(due), transaction_id: "", sender_number: "" });
  const [error, setError] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    setError(null);
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      setError("Enter the amount received.");
      return;
    }
    if (amount > due) {
      setError(`Only ${formatBDT(due, { exact: true })} is still due.`);
      return;
    }
    try {
      await record({ orderId: order.id, idempotencyKey, ...form }).unwrap();
      notify("Payment recorded.");
      onClose();
    } catch (err) {
      setError(firstError(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} disabled={due <= 0} onClick={submit}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Method" options={PAYMENT_METHODS} value={form.method} onChange={set("method")} />
        <Input
          label="Amount (৳)"
          type="number"
          min="0"
          max={due}
          step="0.01"
          inputMode="decimal"
          value={form.amount}
          onChange={set("amount")}
          hint={`Still due: ${formatBDT(due, { exact: true })} · order total ${formatBDT(order.grand_total, { exact: true })}`}
        />
        <Input label="Transaction ID" value={form.transaction_id} onChange={set("transaction_id")} />
        <Input label="Sender number" inputMode="tel" value={form.sender_number} onChange={set("sender_number")} />
        <ErrorNote error={error} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}

/** Money given back without goods coming back (owner only): goodwill, or the refund before a cancellation. */
export function RefundModal({ order, initialReason = "compensation", initialAmount, onClose }) {
  const [refundOrder, { isLoading }] = useRefundOrderMutation();
  const { notify } = useToast();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const refundable = order.money ? Number(order.money.refundable) : null;
  const [form, setForm] = useState({
    amount: initialAmount !== undefined ? String(initialAmount) : "",
    method: "bkash",
    reason: initialReason,
    transaction_id: "",
    note: "",
  });
  const [error, setError] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const isMobile = MOBILE_METHODS.includes(form.method);

  async function submit() {
    setError(null);
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      setError("Enter the amount refunded.");
      return;
    }
    if (refundable !== null && amount > refundable) {
      setError(`Only ${formatBDT(refundable, { exact: true })} can be refunded.`);
      return;
    }
    const { transaction_id: transactionId, ...rest } = form;
    const body = {
      orderId: order.id,
      idempotencyKey,
      ...rest,
      ...(isMobile && transactionId.trim() ? { transaction_id: transactionId.trim() } : {}),
    };
    try {
      try {
        await refundOrder(body).unwrap();
      } catch (err) {
        // same amount already refunded in the last 24 h: ask before recording a second one
        const duplicate = err?.errors?.duplicate;
        if (!duplicate) throw err;
        if (!window.confirm(Array.isArray(duplicate) ? duplicate[0] : String(duplicate))) return;
        await refundOrder({ ...body, confirm_duplicate: true }).unwrap();
      }
      notify("Refund recorded.");
      onClose();
    } catch (err) {
      setError(firstError(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record refund"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={isLoading} disabled={refundable !== null && refundable <= 0} onClick={submit}>
            Record refund
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          {form.reason === "cancellation"
            ? "Money sent back because the order is being cancelled. Record it first, then cancel the order."
            : "For money given back without items returning (e.g. a small defect). It is deducted in the profit report."}{" "}
          For returned items use “Return items”.
        </p>
        {refundable !== null && (
          <p className="rounded-lg bg-cream-100 px-3 py-2 text-sm text-ink-700">
            Refundable: <span className="font-semibold tabular-nums">{formatBDT(refundable, { exact: true })}</span>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Reason" options={REFUND_REASONS} value={form.reason} onChange={set("reason")} />
          <Input label="Amount (৳)" type="number" min="0" max={refundable ?? undefined} step="0.01" inputMode="decimal" value={form.amount} onChange={set("amount")} />
          <Select label="Method" options={PAYMENT_METHODS} value={form.method} onChange={set("method")} />
          {isMobile && <Input label="TrxID of the money sent back" hint="Optional" value={form.transaction_id} onChange={set("transaction_id")} />}
          <Input className="sm:col-span-2" label="Note" value={form.note} onChange={set("note")} />
        </div>
        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}

/**
 * Verify a pending bKash payment. "Amount received" starts at the claimed amount and is sent
 * only when changed (the customer sent less or more).
 */
export function VerifyPaymentModal({ payment, orderNumber, onClose, onVerified }) {
  const [verify, { isLoading }] = useVerifyPaymentMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({ amount: String(Number(payment.amount)), fee: "" });
  const [error, setError] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    setError(null);
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      setError("Enter the amount that really arrived.");
      return;
    }
    try {
      await verify({
        id: payment.id,
        ...(form.fee !== "" ? { fee: form.fee } : {}),
        ...(amount !== Number(payment.amount) ? { amount: form.amount } : {}),
      }).unwrap();
      notify(orderNumber ? `${orderNumber} payment verified.` : "Payment verified.");
      onVerified?.();
      onClose();
    } catch (err) {
      setError(firstError(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Verify payment"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Verify
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          {payment.transaction_id && (
            <>
              TrxID <span className="font-mono font-medium text-ink-900">{payment.transaction_id}</span> ·{" "}
            </>
          )}
          claimed {formatBDT(payment.amount, { exact: true })}
          {payment.sender_number && <> from {payment.sender_number}</>}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount received (৳)" type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={set("amount")} hint="Change it if a different amount arrived." />
          <Input label="Fee (৳)" type="number" min="0" step="0.01" inputMode="decimal" value={form.fee} onChange={set("fee")} hint="bKash charge, if any." />
        </div>
        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}
