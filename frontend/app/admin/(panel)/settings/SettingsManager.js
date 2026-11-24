"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useSettingsQuery } from "@/store/admin/ordersApi";
import { useSaveDeliveryZoneMutation, useUpdateSettingsMutation } from "@/store/admin/ownerApi";
import { formatBDT } from "@/lib/format";
import { Button, Card, Checkbox, ErrorBlock, Input, LoadingBlock, PageHeader, Select, Textarea, useToast } from "@/components/admin/ui";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
const BOOLEAN_KEYS = ["cod_enabled", "bkash_enabled", "sms_enabled", "sms_on_confirmed", "sms_on_shipped", "sms_on_delivered"];

export default function SettingsManager() {
  const { data, error, isLoading, refetch } = useSettingsQuery();

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const { settings, delivery_zones: zones } = data.data;

  return (
    <>
      <PageHeader title="Settings" description="Store details shown to customers, payment options and delivery charges." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SettingsForm key={JSON.stringify(settings)} settings={settings} />
        </div>
        <DeliveryZones zones={zones} />
      </div>
    </>
  );
}

function SettingsForm({ settings }) {
  const [update, { isLoading }] = useUpdateSettingsMutation();
  const { notify } = useToast();
  const [errors, setErrors] = useState({});
  const [bkashEnabled, setBkashEnabled] = useState(Boolean(settings.bkash_enabled));
  const [smsEnabled, setSmsEnabled] = useState(Boolean(settings.sms_enabled));

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    const form = event.currentTarget;
    const formData = new FormData(form);
    BOOLEAN_KEYS.forEach((key) => formData.set(key, form.elements[key].checked ? "1" : "0"));
    if (!formData.get("logo")?.size) formData.delete("logo");

    if (!form.elements.cod_enabled.checked && !form.elements.bkash_enabled.checked) {
      setErrors({ form: "Keep at least one payment method on, or customers cannot check out." });
      return;
    }

    try {
      await update(formData).unwrap();
      notify("Settings saved. The website updates within a minute.");
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.errors || { form: [error.message] }).map(([key, messages]) => [key, messages[0]])));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card title="Store">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="store_name" label="Store name" required defaultValue={settings.store_name} error={errors.store_name} />
          <Input name="tagline" label="Tagline" defaultValue={settings.tagline || ""} error={errors.tagline} />
          <Input name="phone" label="Phone" inputMode="tel" defaultValue={settings.phone || ""} error={errors.phone} />
          <Input name="whatsapp_number" label="WhatsApp" inputMode="tel" defaultValue={settings.whatsapp_number || ""} error={errors.whatsapp_number} />
          <Input name="email" label="Email" type="email" defaultValue={settings.email || ""} error={errors.email} />
          <Input name="address" label="Address" defaultValue={settings.address || ""} error={errors.address} />
          <Input name="facebook_url" label="Facebook page" placeholder="https://facebook.com/…" defaultValue={settings.facebook_url || ""} error={errors.facebook_url} />
          <Input name="instagram_url" label="Instagram" placeholder="https://instagram.com/…" defaultValue={settings.instagram_url || ""} error={errors.instagram_url} />
          <div className="flex items-end gap-4 sm:col-span-2">
            {settings.logo_path && (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview
              <img src={`${BACKEND_URL}/storage/${settings.logo_path}`} alt="Current logo" className="size-16 rounded-lg object-contain ring-1 ring-ink-100" />
            )}
            <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" label={settings.logo_path ? "Replace logo" : "Logo"} hint="PNG with transparent background works best." className="flex-1" error={errors.logo} />
          </div>
        </div>
      </Card>

      <Card title="Payments">
        <div className="space-y-4">
          <Checkbox name="cod_enabled" label="Cash on delivery" defaultChecked={Boolean(settings.cod_enabled)} />
          <Checkbox name="bkash_enabled" label="bKash (customer sends money, staff verifies the TrxID)" checked={bkashEnabled} onChange={(event) => setBkashEnabled(event.target.checked)} />
          {bkashEnabled && (
            <div className="grid gap-4 rounded-lg bg-cream-100 p-4 sm:grid-cols-2">
              <Input name="bkash_number" label="bKash number" inputMode="tel" placeholder="01XXXXXXXXX" defaultValue={settings.bkash_number || ""} error={errors.bkash_number} />
              <Select
                name="bkash_account_type"
                label="Account type"
                options={[
                  { value: "personal", label: "Personal (Send Money)" },
                  { value: "merchant", label: "Merchant (Payment)" },
                ]}
                defaultValue={settings.bkash_account_type || "personal"}
              />
              <Textarea name="bkash_instructions" label="Instructions shown at checkout" rows={3} className="sm:col-span-2" defaultValue={settings.bkash_instructions || ""} error={errors.bkash_instructions} />
            </div>
          )}
        </div>
      </Card>

      <Card title="Orders & stock">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="order_notification_email" label="Email new orders to" type="email" defaultValue={settings.order_notification_email || ""} error={errors.order_notification_email} />
          <Input name="low_stock_threshold" label="Low-stock warning at" type="number" min="0" inputMode="numeric" defaultValue={settings.low_stock_threshold ?? 3} hint="Can be changed per product variant." error={errors.low_stock_threshold} />
          <Input
            name="reorder_cover_days"
            label="Restock suggestions cover (days)"
            type="number"
            min="1"
            max="365"
            inputMode="numeric"
            defaultValue={settings.reorder_cover_days ?? 30}
            hint="Restock suggestions cover this many days of sales."
            error={errors.reorder_cover_days}
          />
        </div>
      </Card>

      <Card title="Staff limits">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="staff_max_discount_percent"
            label="Largest discount staff can give (%)"
            type="number"
            min="0"
            max="100"
            inputMode="numeric"
            defaultValue={settings.staff_max_discount_percent ?? 20}
            hint="Staff can give at most this % off the list price, and never below cost. The owner has no limit."
            error={errors.staff_max_discount_percent}
          />
        </div>
      </Card>

      <Card title="SMS to customers">
        <div className="space-y-4">
          <Checkbox name="sms_enabled" label="Send SMS updates to customers" checked={smsEnabled} onChange={(event) => setSmsEnabled(event.target.checked)} />
          <div className={smsEnabled ? "space-y-3 rounded-lg bg-cream-100 p-4" : "hidden"}>
            <Checkbox name="sms_on_confirmed" label="When the order is confirmed" defaultChecked={Boolean(settings.sms_on_confirmed)} />
            <Checkbox name="sms_on_shipped" label="When the order is shipped" defaultChecked={Boolean(settings.sms_on_shipped)} />
            <Checkbox name="sms_on_delivered" label="When the order is delivered" defaultChecked={Boolean(settings.sms_on_delivered)} />
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            SMS also needs an SMS gateway set up in the server <code>.env</code> file: <code>SMS_DRIVER=http</code>, <code>SMS_API_URL</code>, <code>SMS_API_KEY</code> and <code>SMS_SENDER_ID</code>. While <code>SMS_DRIVER=log</code>, nothing is really sent — messages are only written to the server log.
          </p>
          {(errors.sms_enabled || errors.sms_on_confirmed || errors.sms_on_shipped || errors.sms_on_delivered) && (
            <p className="text-xs text-red-600">{errors.sms_enabled || errors.sms_on_confirmed || errors.sms_on_shipped || errors.sms_on_delivered}</p>
          )}
        </div>
      </Card>

      {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      <Button type="submit" variant="gold" size="lg" loading={isLoading}>
        Save settings
      </Button>
    </form>
  );
}

