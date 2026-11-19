"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, ImageUp, RotateCcw, Wand2 } from "lucide-react";
import { alphaBounds, findPieces, foregroundMask } from "@/lib/cutout";
import { Button, Modal, Spinner } from "@/components/admin/ui";

const MAX_SIDE = 1100;

/**
 * One-click cut-out for the try-on photo: pick a normal product photo, the browser removes
 * the background, keeps ONE piece (the stand and the second earring go), and an eraser
 * cleans up leftovers. `onDone(file)` receives a transparent, tightly cropped PNG.
 * Mounted by the parent only while open, so it always starts fresh.
 */
export default function CutoutTool({ open, onClose, onDone, saving }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const state = useRef({ w: 0, h: 0, rgba: null, mask: null, pieces: [], erased: null });
  const [stage, setStage] = useState("pick"); // pick | working | edit
  const [error, setError] = useState("");
  const [pieceIndex, setPieceIndex] = useState(0); // -1 = whole cut-out
  const [pieceCount, setPieceCount] = useState(0);
  const [brush, setBrush] = useState(18);
  const painting = useRef(false);

  // final alpha for every pixel = model mask x chosen piece x not erased
  const alphaAt = useCallback(
    (index) => {
      const { mask, pieces, erased } = state.current;
      const piece = index >= 0 ? pieces[index] : null;
      const out = new Uint8Array(mask.length);
      for (let p = 0; p < out.length; p++) out[p] = erased[p] || (piece && !piece[p]) ? 0 : mask[p];
      return out;
    },
    [],
  );

  const render = useCallback(
    (index) => {
      const canvas = canvasRef.current;
      const { w, h, rgba } = state.current;
      if (!canvas || !rgba) return;
      const alpha = alphaAt(index);
      const image = new ImageData(new Uint8ClampedArray(rgba), w, h);
      for (let p = 0; p < alpha.length; p++) image.data[p * 4 + 3] = alpha[p];
      canvas.getContext("2d").putImageData(image, 0, 0);
    },
    [alphaAt],
  );

  useEffect(() => {
    if (stage === "edit") render(pieceIndex);
  }, [stage, pieceIndex, render]);

  async function start(file) {
    if (!file) return;
    setError("");
    setStage("working");
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * ratio);
      const h = Math.round(bitmap.height * ratio);
      const scratch = document.createElement("canvas");
      scratch.width = w;
      scratch.height = h;
      const ctx = scratch.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const mask = await foregroundMask(scratch);
      const pieces = findPieces(rgba, mask, w, h);
      state.current = { w, h, rgba, mask, pieces, erased: new Uint8Array(w * h) };
      const canvas = canvasRef.current;
      canvas.width = w;
      canvas.height = h;
      setPieceCount(pieces.length);
      setPieceIndex(pieces.length ? 0 : -1);
      setStage("edit");
    } catch {
      setError("Could not process this photo. Please try another one (JPG or PNG).");
      setStage("pick");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function erase(event) {
    const canvas = canvasRef.current;
    const box = canvas.getBoundingClientRect();
    const { w, h, erased } = state.current;
    const cx = Math.round(((event.clientX - box.left) / box.width) * w);
    const cy = Math.round(((event.clientY - box.top) / box.height) * h);
    const r = Math.round((brush / box.width) * w);
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) erased[y * w + x] = 1;
      }
    }
    render(pieceIndex);
  }

  function finish() {
    const { w, h, rgba } = state.current;
    const alpha = alphaAt(pieceIndex);
    const bounds = alphaBounds(alpha, w, h);
    if (!bounds) {
      setError("Nothing is left in the picture. Reset and try again.");
      return;
    }
    const full = document.createElement("canvas");
    full.width = w;
    full.height = h;
    const image = new ImageData(new Uint8ClampedArray(rgba), w, h);
    for (let p = 0; p < alpha.length; p++) image.data[p * 4 + 3] = alpha[p];
    full.getContext("2d").putImageData(image, 0, 0);
    const out = document.createElement("canvas");
    out.width = bounds.w;
    out.height = bounds.h;
    out.getContext("2d").drawImage(full, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    out.toBlob((blob) => blob && onDone(new File([blob], "tryon-cutout.png", { type: "image/png" })), "image/png");
  }

  return (
    <Modal open={open} onClose={onClose} title="Make try-on photo from a product photo" size="lg">
      <div className="space-y-4">
        {stage === "pick" && (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600 transition hover:border-gold-400 hover:bg-cream-100">
            <ImageUp className="size-8 text-ink-300" />
            <span className="font-medium text-ink-800">Choose a product photo</span>
            <span className="text-xs text-ink-400">Front view works best. The background, the stand and the second earring are removed automatically.</span>
          </button>
        )}

        {stage === "working" && (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-ink-500">
            <Spinner />
            Removing the background… (a few seconds; the first time also loads the tool)
          </div>
        )}

        <div className={stage === "edit" ? "space-y-4" : "hidden"}>
          <div className="flex max-h-[55vh] justify-center overflow-hidden rounded-xl bg-[conic-gradient(#e5e5e5_25%,#fff_0_50%,#e5e5e5_0_75%,#fff_0)] bg-[length:18px_18px] ring-1 ring-ink-100">
            <canvas
              ref={canvasRef}
              className="max-h-[55vh] max-w-full cursor-crosshair touch-none object-contain"
              onPointerDown={(event) => {
                painting.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                erase(event);
              }}
              onPointerMove={(event) => painting.current && erase(event)}
              onPointerUp={() => (painting.current = false)}
              onPointerCancel={() => (painting.current = false)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-500">Keep:</span>
            {Array.from({ length: pieceCount }, (_, i) => (
              <Button key={i} size="sm" variant={pieceIndex === i ? "primary" : "secondary"} onClick={() => setPieceIndex(i)}>
                Piece {i + 1}
              </Button>
            ))}
            <Button size="sm" variant={pieceIndex === -1 ? "primary" : "secondary"} onClick={() => setPieceIndex(-1)}>
              Everything
            </Button>
            <span className="ml-auto flex items-center gap-2 text-ink-500">
              <Eraser className="size-4" /> Eraser
              <input type="range" min="6" max="110" value={brush} onChange={(event) => setBrush(Number(event.target.value))} aria-label="Eraser size" className="w-24 accent-ink-800" />
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                state.current.erased.fill(0);
                render(pieceIndex);
              }}
              className="gap-1.5"
            >
              <RotateCcw className="size-4" /> Undo erasing
            </Button>
          </div>
          <p className="text-xs text-ink-400">Drag on the picture to erase leftovers (stand, hook holder, branch). For earrings keep ONE earring; the other ear is mirrored in the shop.</p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          {stage === "edit" && (
            <Button variant="secondary" onClick={() => setStage("pick")}>
              Choose another photo
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {stage === "edit" && (
            <Button onClick={finish} loading={saving} className="gap-1.5">
              <Wand2 className="size-4" /> Use this cut-out
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => start(event.target.files?.[0])} />
      </div>
    </Modal>
  );
}
