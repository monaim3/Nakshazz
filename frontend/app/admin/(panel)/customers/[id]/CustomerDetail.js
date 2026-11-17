"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { useCustomerQuery, useUpdateCustomerMutation } from "@/store/admin/contentApi";
import { formatBDT, formatDate, formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorBlock, LoadingBlock, StatCard, StatusBadge, Table, Textarea, useToast } from "@/components/admin/ui";

/** 01712345678 → 8801712345678 for wa.me links. */
function whatsappLink(phone) {
  return `https://wa.me/88${phone}`;
}

export default function CustomerDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { data, error, isLoading, refetch } = useCustomerQuery(id);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const customer = data.data;
  const average = customer.orders_count ? Number(customer.total_purchases) / customer.orders_count : 0;

  return (
    <>
      <Link href="/admin/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="size-4" /> Customers
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{customer.name}</h1>
          <p className="text-sm text-ink-500">Customer since {formatDate(customer.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <a href={`tel:${customer.phone}`}>
            <Button variant="secondary">
              <Phone className="size-4" /> Call
            </Button>
          </a>
          <a href={whatsappLink(customer.phone)} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
          </a>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Orders" value={customer.orders_count} />
        <StatCard label="Total bought" value={formatBDT(customer.total_purchases)} hint="Shipped & delivered" />
        <StatCard label="Average order" value={formatBDT(average)} />
        <StatCard label="Phone" value={<span className="text-base">{customer.phone}</span>} hint={customer.email || "No email"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Orders" padded={false} className="lg:col-span-2">
          <Table
            rows={customer.orders}
            onRowClick={(order) => router.push(`/admin/orders/${order.id}`)}
            columns={[
              { key: "order_number", label: "Order", render: (order) => <span className="font-medium text-ink-900">{order.order_number}</span> },
              { key: "channel", label: "Channel", className: "hidden sm:table-cell", render: (order) => <Badge>{order.channel_label}</Badge> },
              { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
              { key: "grand_total", label: "Total", align: "right", render: (order) => formatBDT(order.grand_total) },
              { key: "placed_at", label: "Date", className: "hidden md:table-cell text-ink-500", render: (order) => formatDateTime(order.placed_at) },
            ]}
          />
        </Card>

        <div className="space-y-6">
          <Card title="Addresses">
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-ink-400">No saved address.</p>
            ) : (
              <ul className="space-y-3 text-sm text-ink-700">
                {customer.addresses.map((address) => (
                  <li key={address.id}>
                    {address.address_line}
                    {address.area && `, ${address.area}`}, {address.city}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <NotesCard customer={customer} />
        </div>
      </div>
    </>
  );
}

function NotesCard({ customer }) {
  const [notes, setNotes] = useState(customer.notes || "");
  const [update, { isLoading }] = useUpdateCustomerMutation();
  const { notify } = useToast();

  async function save() {
    try {
      await update({ id: customer.id, notes }).unwrap();
      notify("Notes saved.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <Card title="Private notes">
      <Textarea aria-label="Private notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ring size, preferences, gift dates…" />
      <Button size="sm" className="mt-3" loading={isLoading} disabled={notes === (customer.notes || "")} onClick={save}>
        Save notes
      </Button>
    </Card>
  );
}
