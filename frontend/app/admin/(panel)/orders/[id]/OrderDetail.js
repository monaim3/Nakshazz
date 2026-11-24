"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Lock, MessageCircle, MessageSquare, Phone, Printer, RotateCcw, Truck, Wallet, X } from "lucide-react";
import {
  useAddOrderNoteMutation, useOrderQuery, useRejectPaymentMutation, useUpdateOrderShippingMutation,
  useUpdateOrderStatusMutation,
} from "@/store/admin/ordersApi";
import { TRANSITION_LABELS } from "@/lib/admin-options";
import { formatBDT, formatDateTime, humanize } from "@/lib/format";
import { useIsOwner } from "@/components/admin/AdminShell";
import { Badge, Button, Card, ErrorBlock, Input, LoadingBlock, Modal, StatusBadge, Textarea, useToast } from "@/components/admin/ui";
import { RecordPaymentModal, RefundModal, ReturnModal, VerifyPaymentModal } from "./OrderModals";

/** Orders that are finished: the address can no longer change and no new money is accepted. */
const FINISHED_STATUSES = ["delivered", "returned", "cancelled"];
const CLOSED_STATUSES = ["cancelled", "returned"];

const WHATSAPP_EVENTS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

export default function OrderDetail() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useOrderQuery(id);
  const isOwner = useIsOwner();
  const [transition, setTransition] = useState(null);
  const [modal, setModal] = useState(null); // "shipping" | "return" | "payment" | "refund"
  const [refundPreset, setRefundPreset] = useState({});

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const order = data.data;
  const canReturn = ["shipped", "delivered"].includes(order.status);
  // returns always go through the Return form (stock + refund done correctly)
  const transitions = order.allowed_transitions.filter((status) => status !== "returned");

  function openRefund(preset = {}) {
    setRefundPreset(preset);
    setModal("refund");
  }

  return (
    <>
      <Link href="/admin/orders" className="no-print mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="size-4" /> Orders
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{order.order_number}</h1>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.payment_status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {order.channel_label} · {order.source === "manual" ? `recorded by ${order.created_by?.name || "staff"}` : "website order"} · {formatDateTime(order.placed_at)}
          </p>
        </div>

        <div className="no-print flex flex-wrap gap-2">
          {transitions.map((status) => (
            <Button key={status} variant={status === "cancelled" ? "secondary" : "primary"} onClick={() => setTransition(status)}>
              {TRANSITION_LABELS[status] || humanize(status)}
            </Button>
          ))}
          <Link href={`/admin/invoice/${order.id}`} target="_blank">
            <Button variant="secondary">
              <Printer className="size-4" /> Invoice
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ItemsCard order={order} isOwner={isOwner} canReturn={canReturn} onReturn={() => setModal("return")} />
          <PaymentsCard order={order} isOwner={isOwner} onRecord={() => setModal("payment")} onRefund={() => openRefund()} />
          <NotesCard order={order} />
        </div>

        <div className="space-y-6">
          <CustomerCard order={order} />
          <DeliveryCard order={order} onEdit={() => setModal("shipping")} />
          <TimelineCard order={order} />
        </div>
      </div>

      {transition && (
        <TransitionModal
          key={transition}
          order={order}
          status={transition}
          isOwner={isOwner}
          onClose={() => setTransition(null)}
          onRefundFirst={() => {
            setTransition(null);
            openRefund({ initialReason: "cancellation", initialAmount: Number(order.money?.refundable || 0) });
          }}
        />
      )}
      {modal === "shipping" && <ShippingModal order={order} onClose={() => setModal(null)} />}
      {modal === "return" && <ReturnModal order={order} isOwner={isOwner} onClose={() => setModal(null)} />}
      {modal === "payment" && <RecordPaymentModal order={order} onClose={() => setModal(null)} />}
      {modal === "refund" && <RefundModal order={order} {...refundPreset} onClose={() => setModal(null)} />}
    </>
  );
}

