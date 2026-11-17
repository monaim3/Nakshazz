"use client";

import { useState } from "react";
import { FolderTree, Pencil, Plus } from "lucide-react";
import { useCategoriesQuery, useDeleteCategoryMutation, useSaveCategoryMutation } from "@/store/admin/catalogApi";
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, Select, Table, Textarea, useToast } from "@/components/admin/ui";

export default function CategoriesManager() {
  const { data, error, isLoading, refetch } = useCategoriesQuery();
  const [editing, setEditing] = useState(null); // null | "new" | category
  const categories = data?.data || [];

  // Parents first, children listed under their parent.
  const ordered = categories
    .filter((category) => !category.parent_id)
    .flatMap((parent) => [parent, ...categories.filter((child) => child.parent_id === parent.id)]);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group products for shop navigation, e.g. Earrings → Jhumka."
        actions={
          <Button variant="gold" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add category
          </Button>
        }
      />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}

      {!isLoading && !error && (
        <Card padded={false}>
          <Table
            rows={ordered}
            onRowClick={setEditing}
            empty={<EmptyState icon={FolderTree} title="No categories yet" description="Create categories like Earrings, Necklaces, Bangles." />}
            columns={[
              {
                key: "name",
                label: "Name",
                render: (category) => (
                  <div className={category.parent_id ? "pl-6" : ""}>
                    <p className="font-medium text-ink-900">
                      {category.parent_id && <span className="text-ink-300">└ </span>}
                      {category.name}
                    </p>
                    <p className="text-xs text-ink-400">/{category.slug}</p>
                  </div>
                ),
              },
              { key: "products_count", label: "Products", align: "right" },
              {
                key: "status",
                label: "",
                align: "right",
                render: (category) => (
                  <span className="inline-flex items-center gap-2">
                    {category.is_active === false && <Badge>Hidden</Badge>}
                    <Pencil className="size-4 text-ink-300" />
                  </span>
                ),
              },
            ]}
          />
        </Card>
      )}

      {editing && <CategoryModal key={editing === "new" ? "new" : editing.id} category={editing === "new" ? null : editing} parents={categories.filter((category) => !category.parent_id)} onClose={() => setEditing(null)} />}
    </>
  );
}

function CategoryModal({ category, parents, onClose }) {
  const [save, saveState] = useSaveCategoryMutation();
  const [remove, removeState] = useDeleteCategoryMutation();
  const { notify } = useToast();
  const [errors, setErrors] = useState({});

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    const formData = new FormData(event.currentTarget);
    formData.set("is_active", event.currentTarget.elements.is_active.checked ? "1" : "0");
    if (!formData.get("image")?.size) formData.delete("image");
    ["slug", "parent_id"].forEach((key) => {
      if (!formData.get(key)) formData.delete(key);
    });

    try {
      await save({ id: category?.id, formData }).unwrap();
      notify(category ? "Category saved." : "Category created.");
      onClose();
    } catch (error) {
      const fieldErrors = Object.fromEntries(Object.entries(error.errors || {}).map(([key, messages]) => [key, messages[0]]));
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: error.message });
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete “${category.name}”?`)) return;
    try {
      await remove(category.id).unwrap();
      notify("Category deleted.");
      onClose();
    } catch (error) {
      setErrors({ form: error.message });
    }
  }

  return (
    <Modal open onClose={onClose} title={category ? "Edit category" : "Add category"}>
      <form id="category-form" onSubmit={submit} className="space-y-4">
        <Input name="name" label="Name" required defaultValue={category?.name} error={errors.name} />
        <Input name="slug" label="URL slug" hint="Leave empty to generate from the name." defaultValue={category?.slug} error={errors.slug} />
        <Select
          name="parent_id"
          label="Parent category"
          placeholder="None (top level)"
          options={parents.filter((parent) => parent.id !== category?.id).map((parent) => ({ value: String(parent.id), label: parent.name }))}
          defaultValue={category?.parent_id ? String(category.parent_id) : ""}
          error={errors.parent_id}
        />
        <Textarea name="description" label="Description" rows={3} defaultValue={category?.description || ""} />
        <Input name="image" label="Image" type="file" accept="image/jpeg,image/png,image/webp" error={errors.image} hint={category?.image_url ? "Upload to replace the current image." : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="seo_title" label="SEO title" defaultValue={category?.seo?.title || ""} error={errors.seo_title} />
          <Input name="sort_order" label="Sort order" type="number" min="0" defaultValue={category?.sort_order ?? 0} />
        </div>
        <Textarea name="seo_description" label="SEO description" rows={2} defaultValue={category?.seo?.description || ""} error={errors.seo_description} />
        <Checkbox name="is_active" label="Show in shop" defaultChecked={category ? category.is_active !== false : true} />
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      </form>
      <div className="mt-5 flex items-center justify-between gap-2 border-t border-ink-100 pt-4">
        {category ? (
          <Button variant="ghost" onClick={handleDelete} loading={removeState.isLoading} className="text-red-600 hover:bg-red-50">
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={saveState.isLoading}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
