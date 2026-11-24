"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { useCategoriesQuery, useCreateProductMutation, useDeleteProductMutation, useUpdateProductMutation } from "@/store/admin/catalogApi";
import { useIsOwner } from "@/components/admin/AdminShell";
import { formatBDT } from "@/lib/format";
import { Badge, Button, Card, Checkbox, cx, Input, Select, Textarea, useToast } from "@/components/admin/ui";

const money = z.string().trim().refine((value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) >= 0), "Enter a valid amount.");

const schema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(150),
  category_id: z.string().min(1, "Choose a category."),
  status: z.enum(["draft", "active", "archived"]),
  short_description: z.string().max(300).optional(),
  description: z.string().max(20000).optional(),
  is_featured: z.boolean(),
  is_made_to_order: z.boolean(),
  preparation_days: z.string().optional(),
  seo_title: z.string().max(70, "Keep it under 70 characters.").optional(),
  seo_description: z.string().max(170, "Keep it under 170 characters.").optional(),
  optionNames: z.array(z.string().max(30)),
  variants: z
    .array(
      z.object({
        id: z.number().optional(),
        sku: z.string().trim().max(60).regex(/^[A-Za-z0-9\-_.]*$/, "Letters, numbers, - _ . only."),
        values: z.array(z.string().max(50)),
        price: money.refine((value) => value !== "", "Price is required."),
        compare_at_price: money,
        raw_material_cost: money,
        labour_cost: money,
        packaging_cost: money,
        other_cost: money,
        initial_stock: z.string().optional(),
        low_stock_threshold: z.string().optional(),
        is_active: z.boolean(),
      }),
    )
    .min(1),
});

const blankVariant = () => ({
  sku: "", values: ["", ""], price: "", compare_at_price: "", raw_material_cost: "", labour_cost: "",
  packaging_cost: "", other_cost: "", initial_stock: "", low_stock_threshold: "", is_active: true,
});

function toFormValues(product) {
  if (!product) {
    return {
      name: "", category_id: "", status: "active", short_description: "", description: "", is_featured: false,
      is_made_to_order: false, preparation_days: "", seo_title: "", seo_description: "", optionNames: ["", ""], variants: [blankVariant()],
    };
  }

  const optionNames = [...new Set(product.variants.flatMap((variant) => Object.keys(variant.options || {})))].slice(0, 2);
  while (optionNames.length < 2) optionNames.push("");

  return {
    name: product.name,
    category_id: String(product.category_id),
    status: product.status,
    short_description: product.short_description || "",
    description: product.description || "",
    is_featured: product.is_featured,
    is_made_to_order: product.is_made_to_order,
    preparation_days: product.preparation_days ? String(product.preparation_days) : "",
    seo_title: product.seo_title || "",
    seo_description: product.seo_description || "",
    optionNames,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      values: optionNames.map((name) => (name ? variant.options?.[name] || "" : "")),
      price: variant.price,
      compare_at_price: variant.compare_at_price || "",
      raw_material_cost: variant.raw_material_cost ?? "",
      labour_cost: variant.labour_cost ?? "",
      packaging_cost: variant.packaging_cost ?? "",
      other_cost: variant.other_cost ?? "",
      initial_stock: "",
      low_stock_threshold: variant.low_stock_threshold ? String(variant.low_stock_threshold) : "",
      is_active: variant.is_active,
    })),
  };
}

