"use client";

import { useState } from "react";
import { FileText, ImageIcon, Plus } from "lucide-react";
import { useBannersQuery, useDeleteBannerMutation, usePagesQuery, useSaveBannerMutation, useUpdatePageMutation } from "@/store/admin/contentApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Checkbox, cx, EmptyState, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, Select, Textarea, useToast } from "@/components/admin/ui";

const FILTER_KEYS = ["tab"];

export default function ContentManager() {
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const tab = filters.tab || "banners";

  return (
    <>
      <PageHeader title="Banners & pages" description="What shoppers see on the homepage and on your information pages." />
      <div className="mb-4 inline-flex gap-1 rounded-lg bg-white p-1 ring-1 ring-ink-100" role="tablist">
        {[
          { value: "banners", label: "Homepage banners" },
          { value: "pages", label: "Pages" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setFilters({ tab: item.value === "banners" ? "" : item.value })}
            className={cx("rounded-md px-3 py-1.5 text-sm", tab === item.value ? "bg-ink-900 text-cream-50" : "text-ink-600 hover:bg-cream-100")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "banners" ? <Banners /> : <Pages />}
    </>
  );
}

/* ---------------- Banners ---------------- */

function Banners() {
  const { data, error, isLoading, refetch } = useBannersQuery();
  const [editing, setEditing] = useState(null);
  const banners = data?.data || [];

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const groups = [
    { placement: "hero", title: "Hero slider (top of homepage)", hint: "Wide photos, about 2400 × 1000 px. Add a phone version (1080 × 1350) for best results." },
    { placement: "promo", title: "Promotional banners", hint: "Offers and collections shown further down the homepage." },
  ];

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const items = banners.filter((banner) => banner.placement === group.placement);
        return (
          <Card
            key={group.placement}
            title={group.title}
            actions={
              <Button size="sm" variant="secondary" onClick={() => setEditing({ placement: group.placement })}>
                <Plus className="size-3.5" /> Add banner
              </Button>
            }
          >
            <p className="mb-4 text-xs text-ink-400">{group.hint}</p>
            {items.length === 0 ? (
              <EmptyState icon={ImageIcon} title="No banners yet" />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {items.map((banner) => (
                  <li key={banner.id}>
                    <button type="button" onClick={() => setEditing(banner)} className="group block w-full overflow-hidden rounded-xl text-left ring-1 ring-ink-100 hover:ring-gold-400">
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
                      <img src={banner.image_url} alt="" className="aspect-[12/5] w-full bg-cream-200 object-cover" loading="lazy" />
                      <div className="flex items-start justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{banner.title}</p>
                          <p className="text-xs text-ink-400">
                            {banner.starts_at || banner.ends_at ? `${banner.starts_at ? formatDate(banner.starts_at) : "now"} → ${banner.ends_at ? formatDate(banner.ends_at) : "no end"}` : "Always on"}
                          </p>
                        </div>
                        {!banner.is_active && <Badge>Hidden</Badge>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
      {editing && <BannerModal key={editing.id || "new"} banner={editing.id ? editing : null} placement={editing.placement} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** ISO → value for <input type="datetime-local"> in local time. */
function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 16);
}

function BannerModal({ banner, placement, onClose }) {
  const [save, saveState] = useSaveBannerMutation();
  const [remove, removeState] = useDeleteBannerMutation();
  const { notify } = useToast();
  const [errors, setErrors] = useState({});

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("is_active", form.elements.is_active.checked ? "1" : "0");
    ["image", "mobile_image"].forEach((key) => {
      if (!formData.get(key)?.size) formData.delete(key);
    });

    try {
      await save({ id: banner?.id, formData }).unwrap();
      notify("Banner saved.");
      onClose();
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.errors || { form: [error.message] }).map(([key, messages]) => [key, messages[0]])));
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this banner?")) return;
    try {
      await remove(banner.id).unwrap();
      notify("Banner deleted.");
      onClose();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={banner ? "Edit banner" : "Add banner"}>
      <form id="banner-form" onSubmit={submit} className="space-y-4">
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview
          <img src={banner.image_url} alt="" className="aspect-[12/5] w-full rounded-lg object-cover" />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="image" type="file" accept="image/jpeg,image/png,image/webp" label={banner ? "Replace desktop image" : "Desktop image"} required={!banner} error={errors.image} />
          <Input name="mobile_image" type="file" accept="image/jpeg,image/png,image/webp" label="Phone image (optional)" error={errors.mobile_image} />
          <Input name="title" label="Heading" required defaultValue={banner?.title} error={errors.title} />
          <Input name="subtitle" label="Sub-heading" defaultValue={banner?.subtitle || ""} />
          <Input name="button_text" label="Button text" placeholder="Shop now" defaultValue={banner?.button_text || ""} />
          <Input name="link_url" label="Button link" placeholder="/shop?category=earrings" defaultValue={banner?.link_url || ""} error={errors.link_url} hint="A page on your site (starting with /) or a full https:// link." />
          <Select
            name="placement"
            label="Position"
            options={[
              { value: "hero", label: "Hero slider" },
              { value: "promo", label: "Promotional" },
            ]}
            defaultValue={banner?.placement || placement}
          />
          <Input name="sort_order" label="Order" type="number" min="0" defaultValue={banner?.sort_order ?? 0} />
          <Input name="starts_at" label="Show from (optional)" type="datetime-local" defaultValue={toLocalInput(banner?.starts_at)} />
          <Input name="ends_at" label="Hide after (optional)" type="datetime-local" defaultValue={toLocalInput(banner?.ends_at)} error={errors.ends_at} />
        </div>
        <Checkbox name="is_active" label="Show on website" defaultChecked={banner ? banner.is_active : true} />
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      </form>
      <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
        {banner ? (
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
          <Button type="submit" form="banner-form" loading={saveState.isLoading}>
            Save banner
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Pages ---------------- */

function Pages() {
  const { data, error, isLoading, refetch } = usePagesQuery();
  const [selected, setSelected] = useState(null);
  const pages = data?.data || [];
  const page = pages.find((item) => item.slug === selected) || pages[0];

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;
  if (!page) return <EmptyState icon={FileText} title="No pages" />;

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <Card padded={false} className="h-fit">
        <ul className="p-2">
          {pages.map((item) => (
            <li key={item.slug}>
              <button
                type="button"
                onClick={() => setSelected(item.slug)}
                className={cx("w-full rounded-lg px-3 py-2 text-left text-sm", item.slug === page.slug ? "bg-cream-200 font-medium text-ink-900" : "text-ink-600 hover:bg-cream-100")}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <div className="lg:col-span-3">
        <PageEditor key={page.slug + page.updated_at} page={page} />
      </div>
    </div>
  );
}

function PageEditor({ page }) {
  const [update, { isLoading }] = useUpdatePageMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({ title: page.title, body: page.body, seo_title: page.seo?.title === page.title ? "" : page.seo?.title || "", seo_description: page.seo?.description || "" });
  const [errors, setErrors] = useState({});
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    setErrors({});
    try {
      await update({ slug: page.slug, ...form, seo_title: form.seo_title || null, seo_description: form.seo_description || null }).unwrap();
      notify("Page saved.");
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.errors || { form: [error.message] }).map(([key, messages]) => [key, messages[0]])));
    }
  }

  return (
    <Card
      title={`/${page.slug}`}
      actions={<span className="text-xs text-ink-400">Updated {formatDateTime(page.updated_at)}</span>}
    >
      <div className="space-y-4">
        <Input label="Title" value={form.title} onChange={set("title")} error={errors.title} />
        <Textarea
          label="Content"
          rows={16}
          value={form.body}
          onChange={set("body")}
          error={errors.body}
          className="font-mono"
          hint="Formatting: ## Heading · **bold** · - bullet point · blank line = new paragraph."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="SEO title" value={form.seo_title} onChange={set("seo_title")} hint="Defaults to the title." error={errors.seo_title} />
          <Input label="SEO description" value={form.seo_description} onChange={set("seo_description")} hint={`${form.seo_description.length}/170`} error={errors.seo_description} />
        </div>
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
        <Button onClick={save} loading={isLoading}>
          Save page
        </Button>
      </div>
    </Card>
  );
}
