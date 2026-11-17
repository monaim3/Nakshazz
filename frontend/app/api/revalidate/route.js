import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";

/**
 * Called by Laravel after admin edits: POST { tags: ["products", "product:slug"] }
 * with "Authorization: Bearer <REVALIDATE_SECRET>".
 */
function isAuthorized(request) {
  const secret = process.env.REVALIDATE_SECRET;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tags = Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === "string" && /^[a-z0-9:_-]{1,120}$/.test(tag)).slice(0, 20) : [];

  tags.forEach((tag) => revalidateTag(tag, "max"));

  return Response.json({ revalidated: tags });
}
