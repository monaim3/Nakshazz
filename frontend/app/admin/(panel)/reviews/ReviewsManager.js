"use client";

import { useState } from "react";
import { Check, Download, Sparkles, Star, Trash2, X } from "lucide-react";
import { useDeleteReviewMutation, useImportReviewMutation, useReviewsQuery, useUpdateReviewMutation } from "@/store/admin/contentApi";
import { useProductsQuery } from "@/store/admin/catalogApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { formatDate, humanize } from "@/lib/format";
import { Badge, Button, Card, Checkbox, cx, EmptyState, ErrorBlock, LoadingBlock, Modal, PageHeader, Pagination, Select, StatusBadge, Textarea, Input, useToast } from "@/components/admin/ui";

const FILTER_KEYS = ["status", "page"];
const TABS = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

function Stars({ rating }) {
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className={cx("size-4", value <= rating ? "fill-gold-400 text-gold-400" : "text-ink-200")} aria-hidden />
      ))}
    </span>
  );
}

export default function ReviewsManager() {
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const status = filters.status || "pending";
  const { data, error, isLoading, isFetching, refetch } = useReviewsQuery({ status: status === "all" ? undefined : status, page: filters.page });
  const [updateReview] = useUpdateReviewMutation();
  const [deleteReview] = useDeleteReviewMutation();
  const [importing, setImporting] = useState(false);
  const { notify } = useToast();
  const reviews = data?.data || [];

  async function update(review, changes, message) {
    try {
      await updateReview({ id: review.id, ...changes }).unwrap();
      notify(message);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function remove(review) {
    if (!window.confirm("Delete this review permanently?")) return;
    try {
      await deleteReview(review.id).unwrap();
      notify("Review deleted.");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Reviews"
        description="New website reviews wait here until you approve them. Featured reviews appear on the homepage."
        actions={
          <Button variant="secondary" onClick={() => setImporting(true)}>
            <Download className="size-4" /> Add existing review
          </Button>
        }
      />

      <div className="mb-4 inline-flex gap-1 rounded-lg bg-white p-1 ring-1 ring-ink-100" role="tablist" aria-label="Review status">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setFilters({ status: tab.value === "pending" ? "" : tab.value })}
            className={cx("rounded-md px-3 py-1.5 text-sm", status === tab.value ? "bg-ink-900 text-cream-50" : "text-ink-600 hover:bg-cream-100")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}

      {!isLoading && !error && (
        <Card padded={false} className={cx("transition-opacity", isFetching && "opacity-60")}>
          {reviews.length === 0 ? (
            <EmptyState icon={Star} title={status === "pending" ? "No reviews waiting" : "No reviews here"} description="Reviews customers submit on product pages show up here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {reviews.map((review) => (
                <li key={review.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars rating={review.rating} />
                      <span className="text-sm font-medium text-ink-900">{review.customer_name}</span>
                      {review.order_id && <Badge tone="green">Verified buyer</Badge>}
                      {review.is_featured && <Badge tone="gold">On homepage</Badge>}
                      <StatusBadge status={review.status} />
                    </div>
                    <p className="text-sm whitespace-pre-line text-ink-700">{review.comment}</p>
                    <p className="text-xs text-ink-400">
                      {review.product ? review.product.name : "Store review"} · {humanize(review.source)} · {formatDate(review.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {review.status !== "approved" && (
                      <Button size="sm" onClick={() => update(review, { status: "approved" }, "Review approved.")}>
                        <Check className="size-3.5" /> Approve
                      </Button>
                    )}
                    {review.status === "approved" && (
                      <Button size="sm" variant="secondary" onClick={() => update(review, { is_featured: !review.is_featured }, review.is_featured ? "Removed from homepage." : "Featured on homepage.")}>
                        <Sparkles className="size-3.5" /> {review.is_featured ? "Unfeature" : "Feature"}
                      </Button>
                    )}
                    {review.status !== "rejected" && (
                      <Button size="sm" variant="secondary" onClick={() => update(review, { status: "rejected", is_featured: false }, "Review hidden.")}>
                        <X className="size-3.5" /> Reject
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(review)} aria-label="Delete review">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
        </Card>
      )}

      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  );
}

function ImportModal({ onClose }) {
  const { data } = useProductsQuery({ status: "active", per_page: 100 });
  const [importReview, { isLoading }] = useImportReviewMutation();
  const { notify } = useToast();
  const [form, setForm] = useState({ product_id: "", customer_name: "", rating: "5", comment: "", source: "facebook", is_featured: true });
  const [errors, setErrors] = useState({});
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  async function submit() {
    setErrors({});
    try {
      await importReview({ ...form, product_id: form.product_id ? Number(form.product_id) : null, rating: Number(form.rating) }).unwrap();
      notify("Review added.");
      onClose();
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.errors || { form: [error.message] }).map(([key, messages]) => [key, messages[0]])));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add an existing review"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Add review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-500">Copy a real review from your Facebook page, Instagram or WhatsApp. Please only add genuine customer words.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Customer name" required value={form.customer_name} onChange={set("customer_name")} error={errors.customer_name} />
          <Select
            label="Source"
            options={[
              { value: "facebook", label: "Facebook" },
              { value: "instagram", label: "Instagram" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "website", label: "Website" },
            ]}
            value={form.source}
            onChange={set("source")}
          />
          <Select label="Rating" options={[5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} star${value > 1 ? "s" : ""}` }))} value={form.rating} onChange={set("rating")} />
          <Select
            label="Product"
            placeholder="Store review (no product)"
            options={(data?.data || []).map((product) => ({ value: String(product.id), label: product.name }))}
            value={form.product_id}
            onChange={set("product_id")}
          />
        </div>
        <Textarea label="Review" required rows={4} value={form.comment} onChange={set("comment")} error={errors.comment} />
        <Checkbox label="Show on homepage" checked={form.is_featured} onChange={set("is_featured")} />
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      </div>
    </Modal>
  );
}
