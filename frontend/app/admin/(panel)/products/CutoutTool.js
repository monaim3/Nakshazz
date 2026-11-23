"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Eraser, ImageUp, RotateCcw, Sparkles, Undo2, Wand2 } from "lucide-react";
import { alphaBounds, cleanRim, findObjects, findPieces, foregroundMask, refineEdges, similarRegion } from "@/lib/cutout";
import { Button, Modal, Spinner } from "@/components/admin/ui";

const MAX_SIDE = 2000; // product photos are stored at 1600px: keep every pixel of them

/**
 * One-click cut-out for the try-on photo: pick a normal product photo, the browser removes
 * the background, keeps ONE piece (the stand and the second earring go), and an eraser
 * cleans up leftovers. `onDone(file)` receives a transparent, tightly cropped PNG.
 * Mounted by the parent only while open, so it always starts fresh.
 */
export default function CutoutTool({ open, onClose, onDone, saving, images = [], type = "earring" }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const state = useRef({ w: 0, h: 0, rgba: null, mask: null, pieces: [], erased: null });
  const [stage, setStage] = useState("pick"); // pick | working | edit
  const [error, setError] = useState("");
  const [pieceIndex, setPieceIndex] = useState(0); // -1 = whole cut-out
  const [pieceCount, setPieceCount] = useState(0);
  const [brush, setBrush] = useState(18);
  const painting = useRef(false);
  const [tool, setTool] = useState("magic"); // magic | erase | area
  const history = useRef([]); // erased-mask snapshots for Undo
  const [canUndo, setCanUndo] = useState(false);
  const [box, setBox] = useState(null); // keep-area rectangle while dragging, in % of the canvas
  const boxStart = useRef(null);

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

  /**
   * The finished cut-out of a piece: the piece plus a margin (where the background is read),
   * stand bits and trapped backdrop removed, outline cleaned. Null when nothing is left.
   */
  const cleanCut = useCallback(
    (index) => {
      const { w, h, rgba, mask } = state.current;
      const alpha = alphaAt(index);
      const bounds = alphaBounds(alpha, w, h);
      if (!bounds) return null;
      const pad = Math.round(Math.max(w, h) / 20);
      const x0 = Math.max(0, bounds.x - pad);
      const y0 = Math.max(0, bounds.y - pad);
      const cw = Math.min(w, bounds.x + bounds.w + pad) - x0;
      const ch = Math.min(h, bounds.y + bounds.h + pad) - y0;
      const cropRgba = new Uint8ClampedArray(cw * ch * 4);
      const cropAlpha = new Uint8Array(cw * ch);
      const cropMask = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++) {
        const from = (y0 + y) * w + x0;
        cropRgba.set(rgba.subarray(from * 4, (from + cw) * 4), y * cw * 4);
        cropAlpha.set(alpha.subarray(from, from + cw), y * cw);
        cropMask.set(mask.subarray(from, from + cw), y * cw);
      }
      // 1) backdrop trapped against the outside, 2) clean, sharp outline
      const rim = cleanRim(cropRgba, cropAlpha, cropMask, cw, ch);
      const clean = refineEdges(cropRgba, rim.alpha, rim.mask, cw, ch);
      const image = new ImageData(clean.rgba, cw, ch);
      for (let p = 0; p < clean.alpha.length; p++) image.data[p * 4 + 3] = clean.alpha[p];
      return { x0, y0, cw, ch, image, alpha: clean.alpha };
    },
    [alphaAt],
  );

  const refineTimer = useRef(0);
  useEffect(() => () => clearTimeout(refineTimer.current), []);

  const render = useCallback(
    (index) => {
      const canvas = canvasRef.current;
      const { w, h, rgba } = state.current;
      if (!canvas || !rgba) return;
      // quick draw right away (smooth erasing), the cleaned result a moment after the last change
      const alpha = alphaAt(index);
      const image = new ImageData(new Uint8ClampedArray(rgba), w, h);
      for (let p = 0; p < alpha.length; p++) image.data[p * 4 + 3] = alpha[p];
      const ctx = canvas.getContext("2d");
      ctx.putImageData(image, 0, 0);
      clearTimeout(refineTimer.current);
      refineTimer.current = setTimeout(() => {
        const cut = cleanCut(index);
        ctx.clearRect(0, 0, w, h);
        if (cut) ctx.putImageData(cut.image, cut.x0, cut.y0);
      }, 250);
    },
    [alphaAt, cleanCut],
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
      // earrings: one earring off its stand; anything else: each separate object
      const pieces = type === "earring" ? findPieces(rgba, mask, w, h) : findObjects(mask, w, h);
      state.current = { w, h, rgba, mask, pieces, erased: new Uint8Array(w * h) };
      history.current = [];
      setCanUndo(false);
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

  /** Uses a photo the product already has (loaded through /media so the canvas may read it). */
  async function startFromProduct(image) {
    setError("");
    setStage("working");
    try {
      const response = await fetch(image.urls.lg.replace(/^.*?\/storage\//, "/media/"));
      if (!response.ok) throw new Error("load failed");
      await start(await response.blob());
    } catch {
      setError("Could not load this photo. Please try again.");
      setStage("pick");
    }
  }

  /** Remember the current state so the next change can be undone. */
  function snapshot() {
    history.current.push(state.current.erased.slice());
    if (history.current.length > 15) history.current.shift();
    setCanUndo(true);
  }

  function undo() {
    const last = history.current.pop();
    if (!last) return;
    state.current.erased = last;
    setCanUndo(history.current.length > 0);
    render(pieceIndex);
  }

  /** Magic eraser: one click removes the connected patch of that colour (a stand arm, backdrop). */
  function magicErase(event) {
    const canvas = canvasRef.current;
    const box = canvas.getBoundingClientRect();
    const { w, h, rgba, erased } = state.current;
    const x = Math.min(w - 1, Math.max(0, Math.round(((event.clientX - box.left) / box.width) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.round(((event.clientY - box.top) / box.height) * h)));
    const region = similarRegion(rgba, alphaAt(pieceIndex), w, h, y * w + x);
    if (!region.length) return;
    snapshot();
    // the patch plus one pixel round it (its soft edge)
    for (const p of region) {
      const px = p % w;
      for (const q of [p, p - w, p + w, px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1]) if (q >= 0 && q < erased.length) erased[q] = 1;
    }
    render(pieceIndex);
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

  const pointAt = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  };

  /** Keep only what is inside the dragged rectangle. */
  function keepArea(a, b) {
    const { w, h, erased } = state.current;
    const x0 = Math.round(Math.min(a.x, b.x) * w);
    const x1 = Math.round(Math.max(a.x, b.x) * w);
    const y0 = Math.round(Math.min(a.y, b.y) * h);
    const y1 = Math.round(Math.max(a.y, b.y) * h);
    if (x1 - x0 < 8 || y1 - y0 < 8) return; // a click, not a drag
    snapshot();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (x < x0 || x > x1 || y < y0 || y > y1) erased[y * w + x] = 1;
    }
    setPieceIndex(-1); // the box is the selection now
    render(-1);
  }

  function finish() {
    const cut = cleanCut(pieceIndex);
    const tight = cut && alphaBounds(cut.alpha, cut.cw, cut.ch);
    if (!tight) {
      setError("Nothing is left in the picture. Reset and try again.");
      return;
    }
    const full = document.createElement("canvas");
    full.width = cut.cw;
    full.height = cut.ch;
    full.getContext("2d").putImageData(cut.image, 0, 0);
    const out = document.createElement("canvas");
    out.width = tight.w;
    out.height = tight.h;
    out.getContext("2d").drawImage(full, tight.x, tight.y, tight.w, tight.h, 0, 0, tight.w, tight.h);
    out.toBlob((blob) => blob && onDone(new File([blob], "tryon-cutout.png", { type: "image/png" })), "image/png");
  }

  return (
    <Modal open={open} onClose={onClose} title="Make try-on photo from a product photo" size="lg">
      <div className="space-y-4">
        {stage === "pick" && images.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">Pick one of this product&apos;s photos. Front view works best — the background, the stand and the second earring are removed automatically.</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((image) => (
                <button key={image.id} type="button" onClick={() => startFromProduct(image)} className="overflow-hidden rounded-xl ring-1 ring-ink-100 transition hover:ring-2 hover:ring-gold-500">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin preview from API host */}
                  <img src={image.urls.md} alt={image.alt || ""} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-ink-400 underline underline-offset-2 hover:text-ink-700">
              Use a different photo from this computer
            </button>
          </div>
        )}

        {stage === "pick" && images.length === 0 && (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600 transition hover:border-gold-400 hover:bg-cream-100">
            <ImageUp className="size-8 text-ink-300" />
            <span className="font-medium text-ink-800">This product has no photos yet — choose one from this computer</span>
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
            <div className="relative">
            <canvas
              ref={canvasRef}
              className="max-h-[55vh] max-w-full cursor-crosshair touch-none object-contain"
              onPointerDown={(event) => {
                painting.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                if (tool === "magic") {
                  painting.current = false;
                  magicErase(event);
                } else if (tool === "erase") {
                  snapshot();
                  erase(event);
                } else boxStart.current = pointAt(event);
              }}
              onPointerMove={(event) => {
                if (!painting.current) return;
                if (tool === "erase") erase(event);
                else setBox({ a: boxStart.current, b: pointAt(event) });
              }}
              onPointerUp={(event) => {
                if (painting.current && tool === "area" && boxStart.current) keepArea(boxStart.current, pointAt(event));
                painting.current = false;
                boxStart.current = null;
                setBox(null);
              }}
              onPointerCancel={() => {
                painting.current = false;
                setBox(null);
              }}
            />
            {box && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-gold-600 bg-gold-300/15"
                style={{ left: `${Math.min(box.a.x, box.b.x) * 100}%`, top: `${Math.min(box.a.y, box.b.y) * 100}%`, width: `${Math.abs(box.b.x - box.a.x) * 100}%`, height: `${Math.abs(box.b.y - box.a.y) * 100}%` }}
              />
            )}
            </div>
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
              <Button size="sm" variant={tool === "magic" ? "primary" : "secondary"} onClick={() => setTool("magic")} className="gap-1.5">
                <Sparkles className="size-4" /> Magic eraser
              </Button>
              <Button size="sm" variant={tool === "area" ? "primary" : "secondary"} onClick={() => setTool("area")} className="gap-1.5">
                <Crop className="size-4" /> Keep area
              </Button>
              <Button size="sm" variant={tool === "erase" ? "primary" : "secondary"} onClick={() => setTool("erase")} className="gap-1.5">
                <Eraser className="size-4" /> Eraser
              </Button>
              {tool === "erase" && <input type="range" min="6" max="110" value={brush} onChange={(event) => setBrush(Number(event.target.value))} aria-label="Eraser size" className="w-24 accent-ink-800" />}
            </span>
            <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo} className="gap-1.5">
              <Undo2 className="size-4" /> Undo
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                snapshot();
                state.current.erased.fill(0);
                render(pieceIndex);
              }}
              className="gap-1.5"
            >
              <RotateCcw className="size-4" /> Reset
            </Button>
          </div>
          <p className="text-xs text-ink-400">
            {type === "earring" ? "Keep ONE earring only (the other ear is mirrored in the shop)." : "Each Piece is one separate object in the photo. Keep the piece that is the product itself."} <strong>Magic eraser</strong>: click a leftover (a bit of the stand, a patch of background) to remove it in one go. <strong>Keep area</strong>: drag a box around what you want. <strong>Eraser</strong>: rub out anything else.
          </p>
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
