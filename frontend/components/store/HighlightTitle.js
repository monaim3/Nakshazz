/**
 * Title with one highlighted part in the brand gradient (lotus → saffron, italic serif).
 * Mark the part with asterisks in the dictionary ("Rooted in *Bengal*, made for you");
 * without markers the last word is highlighted ("Shop by *Category*").
 * `tone="dark"` uses a lighter gradient for navy backgrounds.
 */
export default function HighlightTitle({ text, tone = "light" }) {
  const value = String(text || "");
  let before;
  let highlight;
  let after = "";

  const marked = value.match(/^(.*?)\*(.+?)\*(.*)$/);
  if (marked) {
    [, before, highlight, after] = marked;
  } else {
    const index = value.trimEnd().lastIndexOf(" ");
    before = index > 0 ? value.slice(0, index + 1) : "";
    highlight = index > 0 ? value.slice(index + 1) : value;
  }

  const gradient = tone === "dark" ? "from-gold-light via-saffron to-lotus-400" : "from-lotus-500 via-lotus-600 to-saffron";

  return (
    <>
      {before}
      <span className={`inline-block bg-gradient-to-r ${gradient} bg-clip-text pr-[0.08em] pb-[0.08em] text-transparent italic`}>{highlight}</span>
      {after}
    </>
  );
}
