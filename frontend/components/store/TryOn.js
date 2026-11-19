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
let posePromise = null;

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

/**
 * Body model (shoulders). Needed for necklaces: the neck does not follow the face when
 * someone leans or tilts their head. Also finds the head when the face is very small.
 * Resolves to null when it cannot load, so the try-on still works from the face alone.
 */
function loadPose() {
  if (!posePromise) {
    posePromise = import("@mediapipe/tasks-vision")
      .then(async ({ PoseLandmarker, FilesetResolver }) => {
        const files = await FilesetResolver.forVisionTasks(ASSETS);
        const options = (delegate) => ({
          baseOptions: { modelAssetPath: `${ASSETS}/pose_landmarker_lite.task`, delegate },
          runningMode: "IMAGE",
          numPoses: 1,
          // head-and-shoulders photos show little of the body: accept weaker detections
          minPoseDetectionConfidence: 0.15,
          minPosePresenceConfidence: 0.15,
        });
        try {
          return await PoseLandmarker.createFromOptions(files, options("GPU"));
        } catch {
          return PoseLandmarker.createFromOptions(files, options("CPU"));
        }
      })
      .catch(() => null);
  }
  return posePromise;
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// how far the head may turn before the far ear / far nostril is out of sight
const EAR_HIDDEN_YAW = 0.42;
const NOSTRIL_HIDDEN_YAW = 0.6;

/**
 * Turns normalized landmarks into pixel-space anchors for the piece.
 * `mirror` flips x (selfie camera shown like a mirror). `pose` = body landmarks or null.
 */
function computePlacement(landmarks, width, height, mirror, pose) {
  const px = (l) => ({ x: (mirror ? 1 - l.x : l.x) * width, y: l.y * height, z: (l.z || 0) * width });
  const pt = (index) => px(landmarks[index]);
  const right = pt(P.rightFaceEdge);
  const left = pt(P.leftFaceEdge);
  const faceWidth = Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
  const mmToPx = faceWidth / FACE_WIDTH_MM;

  // the face's own "across" axis on screen (always pointing screen-right) and its tilt
  const [edgeA, edgeB] = right.x < left.x ? [right, left] : [left, right];
  const span = Math.hypot(edgeB.x - edgeA.x, edgeB.y - edgeA.y) || 1;
  const across = { x: (edgeB.x - edgeA.x) / span, y: (edgeB.y - edgeA.y) / span };
  const roll = Math.atan2(across.y, across.x);

  const forehead = pt(P.forehead);
  const chin = pt(P.chin);
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);
  const down = { x: (chin.x - forehead.x) / faceHeight, y: (chin.y - forehead.y) / faceHeight };

  // yaw: how far the nose sits from the centre between the face edges, measured along the
  // face's own axis so a tilted head does not read as a turned one (-1..1, + = screen-right)
  const nose = pt(P.noseTip);
  const mid = lerp(right, left, 0.5);
  const yaw = ((nose.x - mid.x) * across.x + (nose.y - mid.y) * across.y) / (span / 2);
  const turn = Math.min(1, Math.abs(yaw));

  // earlobes: lower on the jaw line than the face edge, pushed outward along the face axis.
  // When the head turns, the ear on the open side sits further back, so further out on screen.
  const lobe = (upper, lower, edge) => {
    const base = lerp(pt(upper), pt(lower), 0.25);
    const sign = (edge.x - mid.x) * across.x + (edge.y - mid.y) * across.y >= 0 ? 1 : -1;
    const towardNose = sign * yaw > 0; // the nose points to this side: this ear is the far one
    const push = faceWidth * (towardNose ? 0.06 - 0.05 * turn : 0.06 + 0.1 * turn);
    return {
      x: base.x + sign * across.x * push,
      y: base.y + sign * across.y * push,
      hidden: towardNose && turn > EAR_HIDDEN_YAW,
      side: sign < 0 ? "screenLeft" : "screenRight",
    };
  };

  const nostril = (index) => {
    const at = pt(index);
    const sign = (at.x - mid.x) * across.x + (at.y - mid.y) * across.y >= 0 ? 1 : -1;
    return { x: at.x, y: at.y, hidden: sign * yaw > 0 && turn > NOSTRIL_HIDDEN_YAW };
  };

  // neck base from the shoulders, when the body model sees both of them
  let neck = null;
  const sA = pose?.[11];
  const sB = pose?.[12];
  if (sA && sB && (sA.visibility ?? 1) > 0.5 && (sB.visibility ?? 1) > 0.5) {
    const [s1, s2] = [px(sA), px(sB)].sort((p, q) => p.x - q.x);
    const shoulderWidth = Math.hypot(s2.x - s1.x, s2.y - s1.y);
    const shoulderMid = lerp(s1, s2, 0.5);
    const below = (shoulderMid.x - chin.x) * down.x + (shoulderMid.y - chin.y) * down.y;
    // sanity: shoulders of this same person, below the chin, of a believable width
    if (shoulderWidth > span * 1.1 && shoulderWidth < span * 4.5 && below > faceHeight * 0.15 && below < faceHeight * 1.6) {
      // top of the necklace: high on the neck (85% of the way up from the shoulder line to
      // the chin), sideways halfway between the body's centre and the chin
      const along = { x: (s2.x - s1.x) / shoulderWidth, y: (s2.y - s1.y) / shoulderWidth };
      const rel = { x: chin.x - shoulderMid.x, y: chin.y - shoulderMid.y };
      const side = rel.x * along.x + rel.y * along.y;
      const up = { x: rel.x - along.x * side, y: rel.y - along.y * side };
      neck = {
        x: shoulderMid.x + along.x * side * 0.5 + up.x * 0.85,
        y: shoulderMid.y + along.y * side * 0.5 + up.y * 0.85,
        angle: Math.atan2(along.y, along.x),
      };
    }
  }

  return {
    mmToPx,
    roll,
    yaw,
    faceHeight,
    down,
    chin,
    neck,
    lobes: { right: lobe(P.rightJawUpper, P.rightJawLower, right), left: lobe(P.leftJawUpper, P.leftJawLower, left) },
    nostrils: { right: nostril(P.rightNostril), left: nostril(P.leftNostril) },
  };
}

