/**
 * Colour swatches for variant options. Metals get a light-to-dark gradient so they read as
 * metal, not flat paint. Matching is by lower-cased name, English or Bangla; unknown names
 * return null and the UI falls back to a text chip.
 */
const SWATCHES = {
  golden: "linear-gradient(135deg,#fff3c4 0%,#e9c46a 35%,#b8862b 70%,#f2d27a 100%)",
  gold: "golden",
  "antique gold": "linear-gradient(135deg,#e7cf8f 0%,#b48a3c 45%,#7a5a22 80%,#c9a35a 100%)",
  silver: "linear-gradient(135deg,#ffffff 0%,#d9dde3 35%,#9aa3ad 70%,#e8ebef 100%)",
  oxidised: "linear-gradient(135deg,#b9bcc0 0%,#6f7378 40%,#3c3f43 75%,#8a8e93 100%)",
  oxidized: "oxidised",
  "oxidised silver": "oxidised",
  "rose gold": "linear-gradient(135deg,#ffe3d8 0%,#e8a99a 40%,#b9705f 75%,#f0c1b3 100%)",
  copper: "linear-gradient(135deg,#f6c6a0 0%,#c97b45 45%,#8a4a22 80%,#d99567 100%)",
  bronze: "linear-gradient(135deg,#e8c99a 0%,#a8783f 45%,#6d4b22 80%,#c09a63 100%)",
  black: "#1f1f24",
  white: "#f8f8f6",
  pearl: "radial-gradient(circle at 35% 30%,#ffffff,#f1ece4 55%,#d8cfc2)",
  red: "#c62032",
  maroon: "#6d1a2a",
  pink: "#ec8fb0",
  blue: "#2f6fb5",
  "sky blue": "#8ec5ea",
  turquoise: "#3fb8af",
  green: "#3f8a4e",
  "mint green": "#a7dcc0",
  yellow: "#f2cc5e",
  orange: "#e88a2e",
  purple: "#7b4fa0",
  multicolor: "conic-gradient(#d11e58,#f2cc5e,#40a796,#2f6fb5,#d11e58)",
  multicolour: "multicolor",
  // Bangla
  সোনালি: "golden",
  সোনালী: "golden",
  রুপালি: "silver",
  রূপালী: "silver",
  কালো: "black",
  সাদা: "white",
  লাল: "red",
  নীল: "blue",
  সবুজ: "green",
  গোলাপি: "pink",
};

export function swatchFor(name) {
  let value = SWATCHES[String(name || "").trim().toLowerCase()];
  while (value && SWATCHES[value]) value = SWATCHES[value]; // follow aliases
  return value || null;
}

export const isColourOption = (name) => /colou?r|metal|finish|রং|রঙ/i.test(String(name || ""));
