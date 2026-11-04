import { json, store, authorised, wrongPassword, allow, clean, newId, MB, CHUNK } from "../lib/shared.mjs";

const MAX = { image: 15 * MB, audio: 30 * MB, video: 110 * MB };

async function serve(req, s, id) {
  const meta = await s.get(`meta/${id}`, { type: "json" });
  if (!meta || !meta.complete) return new Response("Not found", { status: 404 });
  const size = meta.size;
  let start = 0, end = size - 1, partial = false;
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1] === "") start = Math.max(0, size - Number(m[2] || 0));
      else { start = Number(m[1]); if (m[2] !== "") end = Math.min(Number(m[2]), size - 1); }
      partial = true;
    }
    if (start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  const ci = Math.floor(start / meta.chunkSize);
  const cStart = ci * meta.chunkSize;
  const cEnd = Math.min(cStart + meta.chunkSize, size) - 1;
  if (end > cEnd) { end = cEnd; partial = true; } // one stored chunk per response; players request the rest
  const buf = await s.get(`c/${id}/${ci}`, { type: "arrayBuffer" });
  if (!buf) return new Response("Not found", { status: 404 });
  const body = new Uint8Array(buf).subarray(start - cStart, end - cStart + 1);
  const headers = {
    "content-type": meta.type,
    "content-length": String(body.byteLength),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable"
  };
  if (partial) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: partial ? 206 : 200, headers });
}

export default async (req, context) => {
  const url = new URL(req.url);
  const s = store("memorial-media");
  const action = url.searchParams.get("action");
  const id = clean(url.searchParams.get("id"), 40);

  if (req.method === "GET" && id) return serve(req, s, id);

  // Anyone writing in the Memory Book may attach files; visitors are rate limited and
  // their files only appear publicly once the family approves the message.
  if (wrongPassword(req)) return json({ error: "unauthorised" }, 401);

  if (req.method === "POST" && action === "init") {
    if (!authorised(req) && !(await allow(s, req, context, "media", 15, 3600e3)))
      return json({ error: "Please wait a little while before adding more files." }, 429);
    let b;
    try { b = await req.json(); } catch { return json({ error: "Invalid upload request." }, 400); }
    const kind = String(b.kind || "");
    const type = clean(b.type, 100).toLowerCase();
    const size = Number(b.size);
    if (!MAX[kind]) return json({ error: "Only photos, voice notes and videos can be added." }, 400);
    if (!type.startsWith(kind + "/")) return json({ error: "That file type is not supported." }, 400);
    if (!(size > 0) || size > MAX[kind]) return json({ error: `That file is too large. The limit is ${MAX[kind] / MB} MB.` }, 400);
    const mid = newId();
    const meta = { id: mid, kind, type, size, chunkSize: CHUNK, chunks: Math.ceil(size / CHUNK), complete: false, at: new Date().toISOString() };
    await s.setJSON(`meta/${mid}`, meta);
    return json({ id: mid, chunkSize: CHUNK, chunks: meta.chunks });
  }

  if (req.method === "PUT" && action === "chunk") {
    const meta = await s.get(`meta/${id}`, { type: "json" });
    if (!meta || meta.complete) return json({ error: "Upload not found." }, 404);
    const n = Number(url.searchParams.get("n"));
    if (!Number.isInteger(n) || n < 0 || n >= meta.chunks) return json({ error: "Invalid chunk." }, 400);
    const body = new Uint8Array(await req.arrayBuffer());
    const expected = n < meta.chunks - 1 ? meta.chunkSize : meta.size - meta.chunkSize * (meta.chunks - 1);
    if (body.byteLength !== expected) return json({ error: "Upload chunk size mismatch." }, 400);
    await s.set(`c/${id}/${n}`, new Blob([body]));
    return json({ ok: true });
  }

  if (req.method === "POST" && action === "done") {
    const meta = await s.get(`meta/${id}`, { type: "json" });
    if (!meta) return json({ error: "Upload not found." }, 404);
    const { blobs } = await s.list({ prefix: `c/${id}/` });
    if (blobs.length !== meta.chunks) return json({ error: "The upload did not finish. Please try again." }, 400);
    meta.complete = true;
    await s.setJSON(`meta/${id}`, meta);
    return json({ id, kind: meta.kind });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/media" };
