import Link from "next/link";

/**
 * Small, safe Markdown renderer for admin-edited pages: headings (##, ###), paragraphs,
 * bullet and numbered lists, **bold**, *italic* and [links](url). It builds React elements
 * only, so raw HTML typed into a page is shown as text and can never run.
 */

const LINE_BREAK = new RegExp("\\r?\\n");
const INLINE =/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text, keyPrefix) {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key} className="font-semibold text-navy-900">{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith("/")) return <Link key={key} href={href} className="text-lotus-600 underline underline-offset-4 hover:text-lotus-700">{label}</Link>;
      if (/^(https?:|mailto:|tel:)/i.test(href)) return <a key={key} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-lotus-600 underline underline-offset-4 hover:text-lotus-700">{label}</a>;
      return label; // unsafe scheme (e.g. javascript:) -> plain text
    }
    return part;
  });
}

export default function Markdown({ source = "" }) {
  const blocks = [];
  let list = null;
  let para = null;
  const flush = () => {
    if (list) blocks.push(list);
    if (para) blocks.push(para);
    list = null;
    para = null;
  };

  String(source)
    .split(LINE_BREAK)
    .forEach((raw, index) => {
      const line = raw.trim();
      if (!line) return flush();
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      const bullet = line.match(/^[-*]\s+(.*)$/);
      const numbered = line.match(/^\d+[.)]\s+(.*)$/);
      if (heading) {
        flush();
        blocks.push({ type: heading[1].length <= 2 ? "h2" : "h3", text: heading[2], index });
      } else if (bullet || numbered) {
        const type = bullet ? "ul" : "ol";
        if (para || (list && list.type !== type)) flush();
        if (!list) list = { type, items: [], index };
        list.items.push((bullet || numbered)[1]);
      } else {
        if (list) flush();
        // consecutive lines form one paragraph
        if (para) para.text += ` ${line}`;
        else para = { type: "p", text: line, index };
      }
    });
  flush();

  return (
    <div className="space-y-4 leading-relaxed text-ink/80">
      {blocks.map((block) => {
        const key = `b${block.index}`;
        if (block.type === "h2") return <h2 key={key} className="pt-4 font-display text-3xl text-navy-900">{inline(block.text, key)}</h2>;
        if (block.type === "h3") return <h3 key={key} className="pt-2 font-display text-2xl text-navy-900">{inline(block.text, key)}</h3>;
        if (block.type === "ul" || block.type === "ol") {
          const Tag = block.type;
          return (
            <Tag key={key} className={`space-y-1.5 pl-5 ${block.type === "ul" ? "list-disc marker:text-marigold-500" : "list-decimal marker:text-navy-900"}`}>
              {block.items.map((item, i) => (
                <li key={i}>{inline(item, `${key}-${i}`)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={key}>{inline(block.text, key)}</p>;
      })}
    </div>
  );
}
