"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Clock, Wallet, X } from "lucide-react";
import { usePendingPaymentsQuery, useRejectPaymentMutation } from "@/store/admin/ordersApi";
import { formatBDT, formatDateTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, useToast } from "@/components/admin/ui";
import { VerifyPaymentModal } from "../orders/[id]/OrderModals";

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Orders where the money can no longer be accepted: the payment can only be rejected. */
const CLOSED_STATUSES = ["cancelled", "returned"];

export default function PendingPayments() {
  const { data, error, isLoading, refetch } = usePendingPaymentsQuery();
  const [reject, rejectState] = useRejectPaymentMutation();
  const [verifying, setVerifying] = useState(null);
  const [now] = useState(() => Date.now());
  const { notify } = useToast();
  const payments = data?.data || [];

  async function handleReject(payment) {
    const closed = CLOSED_STATUSES.includes(payment.order_status);
    const message = closed
      ? `${payment.order_number} is ${payment.order_status}, so this payment can't be accepted. Reject TrxID ${payment.transaction_id}?`
      : `Reject TrxID ${payment.transaction_id}? The order stays unpaid.`;
    if (!window.confirm(message)) return;
    try {
      await reject({ id: payment.id, note: closed ? `Order ${payment.order_status}; payment not accepted` : "TrxID not found in bKash statement" }).unwrap();
      notify("Payment rejected.");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      <PageHeader
        title="bKash verification"
        description="Open your bKash app, find each Transaction ID and check the amount, then verify or reject."
      />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}

      {!isLoading && !error && (
        <Card padded={false}>
          {payments.length === 0 ? (
            <EmptyState icon={Wallet} title="All caught up" description="No bKash payments are waiting for verification." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {payments.map((payment) => {
                const closed = CLOSED_STATUSES.includes(payment.order_status);
                const since = payment.created_at || payment.paid_at;
                const waitedMs = since ? now - new Date(since).getTime() : 0;
                const stale = waitedMs > STALE_AFTER_MS;

                return (
                  <li
                    key={payment.id}
                    className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${stale ? "border-l-4 border-l-red-400 bg-red-50/40" : ""}`}
                  >
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-mono text-lg font-semibold tracking-wide text-ink-900">
                        {payment.transaction_id}
                        {stale && (
                          <Badge tone="red" className="font-sans tracking-normal">
                            <Clock className="mr-1 size-3" /> Waiting {Math.floor(waitedMs / DAY_MS)} days
                          </Badge>
                        )}
                        {closed && (
                          <Badge tone="neutral" className="font-sans tracking-normal">
                            Order {payment.order_status}
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-ink-600">
                        <span className="font-semibold text-ink-900">{formatBDT(payment.amount, { exact: true })}</span> from {payment.sender_number || "—"}
                      </p>
                      <p className="text-xs text-ink-400">
                        <Link href={`/admin/orders/${payment.order_id}`} className="text-gold-700 hover:underline">
                          {payment.order_number}
                        </Link>{" "}
                        · {formatDateTime(payment.paid_at)}
                      </p>
                      {closed && <p className="mt-1 text-xs text-ink-500">The order is {payment.order_status}, so this payment can only be rejected.</p>}
                    </div>
                    <div className="flex gap-2">
                      {!closed && (
                        <Button onClick={() => setVerifying(payment)}>
                          <Check className="size-4" /> Verify
                        </Button>
                      )}
                      <Button variant="secondary" onClick={() => handleReject(payment)} loading={rejectState.isLoading && rejectState.originalArgs?.id === payment.id}>
                        <X className="size-4" /> Reject
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {verifying && <VerifyPaymentModal payment={verifying} orderNumber={verifying.order_number} onClose={() => setVerifying(null)} />}
    </>
  );
}
