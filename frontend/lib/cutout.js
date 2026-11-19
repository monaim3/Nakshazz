/*
 * In-browser background removal for try-on photos (admin only).
 * Model: U²-Net "u2netp" (Apache-2.0), 4.6 MB, self-hosted in /public/tryon with the
 * ONNX Runtime Web 1.31.1 wasm build (/public/tryon/ort). Nothing is sent to any server.
 */

const ORT_BASE = "/tryon/ort/";
const MODEL_URL = "/tryon/u2netp.onnx";
const SIZE = 320; // model input
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise = null;

function loadSession() {
  if (!sessionPromise) {
    // loaded at runtime from /public (not bundled): the wasm loader must sit next to its .wasm
    sessionPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${ORT_BASE}ort.wasm.min.mjs`).then(async (ort) => {
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
      return { ort, session };
    });
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

/**
 * Runs the model on a canvas and returns its foreground mask as Uint8Array (0-255),
 * one value per canvas pixel.
 */
export async function foregroundMask(canvas) {
  const { ort, session } = await loadSession();
  const { width, height } = canvas;

  const small = document.createElement("canvas");
  small.width = SIZE;
  small.height = SIZE;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;

  let max = 1;
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
  const input = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    for (let c = 0; c < 3; c++) input[c * SIZE * SIZE + p] = (px[i + c] / max - MEAN[c]) / STD[c];
  }

  const result = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
  const pred = result[session.outputNames[0]].data;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of pred) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }

  // mask -> canvas -> smooth upscale to the photo size
  const maskSmall = sctx.createImageData(SIZE, SIZE);
  for (let p = 0; p < SIZE * SIZE; p++) {
    const v = Math.round(((pred[p] - lo) / (hi - lo || 1)) * 255);
    maskSmall.data.set([v, v, v, 255], p * 4);
  }
  sctx.putImageData(maskSmall, 0, 0);
  const big = document.createElement("canvas");
  big.width = width;
  big.height = height;
  const bctx = big.getContext("2d", { willReadFrequently: true });
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, width, height);
  const up = bctx.getImageData(0, 0, width, height).data;

  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p++) {
    // contrast curve: crisp edge instead of a wide soft halo
    const t = Math.min(1, Math.max(0, (up[p * 4] / 255 - 0.3) / 0.4));
    mask[p] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return mask;
}

/** Square dilation of a 0/1 mask by `r` pixels (two separable passes). */
function dilate(src, w, h, r) {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    let run = -1;
    for (let x = 0; x < w; x++) {
      if (src[y * w + x]) run = x + r;
      if (x <= run) tmp[y * w + x] = 1;
    }
    run = w + r;
    for (let x = w - 1; x >= 0; x--) {
      if (src[y * w + x]) run = x - r;
      if (x >= run) tmp[y * w + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = -1;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) run = y + r;
      if (y <= run) out[y * w + x] = 1;
    }
    run = h + r;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) run = y - r;
      if (y >= run) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * Splits the cut-out into separate pieces, ignoring dark, colourless parts (a black display
 * stand usually joins two earrings into one blob). Returns up to 4 pieces, largest first,
 * each as a 0/1 mask that also keeps the piece's own dark details (oxidised metal).
 */
export function findPieces(rgba, mask, w, h) {
  const n = w * h;
  const bright = new Uint8Array(n); // clearly "product": bright, or colourful and not too dark
  const solid = new Uint8Array(n); // anything the model kept
  for (let p = 0; p < n; p++) {
    if (mask[p] < 96) continue;
    const r = rgba[p * 4];
    const g = rgba[p * 4 + 1];
    const b = rgba[p * 4 + 2];
    const mx = Math.max(r, g, b);
    const sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
    solid[p] = 1;
    // saturation is meaningless on near-black pixels (a black stand often reads as "blue")
    if (mx > 95 || (sat > 0.35 && mx > 60)) bright[p] = 1;
  }

  // label connected groups of bright pixels (slightly dilated so filigree stays together)
  const r = Math.max(2, Math.round(Math.max(w, h) / 250));
  const grown = dilate(bright, w, h, r);
  const labels = new Int32Array(n);
  const sizes = [0];
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (!grown[start] || labels[start]) continue;
    const id = sizes.length;
    const visit = (q) => {
      if (grown[q] && !labels[q]) {
        labels[q] = id;
        stack.push(q);
      }
    };
    let size = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      size += bright[p];
      const x = p % w;
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (p >= w) visit(p - w);
      if (p < n - w) visit(p + w);
    }
    sizes.push(size);
  }

  const biggest = Math.max(...sizes);
  return sizes
    .map((size, id) => ({ id, size }))
    .filter((piece) => piece.id > 0 && piece.size > biggest * 0.15)
    .sort((a, b) => b.size - a.size)
    .slice(0, 4)
    .map((piece) => {
      const own = new Uint8Array(n);
      for (let p = 0; p < n; p++) if (labels[p] === piece.id) own[p] = 1;
      // "closing" (grow, then shrink): fills the piece's own dark details (oxidised metal,
      // gaps between beads) without reaching out along the stand
      const R = Math.max(4, Math.round(Math.max(w, h) / 70));
      const grownPiece = dilate(own, w, h, R);
      const inverse = new Uint8Array(n);
      for (let p = 0; p < n; p++) inverse[p] = grownPiece[p] ? 0 : 1;
      const outside = dilate(inverse, w, h, R - 1);
      const keep = new Uint8Array(n);
      for (let p = 0; p < n; p++) if (!outside[p] && solid[p]) keep[p] = 1;
      return keep;
    });
}

/** Bounding box of visible pixels (alpha > 24) or null when empty. */
export function alphaBounds(alpha, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
