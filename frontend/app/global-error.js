"use client";

/**
 * Last-resort error screen, used only when the root layout itself fails. It replaces the
 * whole document, so it carries its own <html>/<body> and inline styles (no Tailwind/fonts).
 */
export default function GlobalError({ retry }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fcf7f4", color: "#0f1b35", fontFamily: "Georgia, 'Times New Roman', serif", textAlign: "center", padding: "0 16px" }}>
        <title>Something went wrong | Nakshazz</title>
        <main style={{ maxWidth: 480 }}>
          <p style={{ letterSpacing: "0.3em", fontSize: 13, textTransform: "uppercase", margin: 0 }}>Nakshazz</p>
          <h1 style={{ fontSize: 36, fontWeight: 500, margin: "12px 0" }}>Something went wrong</h1>
          <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 15, opacity: 0.7, lineHeight: 1.6 }}>We couldn&apos;t load the shop just now. Please try again in a moment.</p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", fontFamily: "system-ui, sans-serif" }}>
            <button type="button" onClick={() => retry()} style={{ background: "#0f1b35", color: "#fff", border: 0, borderRadius: 999, padding: "12px 28px", fontSize: 14, cursor: "pointer" }}>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload is the point after a root failure */}
            <a href="/" style={{ border: "1px solid #0f1b35", color: "#0f1b35", borderRadius: 999, padding: "12px 28px", fontSize: 14, textDecoration: "none" }}>
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
