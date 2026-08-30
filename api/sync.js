// Vercel Serverless Function: /api/sync
// GET  /api/sync?code=ABC123        -> returns { data: {...} } or { data: null }
// POST /api/sync  { code, data }    -> upserts the blob for that code
//
// Requires two environment variables set in the Vercel project:
//   SUPABASE_URL          - your Supabase project URL
//   SUPABASE_SERVICE_KEY  - your Supabase service_role key (NOT the anon key —
//                            this must stay server-side only, which is exactly
//                            what a Vercel Function gives you)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function isValidCode(code) {
  return typeof code === "string" && /^[A-Z0-9]{6,10}$/.test(code);
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: "Server is missing SUPABASE_URL / SUPABASE_SERVICE_KEY env vars." });
    return;
  }

  const restUrl = `${SUPABASE_URL}/rest/v1/sync_data`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  if (req.method === "GET") {
    const code = (req.query.code || "").toUpperCase();
    if (!isValidCode(code)) {
      res.status(400).json({ error: "Invalid or missing sync code." });
      return;
    }
    try {
      const r = await fetch(`${restUrl}?code=eq.${code}&select=data,updated_at`, { headers });
      if (!r.ok) throw new Error(`Supabase GET failed: ${r.status}`);
      const rows = await r.json();
      res.status(200).json({ data: rows[0]?.data ?? null, updatedAt: rows[0]?.updated_at ?? null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const code = (body?.code || "").toUpperCase();
    const data = body?.data;
    if (!isValidCode(code)) {
      res.status(400).json({ error: "Invalid or missing sync code." });
      return;
    }
    if (typeof data !== "object" || data === null) {
      res.status(400).json({ error: "Missing data payload." });
      return;
    }
    try {
      const r = await fetch(`${restUrl}?on_conflict=code`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{ code, data, updated_at: new Date().toISOString() }]),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`Supabase POST failed: ${r.status} ${text}`);
      }
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