/** Draws the product on the canvas (already showing the face). */
function drawPiece(ctx, piece, art, place, { scale, offset, noseSide }) {
  // only the visible part of the photo is drawn: empty transparent margins would push the
  // piece away from the ear / neck and make it look too small
  const { img, box } = art;
  const aspect = box.w / box.h;
  const draw = (x, y, w, h) => ctx.drawImage(img, box.x, box.y, box.w, box.h, x, y, w, h);
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
      draw(-w / 2, 0, w, h);
      ctx.restore();
    }
  } else if (piece.type === "necklace") {
    const w = piece.size_mm * place.mmToPx * scale;
    const h = w / aspect;
    if (place.neck) {
      // shoulders found: sit on the real neck base and follow the shoulder line, so a
      // tilted head or a leaning body does not drag the necklace away
      const shift = place.faceHeight * offset;
      ctx.translate(place.neck.x - Math.sin(place.neck.angle) * shift, place.neck.y + Math.cos(place.neck.angle) * shift);
      ctx.rotate(place.neck.angle);
    } else {
      // face only (close-up selfie): a little below the chin, along the face's own "down"
      const drop = place.faceHeight * (0.16 + offset);
      ctx.translate(place.chin.x + place.down.x * drop, place.chin.y + place.down.y * drop);
      ctx.rotate(place.roll);
    }
    draw(-w / 2, 0, w, h);
  } else if (piece.type === "nose") {
    const w = piece.size_mm * place.mmToPx * scale;
    const h = w / aspect;
    // the chosen nostril is turned away from the camera: show it on the one we can see
    const other = noseSide === "left" ? "right" : "left";
    const at = place.nostrils[noseSide].hidden && !place.nostrils[other].hidden ? place.nostrils[other] : place.nostrils[noseSide];
    ctx.translate(at.x, at.y + offset * h * 2);
    ctx.rotate(place.roll);
    draw(-w / 2, -h / 2, w, h);
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
    img.decode().then(() => (imgRef.current = { img, box: visibleBox(img) })).catch(() => setError(t.errorPiece));
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

      const [landmarker, poser] = await Promise.all([loadLandmarker(), loadPose()]);
      await landmarker.setOptions({ runningMode: "IMAGE" });
      let face = landmarker.detect(scratch).faceLandmarks?.[0];
      let pose = null;
      if (poser && (piece.type === "necklace" || !face)) {
        await poser.setOptions({ runningMode: "IMAGE" });
        pose = poser.detect(scratch).landmarks?.[0] || null;
      }
      // small or strongly tilted face: look again at zoomed and rotated views
      if (!face) face = detectHarder(landmarker, scratch, pose);
      placeRef.current = face ? computePlacement(face, canvas.width, canvas.height, false, pose) : null;
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
      const [stream, landmarker, poser] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }),
        loadLandmarker(),
        piece.type === "necklace" ? loadPose() : null,
      ]);
      if (poser) await poser.setOptions({ runningMode: "VIDEO" });
      let pose = null;
      let frame = 0;
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
        const now = performance.now();
        const result = landmarker.detectForVideo(video, now);
        const face = result.faceLandmarks?.[0];
        // shoulders move slowly: every third frame is enough and keeps the camera smooth
        if (poser && frame++ % 3 === 0) pose = poser.detectForVideo(video, now).landmarks?.[0] || null;
        if (face) {
          const next = computePlacement(face, canvas.width, canvas.height, true, pose);
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

/**
 * Second chance when the plain search finds no face (small face in a full-body photo,
 * strongly tilted head): look again at zoomed and rotated views of the photo and map the
 * landmarks back to whole-photo coordinates. Returns landmarks or undefined.
 */
function detectHarder(landmarker, photo, pose) {
  const W = photo.width;
  const H = photo.height;
  const views = [];
  if (pose) {
    // around the head the body model found (nose, eyes, ears, mouth = pose points 0-10)
    const xs = pose.slice(0, 11).map((l) => l.x * W);
    const ys = pose.slice(0, 11).map((l) => l.y * H);
    const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 24) * 3.2;
    const head = { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, side };
    for (const angle of [0, 0.5, -0.5]) views.push({ ...head, angle });
  }
  const full = Math.max(W, H);
  for (const angle of [0.5, -0.5, 1, -1]) views.push({ cx: W / 2, cy: H / 2, side: full, angle });
  // zoomed tiles, largest first: a face of any size somewhere in the photo
  for (const [n, part] of [[2, 0.6], [3, 0.4], [5, 0.24]]) {
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) views.push({ cx: (W * (col + 0.5)) / n, cy: (H * (row + 0.5)) / n, side: full * part, angle: 0 });
    }
  }

  const SIZE = 640;
  const view = document.createElement("canvas");
  view.width = SIZE;
  view.height = SIZE;
  const ctx = view.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  for (const { cx, cy, side, angle } of views) {
    const zoom = SIZE / side;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(angle);
    ctx.scale(zoom, zoom);
    ctx.drawImage(photo, -cx, -cy);
    const found = landmarker.detect(view).faceLandmarks?.[0];
    if (!found) continue;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return found.map((l) => {
      const dx = ((l.x - 0.5) * SIZE) / zoom;
      const dy = ((l.y - 0.5) * SIZE) / zoom;
      return { x: (cx + dx * cos - dy * sin) / W, y: (cy + dx * sin + dy * cos) / H, z: (l.z * SIZE) / zoom / W };
    });
  }
  return undefined;
}

/**
 * The part of a transparent photo that actually shows something. Rows and columns with only
 * a stray pixel or two do not count (leftover specks from background removal).
 */
function visibleBox(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const whole = { x: 0, y: 0, w, h };
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const rows = new Uint32Array(h);
    const cols = new Uint32Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 40) {
          rows[y]++;
          cols[x]++;
        }
      }
    }
    const first = (counts) => counts.findIndex((count) => count >= 3);
    const last = (counts) => counts.findLastIndex((count) => count >= 3);
    const x0 = first(cols);
    const y0 = first(rows);
    if (x0 < 0 || y0 < 0) return whole;
    return { x: x0, y: y0, w: last(cols) - x0 + 1, h: last(rows) - y0 + 1 };
  } catch {
    return whole;
  }
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
    neck: a.neck && b.neck ? { ...mixPt(a.neck, b.neck), angle: mix(a.neck.angle, b.neck.angle) } : b.neck,
    lobes: { right: mixPt(a.lobes.right, b.lobes.right), left: mixPt(a.lobes.left, b.lobes.left) },
    nostrils: { right: mixPt(a.nostrils.right, b.nostrils.right), left: mixPt(a.nostrils.left, b.nostrils.left) },
  };
}