function autoSku(name, values) {
  const initials = name.split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 4);
  const suffix = values.filter(Boolean).map((value) => value.replace(/[^A-Za-z0-9]/g, "").slice(0, 3)).join("-");
  return `NK-${initials}${suffix ? `-${suffix}` : ""}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/** Form values → API payload (option names/values become each variant's options + title). */
function toPayload(values, isOwner) {
  const names = values.optionNames.map((name) => name.trim()).filter(Boolean);

  return {
    name: values.name,
    category_id: Number(values.category_id),
    status: values.status,
    short_description: values.short_description || null,
    description: values.description || null,
    is_featured: values.is_featured,
    is_made_to_order: values.is_made_to_order,
    preparation_days: values.preparation_days ? Number(values.preparation_days) : null,
    seo_title: values.seo_title || null,
    seo_description: values.seo_description || null,
    variants: values.variants.map((variant, index) => {
      const options = {};
      values.optionNames.forEach((name, position) => {
        if (name.trim() && variant.values[position]?.trim()) options[name.trim()] = variant.values[position].trim();
      });
      const title = names.length ? Object.values(options).join(" / ") || `Variant ${index + 1}` : "Default";

      return {
        ...(variant.id ? { id: variant.id } : {}),
        sku: variant.sku || autoSku(values.name, Object.values(options)),
        title,
        options: Object.keys(options).length ? options : null,
        price: variant.price,
        compare_at_price: variant.compare_at_price || null,
        ...(isOwner
          ? {
              raw_material_cost: variant.raw_material_cost || 0,
              labour_cost: variant.labour_cost || 0,
              packaging_cost: variant.packaging_cost || 0,
              other_cost: variant.other_cost || 0,
            }
          : {}),
        low_stock_threshold: variant.low_stock_threshold ? Number(variant.low_stock_threshold) : null,
        allow_backorder: values.is_made_to_order,
        is_active: variant.is_active,
        ...(!variant.id && variant.initial_stock ? { initial_stock: Number(variant.initial_stock) } : {}),
      };
    }),
  };
}

// Server errors for a variant row that have no input of their own on the row.
const ROW_ERROR_KEYS = ["options", "title", "id", "is_active", "allow_backorder", "sort_order"];

const isZeroPrice = (value) => value !== "" && value != null && !Number.isNaN(Number(value)) && Number(value) === 0;

export default function ProductForm({ product, imagesSlot, onCreated }) {
  const router = useRouter();
  const isOwner = useIsOwner();
  const { notify } = useToast();
  const { data: categoryData } = useCategoriesQuery();
  const [createProduct, createState] = useCreateProductMutation();
  const [updateProduct, updateState] = useUpdateProductMutation();
  const [deleteProduct, deleteState] = useDeleteProductMutation();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toFormValues(product) });
  const { fields, append, remove } = useFieldArray({ control, name: "variants" });
  const optionNames = useWatch({ control, name: "optionNames" });
  const variants = useWatch({ control, name: "variants" });
  const madeToOrder = useWatch({ control, name: "is_made_to_order" });
  const seoTitle = useWatch({ control, name: "seo_title" }) || "";
  const seoDescription = useWatch({ control, name: "seo_description" }) || "";
  const hasOptions = optionNames.some((name) => name.trim());
  // a ৳0 price is refused by the server unless the owner confirms the piece is meant to be free
  const [freeConfirmed, setFreeConfirmed] = useState(false);
  const hasFreePrice = (variants || []).some((variant) => isZeroPrice(variant?.price));

  const categories = (categoryData?.data || []).map((category) => ({
    value: String(category.id),
    label: category.parent_id ? `— ${category.name}` : category.name,
  }));

  async function onSubmit(values) {
    if (!hasOptions && values.variants.length > 1) {
      setError("optionNames.0", { message: "Name the option (e.g. Color or Size) to have more than one variant." });
      return;
    }

    try {
      const payload = toPayload(values, isOwner);
      if (freeConfirmed && values.variants.some((variant) => isZeroPrice(variant.price))) payload.allow_free_price = true;
      if (product) {
        await updateProduct({ id: product.id, ...payload }).unwrap();
        notify("Product saved.");
      } else {
        const result = await createProduct(payload).unwrap();
        notify("Product created — now add photos.");
        onCreated(result.data);
      }
    } catch (error) {
      let mapped = false;
      Object.entries(error.errors || {}).forEach(([field, messages]) => {
        mapped = true;
        setError(field, { message: messages[0] });
      });
      notify(mapped ? "Please fix the highlighted fields." : error.message, "error");
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete “${product.name}”? Products with sales history are archived instead.`)) return;
    try {
      const result = await deleteProduct(product.id).unwrap();
      notify(result.message);
      router.replace("/admin/products");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-3" noValidate>
      <div className="space-y-6 lg:col-span-2">
        <Card title="Details">
          <div className="space-y-4">
            <Input label="Product name" required error={errors.name?.message} {...register("name")} />
            <Textarea label="Short description" hint="One or two lines shown on product cards and in Google results." rows={2} error={errors.short_description?.message} {...register("short_description")} />
            <Textarea label="Full description" hint="Materials, size, care instructions. Line breaks are kept." rows={6} {...register("description")} />
          </div>
        </Card>

        {imagesSlot ?? (
          <Card title="Photos">
            <p className="text-sm text-ink-500">Save the product first, then upload photos here.</p>
          </Card>
        )}

        <Card title="Variants & pricing" padded={false}>
          <div className="border-b border-ink-100 p-5">
            <p className="mb-3 text-sm text-ink-600">Does this piece come in different colours, sizes or materials? Name the options, then add one row per combination.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Option 1" placeholder="e.g. Color" error={errors.optionNames?.[0]?.message} {...register("optionNames.0")} />
              <Input label="Option 2" placeholder="e.g. Size (optional)" {...register("optionNames.1")} />
            </div>
          </div>

          <ul className="divide-y divide-ink-100">
            {fields.map((field, index) => {
              const variant = variants?.[index] || {};
              const totalCost = ["raw_material_cost", "labour_cost", "packaging_cost", "other_cost"].reduce((sum, key) => sum + Number(variant[key] || 0), 0);
              const margin = Number(variant.price || 0) - totalCost;
              const variantErrors = errors.variants?.[index] || {};
              const rowErrors = ROW_ERROR_KEYS.map((key) => variantErrors[key]?.message).filter(Boolean);

              return (
                <li key={field.id} className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-800">
                      {hasOptions ? variant.values?.filter(Boolean).join(" / ") || `Variant ${index + 1}` : "Price & stock"}
                    </p>
                    <div className="flex items-center gap-3">
                      <Checkbox label="Sell this" {...register(`variants.${index}.is_active`)} />
                      {fields.length > 1 && (
                        <button type="button" onClick={() => remove(index)} className="rounded p-1 text-ink-300 hover:text-red-600" aria-label="Remove variant">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {optionNames.map((name, position) =>
                      name.trim() ? <Input key={position} label={name} {...register(`variants.${index}.values.${position}`)} /> : null,
                    )}
                    <Input label="Price (৳)" required type="number" min="0" step="0.01" inputMode="decimal" error={variantErrors.price?.message} {...register(`variants.${index}.price`)} />
                    <Input label="Compare-at price" hint="Old price, shown struck through." type="number" min="0" step="0.01" inputMode="decimal" error={variantErrors.compare_at_price?.message} {...register(`variants.${index}.compare_at_price`)} />
                    <Input label="SKU" hint="Leave empty to auto-generate." error={variantErrors.sku?.message} {...register(`variants.${index}.sku`)} />
                    {!variant.id && !madeToOrder && <Input label="Opening stock" type="number" min="0" inputMode="numeric" error={variantErrors.initial_stock?.message} {...register(`variants.${index}.initial_stock`)} />}
                    <Input label="Low-stock alert at" type="number" min="0" inputMode="numeric" placeholder="Store default" error={variantErrors.low_stock_threshold?.message} {...register(`variants.${index}.low_stock_threshold`)} />
                  </div>

                  {rowErrors.length > 0 && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                      {rowErrors.join(" ")}
                    </p>
                  )}

                  {isOwner && (
                    <div className="rounded-lg bg-cream-100 p-3">
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Input label="Raw material" type="number" min="0" step="0.01" inputMode="decimal" error={variantErrors.raw_material_cost?.message} {...register(`variants.${index}.raw_material_cost`)} />
                        <Input label="Labour" type="number" min="0" step="0.01" inputMode="decimal" error={variantErrors.labour_cost?.message} {...register(`variants.${index}.labour_cost`)} />
                        <Input label="Packaging" type="number" min="0" step="0.01" inputMode="decimal" error={variantErrors.packaging_cost?.message} {...register(`variants.${index}.packaging_cost`)} />
                        <Input label="Other" type="number" min="0" step="0.01" inputMode="decimal" error={variantErrors.other_cost?.message} {...register(`variants.${index}.other_cost`)} />
                      </div>
                      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-600">
                        <span>
                          Cost <strong>{formatBDT(totalCost)}</strong>
                        </span>
                        <span>
                          Profit per piece <strong className={margin < 0 ? "text-red-600" : "text-emerald-700"}>{formatBDT(margin)}</strong>
                        </span>
                        {Number(variant.price) > 0 && <span>Margin {Math.round((margin / Number(variant.price)) * 100)}%</span>}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {(errors.variants?.message || errors.variants?.root?.message) && <p className="border-t border-ink-100 px-5 py-3 text-sm text-red-600">{errors.variants.message || errors.variants.root.message}</p>}

          {hasFreePrice && (
            <div className="border-t border-ink-100 bg-amber-50 px-5 py-3">
              <Checkbox
                label="Free item (price ৳0 is intended)"
                hint="Leave unticked if ৳0 is a typo — the shop would give this piece away."
                checked={freeConfirmed}
                onChange={(event) => setFreeConfirmed(event.target.checked)}
              />
            </div>
          )}

          {hasOptions && (
            <div className="border-t border-ink-100 p-4">
              <Button variant="secondary" size="sm" onClick={() => append(blankVariant())}>
                <Plus className="size-4" /> Add variant
              </Button>
            </div>
          )}
          {product && <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-400">To change stock of existing variants, use Inventory — every change is logged there.</p>}
        </Card>

        <Card title="Search engine listing">
          <div className="space-y-4">
            <Input label="SEO title" hint={`${seoTitle.length}/70 · defaults to the product name`} error={errors.seo_title?.message} {...register("seo_title")} />
            <Textarea label="SEO description" rows={2} hint={`${seoDescription.length}/170 · defaults to the short description`} error={errors.seo_description?.message} {...register("seo_description")} />
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Status">
          <div className="space-y-4">
            <Select
              label="Visibility"
              options={[
                { value: "active", label: "Active — visible in shop" },
                { value: "draft", label: "Draft — hidden" },
                { value: "archived", label: "Archived — hidden" },
              ]}
              {...register("status")}
            />
            <Select label="Category" required placeholder="Choose…" options={categories} error={errors.category_id?.message} {...register("category_id")} />
            <Checkbox label="Featured on homepage" {...register("is_featured")} />
            <Checkbox label="Made to order" hint="Can be ordered even when stock is 0." {...register("is_made_to_order")} />
            {madeToOrder && <Input label="Preparation time (days)" type="number" min="0" inputMode="numeric" {...register("preparation_days")} />}
          </div>
        </Card>

        <div className="space-y-2 lg:sticky lg:top-6">
          <Button type="submit" variant="gold" size="lg" className="w-full" loading={createState.isLoading || updateState.isLoading}>
            {product ? "Save changes" : "Create product"}
          </Button>
          {product && isDirty && <Badge tone="amber" className="w-full justify-center">Unsaved changes</Badge>}
          {product && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteState.isLoading}
              className={cx("w-full rounded-lg py-2 text-sm text-ink-400 hover:bg-red-50 hover:text-red-600")}
            >
              Delete product
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
