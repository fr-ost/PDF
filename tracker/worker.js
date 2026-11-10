/**
 * Unique PDF usage tracker (Cloudflare Workers + D1)
 * ------------------------------------------------------------------
 * Anonymous, aggregate usage numbers for the Unique PDF Chrome extension,
 * with a built-in dashboard: users per day / week / month, which tools are
 * used and how often, Unique AI questions, time the app is open, installs,
 * updates and uninstalls, how long people keep the extension, versions,
 * country, OS, browser language and whether Chrome's built-in AI is
 * available on the device.
 *
 * Stats are OFF in the extension until the user turns them on (Settings ->
 * Privacy, or the one-time "Help improve Unique PDF" card). Installs that
 * never opted in send nothing at all, so every number here counts opted-in
 * installs only.
 *
 * It NEVER receives or stores documents, file names, file sizes, page
 * content, AI questions or answers, settings, names, emails or IP addresses.
 * The only id is a random number each install makes up for itself (deleted
 * when the user turns stats off). Country is Cloudflare's 2-letter country
 * code of the request (request.cf.country); the IP itself is never read.
 *
 * Endpoints
 *   POST /e            an event from the extension (see EVENT BODY)
 *   GET  /u?id=&v=     uninstall ping (chrome.runtime.setUninstallURL, only
 *                      set while stats are on)
 *   GET  /             the dashboard (HTML)
 *   GET  /api/stats    aggregate numbers as JSON (?days=7|30|90|365)
 *   GET  /health       "ok"
 *
 * If the STATS_KEY secret is set, the dashboard asks for it and /api/stats
 * requires it (header x-stats-key or ?key=).
 *
 * EVENT BODY (all fields optional except ev and id; unknown fields are ignored)
 *   ev  "install" | "update" | "active" | "usage"
 *   id  random install id (hex)          v   extension version
 *   pv  previous version (update)        p   OS: win|mac|linux|cros|...
 *   l   browser language, e.g. "en"      ag  days since install (whole days)
 *   ai  Chrome built-in AI: available|downloadable|downloading|unavailable
 *   t   { toolId: times used } since the last event (fixed list of tool ids)
 *   q   Unique AI chat questions since the last event
 *   um  minutes the Unique PDF tab was open and visible since the last event
 *
 * Storage: a D1 database bound as DB. Tables are created automatically on
 * the first request. Daily rows are kept 400 days. Setup: README.md.
 */

const DAY = 86400000;
const EVENTS = new Set(["install", "update", "active", "usage"]);
const PLATFORMS = new Set(["win", "mac", "linux", "cros", "android", "openbsd", "fuchsia", "other"]);
const AI_STATES = new Set(["available", "downloadable", "downloading", "unavailable"]);
// Tool ids of the extension (src/features/registry.ts). Anything else is dropped.
const TOOLS = new Set([
  "merge", "split", "organize", "rotate", "reorder", "delete-pages", "extract", "compress",
  "images-to-pdf", "pdf-to-images", "edit", "sign", "watermark", "page-numbers", "protect",
  "unlock", "redact", "ai-chat", "ai-summary", "metadata"
]);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-stats-key",
  "access-control-max-age": "86400"
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10); // UTC YYYY-MM-DD
const clean = (v, max = 24) => String(v == null ? "" : v).replace(/[^\w.+-]/g, "").slice(0, max);
const version = (v) => (/^\d{1,4}(\.\d{1,5}){0,3}$/.test(String(v || "")) ? String(v) : "");
const anonId = (v) => (/^[a-f0-9]{16,64}$/i.test(String(v || "")) ? String(v).toLowerCase() : "");
const int = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
const country = (req) => { const c = String((req.cf && req.cf.country) || "").toUpperCase(); return /^[A-Z][A-Z0-9]$/.test(c) ? c : "XX"; };

/** Tool counts from the event, limited to known tools and sane numbers. */
function toolCounts(t) {
  const out = [];
  if (!t || typeof t !== "object" || Array.isArray(t)) return out;
  for (const [k, v] of Object.entries(t)) {
    const n = int(v, 500);
    if (TOOLS.has(k) && n) out.push([k, n]);
  }
  return out;
}

