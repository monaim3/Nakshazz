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

  // The outline of the cut-out carries a thin halo of the (light) background. Along a black
  // stand that halo would read as "bright" and glue everything into one piece, so nothing
  // on the outline counts as product evidence.
  const inverse0 = new Uint8Array(n);
  for (let p = 0; p < n; p++) inverse0[p] = solid[p] ? 0 : 1;
  const edgeBand = dilate(inverse0, w, h, Math.max(4, Math.round(Math.max(w, h) / 200)));
  for (let p = 0; p < n; p++) if (edgeBand[p]) bright[p] = 0;

  // Dark jewellery (oxidised silver) on a black stand: brightness cannot tell them apart,
  // texture can. Jewellery is full of small details; a stand is smooth. Count a pixel as
  // product when it is well inside the cut-out (not on its outline) and the picture
  // changes sharply around it.
  const lum = (p) => rgba[p * 4] * 0.3 + rgba[p * 4 + 1] * 0.59 + rgba[p * 4 + 2] * 0.11;
  const textured = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!solid[p] || edgeBand[p]) continue;
      if (Math.abs(lum(p + 1) - lum(p - 1)) + Math.abs(lum(p + w) - lum(p - w)) > 38) textured[p] = 1;
    }
  }
  // only dense texture counts (single sparkles on a glossy stand do not)
  const D = 3;
  for (let y = D; y < h - D; y++) {
    for (let x = D; x < w - D; x++) {
      const p = y * w + x;
      if (!textured[p] || bright[p]) continue;
      let count = 0;
      for (let dy = -D; dy <= D; dy++) for (let dx = -D; dx <= D; dx++) count += textured[p + dy * w + dx];
      if (count >= 10) bright[p] = 1;
    }
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

  // A stud and the drop hanging under it are joined only by a thin dark link, so they come
  // out as separate groups. Join groups that sit one above the other (their widths overlap
  // and the gap is small); two earrings on a stand hang side by side and stay apart.
  const count = sizes.length;
  const box = Array.from({ length: count }, () => [w, h, -1, -1]); // x0, y0, x1, y1
  const leafy = new Int32Array(count); // yellow-green pixels: a leaf used as a photo prop
  for (let p = 0; p < n; p++) {
    const id = labels[p];
    if (!id || !bright[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    const b = box[id];
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
    const red = rgba[p * 4];
    if (rgba[p * 4 + 1] > red * 1.1 && red > rgba[p * 4 + 2] * 1.2) leafy[id]++;
  }
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const real = [];
  for (let id = 1; id < count; id++) if (sizes[id] > 12) real.push(id);
  const gapMax = Math.round(Math.max(w, h) / 22);
  for (let i = 0; i < real.length; i++) {
    for (let j = i + 1; j < real.length; j++) {
      const a = box[real[i]];
      const b = box[real[j]];
      const overlap = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const narrow = Math.min(a[2] - a[0], b[2] - b[0]) + 1;
      const gap = Math.max(a[1], b[1]) - Math.min(a[3], b[3]);
      if (overlap >= narrow * 0.5 && gap <= gapMax) parent[find(real[i])] = find(real[j]);
    }
  }
  const total = new Float64Array(count);
  const leaf = new Float64Array(count);
  for (let id = 1; id < count; id++) {
    total[find(id)] += sizes[id];
    leaf[find(id)] += leafy[id];
  }
  for (let p = 0; p < n; p++) if (labels[p]) labels[p] = find(labels[p]);

  const biggest = Math.max(...total);
  return Array.from(total, (size, id) => ({ id, size, prop: leaf[id] > size * 0.5 }))
    .filter((piece) => piece.id > 0 && piece.size > biggest * 0.15)
    .sort((a, b) => a.prop - b.prop || b.size - a.size) // jewellery first, leaves last
    .slice(0, 4)
    .map((piece) => {
      const own = new Uint8Array(n);
      for (let p = 0; p < n; p++) if (labels[p] === piece.id) own[p] = 1;
      // "closing" (grow, then shrink): fills the piece's own dark details (oxidised metal,
      // gaps between beads) without reaching out along the stand
      const R = Math.max(4, Math.round(Math.max(w, h) / 50));
      const grownPiece = dilate(own, w, h, R);
      const inverse = new Uint8Array(n);
      for (let p = 0; p < n; p++) inverse[p] = grownPiece[p] ? 0 : 1;
      const outside = dilate(inverse, w, h, R - 1);
      const keep = new Uint8Array(n);
      for (let p = 0; p < n; p++) if (!outside[p] && solid[p]) keep[p] = 1;
      return keep;
    });
}

/**
 * Plain split for necklaces and nose pins: every separate object in the cut-out is one
 * piece (the necklace, each earring lying next to it, a prop leaf...), largest first.
 * No stand logic, so a long thin chain stays whole.
 */
export function findObjects(mask, w, h) {
  const n = w * h;
  const solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (mask[p] >= 96) solid[p] = 1;
  // small bridge so a chain with faint gaps between beads is not broken up
  const grown = dilate(solid, w, h, Math.max(2, Math.round(Math.max(w, h) / 220)));
  const labels = new Int32Array(n);
  const sizes = [0];
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (!grown[start] || labels[start]) continue;
    const id = sizes.length;
    let size = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      size += solid[p];
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < n && grown[q] && !labels[q]) {
          labels[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  const biggest = Math.max(...sizes);
  return sizes
    .map((size, id) => ({ id, size }))
    .filter((piece) => piece.id > 0 && piece.size > biggest * 0.04)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((piece) => {
      const keep = new Uint8Array(n);
      for (let p = 0; p < n; p++) if (labels[p] === piece.id && solid[p]) keep[p] = 1;
      return keep;
    });
}

/** Sum of `src` over a (2r+1)² window around every pixel (two prefix-sum passes). */
function windowSum(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const row = new Float64Array(w + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x + 1] = row[x] + src[y * w + x];
    for (let x = 0; x < w; x++) tmp[y * w + x] = row[Math.min(w, x + r + 1)] - row[Math.max(0, x - r)];
  }
  const col = new Float64Array(h + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y + 1] = col[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) out[y * w + x] = col[Math.min(h, y + r + 1)] - col[Math.max(0, y - r)];
  }
  return out;
}

/**
 * Cleans the outline of a cut-out. The model's mask is made at 320 px and blown up, so its
 * edge is soft and carries a rim of background (the white "shadow" round the piece). Along
 * the outline every pixel is treated as a mix of the piece's colour and the background
 * colour next to it (both read from the neighbourhood):
 *   - how much of it is piece becomes its transparency (sharp edge, rim gone, holes in
 *     filigree open up)
 *   - the background's share is taken out of its colour (no light fringe on a dark face)
 * Where the background is busy (flowers, books) the mix cannot be read reliably and the
 * model's edge is kept. Works on a crop; returns new pixel and alpha arrays.
 */
export function refineEdges(rgba, alpha, mask, w, h) {
  const n = w * h;
  const side = Math.max(w, h);
  const R = Math.max(6, Math.round(side / 25));
  const D = Math.max(2, Math.round(side / 250));

  const background = new Uint8Array(n);
  for (let p = 0; p < n; p++) background[p] = mask[p] < 128 ? 1 : 0;
  const nearBackground = dilate(background, w, h, D);

  const bgW = new Float32Array(n);
  const fgW = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    if (mask[p] < 25) bgW[p] = 1;
    if (alpha[p] > 240 && !nearBackground[p]) fgW[p] = 1;
  }
  const weighted = (weights, channel) => {
    const out = new Float32Array(n);
    for (let p = 0; p < n; p++) out[p] = weights[p] ? (channel < 3 ? rgba[p * 4 + channel] : rgba[p * 4] ** 2 + rgba[p * 4 + 1] ** 2 + rgba[p * 4 + 2] ** 2) : 0;
    return windowSum(out, w, h, R);
  };
  const Wb = windowSum(bgW, w, h, R);
  const Wf = windowSum(fgW, w, h, R);
  const B = [0, 1, 2].map((c) => weighted(bgW, c));
  const Bsq = weighted(bgW, 3);
  const F = [0, 1, 2].map((c) => weighted(fgW, c));

  const outRgba = new Uint8ClampedArray(rgba);
  const outAlpha = new Uint8Array(alpha);
  for (let p = 0; p < n; p++) {
    if (!alpha[p] || !nearBackground[p] || Wb[p] < 4) continue;
    const b = [B[0][p] / Wb[p], B[1][p] / Wb[p], B[2][p] / Wb[p]];
    const spread = Math.sqrt(Math.max(0, Bsq[p] / Wb[p] - b[0] ** 2 - b[1] ** 2 - b[2] ** 2));
    if (spread > 32) continue; // busy background: keep the model's edge
    const i = [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]];
    let a = alpha[p] / 255;
    if (Wf[p] >= 4) {
      const d = [F[0][p] / Wf[p] - b[0], F[1][p] / Wf[p] - b[1], F[2][p] / Wf[p] - b[2]];
      const den = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
      // piece and background clearly different colours: read the mix from the colour
      if (den > 1600) a = Math.min(1, Math.max(0, ((i[0] - b[0]) * d[0] + (i[1] - b[1]) * d[1] + (i[2] - b[2]) * d[2]) / den));
    }
    if (a < 0.06) {
      outAlpha[p] = 0;
      continue;
    }
    outAlpha[p] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) outRgba[p * 4 + c] = b[c] + (i[c] - b[c]) / a;
  }
  return { rgba: outRgba, alpha: outAlpha };
}

