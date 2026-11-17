"use client";

import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { useDeleteProductImageMutation, useUpdateProductImageMutation, useUploadProductImagesMutation } from "@/store/admin/catalogApi";
import { Card, cx, Spinner, useToast } from "@/components/admin/ui";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function ImageManager({ product }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [upload, uploadState] = useUploadProductImagesMutation();
  const [updateImage] = useUpdateProductImageMutation();
  const [deleteImage] = useDeleteProductImageMutation();
  const { notify } = useToast();

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    const valid = files.filter((file) => ACCEPTED.includes(file.type) && file.size <= MAX_BYTES);
    if (valid.length < files.length) notify("Some files were skipped (JPG, PNG or WebP up to 8 MB).", "error");
    if (!valid.length) return;

    const formData = new FormData();
    valid.slice(0, 10).forEach((file) => formData.append("images[]", file));

    try {
      await upload({ productId: product.id, formData }).unwrap();
      notify(`${valid.length} photo${valid.length > 1 ? "s" : ""} uploaded.`);
    } catch (error) {
      notify(error.errors ? Object.values(error.errors)[0][0] : error.message, "error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function setPrimary(image) {
    await updateImage({ id: image.id, productId: product.id, is_primary: true }).unwrap().catch((error) => notify(error.message, "error"));
  }

  async function saveAlt(image, alt) {
    if (alt === (image.alt || "")) return;
    await updateImage({ id: image.id, productId: product.id, alt }).unwrap().catch((error) => notify(error.message, "error"));
  }

  async function remove(image) {
    if (!window.confirm("Delete this photo?")) return;
    await deleteImage({ id: image.id, productId: product.id }).unwrap().catch((error) => notify(error.message, "error"));
  }

  return (
    <Card title={`Photos (${product.images.length})`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {product.images.map((image, index) => (
          <figure key={image.id} className="group relative overflow-hidden rounded-xl bg-cream-200 ring-1 ring-ink-100">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin preview from API host */}
            <img src={image.urls.md} alt={image.alt || ""} className="aspect-square w-full object-cover" loading="lazy" />
            {index === 0 && <span className="absolute top-2 left-2 rounded-full bg-ink-900/80 px-2 py-0.5 text-[10px] font-medium text-cream-50">Main photo</span>}
            <div className="absolute top-2 right-2 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              {index !== 0 && (
                <button type="button" onClick={() => setPrimary(image)} className="rounded-md bg-white/90 p-1.5 text-ink-700 shadow hover:text-gold-600" aria-label="Make main photo" title="Make main photo">
                  <Star className="size-4" />
                </button>
              )}
              <button type="button" onClick={() => remove(image)} className="rounded-md bg-white/90 p-1.5 text-ink-700 shadow hover:text-red-600" aria-label="Delete photo" title="Delete">
                <Trash2 className="size-4" />
              </button>
            </div>
            <figcaption>
              <input
                defaultValue={image.alt || ""}
                onBlur={(event) => saveAlt(image, event.target.value)}
                placeholder="Describe the photo"
                aria-label="Photo description (alt text)"
                className="w-full border-t border-ink-100 bg-white px-2 py-1.5 text-xs focus:outline-none"
              />
            </figcaption>
          </figure>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          className={cx(
            "flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center text-xs text-ink-500 transition",
            dragging ? "border-gold-500 bg-gold-300/10" : "border-ink-200 hover:border-gold-400 hover:bg-cream-100",
          )}
        >
          {uploadState.isLoading ? <Spinner /> : <ImagePlus className="size-6 text-ink-300" />}
          <span>{uploadState.isLoading ? "Uploading…" : "Add photos"}</span>
          <span className="text-ink-300">JPG, PNG, WebP · min 400px</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPTED.join(",")} multiple hidden onChange={(event) => handleFiles(event.target.files)} />
      <p className="mt-3 text-xs text-ink-400">Photos are converted to fast-loading WebP in three sizes automatically. Square photos on a plain background look best.</p>
    </Card>
  );
}