// ------------------------------------------------------------------ schema
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS installs (
     id TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
     v TEXT, p TEXT, l TEXT, c TEXT, ai TEXT, uninstalled_at INTEGER, uninstall_v TEXT,
     tasks INTEGER DEFAULT 0, questions INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS daily (
     day TEXT NOT NULL, id TEXT NOT NULL,
     tasks INTEGER DEFAULT 0, questions INTEGER DEFAULT 0, ui_min INTEGER DEFAULT 0,
     v TEXT, p TEXT, c TEXT, PRIMARY KEY (day, id))`,
  `CREATE TABLE IF NOT EXISTS tool_daily (day TEXT NOT NULL, tool TEXT NOT NULL, id TEXT NOT NULL, n INTEGER DEFAULT 0, PRIMARY KEY (day, tool, id))`,
  `CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, ev TEXT NOT NULL, n INTEGER DEFAULT 0, PRIMARY KEY (day, ev))`,
  `CREATE INDEX IF NOT EXISTS daily_day ON daily(day)`,
  `CREATE INDEX IF NOT EXISTS tool_daily_day ON tool_daily(day)`,
  `CREATE INDEX IF NOT EXISTS installs_unin ON installs(uninstalled_at)`
];
const schemaReady = new WeakSet(); // once per database binding per isolate
async function ensureSchema(db) {
  if (schemaReady.has(db)) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady.add(db);
}

// ------------------------------------------------------------------ writes
async function record(env, req, body, now) {
  const db = env.DB;
  const ev = String(body.ev || "");
  const id = anonId(body.id);
  if (!EVENTS.has(ev) || !id) return false;
  const day = dayOf(now);
  const v = version(body.v);
  const p = PLATFORMS.has(body.p) ? body.p : body.p ? "other" : "";
  const l = clean(body.l, 8).toLowerCase();
  const ai = AI_STATES.has(body.ai) ? body.ai : "";
  const c = country(req);
  const tools = toolCounts(body.t);
  const tasks = Math.min(5000, tools.reduce((a, [, n]) => a + n, 0));
  const q = int(body.q, 5000);
  const um = int(body.um, 1440);
  const firstSeen = now - int(body.ag, 3650) * DAY;

  const stmts = [
    db.prepare(`INSERT INTO installs (id, first_seen, last_seen, v, p, l, c, ai, tasks, questions)
                VALUES (?1, ?2, ?3, NULLIF(?4, ''), COALESCE(NULLIF(?5, ''), 'other'), COALESCE(NULLIF(?6, ''), 'other'), ?7, NULLIF(?8, ''), ?9, ?10)
                ON CONFLICT(id) DO UPDATE SET last_seen = ?3, v = COALESCE(NULLIF(?4, ''), v), p = COALESCE(NULLIF(?5, ''), p),
                  l = COALESCE(NULLIF(?6, ''), l), c = ?7, ai = COALESCE(NULLIF(?8, ''), ai),
                  tasks = tasks + ?9, questions = questions + ?10, first_seen = MIN(first_seen, ?2)`)
      .bind(id, firstSeen, now, v, p, l, c, ai, tasks, q),
    db.prepare(`INSERT INTO daily (day, id, tasks, questions, ui_min, v, p, c)
                VALUES (?1, ?2, ?3, ?4, ?5,
                  COALESCE(NULLIF(?6, ''), (SELECT v FROM installs WHERE id = ?2)),
                  COALESCE(NULLIF(?7, ''), (SELECT p FROM installs WHERE id = ?2), 'other'), ?8)
                ON CONFLICT(day, id) DO UPDATE SET tasks = tasks + ?3, questions = questions + ?4,
                  ui_min = MIN(1440, ui_min + ?5), v = COALESCE(NULLIF(?6, ''), v), p = COALESCE(NULLIF(?7, ''), p), c = ?8`)
      .bind(day, id, tasks, q, um, v, p, c)
  ];
  for (const [tool, n] of tools) {
    stmts.push(db.prepare(`INSERT INTO tool_daily (day, tool, id, n) VALUES (?1, ?2, ?3, ?4)
                           ON CONFLICT(day, tool, id) DO UPDATE SET n = n + ?4`).bind(day, tool, id, n));
  }
  if (ev === "install" || ev === "update") {
    stmts.push(db.prepare(`INSERT INTO counts (day, ev, n) VALUES (?1, ?2, 1) ON CONFLICT(day, ev) DO UPDATE SET n = n + 1`).bind(day, ev));
  }
  if (ev === "install") stmts.push(db.prepare(`UPDATE installs SET uninstalled_at = NULL, uninstall_v = NULL WHERE id = ?1`).bind(id));
  await db.batch(stmts);
  return true;
}

async function recordUninstall(env, url, now) {
  const db = env.DB;
  const id = anonId(url.searchParams.get("id"));
  if (!id) return false;
  const v = version(url.searchParams.get("v"));
  const res = await db.batch([
    db.prepare(`UPDATE installs SET uninstalled_at = ?2, uninstall_v = NULLIF(?3, '') WHERE id = ?1 AND uninstalled_at IS NULL`).bind(id, now, v)
  ]);
  const first = !!(res[0] && res[0].meta && res[0].meta.changes > 0);
  // Count each install's uninstall once (reloading the page doesn't count again).
  if (first) await db.prepare(`INSERT INTO counts (day, ev, n) VALUES (?1, 'uninstall', 1) ON CONFLICT(day, ev) DO UPDATE SET n = n + 1`).bind(dayOf(now)).run();
  return first;
}

// Keep the database small: per-day rows older than 400 days go.
async function prune(env, now) {
  const cutoff = dayOf(now - 400 * DAY);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM daily WHERE day < ?1`).bind(cutoff),
    env.DB.prepare(`DELETE FROM tool_daily WHERE day < ?1`).bind(cutoff),
    env.DB.prepare(`DELETE FROM counts WHERE day < ?1`).bind(dayOf(now - 800 * DAY))
  ]);
}

// ------------------------------------------------------------------ reads
const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