/**
 * Removes leftovers stuck to the outside of the piece: bits of a black display stand, and
 * patches of backdrop the model kept because the stand closed them in (the light "shadow"
 * at the top of an earring). Starting from the outline it eats inward only through pixels
 * that look like stand (near-black grey) or like the backdrop right there (same colour,
 * smooth). White enamel or pearls inside the piece are walled off by metal and stay.
 * Returns new alpha and model-mask arrays (removed pixels count as background), or the
 * originals when it would remove a suspicious amount.
 */
export function cleanRim(rgba, alpha, mask, w, h, { stand = true } = {}) {
  const n = w * h;
  const side = Math.max(w, h);
  const lum = (p) => 0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2];

  // backdrop colour around each pixel (from what the model called background)
  const R = Math.max(8, Math.round(side / 12));
  const bgW = new Float32Array(n);
  for (let p = 0; p < n; p++) if (mask[p] < 25) bgW[p] = 1;
  const Wb = windowSum(bgW, w, h, R);
  const B = [0, 1, 2].map((c) => {
    const ch = new Float32Array(n);
    for (let p = 0; p < n; p++) if (bgW[p]) ch[p] = rgba[p * 4 + c];
    return windowSum(ch, w, h, R);
  });

  const smooth = (p) => {
    const x = p % w;
    if (x < 1 || x >= w - 1 || p < w || p >= n - w) return true;
    return Math.abs(lum(p + 1) - lum(p - 1)) + Math.abs(lum(p + w) - lum(p - w)) < 26;
  };
  const standLike = (p) => {
    if (!stand) return false;
    const r = rgba[p * 4];
    const g = rgba[p * 4 + 1];
    const b = rgba[p * 4 + 2];
    const mx = Math.max(r, g, b);
    return mx < 40 && mx - Math.min(r, g, b) < 18;
  };
  const backdropLike = (p) => {
    if (Wb[p] < 4) return false;
    const d = Math.hypot(rgba[p * 4] - B[0][p] / Wb[p], rgba[p * 4 + 1] - B[1][p] / Wb[p], rgba[p * 4 + 2] - B[2][p] / Wb[p]);
    return d < 28 && smooth(p);
  };

  const removed = new Uint8Array(n); // 1 = backdrop, 2 = stand
  const queue = [];
  const consider = (p) => {
    if (removed[p] || alpha[p] < 25) return;
    if (standLike(p)) removed[p] = 2;
    else if (backdropLike(p)) removed[p] = 1;
    else return;
    queue.push(p);
  };
  for (let p = 0; p < n; p++) {
    if (alpha[p] < 25) continue;
    const x = p % w;
    const onOutline = x === 0 || x === w - 1 || p < w || p >= n - w || alpha[p - 1] < 25 || alpha[p + 1] < 25 || alpha[p - w] < 25 || alpha[p + w] < 25;
    if (onOutline) consider(p);
  }
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    const x = p % w;
    if (x > 0) consider(p - 1);
    if (x < w - 1) consider(p + 1);
    if (p >= w) consider(p - w);
    if (p < n - w) consider(p + w);
  }

  let visible = 0;
  for (let p = 0; p < n; p++) if (alpha[p] >= 25) visible++;
  if (queue.length > visible * 0.3) return { alpha, mask }; // looks like the piece itself: leave it

  const outAlpha = new Uint8Array(alpha);
  const outMask = new Uint8Array(mask);
  for (let p = 0; p < n; p++) {
    if (!removed[p]) continue;
    outAlpha[p] = 0;
    // backdrop helps read the background colour later; the stand must not (it is black)
    outMask[p] = removed[p] === 1 ? 0 : 60;
  }
  return { alpha: outAlpha, mask: outMask };
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
