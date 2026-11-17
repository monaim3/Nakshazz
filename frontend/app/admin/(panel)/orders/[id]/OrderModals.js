"use client";

import { useState } from "react";
import { useRecordPaymentMutation, useRefundOrderMutation, useReturnOrderItemsMutation } from "@/store/admin/ordersApi";
import { PAYMENT_METHODS } from "@/lib/admin-options";
import { formatBDT } from "@/lib/format";
import { Button, Input, Modal, Select, useToast } from "@/components/admin/ui";

function firstError(error) {
  return error?.errors ? Object.values(error.errors)[0][0] : error?.message;
}

/** Partial or full return. Damaged units are written off instead of going back to stock. */
export function ReturnModal({ order, isOwner, open, onClose }) {
  const [returnItems, { isLoading }] = useReturnOrderItemsMutation();
  const { notify } = useToast();
  const [lines, setLines] = useState({});
  const [refund, setRefund] = useState({ amount: "", method: "cash" });
  const [error, setError] = useState(null);

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

    try {
      await returnItems({
        id: order.id,
        items,
        ...(isOwner && Number(refund.amount) > 0 ? { refund: { amount: refund.amount, method: refund.method } } : {}),
      }).unwrap();
      notify("Return recorded. Stock updated.");
      setLines({});
      onClose();
    } catch (err) {
      setError(firstError(err));
    }
  }

  return (
    <Modal
      open={open}
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
            <Input label="Refund amount (optional)" type="number" min="0" step="0.01" inputMode="decimal" value={refund.amount} onChange={(event) => setRefund({ ...refund, amount: event.target.value })} hint="Only if money was already received." />
            <Select label="Refund method" options={PAYMENT_METHODS} value={refund.method} onChange={(event) => setRefund({ ...refund, method: event.target.value })} />
          </div>
        ) : (
          <p className="text-xs text-ink-400">Refunds are handled by the owner.</p>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

export function RecordPaymentModal({ order, open, onClose }) {
  const [record, { isLoading }] = useRecordPaymentMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({ method: "bkash", amount: "", transaction_id: "", sender_number: "", fee: "" });
  const [error, setError] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    setError(null);
    try {
      await record({ orderId: order.id, ...form, amount: form.amount || order.grand_total }).unwrap();
      notify("Payment recorded.");
      onClose();
    } catch (err) {
      setError(firstError(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Method" options={PAYMENT_METHODS} value={form.method} onChange={set("method")} />
        <Input label="Amount (৳)" type="number" min="0" step="0.01" inputMode="decimal" placeholder={order.grand_total} value={form.amount} onChange={set("amount")} hint={`Order total ${formatBDT(order.grand_total)}`} />
        <Input label="Transaction ID" value={form.transaction_id} onChange={set("transaction_id")} />
        <Input label="Sender number" inputMode="tel" value={form.sender_number} onChange={set("sender_number")} />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
}

/** Goodwill refund without returned items (owner only). */
export function RefundModal({ order, open, onClose }) {
  const [refundOrder, { isLoading }] = useRefundOrderMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({ amount: "", method: "bkash", note: "" });
  const [error, setError] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    setError(null);
    try {
      await refundOrder({ orderId: order.id, ...form }).unwrap();
      notify("Refund recorded.");
      onClose();
    } catch (err) {
      setError(firstError(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Goodwill refund"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={isLoading} onClick={submit}>
            Record refund
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">For money given back without items returning (e.g. a small defect). It is deducted in the profit report. For returned items use “Return items”.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount (৳)" type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={set("amount")} />
          <Select label="Method" options={PAYMENT_METHODS} value={form.method} onChange={set("method")} />
          <Input className="sm:col-span-2" label="Reason" value={form.note} onChange={set("note")} />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
