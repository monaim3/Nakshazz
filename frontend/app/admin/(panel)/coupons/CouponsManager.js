"use client";

import { useState } from "react";
import { Plus, Tag } from "lucide-react";
import { useCouponsQuery, useDeleteCouponMutation, useSaveCouponMutation } from "@/store/admin/ownerApi";
import { formatBDT, formatDate } from "@/lib/format";
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, Select, Table, useToast } from "@/components/admin/ui";

function couponState(coupon) {
  const now = Date.now();
  if (!coupon.is_active) return { label: "Off", tone: "neutral" };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) return { label: "Expired", tone: "red" };
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { label: "Scheduled", tone: "blue" };
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) return { label: "Used up", tone: "amber" };
  return { label: "Live", tone: "green" };
}

function describe(coupon) {
  const amount = coupon.type === "percent" ? `${Number(coupon.value)}% off` : `${formatBDT(coupon.value)} off`;
  const cap = coupon.type === "percent" && coupon.max_discount ? ` (max ${formatBDT(coupon.max_discount)})` : "";
  const min = coupon.min_order_amount ? ` · min order ${formatBDT(coupon.min_order_amount)}` : "";
  return `${amount}${cap}${min}`;
}

export default function CouponsManager() {
  const { data, error, isLoading, refetch } = useCouponsQuery();
  const [editing, setEditing] = useState(null);
  const coupons = data?.data || [];

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Discount codes customers enter at checkout. Also usable in manual sales."
        actions={
          <Button variant="gold" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New coupon
          </Button>
        }
      />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}
      {!isLoading && !error && (
        <Card padded={false}>
          <Table
            rows={coupons}
            onRowClick={setEditing}
            empty={<EmptyState icon={Tag} title="No coupons yet" description="Create codes like EID10 or WELCOME100 for campaigns." />}
            columns={[
              {
                key: "code",
                label: "Code",
                render: (coupon) => (
                  <div>
                    <p className="font-mono font-semibold tracking-wide text-ink-900">{coupon.code}</p>
                    <p className="text-xs text-ink-400">{describe(coupon)}</p>
                  </div>
                ),
              },
              { key: "used", label: "Used", align: "right", render: (coupon) => `${coupon.used_count}${coupon.usage_limit ? ` / ${coupon.usage_limit}` : ""}` },
              { key: "expires_at", label: "Ends", className: "hidden sm:table-cell text-ink-500", render: (coupon) => (coupon.expires_at ? formatDate(coupon.expires_at) : "No end") },
              {
                key: "state",
                label: "",
                align: "right",
                render: (coupon) => {
                  const state = couponState(coupon);
                  return <Badge tone={state.tone}>{state.label}</Badge>;
                },
              },
            ]}
          />
        </Card>
      )}

      {editing && <CouponModal key={editing === "new" ? "new" : editing.id} coupon={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function CouponModal({ coupon, onClose }) {
  const [save, saveState] = useSaveCouponMutation();
  const [remove, removeState] = useDeleteCouponMutation();
  const { notify } = useToast();
  const [type, setType] = useState(coupon?.type || "fixed");
  const [errors, setErrors] = useState({});

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    const form = new FormData(event.currentTarget);
    const value = (key) => (form.get(key) === "" ? null : form.get(key));

    const payload = {
      code: form.get("code"),
      type,
      value: form.get("value"),
      max_discount: type === "percent" ? value("max_discount") : null,
      min_order_amount: value("min_order_amount"),
      starts_at: value("starts_at"),
      expires_at: value("expires_at"),
      usage_limit: value("usage_limit"),
      per_phone_limit: value("per_phone_limit"),
      is_active: event.currentTarget.elements.is_active.checked,
    };

    try {
      await save({ id: coupon?.id, ...payload }).unwrap();
      notify("Coupon saved.");
      onClose();
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.errors || { form: [error.message] }).map(([key, messages]) => [key, messages[0]])));
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${coupon.code}? If it was already used it will be switched off instead.`)) return;
    try {
      const result = await remove(coupon.id).unwrap();
      notify(result.message);
      onClose();
    } catch (error) {
      setErrors({ form: error.message });
    }
  }

  return (
    <Modal open onClose={onClose} title={coupon ? `Edit ${coupon.code}` : "New coupon"}>
      <form id="coupon-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="code" label="Code" required placeholder="EID10" defaultValue={coupon?.code} className="uppercase" error={errors.code} hint="Letters, numbers, - and _" />
          <Select
            label="Discount type"
            options={[
              { value: "fixed", label: "Fixed amount (৳)" },
              { value: "percent", label: "Percentage (%)" },
            ]}
            value={type}
            onChange={(event) => setType(event.target.value)}
          />
          <Input name="value" label={type === "percent" ? "Percent off" : "Amount off (৳)"} required type="number" min="0" step="0.01" inputMode="decimal" defaultValue={coupon?.value} error={errors.value} />
          {type === "percent" && <Input name="max_discount" label="Maximum discount (৳)" type="number" min="0" inputMode="decimal" defaultValue={coupon?.max_discount ?? ""} hint="Optional cap" />}
          <Input name="min_order_amount" label="Minimum order (৳)" type="number" min="0" inputMode="decimal" defaultValue={coupon?.min_order_amount ?? ""} />
          <Input name="usage_limit" label="Total uses allowed" type="number" min="1" inputMode="numeric" defaultValue={coupon?.usage_limit ?? ""} hint="Empty = unlimited" />
          <Input name="per_phone_limit" label="Uses per customer" type="number" min="1" inputMode="numeric" defaultValue={coupon?.per_phone_limit ?? ""} hint="Matched by phone number" />
          <Input name="starts_at" label="Starts" type="datetime-local" defaultValue={toLocalInput(coupon?.starts_at)} />
          <Input name="expires_at" label="Ends" type="datetime-local" defaultValue={toLocalInput(coupon?.expires_at)} error={errors.expires_at} />
        </div>
        <Checkbox name="is_active" label="Active" defaultChecked={coupon ? coupon.is_active : true} />
        {coupon && <p className="text-xs text-ink-400">Used {coupon.used_count} time{coupon.used_count === 1 ? "" : "s"}. Cancelled orders give their use back automatically.</p>}
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      </form>
      <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
        {coupon ? (
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" loading={removeState.isLoading} onClick={handleDelete}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" loading={saveState.isLoading}>
            Save coupon
          </Button>
        </div>
      </div>
    </Modal>
  );
}
