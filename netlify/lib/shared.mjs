import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const MB = 1024 * 1024;
export const CHUNK = 3 * MB; // stays well inside Netlify's 6 MB function payload limit

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

export const store = (name) => getStore({ name, consistency: "strong" });

export function adminPassword() {
  const n = globalThis.Netlify && globalThis.Netlify.env ? globalThis.Netlify.env.get("ADMIN_PASSWORD") : undefined;
  return n || process.env.ADMIN_PASSWORD || "";
}

export function authorised(req) {
  const expected = adminPassword();
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function requireAdmin(req) {
  if (!adminPassword()) return json({ error: "The family password has not been set on Netlify yet." }, 503);
  if (!authorised(req)) return json({ error: "unauthorised" }, 401);
  return null;
}

export const clean = (v, max) =>
  String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

export const newId = () => Date.now().toString(36) + crypto.randomBytes(5).toString("hex");

export function clientKey(req, context) {
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
  return crypto.createHash("sha256").update("memorial:" + ip).digest("hex").slice(0, 32);
}

export async function deleteMedia(ms, id) {
  const meta = await ms.get(`meta/${id}`, { type: "json" });
  if (meta) for (let n = 0; n < meta.chunks; n++) await ms.delete(`c/${id}/${n}`);
  await ms.delete(`meta/${id}`);
}

// True when the request carried a password that did not match (as opposed to no password at all).
export function wrongPassword(req) {
  const header = req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") && header.length > 7 && !authorised(req);
}

// Simple per visitor rate limit kept in Blobs. Returns true when the request is allowed.
export async function allow(s, req, context, bucket, max, windowMs) {
  const key = `rl/${bucket}/${clientKey(req, context)}`;
  const now = Date.now();
  const hits = ((await s.get(key, { type: "json" })) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  await s.setJSON(key, hits);
  return true;
}
