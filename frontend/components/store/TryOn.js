"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Download, ImageUp, Loader2, RotateCcw, Sparkles, X } from "lucide-react";

/*
 * Virtual try-on. Google MediaPipe Face Landmarker finds 478 face points on the device
 * (the photo never leaves the phone), then the product's transparent photo is drawn:
 *   earring  -> hanging from both earlobes (mirrored for the other ear), kept vertical like
 *               real earrings; the far ear's earring is hidden when the head turns
 *   necklace -> centred below the chin at the base of the neck, tilting with the head
 *   nose     -> on the left or right nostril
 * Size is true to life: the piece's real size in mm against an average face width.
 */

const ASSETS = "/tryon"; // self-hosted wasm + model (public/tryon)
const FACE_WIDTH_MM = 140; // average width between the face points beside the ears (234 <-> 454)

// MediaPipe face-mesh landmark indices
const P = {
  forehead: 10,
  chin: 152,
  noseTip: 1,
  rightFaceEdge: 234, // subject's right (image left), at ear height
  leftFaceEdge: 454,
  rightJawUpper: 93,
  rightJawLower: 132,
  leftJawUpper: 323,
  leftJawLower: 361,
  rightEyeOuter: 33,
  leftEyeOuter: 263,
  rightNostril: 129,
  leftNostril: 358,
};

let landmarkerPromise = null;

/** Loads the face model once per page (lazy: only when the try-on opens). */
function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = import("@mediapipe/tasks-vision").then(async ({ FaceLandmarker, FilesetResolver }) => {
      const files = await FilesetResolver.forVisionTasks(ASSETS);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: `${ASSETS}/face_landmarker.task`, delegate },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFacialTransformationMatrixes: false,
      });
      try {
        return await FaceLandmarker.createFromOptions(files, options("GPU"));
      } catch {
        return FaceLandmarker.createFromOptions(files, options("CPU"));
      }
    });
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Turns normalized landmarks into pixel-space anchors for the piece.
 * `mirror` flips x (selfie camera shown like a mirror).
 */
function computePlacement(landmarks, width, height, mirror) {
  const pt = (index) => {
    const l = landmarks[index];
    return { x: (mirror ? 1 - l.x : l.x) * width, y: l.y * height, z: l.z * width };
  };
  const right = pt(P.rightFaceEdge);
  const left = pt(P.leftFaceEdge);
  const faceWidth = Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
  const mmToPx = faceWidth / FACE_WIDTH_MM;

  const eyeR = pt(P.rightEyeOuter);
  const eyeL = pt(P.leftEyeOuter);
  // head tilt: angle of the line through both eyes, measured left-to-right on screen
  const [eyeA, eyeB] = eyeR.x < eyeL.x ? [eyeR, eyeL] : [eyeL, eyeR];
  const roll = Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x);

  const forehead = pt(P.forehead);
  const chin = pt(P.chin);
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);
  const down = { x: (chin.x - forehead.x) / faceHeight, y: (chin.y - forehead.y) / faceHeight };

  // yaw: how far the nose sits from the centre between the face edges (-1..1)
  const nose = pt(P.noseTip);
  const mid = lerp(right, left, 0.5);
  const yaw = (nose.x - mid.x) / (Math.abs(left.x - right.x) / 2 || 1);

  // earlobes: lower on the jaw line than the face edge, pushed outward beyond the cheek
  const lobe = (upper, lower, edge, outwardSign) => {
    const base = lerp(pt(upper), pt(lower), 0.25);
    const dirX = edge.x - mid.x;
    const sign = Math.sign(dirX) || outwardSign;
    return { x: base.x + sign * faceWidth * 0.06, y: base.y };
  };

  return {
    mmToPx,
    roll,
    yaw,
    faceHeight,
    down,
    chin,
    lobes: {
      right: { ...lobe(P.rightJawUpper, P.rightJawLower, right, -1), hidden: yaw < -0.42, side: right.x < mid.x ? "screenLeft" : "screenRight" },
      left: { ...lobe(P.leftJawUpper, P.leftJawLower, left, 1), hidden: yaw > 0.42, side: left.x < mid.x ? "screenLeft" : "screenRight" },
    },
    nostrils: { right: pt(P.rightNostril), left: pt(P.leftNostril) },
  };
}

