import { json, store, requireAdmin, authorised, wrongPassword, allow, clean, newId, deleteMedia } from "../lib/shared.mjs";

// Messages carried over from the first version of the memorial page.
const SEED = [
  {
    id: "mw0rs824j73v0",
    name: "Dr Dr Benadette Aineamani",
    rel: "Daughter",
    text: "Dear mom, It’s been over 30 years but the beautiful memories of you still remain with me.",
    at: "2026-11-03T14:15:11.309Z",
    media: []
  }
];
const KEY = "messages";
const PENDING = "pending";

const loadApproved = async (s) => {
  const v = await s.get(KEY, { type: "json" });
  return Array.isArray(v) ? v : SEED.slice();
};
const loadPending = async (s) => {
  const v = await s.get(PENDING, { type: "json" });
  return Array.isArray(v) ? v : [];
};

export default async (req, context) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const s = store("memorial-messages");
  const ms = store("memorial-media");

  // Everyone: read the approved wall.
  if (req.method === "GET" && !url.searchParams.has("pending")) return json({ messages: await loadApproved(s) });

  // Everyone: write in the Memory Book. All posts wait in the approval queue.
  if (req.method === "POST" && !action) {
    if (wrongPassword(req)) return json({ error: "unauthorised" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Please add your name and a message." }, 400); }
    const name = clean(body.name, 60);
    const rel = clean(body.rel, 60);
    const text = clean(body.text, 800);
    const ids = Array.isArray(body.media) ? body.media.slice(0, 12).map((x) => clean(x, 40)) : [];
    const media = [];
    for (const id of ids) {
      const meta = await ms.get(`meta/${id}`, { type: "json" });
      if (meta && meta.complete) media.push({ id, kind: meta.kind, type: meta.type, size: meta.size });
    }
    if (!name) return json({ error: "Please add your name." }, 400);
    if (!text && !media.length) return json({ error: "Please write a message or add a photo, voice note or video." }, 400);
    const entry = { id: newId(), name, rel, text, media, at: new Date().toISOString() };

    // Every message, including those from the family, waits for approval before it is shown.
    const admin = authorised(req);
    if (!admin && !(await allow(s, req, context, "msg", 5, 3600e3)))
      return json({ error: "Thank you for your messages. Please wait a little while before sending another." }, 429);
    const pending = await loadPending(s);
    if (pending.length >= 500) return json({ error: "The Memory Book is very full right now. Please try again later." }, 429);
    pending.push(entry);
    await s.setJSON(PENDING, pending);
    return json(admin ? { queued: true, pending } : { queued: true });
  }

  // Family only from here.
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "GET") return json({ pending: await loadPending(s) });

  if (req.method === "POST" && (action === "approve" || action === "reject")) {
    const id = url.searchParams.get("id");
    const pending = await loadPending(s);
    const item = pending.find((m) => m.id === id);
    if (!item) return json({ error: "That message is no longer waiting for approval." }, 404);
    const rest = pending.filter((m) => m.id !== id);
    let messages = await loadApproved(s);
    if (action === "approve") {
      item.approvedAt = new Date().toISOString();
      messages.push(item);
      await s.setJSON(KEY, messages);
    } else {
      for (const m of item.media || []) await deleteMedia(ms, m.id);
    }
    await s.setJSON(PENDING, rest);
    return json({ messages, pending: rest });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing message id." }, 400);
    const all = await loadApproved(s);
    const gone = all.find((m) => m.id === id);
    const messages = all.filter((m) => m.id !== id);
    await s.setJSON(KEY, messages);
    if (gone && Array.isArray(gone.media)) for (const m of gone.media) await deleteMedia(ms, m.id);
    return json({ messages });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/messages" };
