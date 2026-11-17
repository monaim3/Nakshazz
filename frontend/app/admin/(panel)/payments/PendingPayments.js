"use client";

import Link from "next/link";
import { Check, Wallet, X } from "lucide-react";
import { usePendingPaymentsQuery, useRejectPaymentMutation, useVerifyPaymentMutation } from "@/store/admin/ordersApi";
import { formatBDT, formatDateTime } from "@/lib/format";
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, useToast } from "@/components/admin/ui";

export default function PendingPayments() {
  const { data, error, isLoading, refetch } = usePendingPaymentsQuery();
  const [verify, verifyState] = useVerifyPaymentMutation();
  const [reject, rejectState] = useRejectPaymentMutation();
  const { notify } = useToast();
  const payments = data?.data || [];

  async function handleVerify(payment) {
    try {
      await verify({ id: payment.id }).unwrap();
      notify(`${payment.order_number} marked paid.`);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleReject(payment) {
    if (!window.confirm(`Reject TrxID ${payment.transaction_id}? The order stays unpaid.`)) return;
    try {
      await reject({ id: payment.id, note: "TrxID not found in bKash statement" }).unwrap();
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
              {payments.map((payment) => (
                <li key={payment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-lg font-semibold tracking-wide text-ink-900">{payment.transaction_id}</p>
                    <p className="text-sm text-ink-600">
                      <span className="font-semibold text-ink-900">{formatBDT(payment.amount)}</span> from {payment.sender_number || "—"}
                    </p>
                    <p className="text-xs text-ink-400">
                      <Link href={`/admin/orders/${payment.order_id}`} className="text-gold-700 hover:underline">
                        {payment.order_number}
                      </Link>{" "}
                      · {formatDateTime(payment.paid_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleVerify(payment)} loading={verifyState.isLoading && verifyState.originalArgs?.id === payment.id}>
                      <Check className="size-4" /> Verify
                    </Button>
                    <Button variant="secondary" onClick={() => handleReject(payment)} loading={rejectState.isLoading && rejectState.originalArgs?.id === payment.id}>
                      <X className="size-4" /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
