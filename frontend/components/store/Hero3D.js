"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { localePath } from "@/lib/i18n";

/*
 * Branch hero on the logo navy (owner reference: earrings hanging on a branch).
 * A leafy SVG branch slides in from the left, real cut-out earrings fly in from the right,
 * catch on it by their hooks and swing to rest. Pieces alternate; each change remounts the
 * scene so the animation replays. Earrings fill the space between the branch and the button.
 * --top (set on the section per breakpoint) is where the branch line sits, below the header.
 */
const BRANCH_PIECES = [
  { src: "/hero/branch-aqua-v2.webp", w: 700, h: 1000, name: "Aqua Agate Drops", href: "/product/aqua-agate-drops" },
  { src: "/hero/branch-tassel-v2.webp", w: 363, h: 685, name: "Tasselled Wooden Bead Earrings", href: "/product/tasselled-wooden-bead-earrings" },
];

const SCENE_MS = 6000; // auto-advance forever

export default function Hero3D({ t, lang }) {
  const [step, setStep] = useState(0);
  // Kingfisher on the branch: "perched" -> "away" when the page scrolls (a full-screen
  // flight plays above everything, starting where the bird sat), "landing" back at the top.
  const [bird, setBird] = useState("perched");
  const [flight, setFlight] = useState(null);

  useEffect(() => {
    let state = "perched";
    let landingTimer;
    const set = (next) => {
      state = next;
      setBird(next);
    };
    const onScroll = () => {
      const scrolled = window.scrollY > 60;
      if (scrolled && state !== "away") {
        const box = document.querySelector("[data-perched-bird]")?.getBoundingClientRect();
        if (state === "perched" && box?.width && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setFlight({ left: box.left, top: box.top, width: box.width, height: box.height, id: Date.now() });
        }
        clearTimeout(landingTimer);
        set("away");
      } else if (!scrolled && state === "away") {
        set("landing");
        landingTimer = setTimeout(() => set("perched"), 1700);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(landingTimer);
    };
  }, []);

  const active = step % BRANCH_PIECES.length;
  const piece = BRANCH_PIECES[active];

  // Always advances (no pause on hover). With reduced motion the CSS animations are
  // shortened globally, so pieces simply swap instead of flying in.
  useEffect(() => {
    const timer = setTimeout(() => setStep((current) => current + 1), SCENE_MS);
    return () => clearTimeout(timer);
  }, [step]);


  return (
    <section
      className="relative h-[100svh] min-h-[640px] overflow-hidden bg-navy-950 text-white [--top:max(24%,180px)] lg:[--top:max(31%,250px)]"
      aria-roledescription="carousel"
      aria-label={t.heroPiece}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_45%,#24406b_0%,#142342_45%,#0a1226_100%)]" aria-hidden />

      <BranchScene key={step} piece={piece} bird={bird} />
      {flight && <FlyingBird key={flight.id} box={flight} onDone={() => setFlight(null)} />}

      {/* Minimal call to action */}
      <div className="absolute inset-x-0 bottom-7 flex flex-col items-center gap-4 lg:bottom-8">
        <Link
          href={localePath(lang, piece.href)}
          className="group relative inline-flex items-center gap-4 overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--color-gold-light),var(--color-saffron))] py-1.5 pr-1.5 pl-7 text-sm font-medium text-navy-950 shadow-[0_10px_30px_-10px_rgba(229,147,42,0.7)] ring-1 ring-white/30 transition duration-300 ring-inset hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(229,147,42,0.9)]"
        >
          {/* light sweep on hover */}
          <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/40 blur-sm transition-transform duration-700 ease-out group-hover:translate-x-[420%]" aria-hidden />
          <span className="relative">{t.heroShop}</span>
          <span className="relative flex size-9 items-center justify-center rounded-full bg-navy-950 text-gold-light transition-transform duration-300 group-hover:rotate-45">
            <ArrowUpRight className="size-4" strokeWidth={2} />
          </span>
        </Link>
        <div className="flex gap-2">
          {BRANCH_PIECES.map((item, index) => (
            <button
              key={item.src}
              type="button"
              onClick={() => setStep((current) => (active === index ? current : current + 1))}
              aria-label={item.name}
              aria-current={active === index}
              className={`relative h-1 rounded-full transition-all duration-500 after:absolute after:-inset-x-1 after:-inset-y-4 ${active === index ? "w-8 bg-gold-light" : "w-3 bg-white/25 hover:bg-white/50"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Earrings land on a branch ---------- */

function BranchScene({ piece, bird }) {
  return (
    // The branch line runs along the top edge of this wrapper; the earrings hang from it.
    <div className="absolute inset-x-0 [--bw:130vw] sm:[--bw:84vw] lg:[--bw:70vw]" style={{ top: "var(--top)" }}>
      <div
        className="absolute left-1/2 -translate-x-1/2 animate-[hero-hang-in_2.4s_cubic-bezier(.2,.75,.25,1)_0.8s_both] [transform-origin:50%_0]"
        style={{
          aspectRatio: `${piece.w} / ${piece.h}`,
          top: "calc(var(--bw) * -0.004)",
          // fill the space between the branch and the button, but never wider than the screen
          height: `max(220px, min(620px, calc(100svh - var(--top) - 140px), calc(84vw * ${piece.h} / ${piece.w})))`,
        }}
      >
        <div className="size-full animate-[hero-sway_5s_ease-in-out_3.2s_infinite] [transform-origin:50%_0]">
          <Image src={piece.src} alt={piece.name} width={piece.w} height={piece.h} priority sizes="(min-width: 640px) 30vw, 70vw" className="size-full object-contain drop-shadow-[0_30px_35px_rgba(5,10,25,0.65)]" />
        </div>
      </div>

      {/* Branch drawn in front, so the hooks come out from behind it */}
      <svg
        viewBox="0 0 1000 220"
        className="absolute -left-[22vw] animate-[hero-branch-in_1.3s_cubic-bezier(.2,.8,.25,1)_both] sm:left-0"
        style={{ width: "var(--bw)", top: "calc(var(--bw) * -0.105)" }}
        aria-hidden
      >
        <defs>
          <linearGradient id="bark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a6440" />
            <stop offset="0.5" stopColor="#5b3d24" />
            <stop offset="1" stopColor="#3a2614" />
          </linearGradient>
          <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8fbf4f" />
            <stop offset="1" stopColor="#3f7a2f" />
          </linearGradient>
          <linearGradient id="leaf-dark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6ea343" />
            <stop offset="1" stopColor="#2f5f26" />
          </linearGradient>
        </defs>
        {/* short twigs (kept low so leaves stay clear of the menu) */}
        <path d="M300 110 C 320 96, 340 86, 365 79" stroke="url(#bark)" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M200 128 C 215 150, 232 166, 250 182" stroke="url(#bark)" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M850 100 C 866 93, 882 88, 902 84" stroke="url(#bark)" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* main branch, tapering to the right */}
        <path d="M-10 124 C 200 108, 380 101, 560 101 C 760 100, 900 97, 1004 96 L 1004 101 C 900 103, 760 108, 560 115 C 380 120, 200 130, -10 154 Z" fill="url(#bark)" />
        <path d="M-10 128 C 200 112, 380 104, 560 104 C 760 103, 900 99, 1004 98" stroke="#a37b52" strokeOpacity="0.45" strokeWidth="2" fill="none" />
        <ellipse cx="240" cy="117" rx="6" ry="4" fill="#3a2614" opacity="0.6" />
        <ellipse cx="520" cy="108" rx="4" ry="2.5" fill="#3a2614" opacity="0.6" />
        {/* leaves: above the line nearly flat, the rest hanging on the left, none over the earrings */}
        <Leaf x={365} y={79} r={-14} s={0.8} delay={0} />
        <Leaf x={346} y={86} r={-168} s={0.7} dark delay={0.6} />
        <Leaf x={902} y={84} r={-10} s={0.62} delay={0.4} />
        <Kingfisher x={790} y={100} state={bird} />
        <Leaf x={884} y={89} r={-172} s={0.55} dark delay={1} />
        <Leaf x={60} y={132} r={115} s={0.85} delay={0.7} />
        <Leaf x={120} y={122} r={78} s={0.9} dark delay={1.4} />
        <Leaf x={250} y={182} r={62} s={0.8} delay={0.3} />
        <Leaf x={236} y={168} r={150} s={0.68} dark delay={0.9} />
        <Leaf x={430} y={112} r={95} s={0.6} delay={1.1} />
      </svg>
    </div>
  );
}

/** Kingfisher drawing in logo colours, drawn facing left with its feet at (0, 0). */
function BirdShape({ flying }) {
  return (
    <>
      <path d="M14 -12 L34 -4 L30 0 L12 -7 Z" fill="#1d6f7e" />
      {!flying && <path d="M-2 -6 L-3 0 M3 -6 L3 0" stroke="#d9772a" strokeWidth="1.6" strokeLinecap="round" />}
      <ellipse cx="2" cy="-15" rx="15" ry="11" fill="var(--color-teal-500)" />
      <path d="M-12 -14 C -10 -4, 8 -2, 14 -10 C 6 -8, -4 -10, -12 -14 Z" fill="var(--color-saffron)" />
      <g className={flying ? "bird-wing-flap" : "bird-wing"} style={{ transformOrigin: "-2px -20px" }}>
        <path d="M-2 -21 C 8 -26, 20 -22, 24 -12 C 14 -12, 4 -14, -2 -21 Z" fill="#1d6f7e" />
        <path d="M3 -20 C 10 -21, 16 -18, 19 -14" stroke="#7fd3d8" strokeWidth="1.2" fill="none" />
      </g>
      <g className={flying ? undefined : "bird-head"} style={{ transformOrigin: "-10px -24px" }}>
        <circle cx="-11" cy="-27" r="8.5" fill="var(--color-teal-500)" />
        <path d="M-18 -24 C -14 -21, -9 -21, -5 -23 C -8 -19, -15 -19, -18 -24 Z" fill="var(--color-saffron)" />
        <circle cx="-14" cy="-29" r="1.8" fill="#0a1226" />
        <circle cx="-14.5" cy="-29.6" r="0.6" fill="white" />
        <path d="M-19 -28 L-36 -24.5 L-19 -24.5 Z" fill="#1f1f24" />
      </g>
    </>
  );
}

/** Perched kingfisher on the branch, facing right (mirrored). */
function Kingfisher({ x, y, state }) {
  return (
    <g transform={`translate(${x} ${y}) scale(-1.3 1.3)`}>
      <g className={`bird bird-${state}`} data-perched-bird>
        <BirdShape flying={state === "landing"} />
      </g>
    </g>
  );
}

/**
 * Take-off: a copy of the bird in a fixed layer above the page (so the header and the
 * hero's edges never clip it). It hops, flaps, swoops toward the viewer growing large,
 * and leaves across the screen to the right.
 */
function FlyingBird({ box, onDone }) {
  return (
    <div
      className="pointer-events-none fixed z-[60] animate-[bird-escape_2.6s_cubic-bezier(.45,.05,.35,1)_forwards] will-change-transform"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      onAnimationEnd={(event) => event.target === event.currentTarget && onDone()}
      aria-hidden
    >
      <svg viewBox="-37 -37 72 38" className="size-full overflow-visible">
        <g transform="scale(-1 1)">
          <BirdShape flying />
        </g>
      </svg>
    </div>
  );
}

function Leaf({ x, y, r, s, dark = false, delay = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <g className="animate-[hero-leaf_4s_ease-in-out_infinite] [transform-box:fill-box] [transform-origin:0%_50%]" style={{ animationDelay: `${delay}s` }}>
        <path d="M0 0 C 25 -22, 75 -24, 112 0 C 75 24, 25 22, 0 0 Z" fill={dark ? "url(#leaf-dark)" : "url(#leaf)"} />
        <path d="M2 0 C 40 -2, 80 -1, 110 0" stroke="#e6f2c8" strokeOpacity="0.55" strokeWidth="1.6" fill="none" />
        <path d="M30 -1 L 44 -12 M55 -1 L 70 -13 M30 1 L 44 12 M55 1 L 70 13" stroke="#e6f2c8" strokeOpacity="0.3" strokeWidth="1" />
      </g>
    </g>
  );
}
