"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useProductQuery } from "@/store/admin/catalogApi";
import { ErrorBlock, LoadingBlock, StatusBadge } from "@/components/admin/ui";
import ProductForm from "./ProductForm";
import ImageManager from "./ImageManager";
import TryOnManager from "./TryOnManager";

/** Loads the product (when editing) and mounts the form with it. */
export default function ProductEditor({ editing = false }) {
  const { id } = useParams();
  const router = useRouter();
  const { data, error, isLoading, refetch } = useProductQuery(id, { skip: !editing });
  const product = data?.data;

  if (editing && isLoading) return <LoadingBlock />;
  if (editing && error) return <ErrorBlock error={error} onRetry={refetch} />;

  return (
    <>
      <Link href="/admin/products" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{product ? product.name : "Add product"}</h1>
        {product && <StatusBadge status={product.status} />}
        {product?.status === "active" && (
          <a href={`/product/${product.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-gold-700 hover:underline">
            View in shop <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <ProductForm
        key={product?.updated_at || "new"}
        product={product}
        imagesSlot={
          product ? (
            <>
              <ImageManager product={product} />
              <TryOnManager product={product} />
            </>
          ) : null
        }
        onCreated={(created) => router.replace(`/admin/products/${created.id}?created=1`)}
      />
    </>
  );
}