function DeliveryZones({ zones }) {
  const [save, { isLoading }] = useSaveDeliveryZoneMutation();
  const { notify } = useToast();
  const [draft, setDraft] = useState({ name: "", charge: "" });

  async function saveZone(zone, changes) {
    try {
      await save({ id: zone.id, ...changes }).unwrap();
      notify("Delivery zone updated.");
    } catch (error) {
      notify(error.errors ? Object.values(error.errors)[0][0] : error.message, "error");
    }
  }

  async function addZone(event) {
    event.preventDefault();
    try {
      await save({ name: draft.name, charge: draft.charge, sort_order: zones.length + 1 }).unwrap();
      setDraft({ name: "", charge: "" });
      notify("Delivery zone added.");
    } catch (error) {
      notify(error.errors ? Object.values(error.errors)[0][0] : error.message, "error");
    }
  }

  return (
    <Card title="Delivery charges" className="h-fit">
      <ul className="space-y-3">
        {zones.map((zone) => (
          <li key={zone.id} className="rounded-lg p-3 ring-1 ring-ink-100">
            <div className="flex items-end gap-2">
              <Input label="Zone" defaultValue={zone.name} onBlur={(event) => event.target.value !== zone.name && saveZone(zone, { name: event.target.value })} className="flex-1" />
              <Input
                label="Charge (৳)"
                type="number"
                min="0"
                inputMode="decimal"
                defaultValue={Number(zone.charge)}
                onBlur={(event) => Number(event.target.value) !== Number(zone.charge) && saveZone(zone, { charge: event.target.value })}
                className="w-28"
              />
            </div>
            <Checkbox className="mt-2" label="Offer at checkout" checked={zone.is_active} onChange={(event) => saveZone(zone, { is_active: event.target.checked })} />
          </li>
        ))}
      </ul>
      <form onSubmit={addZone} className="mt-4 flex items-end gap-2 border-t border-ink-100 pt-4">
        <Input label="New zone" placeholder="e.g. Sub-area" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="flex-1" />
        <Input label="৳" type="number" min="0" value={draft.charge} onChange={(event) => setDraft({ ...draft, charge: event.target.value })} className="w-24" />
        <Button type="submit" variant="secondary" loading={isLoading} disabled={!draft.name || draft.charge === ""} aria-label="Add zone">
          <Plus className="size-4" />
        </Button>
      </form>
      <p className="mt-3 text-xs text-ink-400">Changes save when you leave a field. Current: {zones.map((zone) => `${zone.name} ${formatBDT(zone.charge)}`).join(" · ")}</p>
    </Card>
  );
}