async function readStats(env, days, now = Date.now()) {
  const db = env.DB;
  const today = dayOf(now);
  const from = dayOf(now - (days - 1) * DAY);
  const d7 = dayOf(now - 6 * DAY), d30 = dayOf(now - 29 * DAY);
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
  const one = async (sql, ...args) => (await db.prepare(sql).bind(...args).first()) || {};
  const since = now - days * DAY;

  const [series, counts, totals, life, todayRow, wau, mau, tools, countries, platforms, versions, languages, ai, lifeBuckets, uninstallVersions, usageBuckets] = await Promise.all([
    all(`SELECT day, COUNT(*) AS users, SUM(tasks) AS tasks, SUM(questions) AS questions, SUM(ui_min) AS ui_min
         FROM daily WHERE day >= ?1 GROUP BY day ORDER BY day`, from),
    all(`SELECT day, ev, n FROM counts WHERE day >= ?1`, from),
    one(`SELECT COUNT(*) AS installs, SUM(CASE WHEN uninstalled_at IS NULL THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN uninstalled_at IS NOT NULL THEN 1 ELSE 0 END) AS uninstalled,
                SUM(tasks) AS tasks, SUM(questions) AS questions FROM installs`),
    one(`SELECT AVG((uninstalled_at - first_seen) / 86400000.0) AS avg_days FROM installs WHERE uninstalled_at IS NOT NULL`),
    one(`SELECT COUNT(*) AS users, SUM(tasks) AS tasks, SUM(questions) AS questions, AVG(ui_min) AS ui_avg FROM daily WHERE day = ?1`, today),
    one(`SELECT COUNT(DISTINCT id) AS n FROM daily WHERE day >= ?1`, d7),
    one(`SELECT COUNT(DISTINCT id) AS n FROM daily WHERE day >= ?1`, d30),
    all(`SELECT tool AS k, SUM(n) AS n, COUNT(DISTINCT id) AS users FROM tool_daily WHERE day >= ?1 GROUP BY tool ORDER BY n DESC`, from),
    all(`SELECT c AS k, COUNT(DISTINCT id) AS n, SUM(tasks) AS tasks FROM daily WHERE day >= ?1 GROUP BY c ORDER BY n DESC LIMIT 40`, from),
    all(`SELECT p AS k, COUNT(DISTINCT id) AS n FROM daily WHERE day >= ?1 GROUP BY p ORDER BY n DESC`, from),
    all(`SELECT v AS k, COUNT(DISTINCT id) AS n FROM daily WHERE day >= ?1 GROUP BY v ORDER BY n DESC LIMIT 12`, from),
    all(`SELECT l AS k, COUNT(*) AS n FROM installs WHERE last_seen >= ?1 GROUP BY l ORDER BY n DESC LIMIT 15`, since),
    all(`SELECT COALESCE(ai, 'unknown') AS k, COUNT(*) AS n FROM installs WHERE last_seen >= ?1 GROUP BY k ORDER BY n DESC`, since),
    all(`SELECT CASE WHEN d < 1 THEN '< 1 day' WHEN d < 3 THEN '1-3 days' WHEN d < 7 THEN '3-7 days'
                     WHEN d < 30 THEN '1-4 weeks' WHEN d < 90 THEN '1-3 months' ELSE '3+ months' END AS k, COUNT(*) AS n
         FROM (SELECT (uninstalled_at - first_seen) / 86400000.0 AS d FROM installs WHERE uninstalled_at IS NOT NULL) GROUP BY k`),
    all(`SELECT COALESCE(uninstall_v, '?') AS k, COUNT(*) AS n FROM installs WHERE uninstalled_at >= ?1 GROUP BY k ORDER BY n DESC LIMIT 10`, since),
    all(`SELECT CASE WHEN ui_min = 0 THEN 'under 1 min' WHEN ui_min < 5 THEN '1-5 min' WHEN ui_min < 15 THEN '5-15 min'
                     WHEN ui_min < 60 THEN '15-60 min' ELSE '1 h+' END AS k, COUNT(*) AS n
         FROM daily WHERE day >= ?1 GROUP BY k`, from)
  ]);

  // A full, gap-free day axis for the charts.
  const byDay = new Map(series.map((r) => [r.day, r]));
  const ev = {};
  for (const r of counts) (ev[r.day] = ev[r.day] || {})[r.ev] = r.n;
  const daysOut = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOf(now - i * DAY), r = byDay.get(d) || {}, e = ev[d] || {};
    daysOut.push({
      day: d, users: r.users || 0, tasks: r.tasks || 0, questions: r.questions || 0, uiMin: r.ui_min || 0,
      installs: e.install || 0, updates: e.update || 0, uninstalls: e.uninstall || 0
    });
  }
  const sum = (k) => daysOut.reduce((a, r) => a + r[k], 0);
  const userDays = sum("users");
  return {
    ok: true, at: new Date(now).toISOString(), days,
    today: {
      users: todayRow.users || 0, tasks: todayRow.tasks || 0, questions: todayRow.questions || 0, uiAvg: round1(todayRow.ui_avg),
      installs: (ev[today] || {}).install || 0, uninstalls: (ev[today] || {}).uninstall || 0
    },
    totals: {
      installs: totals.installs || 0, active: totals.active || 0, uninstalled: totals.uninstalled || 0,
      tasks: totals.tasks || 0, questions: totals.questions || 0,
      wau: wau.n || 0, mau: mau.n || 0, avgLifeDays: round1(life.avg_days)
    },
    range: {
      tasks: sum("tasks"), questions: sum("questions"), installs: sum("installs"), updates: sum("updates"), uninstalls: sum("uninstalls"),
      avgUsers: Math.round(userDays / days), uiAvg: userDays ? round1(sum("uiMin") / userDays) : 0
    },
    series: daysOut, tools, countries, platforms, versions, languages, ai, lifeBuckets, uninstallVersions, usageBuckets
  };
}

function authorized(env, req, url) {
  if (!env.STATS_KEY) return true;
  const k = req.headers.get("x-stats-key") || url.searchParams.get("key") || "";
  return k === env.STATS_KEY;
}

