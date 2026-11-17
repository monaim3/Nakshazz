"use client";

import { useState } from "react";
import { Paperclip, Plus, Receipt, Settings2 } from "lucide-react";
import { useDeleteExpenseMutation, useExpenseCategoriesQuery, useExpensesQuery, useSaveExpenseCategoryMutation, useSaveExpenseMutation } from "@/store/admin/ownerApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { formatBDT, formatDate, todayISO } from "@/lib/format";
import { Badge, Button, Card, Checkbox, cx, EmptyState, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, Textarea, useToast } from "@/components/admin/ui";

const FILTER_KEYS = ["month", "category_id", "page"];
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** "2026-11" → { from, to } */
function monthRange(month) {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(year, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default function ExpensesManager() {
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const month = filters.month || todayISO().slice(0, 7);
  const { data, error, isLoading, isFetching, refetch } = useExpensesQuery({ ...monthRange(month), category_id: filters.category_id, page: filters.page });
  const { data: categoryData } = useExpenseCategoriesQuery();
  const [editing, setEditing] = useState(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const categories = categoryData?.data || [];
  const expenses = data?.data || [];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Business costs that are not part of a product's cost: ads, rent, salaries, bills. These reduce net profit."
        actions={
          <>
            <Button variant="secondary" onClick={() => setManagingCategories(true)}>
              <Settings2 className="size-4" /> Categories
            </Button>
            <Button variant="gold" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add expense
            </Button>
          </>
        }
      />

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input label="Month" type="month" value={month} max={todayISO().slice(0, 7)} onChange={(event) => setFilters({ month: event.target.value })} />
            <Select
              label="Category"
              placeholder="All categories"
              options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
              value={filters.category_id}
              onChange={(event) => setFilters({ category_id: event.target.value })}
            />
          </div>
          {data && (
            <p className="text-sm text-ink-500">
              Total <span className="text-lg font-semibold text-ink-900 tabular-nums">{formatBDT(data.total_amount)}</span>
            </p>
          )}
        </div>

        {isLoading && <LoadingBlock />}
        {error && (
          <div className="p-4">
            <ErrorBlock error={error} onRetry={refetch} />
          </div>
        )}
        {!isLoading && !error && (
          <div className={cx("transition-opacity", isFetching && "opacity-60")}>
            <Table
              rows={expenses}
              onRowClick={setEditing}
              empty={<EmptyState icon={Receipt} title="No expenses this month" description="Record ads, rent, bills and other running costs to see true net profit." />}
              columns={[
                { key: "expense_date", label: "Date", className: "whitespace-nowrap text-ink-500", render: (expense) => formatDate(expense.expense_date) },
                {
                  key: "title",
                  label: "Expense",
                  render: (expense) => (
                    <span className="flex items-center gap-1.5 font-medium text-ink-900">
                      {expense.title}
                      {expense.has_attachment && <Paperclip className="size-3.5 text-ink-400" aria-label="Has receipt" />}
                    </span>
                  ),
                },
                { key: "category", label: "Category", className: "hidden sm:table-cell", render: (expense) => <Badge>{expense.category?.name}</Badge> },
                { key: "amount", label: "Amount", align: "right", render: (expense) => <span className="font-medium">{formatBDT(expense.amount)}</span> },
              ]}
            />
            <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
          </div>
        )}
      </Card>

      {editing && <ExpenseModal key={editing === "new" ? "new" : editing.id} expense={editing === "new" ? null : editing} categories={categories.filter((category) => category.is_active)} onClose={() => setEditing(null)} />}
      {managingCategories && <CategoriesModal categories={categories} onClose={() => setManagingCategories(false)} />}
    </>
  );
}

function ExpenseModal({ expense, categories, onClose }) {
  const [save, saveState] = useSaveExpenseMutation();
  const [remove, removeState] = useDeleteExpenseMutation();
  const { notify } = useToast();
  const [categoryId, setCategoryId] = useState(expense?.category ? String(expense.category.id) : "");
  const [errors, setErrors] = useState({});
  const hint = categories.find((category) => String(category.id) === categoryId)?.hint;

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    const formData = new FormData(event.currentTarget);
    if (!formData.get("attachment")?.size) formData.delete("attachment");

    try {
      await save({ id: expense?.id, formData }).unwrap();
      notify("Expense saved.");
      onClose();
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.errors || { form: [error.message] }).map(([key, messages]) => [key, messages[0]])));
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await remove(expense.id).unwrap();
      notify("Expense deleted.");
      onClose();
    } catch (error) {
      setErrors({ form: error.message });
    }
  }

  return (
    <Modal open onClose={onClose} title={expense ? "Edit expense" : "Add expense"}>
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        <Input name="title" label="What was it for?" required placeholder="Facebook boost — Eid collection" defaultValue={expense?.title} error={errors.title} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="amount" label="Amount (৳)" required type="number" min="0" step="0.01" inputMode="decimal" defaultValue={expense?.amount} error={errors.amount} />
          <Input name="expense_date" label="Date" required type="date" max={todayISO()} defaultValue={expense?.expense_date || todayISO()} error={errors.expense_date} />
        </div>
        <Select
          name="expense_category_id"
          label="Category"
          required
          placeholder="Choose…"
          options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          error={errors.expense_category_id}
        />
        {hint && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{hint}</p>}
        <Textarea name="description" label="Notes" rows={2} defaultValue={expense?.description || ""} />
        <Input name="attachment" type="file" label={expense?.has_attachment ? "Replace receipt" : "Receipt (optional)"} accept="application/pdf,image/jpeg,image/png,image/webp" hint="PDF or photo, up to 5 MB." error={errors.attachment} />
        {expense?.has_attachment && (
          <a href={`${API_URL}/admin/expenses/${expense.id}/attachment`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-gold-700 hover:underline">
            <Paperclip className="size-3.5" /> View current receipt
          </a>
        )}
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      </form>
      <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
        {expense ? (
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
          <Button type="submit" form="expense-form" loading={saveState.isLoading}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CategoriesModal({ categories, onClose }) {
  const [save, { isLoading }] = useSaveExpenseCategoryMutation();
  const { notify } = useToast();
  const [name, setName] = useState("");

  async function add(event) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await save({ name: name.trim() }).unwrap();
      setName("");
      notify("Category added.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <Modal open onClose={onClose} title="Expense categories">
      <ul className="divide-y divide-ink-100">
        {categories.map((category) => (
          <li key={category.id} className="flex items-start justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-ink-900">{category.name}</p>
              {category.hint && <p className="text-xs text-ink-400">{category.hint}</p>}
            </div>
            <Checkbox label="In use" checked={category.is_active} onChange={(event) => save({ id: category.id, is_active: event.target.checked })} />
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 flex gap-2 border-t border-ink-100 pt-4">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New category name"
          aria-label="New category name"
          className="h-10 flex-1 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200 ring-inset focus:ring-2 focus:ring-gold-500 focus:outline-none"
        />
        <Button type="submit" loading={isLoading} disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </Modal>
  );
}
