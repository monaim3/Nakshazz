/*
 * Leaf-shaped petals in the logo colours drifting down along the left and right edges of a
 * section (same effect as the nakshazz.com coming-soon page). Place inside a `relative
 * overflow-hidden` parent. Positions are fixed numbers (no Math.random) so server and
 * browser render the same markup. Hidden for reduced motion.
 */
const COLOURS = ["var(--color-lotus-500)", "var(--color-gold-light)", "var(--color-teal-400)", "var(--color-saffron)"];

// [left %, size px, duration s, delay s]; left ≤ 8 or ≥ 92 keeps them on the outer edges
const PETALS = [
  [1, 18, 14, 0],
  [5, 13, 18, -6],
  [8, 22, 16, -11],
  [3, 15, 21, -15],
  [7, 11, 13, -3],
  [92, 20, 15, -2],
  [95, 14, 19, -9],
  [97, 23, 17, -13],
  [93, 12, 22, -17],
  [96, 16, 13, -5],
];

export default function FallingPetals() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {PETALS.map(([left, size, duration, delay], index) => (
        // The column is as tall as the section, so translateY(%) moves the petal through its full height.
        <div key={index} className="absolute inset-y-0 animate-[petal-fall_linear_infinite]" style={{ left: `${left}%`, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}>
          <span
            className="block animate-[petal-sway_ease-in-out_infinite] rounded-[0_100%] opacity-55"
            style={{
              width: size,
              height: Math.round(size * 1.55),
              background: COLOURS[index % COLOURS.length],
              animationDuration: `${4 + (index % 3)}s`,
              animationDelay: `${delay}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