/** Draws the product on the canvas (already showing the face). */
function drawPiece(ctx, piece, img, place, { scale, offset, noseSide }) {
  const aspect = img.naturalWidth / img.naturalHeight;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.max(4, place.mmToPx * 1.2);
  ctx.shadowOffsetY = Math.max(2, place.mmToPx * 0.6);

  if (piece.type === "earring") {
    const h = piece.size_mm * place.mmToPx * scale;
    const w = h * aspect;
    for (const lobe of [place.lobes.right, place.lobes.left]) {
      if (lobe.hidden) continue;
      ctx.save();
      // the hook / stud top sits just above the lobe point (where it pierces the ear)
      ctx.translate(lobe.x, lobe.y + (offset - 0.06) * h);
      ctx.rotate(place.roll * 0.15); // earrings hang with gravity, follow the head only slightly
      if (lobe.side === "screenLeft") ctx.scale(-1, 1); // mirror the single earring for the other ear
      ctx.drawImage(img, -w / 2, 0, w, h);
      ctx.restore();
    }
  } else if (piece.type === "necklace") {
    const w = piece.size_mm * place.mmToPx * scale;
    const h = w / aspect;
    // top of the necklace a little below the chin, along the face's own "down" direction
    const drop = place.faceHeight * (0.16 + offset);
    ctx.translate(place.chin.x + place.down.x * drop, place.chin.y + place.down.y * drop);
    ctx.rotate(place.roll);
    ctx.drawImage(img, -w / 2, 0, w, h);
  } else if (piece.type === "nose") {
    const w = piece.size_mm * place.mmToPx * scale;
    const h = w / aspect;
    const at = place.nostrils[noseSide];
    ctx.translate(at.x, at.y + offset * h * 2);
    ctx.rotate(place.roll);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

export default function TryOn({ product, t, onClose }) {
  const piece = product.tryon;
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const photoRef = useRef(null);
  const placeRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const settingsRef = useRef({ scale: 1, offset: 0, noseSide: "left" });

  const [mode, setMode] = useState("choose"); // choose | loading | camera | photo
  const [error, setError] = useState("");
  const [noFace, setNoFace] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState(0);
  const [noseSide, setNoseSide] = useState("left");

  useEffect(() => {
    settingsRef.current = { scale, offset, noseSide };
  }, [scale, offset, noseSide]);

  // product photo (same-origin via /media so the canvas can be saved)
  useEffect(() => {
    const img = new Image();
    img.src = `/media/${piece.image_path}`;
    img.decode().then(() => (imgRef.current = img)).catch(() => setError(t.errorPiece));
  }, [piece.image_path, t.errorPiece]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // redraw a still photo when the user adjusts size / position / side
  const redrawPhoto = useCallback(() => {
    const canvas = canvasRef.current;
    const photo = photoRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    if (placeRef.current && imgRef.current) drawPiece(ctx, piece, imgRef.current, placeRef.current, settingsRef.current);
  }, [piece]);

  useEffect(() => {
    if (mode === "photo") redrawPhoto();
  }, [mode, scale, offset, noseSide, redrawPhoto]);

  async function startWithPhoto(file) {
    if (!file) return;
    stopCamera();
    setError("");
    setNoFace(false);
    setMode("loading");
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      // keep phone photos to a sensible size for speed
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = canvasRef.current;
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      scratch.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      photoRef.current = scratch;

      const landmarker = await loadLandmarker();
      await landmarker.setOptions({ runningMode: "IMAGE" });
      const result = landmarker.detect(scratch);
      placeRef.current = result.faceLandmarks?.[0] ? computePlacement(result.faceLandmarks[0], canvas.width, canvas.height, false) : null;
      setNoFace(!placeRef.current);
      setMode("photo");
    } catch {
      setError(t.errorLoad);
      setMode("choose");
    }
  }

  async function startCamera() {
    setError("");
    setNoFace(false);
    setMode("loading");
    try {
      const [stream, landmarker] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }),
        loadLandmarker(),
      ]);
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      await landmarker.setOptions({ runningMode: "VIDEO" });
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      setMode("camera");

      let smooth = null;
      const loop = () => {
        if (!streamRef.current) return;
        // mirrored like a real mirror
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        const result = landmarker.detectForVideo(video, performance.now());
        const face = result.faceLandmarks?.[0];
        if (face) {
          const next = computePlacement(face, canvas.width, canvas.height, true);
          // light smoothing so the piece does not jitter
          smooth = smooth ? blend(smooth, next, 0.45) : next;
          placeRef.current = smooth;
          if (imgRef.current) drawPiece(ctx, piece, imgRef.current, smooth, settingsRef.current);
        }
        setNoFace((current) => (current !== !face ? !face : current));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (reason) {
      stopCamera();
      setError(reason?.name === "NotAllowedError" ? t.errorCameraDenied : t.errorCamera);
      setMode("choose");
    }
  }

  function capture() {
    // freeze the current camera frame (with the piece) as a photo the user can adjust & save
    const canvas = canvasRef.current;
    const scratch = document.createElement("canvas");
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const ctx = scratch.getContext("2d");
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    photoRef.current = scratch;
    stopCamera();
    setMode("photo");
  }

  function download() {
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nakshazz-${product.slug}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  const showStage = mode === "camera" || mode === "photo" || mode === "loading";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-navy-950 text-white" role="dialog" aria-modal="true" aria-label={t.title}>
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <p className="flex items-center gap-2 font-display text-xl">
          <Sparkles className="size-5 text-gold-light" /> {t.title}
          <span className="hidden text-sm text-white/50 sm:inline">· {product.name}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          aria-label={t.close}
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        <video ref={videoRef} playsInline muted className="hidden" />
        <canvas ref={canvasRef} className={`max-h-full max-w-full rounded-2xl object-contain ${showStage ? "" : "hidden"}`} />

        {mode === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
            <Loader2 className="size-8 animate-spin text-gold-light" />
            <p className="text-sm">{t.loading}</p>
          </div>
        )}

        {mode === "choose" && (
          <div className="mx-auto max-w-md text-center">
            <p className="font-display text-3xl">{t.headline}</p>
            <p className="mt-2 text-sm text-white/65">{t[`tip_${piece.type}`]}</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={startCamera} className="flex h-14 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] font-semibold text-navy-950 transition hover:-translate-y-0.5">
                <Camera className="size-5" /> {t.useCamera}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-14 items-center justify-center gap-2 rounded-full border border-white/25 font-medium transition hover:bg-white/10">
                <ImageUp className="size-5" /> {t.uploadPhoto}
              </button>
            </div>
            <p className="mt-6 text-xs text-white/45">🔒 {t.privacy}</p>
            {error && <p className="mt-4 rounded-xl bg-lotus-500/20 p-3 text-sm text-lotus-100">{error}</p>}
          </div>
        )}

        {noFace && (mode === "photo" || mode === "camera") && <p className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-lotus-500 px-4 py-2 text-sm">{t.noFace}</p>}
      </div>

      {(mode === "camera" || mode === "photo") && (
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="mx-auto grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/70">
              {t.size} {Math.round(scale * 100)}%
              <input type="range" min="0.7" max="1.4" step="0.02" value={scale} onChange={(event) => setScale(Number(event.target.value))} className="mt-1 w-full accent-[var(--color-gold-light)]" />
            </label>
            <label className="text-xs text-white/70">
              {t.position}
              <input type="range" min="-0.15" max="0.15" step="0.01" value={offset} onChange={(event) => setOffset(Number(event.target.value))} className="mt-1 w-full accent-[var(--color-gold-light)]" />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {piece.type === "nose" &&
              ["left", "right"].map((side) => (
                <button key={side} type="button" onClick={() => setNoseSide(side)} className={`h-11 rounded-full px-5 text-sm transition ${noseSide === side ? "bg-white text-navy-950" : "border border-white/25"}`}>
                  {t[side]}
                </button>
              ))}
            {mode === "camera" ? (
              <button type="button" onClick={capture} className="flex h-11 items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] px-6 text-sm font-semibold text-navy-950">
                <Camera className="size-4" /> {t.capture}
              </button>
            ) : (
              <>
                <button type="button" onClick={download} disabled={noFace} className="flex h-11 items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] px-6 text-sm font-semibold text-navy-950 disabled:opacity-40">
                  <Download className="size-4" /> {t.save}
                </button>
                <button type="button" onClick={() => setMode("choose")} className="flex h-11 items-center gap-2 rounded-full border border-white/25 px-5 text-sm">
                  <RotateCcw className="size-4" /> {t.again}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => startWithPhoto(event.target.files?.[0])} />
    </div>
  );
}

/** Weighted blend of two placements (camera smoothing). */
function blend(a, b, k) {
  const mix = (x, y) => x + (y - x) * k;
  const mixPt = (p, q) => ({ ...q, x: mix(p.x, q.x), y: mix(p.y, q.y) });
  return {
    ...b,
    mmToPx: mix(a.mmToPx, b.mmToPx),
    roll: mix(a.roll, b.roll),
    faceHeight: mix(a.faceHeight, b.faceHeight),
    chin: mixPt(a.chin, b.chin),
    lobes: { right: mixPt(a.lobes.right, b.lobes.right), left: mixPt(a.lobes.left, b.lobes.left) },
    nostrils: { right: mixPt(a.nostrils.right, b.nostrils.right), left: mixPt(a.nostrils.left, b.nostrils.left) },
  };
}