function ItemsCard({ order, isOwner, canReturn, onReturn }) {
  const discount = Number(order.coupon_discount) + Number(order.manual_discount);

  return (
    <Card
      title={`Items (${order.items.length})`}
      padded={false}
      actions={
        canReturn && (
          <Button size="sm" variant="ghost" onClick={onReturn} className="no-print">
            <RotateCcw className="size-3.5" /> Return items
          </Button>
        )
      }
    >
      <ul className="divide-y divide-ink-100">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start gap-4 px-5 py-3">
            <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-cream-200 ring-1 ring-ink-100">
              {item.image_url && (
                // eslint-disable-next-line @next/next/no-img-element -- small WebP from the API host
                <img src={item.image_url} alt="" loading="lazy" className="size-full object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{item.product_name}</p>
              <p className="text-xs text-ink-400">
                {item.variant_title !== "Default" && `${item.variant_title} · `}SKU {item.sku}
              </p>
              {item.returned_quantity > 0 && (
                <Badge tone="red" className="mt-1">
                  {item.returned_quantity} returned{item.damaged_quantity > 0 && ` (${item.damaged_quantity} damaged)`}
                </Badge>
              )}
              {isOwner && item.unit_cost && <p className="mt-1 text-xs text-ink-400">Cost {formatBDT(item.unit_cost)} each</p>}
            </div>
            <div className="shrink-0 text-right text-sm">
              <p className="tabular-nums text-ink-500">
                {item.quantity} × {formatBDT(item.unit_price)}
              </p>
              <p className="font-medium tabular-nums">{formatBDT(item.line_subtotal)}</p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="space-y-1.5 border-t border-ink-100 px-5 py-4 text-sm">
        <Row label="Subtotal" value={formatBDT(order.items_subtotal)} />
        {discount > 0 && <Row label={order.coupon_code ? `Discount (${order.coupon_code})` : "Discount"} value={`− ${formatBDT(discount)}`} />}
        <Row label={`Delivery${order.shipping.zone ? ` (${order.shipping.zone})` : ""}`} value={formatBDT(order.delivery_charge)} />
        <Row label="Total" value={formatBDT(order.grand_total)} strong />
        {isOwner && order.cogs_total !== undefined && (
          <div className="mt-3 rounded-lg bg-cream-100 px-3 py-2">
            <Row label="Product cost" value={formatBDT(order.cogs_total)} muted />
            <Row label="Gross profit (est.)" value={formatBDT(order.estimated_gross_profit)} muted />
            {order.delivery_cost !== null && <Row label="Courier cost" value={formatBDT(order.delivery_cost)} muted />}
          </div>
        )}
      </dl>
    </Card>
  );
}

function PaymentsCard({ order, isOwner, onRecord, onRefund }) {
  const [rejectPayment, rejectState] = useRejectPaymentMutation();
  const [verifying, setVerifying] = useState(null);
  const { notify } = useToast();
  const { money } = order;
  const isClosed = CLOSED_STATUSES.includes(order.status);

  const canRecord = !isClosed && (money ? Number(money.amount_due) > 0 : !["paid", "refunded", "partially_refunded"].includes(order.payment_status));
  const canRefund = isOwner && (money ? Number(money.refundable) > 0 : ["paid", "partially_paid", "partially_refunded"].includes(order.payment_status));

  async function reject(payment) {
    const message = isClosed
      ? `This order is ${order.status}, so the payment can't be accepted. Reject it?`
      : "Reject this payment? The order will be marked unpaid.";
    if (!window.confirm(message)) return;
    try {
      await rejectPayment({ id: payment.id, note: isClosed ? `Order ${order.status}; payment not accepted` : "TrxID not found in bKash" }).unwrap();
      notify("Payment rejected.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <Card
      title="Payments"
      padded={false}
      actions={
        <div className="no-print flex items-center gap-1">
          {money && !isClosed && Number(money.amount_due) > 0 && (
            <span className="mr-1 text-xs text-ink-500">Still due: <span className="font-medium tabular-nums text-ink-800">{formatBDT(money.amount_due, { exact: true })}</span></span>
          )}
          {canRecord && (
            <Button size="sm" variant="ghost" onClick={onRecord}>
              <Wallet className="size-3.5" /> Record payment
            </Button>
          )}
          {canRefund && (
            <Button size="sm" variant="ghost" onClick={onRefund}>
              Refund
            </Button>
          )}
        </div>
      }
    >
      {order.payments.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-400">
          No payment yet · {order.payment_method_label}
          {order.payment_method === "cod" && " — recorded automatically when marked delivered."}
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {order.payments.map((payment) => (
            <li key={payment.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-medium text-ink-900">
                  {payment.type === "refund" ? "Refund · " : ""}
                  {payment.method_label} · {formatBDT(payment.amount, { exact: true })}
                  {payment.type === "refund" && payment.refund_reason_label && (
                    <Badge tone="violet" className="ml-2 align-middle">
                      {payment.refund_reason_label}
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-ink-400">
                  {payment.transaction_id && <>{payment.type === "refund" ? "Sent back, TrxID" : "TrxID"} <span className="font-mono text-ink-700">{payment.transaction_id}</span> · </>}
                  {payment.rejected_transaction_id && <>rejected TrxID <span className="font-mono text-ink-700 line-through">{payment.rejected_transaction_id}</span> · </>}
                  {payment.sender_number && <>from {payment.sender_number} · </>}
                  {formatDateTime(payment.paid_at)}
                  {isOwner && Number(payment.fee) > 0 && <> · fee {formatBDT(payment.fee, { exact: true })}</>}
                </p>
                {payment.note && <p className="text-xs text-ink-500">{payment.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={payment.status} />
                {payment.status === "pending" && (
                  <div className="no-print flex gap-1">
                    {!isClosed && (
                      <Button size="sm" variant="primary" onClick={() => setVerifying(payment)}>
                        <Check className="size-3.5" /> Verify
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" loading={rejectState.isLoading && rejectState.originalArgs?.id === payment.id} onClick={() => reject(payment)}>
                      <X className="size-3.5" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {isClosed && order.payments.some((payment) => payment.status === "pending") && (
        <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">This order is {order.status}, so a pending payment can only be rejected.</p>
      )}
      {verifying && <VerifyPaymentModal payment={verifying} onClose={() => setVerifying(null)} />}
    </Card>
  );
}

function CustomerCard({ order }) {
  return (
    <Card title="Customer">
      {order.customer_name || order.customer_phone ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-ink-900">
            {order.customer_id ? (
              <Link href={`/admin/customers/${order.customer_id}`} className="hover:underline">
                {order.customer_name}
              </Link>
            ) : (
              order.customer_name
            )}
          </p>
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="inline-flex items-center gap-1.5 text-gold-700 hover:underline">
              <Phone className="size-3.5" /> {order.customer_phone}
            </a>
          )}
          {order.customer_email && <p className="text-ink-500">{order.customer_email}</p>}
          {order.customer_note && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              <span className="font-medium">Customer note:</span> {order.customer_note}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-400">Walk-in customer (no details)</p>
      )}
      <WhatsAppButtons links={order.whatsapp} />
    </Card>
  );
}

/** Opens WhatsApp with the message for that step already typed in. */
function WhatsAppButtons({ links }) {
  const available = WHATSAPP_EVENTS.filter((event) => links?.[event.key]);
  if (available.length === 0) return null;

  return (
    <div className="no-print mt-4 border-t border-ink-100 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <MessageCircle className="size-3.5" /> WhatsApp customer
      </p>
      <div className="flex flex-wrap gap-1.5">
        {available.map((event) => (
          <a
            key={event.key}
            href={links[event.key]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-green-700 ring-1 ring-green-200 ring-inset hover:bg-green-50"
          >
            {event.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function DeliveryCard({ order, onEdit }) {
  const { shipping } = order;
  const hasAddress = shipping.address || shipping.city;

  return (
    <Card
      title="Delivery"
      actions={
        <Button size="sm" variant="ghost" onClick={onEdit} className="no-print">
          Edit
        </Button>
      }
    >
      <div className="space-y-3 text-sm">
        {hasAddress ? (
          <address className="not-italic text-ink-700">
            {shipping.address}
            {shipping.area && <>, {shipping.area}</>}
            {shipping.city && <>, {shipping.city}</>}
            {shipping.zone && <span className="block text-xs text-ink-400">{shipping.zone}</span>}
          </address>
        ) : (
          <p className="text-ink-400">Handed over in person</p>
        )}
        {FINISHED_STATUSES.includes(order.status) && hasAddress && (
          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <Lock className="size-3" /> Address locked after the order is finished
          </p>
        )}
        {(order.courier_name || order.tracking_code) && (
          <p className="flex items-center gap-1.5 text-ink-700">
            <Truck className="size-4 text-ink-400" />
            {order.courier_name} {order.tracking_code && <span className="font-mono text-xs">#{order.tracking_code}</span>}
          </p>
        )}
      </div>
    </Card>
  );
}

function TimelineCard({ order }) {
  return (
    <Card title="History">
      <ol className="relative space-y-4 border-l border-ink-100 pl-4">
        {order.status_history.map((entry, index) => (
          <li key={index} className="relative">
            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-gold-500 ring-4 ring-white" />
            <p className="text-sm font-medium text-ink-900">{humanize(entry.to)}</p>
            <p className="text-xs text-ink-400">
              {formatDateTime(entry.at)}
              {entry.user && ` · ${entry.user.name}`}
            </p>
            {entry.note && <p className="mt-0.5 text-xs text-ink-500">{entry.note}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function NotesCard({ order }) {
  const [body, setBody] = useState("");
  const [addNote, { isLoading }] = useAddOrderNoteMutation();
  const { notify } = useToast();

  async function submit(event) {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      await addNote({ id: order.id, body: body.trim() }).unwrap();
      setBody("");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <Card title="Internal notes" className="no-print">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Only staff can see notes"
          aria-label="New note"
          className="h-10 flex-1 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200 ring-inset focus:ring-2 focus:ring-gold-500 focus:outline-none"
        />
        <Button type="submit" loading={isLoading} disabled={!body.trim()}>
          <MessageSquare className="size-4" /> Add
        </Button>
      </form>
      {order.notes.length > 0 && (
        <ul className="mt-4 space-y-3">
          {order.notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-cream-100 px-3 py-2 text-sm">
              <p className="whitespace-pre-line text-ink-800">{note.body}</p>
              <p className="mt-1 text-xs text-ink-400">
                {note.user?.name} · {formatDateTime(note.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TransitionModal({ order, status, isOwner, onClose, onRefundFirst }) {
  const [update, { isLoading }] = useUpdateOrderStatusMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);

  if (!status) return null;

  const { money } = order;
  const asksCourier = status === "shipped" || (status === "delivered" && order.status !== "shipped" && order.shipping.address);
  const asksCodFee = status === "delivered" && order.payment_method === "cod";
  const asksDeliveryCost = (status === "shipped" || status === "delivered") && order.shipping.address && order.delivery_cost === null;
  const isDestructive = status === "cancelled";

  // the server refuses a cancel while a bKash payment is unchecked or money is still held
  const cancelBlockedByPending = status === "cancelled" && Boolean(money?.has_pending_payment);
  const refundable = Number(money?.refundable || 0);
  const cancelBlockedByMoney = status === "cancelled" && refundable > 0;
  const cancelBlocked = cancelBlockedByPending || cancelBlockedByMoney;
  const deliverWithPending = status === "delivered" && Boolean(money?.has_pending_payment);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    setError(null);
    try {
      await update({ id: order.id, status, ...form }).unwrap();
      notify(`Order ${humanize(status).toLowerCase()}.`);
      setForm({});
      onClose();
    } catch (err) {
      setError(err.errors ? Object.values(err.errors)[0][0] : err.message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={TRANSITION_LABELS[status]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant={isDestructive || deliverWithPending ? "danger" : "primary"} loading={isLoading} disabled={cancelBlocked} onClick={submit}>
            {deliverWithPending ? "Deliver anyway" : TRANSITION_LABELS[status]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {status === "cancelled" && <p className="text-sm text-ink-600">Reserved stock goes back to available and any coupon use is released.</p>}
        {cancelBlockedByPending && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            A bKash payment for this order is still waiting. Verify or reject it first (in Payments below), then cancel.
          </p>
        )}
        {cancelBlockedByMoney && (
          <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>
              {formatBDT(refundable, { exact: true })} has been received for this order. Record the refund first, then cancel.
            </p>
            {isOwner ? (
              <Button size="sm" variant="secondary" onClick={onRefundFirst}>
                Record refund of {formatBDT(refundable, { exact: true })}
              </Button>
            ) : (
              <p className="text-xs">Ask the owner to record the refund.</p>
            )}
          </div>
        )}
        {deliverWithPending && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The bKash payment for this order is not checked yet — deliver anyway?
          </p>
        )}
        {status === "delivered" && order.payment_method === "cod" && <p className="text-sm text-ink-600">The cash collected ({formatBDT(order.grand_total)}) is recorded as a payment automatically.</p>}

        {asksCourier && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Courier" placeholder="Steadfast, Pathao, RedX…" defaultValue={order.courier_name || ""} onChange={set("courier_name")} />
            <Input label="Tracking / consignment no." defaultValue={order.tracking_code || ""} onChange={set("tracking_code")} />
          </div>
        )}
        {asksDeliveryCost && (
          <Input label="Courier charge for this parcel (৳)" type="number" min="0" step="0.01" inputMode="decimal" hint="What the courier charges you. Kept separate from the delivery fee the customer paid." onChange={set("delivery_cost")} />
        )}
        {asksCodFee && <Input label="COD fee deducted by courier (৳)" type="number" min="0" step="0.01" inputMode="decimal" hint="Usually ~1% of the collected amount. Leave empty if none." onChange={set("cod_fee")} />}
        <Textarea label="Note (optional)" rows={2} onChange={set("note")} />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

function ShippingModal({ order, onClose }) {
  const [update, { isLoading }] = useUpdateOrderShippingMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  // the address can't change once the order is finished; courier details still can
  const addressLocked = FINISHED_STATUSES.includes(order.status);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    setError(null);
    try {
      await update({ id: order.id, ...form }).unwrap();
      notify("Delivery details saved.");
      onClose();
    } catch (err) {
      setError(err.errors ? Object.values(err.errors)[0][0] : err.message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delivery details"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {addressLocked && (
          <p className="flex items-center gap-1.5 text-xs text-ink-500 sm:col-span-2">
            <Lock className="size-3.5" /> Locked after the order is finished. Courier details can still be changed.
          </p>
        )}
        <Input className="sm:col-span-2" label="Address" defaultValue={order.shipping.address || ""} onChange={set("shipping_address")} readOnly={addressLocked} disabled={addressLocked} />
        <Input label="Area" defaultValue={order.shipping.area || ""} onChange={set("shipping_area")} readOnly={addressLocked} disabled={addressLocked} />
        <Input label="City" defaultValue={order.shipping.city || ""} onChange={set("shipping_city")} readOnly={addressLocked} disabled={addressLocked} />
        <Input label="Courier" defaultValue={order.courier_name || ""} onChange={set("courier_name")} />
        <Input label="Tracking no." defaultValue={order.tracking_code || ""} onChange={set("tracking_code")} />
        <Input label="Courier charge (৳)" type="number" min="0" step="0.01" defaultValue={order.delivery_cost ?? ""} onChange={set("delivery_cost")} />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
}

function Row({ label, value, strong, muted }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-ink-100 pt-2 text-base font-semibold text-ink-900" : muted ? "text-ink-500" : "text-ink-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
