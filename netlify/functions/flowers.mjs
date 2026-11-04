import { json, store, requireAdmin, clean, newId, clientKey } from "../lib/shared.mjs";

const TYPES = ["lily", "rose", "tulip", "daisy", "lavender", "orchid"];
const COLORS = ["pink", "blue", "green", "white", "purple", "red", "yellow", "peach"];
const WRAPS = ["ivory", "blue", "sage", "lilac", "gold"];
const KEY = "flowers";
const PER_HOUR = 8;

const load = async (s) => {
  const v = await s.get(KEY, { type: "json" });
  return Array.isArray(v) ? v : [];
};

export default async (req, context) => {
  const url = new URL(req.url);
  const s = store("memorial-flowers");

  if (req.method === "GET") return json({ flowers: await load(s) });

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "Please choose a flower and add your name." }, 400); }
    const name = clean(b.name, 40);
    const note = clean(b.note, 140);
    const ok = (x) => x && TYPES.includes(x.type) && COLORS.includes(x.color);
    let entry;
    if (Array.isArray(b.stems)) {
      const stems = b.stems.slice(0, 9).filter(ok).map((x) => ({ type: x.type, color: x.color }));
      if (stems.length < 2) return json({ error: "A bunch needs at least two flowers." }, 400);
      const wrap = WRAPS.includes(b.wrap) ? b.wrap : "ivory";
      entry = { type: stems[0].type, color: stems[0].color, stems, wrap };
    } else if (ok(b)) {
      entry = { type: b.type, color: b.color };
    } else {
      return json({ error: "Please choose a flower and a colour, and add your name." }, 400);
    }
    if (!name) return json({ error: "Please add your name." }, 400);

    const rk = "rl/" + clientKey(req, context);
    const now = Date.now();
    const hits = ((await s.get(rk, { type: "json" })) || []).filter((t) => now - t < 3600e3);
    if (hits.length >= PER_HOUR) return json({ error: "Thank you for your love. Please wait a little while before placing another flower." }, 429);
    hits.push(now);
    await s.setJSON(rk, hits);

    const flowers = await load(s);
    const f = { id: newId(), ...entry, name, note, at: new Date().toISOString() };
    flowers.push(f);
    if (flowers.length > 3000) flowers.splice(0, flowers.length - 3000);
    await s.setJSON(KEY, flowers);
    return json({ flowers, id: f.id });
  }

  if (req.method === "DELETE") {
    const denied = requireAdmin(req);
    if (denied) return denied;
    const id = url.searchParams.get("id");
    const flowers = (await load(s)).filter((f) => f.id !== id);
    await s.setJSON(KEY, flowers);
    return json({ flowers });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/flowers" };