// ------------------------------------------------------------------ router
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const now = Date.now();
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health") return new Response("ok", { headers: CORS });
    if ((path === "/" || path === "/dashboard") && req.method === "GET") {
      return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer", "x-frame-options": "DENY" } });
    }

    if (!env.DB) {
      return json({ ok: false, error: "No D1 database is attached. In this Worker: Settings -> Bindings -> Add -> D1 database, variable name DB. See README.md." }, 503);
    }
    try { await ensureSchema(env.DB); } catch (e) { return json({ ok: false, error: "Database setup failed: " + ((e && e.message) || e) }, 500); }

    if (path === "/e" && req.method === "POST") {
      const text = await req.text();
      if (text.length > 4096) return json({ ok: false, error: "too large" }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ ok: false, error: "bad json" }, 400); }
      if (!body || typeof body !== "object" || !EVENTS.has(String(body.ev || "")) || !anonId(body.id)) return json({ ok: false, error: "bad event" }, 400);
      try { await record(env, req, body, now); } catch (e) { console.error("record failed", e && e.message); return json({ ok: false, error: "server error" }, 500); }
      if (Math.random() < 0.005 && ctx) ctx.waitUntil(prune(env, now).catch(() => {}));
      return json({ ok: true });
    }
    if (path === "/u" && req.method === "GET") {
      try { await recordUninstall(env, url, now); } catch { /* still show the page */ }
      return new Response(UNINSTALL_HTML, { headers: { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
    }
    if ((path === "/api/stats" || path === "/stats") && req.method === "GET") {
      if (!authorized(env, req, url)) return json({ ok: false, error: "unauthorized", needKey: true }, 401);
      const days = [7, 30, 90, 365].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
      try { return json(await readStats(env, days, now)); } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }, 500); }
    }
    return json({ ok: false, error: "not found" }, 404);
  }
};

