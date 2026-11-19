"use client";

import { useRef, useState } from "react";
import { Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { useDeleteTryOnImageMutation, useUpdateProductMutation, useUploadTryOnImageMutation } from "@/store/admin/catalogApi";
import { Button, Card, Input, Select, Spinner, useToast } from "@/components/admin/ui";
import CutoutTool from "./CutoutTool";

const TYPES = [
  { value: "", label: "Off — no try-on for this product" },
  { value: "earring", label: "Earring — hangs from both earlobes" },
  { value: "necklace", label: "Necklace — sits at the base of the neck" },
  { value: "nose", label: "Nose pin — sits on the nostril" },
];

const SIZE_HELP = {
  earring: { label: "Drop length (mm)", hint: "From the hook top to the lowest point of ONE earring. Typical: 30–80 mm.", fallback: 45 },
  necklace: { label: "Width across (mm)", hint: "Widest point of the necklace as it hangs. Typical: 120–180 mm.", fallback: 150 },
  nose: { label: "Width (mm)", hint: "Width of the stud or ring as seen from the front. Typical: 5–12 mm.", fallback: 8 },
};

const PHOTO_HELP = {
  earring: "ONE earring, straight from the front, hook at the top, background removed. The Make from a photo button cuts it out automatically. The other ear is mirrored in the shop.",
  necklace: "The whole necklace from the front, the chain ends at the top corners, background removed. The Make from a photo button does it automatically; keep the piece that is the necklace.",
  nose: "The nose pin from the front, background removed. The Make from a photo button does it automatically.",
};

/** Admin card: virtual try-on type, real size and the transparent photo used on the face. */
export default function TryOnManager({ product }) {
  const inputRef = useRef(null);
  const { notify } = useToast();
  const [type, setType] = useState(product.tryon?.type || "");
  const [size, setSize] = useState(product.tryon?.size_mm ? String(product.tryon.size_mm) : "");
  const [updateProduct, updateState] = useUpdateProductMutation();
  const [upload, uploadState] = useUploadTryOnImageMutation();
  const [remove, removeState] = useDeleteTryOnImageMutation();
  const help = SIZE_HELP[type];
  const [cutoutOpen, setCutoutOpen] = useState(false);

  async function save() {
    try {
      // slug is sent unchanged so saving never alters the product's web address
      await updateProduct({ id: product.id, slug: product.slug, tryon_type: type || null, tryon_size_mm: type && size ? Number(size) : null }).unwrap();
      notify(type ? "Try-on settings saved." : "Try-on turned off.");
    } catch (error) {
      notify(error.errors ? Object.values(error.errors)[0][0] : error.message, "error");
    }
  }

  async function onFile(file) {
    if (!file) return false;
    if (!["image/png", "image/webp"].includes(file.type)) {
      notify("Use a PNG or WebP with a transparent background.", "error");
      return false;
    }
    const formData = new FormData();
    formData.append("image", file);
    try {
      await upload({ productId: product.id, formData }).unwrap();
      notify("Try-on photo saved.");
      return true;
    } catch (error) {
      notify(error.errors ? Object.values(error.errors)[0][0] : error.message, "error");
      return false;
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const imageUrl = product.tryon?.image_url;
  const ready = Boolean(product.tryon?.type && imageUrl);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-gold-600" /> Virtual try-on
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ready ? "bg-emerald-50 text-emerald-700" : "bg-ink-50 text-ink-500"}`}>{ready ? "Live in shop" : "Not active"}</span>
        </span>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          <Select label="Where does it go?" value={type} onChange={(event) => setType(event.target.value)} options={TYPES} />
          {help && <Input label={help.label} type="number" min="2" max="600" inputMode="numeric" placeholder={String(help.fallback)} value={size} onChange={(event) => setSize(event.target.value)} hint={`${help.hint} Empty = ${help.fallback} mm.`} />}
          <Button onClick={save} loading={updateState.isLoading} variant="secondary">
            Save try-on settings
          </Button>
          {type && <p className="rounded-lg bg-cream-100 p-3 text-xs leading-relaxed text-ink-600">{PHOTO_HELP[type]}</p>}
        </div>

        <div>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-[conic-gradient(#eee_25%,#fff_0_50%,#eee_0_75%,#fff_0)] bg-[length:16px_16px] ring-1 ring-ink-100">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview from API host
              <img src={imageUrl} alt="Try-on photo" className="max-h-full max-w-full object-contain p-2" />
            ) : uploadState.isLoading ? (
              <Spinner />
            ) : (
              <span className="px-4 text-center text-xs text-ink-400">Transparent photo appears here</span>
            )}
          </div>
          <Button size="sm" onClick={() => setCutoutOpen(true)} className="mt-2 w-full gap-1.5">
            <Wand2 className="size-4" /> Make from a photo
          </Button>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()} loading={uploadState.isLoading} className="flex-1 gap-1.5">
              <Upload className="size-4" /> {imageUrl ? "Replace PNG" : "Upload PNG"}
            </Button>
            {imageUrl && (
              <Button size="sm" variant="ghost" onClick={() => remove({ productId: product.id }).unwrap().then(() => notify("Try-on photo removed."))} loading={removeState.isLoading} aria-label="Remove try-on photo">
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/png,image/webp" hidden onChange={(event) => onFile(event.target.files?.[0])} />
          {cutoutOpen && <CutoutTool open type={type || "earring"} images={product.images || []} onClose={() => setCutoutOpen(false)} saving={uploadState.isLoading} onDone={async (file) => (await onFile(file)) && setCutoutOpen(false)} />}
        </div>
      </div>
    </Card>
  );
}