// ------------------------------------------------------------------ pages
const UNINSTALL_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unique PDF was removed</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f7f7fb;color:#14141f}
@media(prefers-color-scheme:dark){body{background:#0b0b14;color:#ececf4}a{color:#8c9fff!important}}main{max-width:480px;padding:24px;text-align:center}
.logo{width:56px;height:56px;border-radius:16px;margin:0 auto 18px;background:linear-gradient(135deg,#4660ff,#7448ff 60%,#9a45f5);display:grid;place-items:center}
h1{font-size:24px;margin:0 0 8px;letter-spacing:-.02em}a{color:#4f5bff;font-weight:600}</style></head>
<body><main><div class="logo"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg></div>
<h1>Unique PDF was removed</h1><p>Thanks for trying Unique PDF. If something didn't work for you, please tell us. It helps make it better for everyone.</p>
<p><a href="https://t.me/igfrostt">Send feedback on Telegram</a> &middot; <a href="https://pdf.uniquelabs.org">pdf.uniquelabs.org</a></p>
<p><a href="https://chromewebstore.google.com/detail/ogajiapfmheeiadeflajlkikpfkoobfl">Reinstall from the Chrome Web Store</a></p></main></body></html>`;

const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Unique PDF Tracker</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234660ff'/%3E%3Cstop offset='1' stop-color='%239a45f5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Cpath d='M11 8h7l4 4v12H11z' fill='none' stroke='%23fff' stroke-width='2.2' stroke-linejoin='round'/%3E%3C/svg%3E">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
:root {
  color-scheme: light;
  --bg: #f7f7fb; --surface: #ffffff; --surface-2: #f1f2fa; --border: #e4e5f0;
  --text: #14141f; --text-2: #4a4a5c; --muted: #666672;
  --brand: #5b5bff; --brand-2: #9a45f5; --brand-text: #3d4ed8;
  --s1: #4660ff; --s2: #e0569b; --s3: #0ea5a4;
  --grid: rgba(20,20,31,.07);
  --shadow: 0 1px 2px rgba(20,20,31,.05), 0 10px 28px -14px rgba(70,96,255,.25);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0b0b14; --surface: #14141f; --surface-2: #1b1b29; --border: #272738;
    --text: #ececf4; --text-2: #c2c2d4; --muted: #8e8ea0;
    --brand: #7c86ff; --brand-2: #b07cff; --brand-text: #a5adff;
    --s1: #6f86ff; --s2: #f07ab5; --s3: #2dd4bf; --grid: rgba(236,236,244,.08);
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px -14px rgba(0,0,0,.6);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0b0b14; --surface: #14141f; --surface-2: #1b1b29; --border: #272738;
  --text: #ececf4; --text-2: #c2c2d4; --muted: #8e8ea0;
  --brand: #7c86ff; --brand-2: #b07cff; --brand-text: #a5adff;
  --s1: #6f86ff; --s2: #f07ab5; --s3: #2dd4bf; --grid: rgba(236,236,244,.08);
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px -14px rgba(0,0,0,.6);
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--text); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 20px 16px 48px; }
header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.logo { width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(135deg, #4660ff, #7448ff 60%, #9a45f5); display: grid; place-items: center; box-shadow: 0 6px 18px -6px #5b5bff; }
.logo svg { width: 21px; height: 21px; }
h1 { font-size: 20px; margin: 0; letter-spacing: -.01em; }
h1 small { display: block; font-size: 12.5px; font-weight: 500; color: var(--muted); letter-spacing: 0; }
.grow { flex: 1; }
.seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 11px; background: var(--surface); border: 1px solid var(--border); }
.seg button { border: 0; background: transparent; color: var(--text-2); font: inherit; font-weight: 650; font-size: 12.5px; height: 30px; padding: 0 12px; border-radius: 8px; cursor: pointer; }
.seg button.on { background: linear-gradient(135deg, #4660ff, #7448ff); color: #fff; }
.btn { border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-weight: 650; height: 36px; min-width: 36px; padding: 0 12px; border-radius: 10px; cursor: pointer; }
.btn:hover { border-color: var(--brand); color: var(--brand-text); }
button:focus-visible, a:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr)); gap: 12px; margin-bottom: 14px; }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px 16px; box-shadow: var(--shadow); min-width: 0; }
.kpi span { display: block; font-size: 12px; font-weight: 650; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.kpi b { display: block; font-size: 28px; line-height: 1.15; margin-top: 4px; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.kpi em { display: block; font-style: normal; font-size: 12.5px; color: var(--text-2); margin-top: 2px; }
.kpi.hero { background: linear-gradient(135deg, #4660ff 0%, #7448ff 60%, #9a45f5 100%); border-color: transparent; color: #fff; }
.kpi.hero span, .kpi.hero em { color: rgba(255,255,255,.88); }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px; box-shadow: var(--shadow); min-width: 0; grid-column: span 6; }
.card.w12 { grid-column: span 12; } .card.w8 { grid-column: span 8; } .card.w4 { grid-column: span 4; }
.card h2 { font-size: 14.5px; margin: 0 0 2px; }
.card p.sub { margin: 0 0 12px; color: var(--muted); font-size: 12.5px; }
.chart { position: relative; height: 240px; }
.chart.tall { height: 380px; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--text-2); margin: -4px 0 8px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
td.n, th.n { text-align: right; }
.scroll { max-height: 340px; overflow: auto; }
.login { max-width: 380px; margin: 12vh auto; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 24px; box-shadow: var(--shadow); text-align: center; }
.login label { display: block; text-align: left; font-weight: 650; font-size: 13px; margin-top: 14px; }
.login input { width: 100%; height: 42px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); padding: 0 12px; font: inherit; margin: 6px 0 12px; }
.login button { width: 100%; height: 42px; border: 0; border-radius: 10px; background: linear-gradient(135deg, #4660ff, #7448ff); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.err { color: #cf2e31; font-weight: 600; }
:root[data-theme="dark"] .err { color: #ff8a8c; }
.note { color: var(--muted); font-size: 12.5px; margin-top: 16px; text-align: center; }
.note a { color: var(--brand-text); }
.empty { color: var(--muted); padding: 24px 0; text-align: center; }
details.tbl { margin-top: 10px; } details.tbl summary { cursor: pointer; color: var(--text-2); font-size: 12.5px; font-weight: 650; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 900px) { .card, .card.w8, .card.w4 { grid-column: span 12; } }
@media (max-width: 520px) { .kpi { padding: 12px; } .kpi b { font-size: 22px; } .kpi em { font-size: 11.5px; } .chart { height: 210px; } }
</style>
</head>
<body>
<div class="wrap" id="app">
  <header>
    <div class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg></div>
    <h1>Unique PDF Tracker<small id="stamp">Anonymous, aggregate usage from installs that turned stats on</small></h1>
    <div class="grow"></div>
    <div class="seg" id="range" role="group" aria-label="Period"><button data-d="7" aria-pressed="false">7 days</button><button data-d="30" class="on" aria-pressed="true">30 days</button><button data-d="90" aria-pressed="false">90 days</button><button data-d="365" aria-pressed="false">1 year</button></div>
    <button class="btn" id="theme" title="Light / dark" aria-label="Switch light or dark theme">&#9681;</button>
    <button class="btn" id="reload" title="Refresh" aria-label="Refresh">&#8635;</button>
  </header>
  <main id="body"><div class="empty">Loading...</div></main>
</div>
<script>
(function () {
  "use strict";
  var KEY = "uniquepdf.statsKey", THEME = "uniquepdf.theme";
  var days = 30, charts = [], last = null;
  var $ = function (s) { return document.querySelector(s); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
  var t = store.get(THEME); if (t) document.documentElement.setAttribute("data-theme", t);
  var fmt = function (n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "k" : n.toLocaleString(); };
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + "%" : "-"; };
  var mins = function (m) { m = Number(m) || 0; return m >= 60 ? (m / 60).toFixed(1) + " h" : (Math.round(m * 10) / 10) + " min"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  var regionName = (function () { try { var d = new Intl.DisplayNames(["en"], { type: "region" }); return function (c) { try { return d.of(c); } catch (e) { return c; } }; } catch (e) { return function (c) { return c; }; } })();
  var langName = (function () { try { var d = new Intl.DisplayNames(["en"], { type: "language" }); return function (c) { try { return c === "other" ? "Other" : d.of(c); } catch (e) { return c; } }; } catch (e) { return function (c) { return c; }; } })();
  var flag = function (c) { return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? String.fromCodePoint.apply(null, c.split("").map(function (x) { return 127397 + x.charCodeAt(0); })) : "\u{1F310}"; };
  var OS = { win: "Windows", mac: "macOS", linux: "Linux", cros: "ChromeOS", android: "Android", openbsd: "OpenBSD", fuchsia: "Fuchsia", other: "Other" };
  var AI = { available: "Ready", downloadable: "Needs download", downloading: "Downloading", unavailable: "Not supported", unknown: "Not reported" };
  var TOOL = { "merge": "Merge", "split": "Split", "organize": "Organize pages", "rotate": "Rotate", "reorder": "Reorder", "delete-pages": "Delete pages", "extract": "Extract pages",
    "compress": "Compress", "images-to-pdf": "Images to PDF", "pdf-to-images": "PDF to images", "edit": "Edit PDF", "sign": "Sign", "watermark": "Watermark",
    "page-numbers": "Page numbers", "protect": "Protect", "unlock": "Unlock", "redact": "Redact", "ai-chat": "Chat with PDF", "ai-summary": "AI summary", "metadata": "Metadata" };

  function load() {
    var key = store.get(KEY) || "";
    fetch("api/stats?days=" + days, { headers: key ? { "x-stats-key": key } : {} })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (res) {
        if (res.s === 401) return login(key ? "That key didn't work." : "");
        if (!res.j.ok) { $("#body").innerHTML = '<div class="login"><h2>Not ready yet</h2><p class="err">' + esc(res.j.error) + '</p></div>'; return; }
        last = res.j; render(res.j);
      })
      .catch(function (e) { $("#body").innerHTML = '<div class="login"><p class="err">Couldn\'t load the numbers: ' + esc(e.message) + '</p></div>'; });
  }

  function login(msg) {
    $("#body").innerHTML = '<form class="login" id="lf"><h2 style="margin:0">Enter your stats key</h2><p style="color:var(--muted);margin:6px 0 0">The STATS_KEY secret you set on this Worker.</p>' +
      '<label for="k">Stats key</label><input type="password" id="k" autocomplete="current-password" required>' + (msg ? '<p class="err" role="alert">' + esc(msg) + '</p>' : "") + '<button>Open dashboard</button></form>';
    $("#lf").addEventListener("submit", function (e) { e.preventDefault(); store.set(KEY, $("#k").value); load(); });
    $("#k").focus();
  }

  function kpi(label, value, sub, hero) { return '<div class="kpi' + (hero ? " hero" : "") + '"><span>' + label + '</span><b>' + value + '</b>' + (sub ? "<em>" + sub + "</em>" : "") + "</div>"; }
  function card(id, title, sub, w, legend, tall) { return '<section class="card ' + (w || "") + '" aria-labelledby="' + id + 'H"><h2 id="' + id + 'H">' + title + '</h2><p class="sub">' + sub + '</p>' + (legend || "") + '<div class="chart' + (tall ? " tall" : "") + '"><canvas id="' + id + '" role="img" aria-label="' + esc(title) + ' chart. Exact numbers are in the table below."></canvas></div><details class="tbl"><summary>Show as table</summary><div class="scroll" id="' + id + 'T"></div></details></section>'; }
  function leg(items) { return '<div class="legend">' + items.map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[0] + "</span>"; }).join("") + "</div>"; }
  function tableOf(head, rows) { return "<table><thead><tr>" + head.map(function (h, i) { return '<th scope="col"' + (i ? ' class="n"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (i ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"; }

  function render(d) {
    charts.forEach(function (c) { c.destroy(); }); charts = [];
    var T = d.today, A = d.totals, R = d.range;
    var aiReady = (d.ai.filter(function (x) { return x.k === "available"; })[0] || { n: 0 }).n;
    var aiAll = d.ai.reduce(function (a, x) { return a + x.n; }, 0);
    var top = d.tools[0];
    $("#stamp").textContent = "Updated " + new Date(d.at).toLocaleString() + " - anonymous, aggregate, opted-in installs only";
    var html = '<h2 class="sr">Key numbers</h2><div class="kpis">' +
      kpi("Users today", fmt(T.users), fmt(R.avgUsers) + " a day on average (" + d.days + " d)", true) +
      kpi("Tasks today", fmt(T.tasks), fmt(R.tasks) + " in " + d.days + " days") +
      kpi("AI questions today", fmt(T.questions), fmt(R.questions) + " in " + d.days + " days") +
      kpi("Avg time open", mins(T.uiAvg), "per user today · " + mins(R.uiAvg) + " avg (" + d.days + " d)") +
      kpi("Weekly users", fmt(A.wau), fmt(A.mau) + " monthly") +
      kpi("Top tool", top ? esc(TOOL[top.k] || top.k) : "-", top ? fmt(top.n) + " uses by " + fmt(top.users) + " users" : "no tasks yet") +
      kpi("Opted-in installs", fmt(A.installs), fmt(A.active) + " still installed · +" + T.installs + " today") +
      kpi("Uninstalls", fmt(A.uninstalled), (T.uninstalls ? T.uninstalls + " today · " : "") + "avg kept " + (A.avgLifeDays ? A.avgLifeDays + " days" : "-")) +
      kpi("All-time tasks", fmt(A.tasks), fmt(A.questions) + " AI questions") +
      kpi("Chrome AI ready", pct(aiReady, aiAll), fmt(aiReady) + " of " + fmt(aiAll) + " active installs") +
      "</div><div class='grid'>" +
      card("cUsers", "Daily users", "Opted-in installs that used Unique PDF each day (UTC).", "w8") +
      card("cUsage", "Time open per user", "Average minutes the Unique PDF tab was open and visible, per user and day.", "w4") +
      card("cTools", "Tools used", "Times each tool finished a task in the period, and how many users used it.", "w12", leg([["Uses", css("--s1")], ["Users", css("--s3")]]), true) +
      card("cTasks", "Tasks and AI questions", "All users combined, per day. A task is a finished tool run (a saved file, a summary, a first chat answer about a document).", "w8", leg([["Tasks", css("--s1")], ["AI questions", css("--s2")]])) +
      card("cAi", "Chrome built-in AI", "Whether Unique AI's model is available on the device (installs active in the period).", "w4") +
      card("cInst", "Installs and uninstalls", "Opted-in installs per day, and Chrome's uninstall ping (sent only while stats are on).", "w8", leg([["Installs", css("--s1")], ["Uninstalls", css("--s2")]])) +
      card("cLife", "Kept for how long", "Time from install to uninstall.", "w4") +
      card("cCountry", "Countries", "Users in the period, by Cloudflare's country code.", "w8", "", true) +
      card("cOS", "Device platform", "Operating system of users in the period.", "w4", "", true) +
      card("cVer", "Versions in use", "Extension version of users in the period.", "w4") +
      card("cBucket", "Daily usage time", "How long the tab is open on a day it is used.", "w4") +
      card("cLang", "Languages", "Browser language of installs active in the period.", "w4") +
      "</div><p class='note'>No documents, file names, AI questions, emails or IP addresses are ever sent. Each install is a random id, and stats are off until the user turns them on. " +
      (store.get(KEY) ? '<a href="#" id="logout">Forget key</a>' : "") + "</p>";
    $("#body").innerHTML = html;
    if ($("#logout")) $("#logout").addEventListener("click", function (e) { e.preventDefault(); store.del(KEY); load(); });
    draw(d);
  }

  function draw(d) {
    if (!window.Chart) { document.querySelectorAll(".chart").forEach(function (el) { el.innerHTML = '<div class="empty">Charts need cdnjs.cloudflare.com. The tables still work.</div>'; }); }
    var s = d.series, labels = s.map(function (r) { return r.day.slice(5); });
    var brand = css("--brand"), s1 = css("--s1"), s2 = css("--s2"), s3 = css("--s3"), grid = css("--grid"), ink = css("--text-2"), surf = css("--surface");
    if (window.Chart) {
      Chart.defaults.color = ink; Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.font.size = 11.5;
      Chart.defaults.plugins.legend.display = false;
      Chart.defaults.plugins.tooltip.backgroundColor = css("--text"); Chart.defaults.plugins.tooltip.titleColor = surf; Chart.defaults.plugins.tooltip.bodyColor = surf;
      Chart.defaults.plugins.tooltip.padding = 10; Chart.defaults.plugins.tooltip.cornerRadius = 8; Chart.defaults.plugins.tooltip.boxPadding = 4;
    }
    var axes = function (opt) { opt = opt || {}; return { x: { stacked: !!opt.stacked, grid: { display: false }, ticks: opt.cats ? { maxRotation: 50, autoSkip: false, font: { size: 10.5 } } : { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, border: { color: grid } }, y: { stacked: !!opt.stacked, beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: Object.assign({ precision: 0, maxTicksLimit: 6 }, opt.yticks || {}) } }; };
    var hover = { mode: "index", intersect: false };
    var line = function (data, color) { return { data: data, borderColor: color, backgroundColor: color + "22", borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: surf, tension: .3, fill: true }; };
    var bars = function (data, color) { return { data: data, backgroundColor: color, borderRadius: 4, borderSkipped: "start", maxBarThickness: 26, borderColor: surf, borderWidth: { left: 1, right: 1 } }; };
    var mk = function (id, cfg) { if (!window.Chart) return; charts.push(new Chart(document.getElementById(id), cfg)); };
    var hbar = function (id, rows, color, fmtLabel) {
      mk(id, { type: "bar", data: { labels: rows.map(function (r) { return fmtLabel(r.k); }), datasets: [Object.assign(bars(rows.map(function (r) { return r.n; }), color), { label: "Users" })] },
        options: { indexAxis: "y", maintainAspectRatio: false, interaction: { mode: "nearest", axis: "y", intersect: false }, scales: { x: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5 } }, y: { grid: { display: false }, border: { display: false } } } } });
    };
    var lab = function (k, fb) { return k == null || k === "" ? (fb || "unknown") : k; };
    var toolName = function (k) { return TOOL[k] || k; };

    mk("cUsers", { type: "line", data: { labels: labels, datasets: [Object.assign(line(s.map(function (r) { return r.users; }), brand), { label: "Users" })] }, options: { maintainAspectRatio: false, interaction: hover, scales: axes() } });
    mk("cUsage", { type: "line", data: { labels: labels, datasets: [Object.assign(line(s.map(function (r) { return r.users ? +(r.uiMin / r.users).toFixed(1) : 0; }), s3), { label: "Minutes per user" })] }, options: { maintainAspectRatio: false, interaction: hover, scales: axes({ yticks: { precision: 1 } }) } });
    mk("cTools", { type: "bar", data: { labels: d.tools.map(function (r) { return toolName(r.k); }), datasets: [
      Object.assign(bars(d.tools.map(function (r) { return r.n; }), s1), { label: "Uses" }),
      Object.assign(bars(d.tools.map(function (r) { return r.users; }), s3), { label: "Users" })] },
      options: { indexAxis: "y", maintainAspectRatio: false, interaction: { mode: "index", axis: "y", intersect: false }, scales: { x: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 6 } }, y: { grid: { display: false }, border: { display: false } } } } });
    mk("cTasks", { type: "bar", data: { labels: labels, datasets: [Object.assign(bars(s.map(function (r) { return r.tasks; }), s1), { label: "Tasks" }), Object.assign(bars(s.map(function (r) { return r.questions; }), s2), { label: "AI questions" })] }, options: { maintainAspectRatio: false, interaction: hover, scales: axes() } });
    var AIK = ["available", "downloadable", "downloading", "unavailable", "unknown"];
    var aiRows = AIK.map(function (k) { var r = d.ai.filter(function (x) { return x.k === k; })[0]; return { k: k, n: r ? r.n : 0 }; });
    mk("cAi", { type: "doughnut", data: { labels: aiRows.map(function (r) { return AI[r.k]; }), datasets: [{ data: aiRows.map(function (r) { return r.n; }), backgroundColor: [s3, s1, brand, s2, css("--muted")], borderColor: surf, borderWidth: 2 }] }, options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10, boxHeight: 10 } } } } });
    mk("cInst", { type: "bar", data: { labels: labels, datasets: [Object.assign(bars(s.map(function (r) { return r.installs; }), s1), { label: "Installs" }), Object.assign(bars(s.map(function (r) { return r.uninstalls; }), s2), { label: "Uninstalls" })] }, options: { maintainAspectRatio: false, interaction: hover, scales: axes() } });
    var LIFE = ["< 1 day", "1-3 days", "3-7 days", "1-4 weeks", "1-3 months", "3+ months"];
    var life = LIFE.map(function (k) { var r = d.lifeBuckets.filter(function (x) { return x.k === k; })[0]; return { k: k, n: r ? r.n : 0 }; });
    mk("cLife", { type: "bar", data: { labels: LIFE, datasets: [Object.assign(bars(life.map(function (r) { return r.n; }), brand), { label: "Uninstalls" })] }, options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, scales: axes({ cats: true }) } });
    hbar("cCountry", d.countries.slice(0, 15), brand, function (c) { return flag(c) + " " + (c === "XX" ? "Unknown" : regionName(c)); });
    hbar("cOS", d.platforms, brand, function (p) { return OS[p] || lab(p); });
    hbar("cVer", d.versions, brand, function (v) { return "v" + lab(v, "?"); });
    var UB = ["under 1 min", "1-5 min", "5-15 min", "15-60 min", "1 h+"];
    var ub = UB.map(function (k) { var r = d.usageBuckets.filter(function (x) { return x.k === k; })[0]; return { k: k, n: r ? r.n : 0 }; });
    mk("cBucket", { type: "bar", data: { labels: UB, datasets: [Object.assign(bars(ub.map(function (r) { return r.n; }), brand), { label: "User-days" })] }, options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, scales: axes({ cats: true }) } });
    hbar("cLang", d.languages, brand, function (l) { return langName(lab(l)); });

    // Table views (exact numbers, and for screen readers).
    var put = function (id, html) { var el = document.getElementById(id + "T"); if (el) el.innerHTML = html; };
    var daily = s.slice().reverse();
    put("cUsers", tableOf(["Day", "Users"], daily.map(function (r) { return [r.day, fmt(r.users)]; })));
    put("cUsage", tableOf(["Day", "Open per user"], daily.map(function (r) { return [r.day, mins(r.users ? r.uiMin / r.users : 0)]; })));
    put("cTools", tableOf(["Tool", "Uses", "Users", "Share of tasks"], d.tools.map(function (r) { return [esc(toolName(r.k)), fmt(r.n), fmt(r.users), pct(r.n, d.range.tasks)]; })));
    put("cTasks", tableOf(["Day", "Tasks", "AI questions"], daily.map(function (r) { return [r.day, fmt(r.tasks), fmt(r.questions)]; })));
    put("cAi", tableOf(["Chrome AI", "Installs"], aiRows.map(function (r) { return [AI[r.k], fmt(r.n)]; })));
    put("cInst", tableOf(["Day", "Installs", "Updates", "Uninstalls"], daily.map(function (r) { return [r.day, fmt(r.installs), fmt(r.updates), fmt(r.uninstalls)]; })));
    put("cLife", tableOf(["Kept for", "Uninstalls"], life.map(function (r) { return [r.k, fmt(r.n)]; })) + (d.uninstallVersions.length ? "<p class='sub' style='margin:10px 0 4px'>Uninstalls by version (period)</p>" + tableOf(["Version", "Uninstalls"], d.uninstallVersions.map(function (r) { return ["v" + esc(r.k), fmt(r.n)]; })) : ""));
    put("cCountry", tableOf(["Country", "Users", "Tasks"], d.countries.map(function (r) { return [flag(r.k) + " " + esc(r.k === "XX" ? "Unknown" : regionName(r.k)), fmt(r.n), fmt(r.tasks)]; })));
    put("cOS", tableOf(["Platform", "Users"], d.platforms.map(function (r) { return [esc(OS[r.k] || lab(r.k)), fmt(r.n)]; })));
    put("cVer", tableOf(["Version", "Users"], d.versions.map(function (r) { return ["v" + esc(lab(r.k, "?")), fmt(r.n)]; })));
    put("cBucket", tableOf(["Time on the day", "User-days"], ub.map(function (r) { return [r.k, fmt(r.n)]; })));
    put("cLang", tableOf(["Language", "Installs"], d.languages.map(function (r) { return [esc(langName(lab(r.k))), fmt(r.n)]; })));
    if (!d.series.some(function (r) { return r.users; })) {
      var el = document.querySelector(".grid");
      if (el) el.insertAdjacentHTML("beforebegin", '<div class="card w12" style="margin-bottom:12px"><b>No data yet.</b> <span style="color:var(--muted)">Numbers appear when someone turns on usage stats in Unique PDF (Settings, or the "Help improve Unique PDF" card). Their install sends an event right away, then once a day and about every 30 minutes while in use.</span></div>');
    }
  }

  document.getElementById("range").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    days = Number(b.dataset.d);
    document.querySelectorAll("#range button").forEach(function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
    load();
  });
  document.getElementById("reload").addEventListener("click", load);
  document.getElementById("theme").addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next); store.set(THEME, next);
    if (last) render(last);
  });
  load();
  setInterval(function () { if (document.visibilityState === "visible" && last) load(); }, 120000);
})();
</script>
</body>
</html>`;
