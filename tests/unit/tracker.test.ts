/**
 * The tracker Worker (tracker/worker.js) against a real SQLite database that
 * stands in for Cloudflare D1, through its public HTTP routes.
 */
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import worker from '../../tracker/worker.js';

type Row = Record<string, unknown>;
interface Stmt { sql: string; args: unknown[] }

function d1(db: DatabaseSync) {
  const exec = (s: Stmt) => {
    const st = db.prepare(s.sql);
    return st;
  };
  const make = (sql: string, args: unknown[] = []) => {
    const s: Stmt = { sql, args };
    return {
      ...s,
      bind: (...a: unknown[]) => make(sql, a),
      all: async () => ({ results: exec(s).all(...(s.args as never[])) as Row[] }),
      first: async () => (exec(s).get(...(s.args as never[])) as Row | undefined) ?? null,
      run: async () => { const r = exec(s).run(...(s.args as never[])); return { meta: { changes: Number(r.changes) } }; },
    };
  };
  return {
    prepare: (sql: string) => make(sql),
    batch: async (stmts: { sql: string; args: unknown[] }[]) => {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => { const r = db.prepare(s.sql).run(...(s.args as never[])); return { meta: { changes: Number(r.changes) } }; });
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const ID = 'a'.repeat(32);
const ID2 = 'b'.repeat(32);
let env: { DB: ReturnType<typeof d1>; STATS_KEY?: string };
let sqlite: DatabaseSync;

const call = (path: string, init: RequestInit & { country?: string } = {}) => {
  const req = new Request(`https://unique-pdf.example.workers.dev${path}`, init) as Request & { cf?: unknown };
  Object.defineProperty(req, 'cf', { value: { country: init.country ?? 'BD' } });
  return worker.fetch(req, env, { waitUntil: () => {} }) as Promise<Response>;
};
const send = (body: unknown, country?: string) => call('/e', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'text/plain' }, ...(country ? { country } : {}) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in assertions
const stats = async (days = 7) => (await (await call(`/api/stats?days=${days}`)).json()) as Record<string, any>;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  env = { DB: d1(sqlite) };
});

describe('tracker worker', () => {
  it('records installs, tool use, AI questions and time, and reports them', async () => {
    expect((await send({ ev: 'install', id: ID, v: '1.3.0', p: 'win', l: 'en', ai: 'available', ag: 0, t: { merge: 2, compress: 1 }, q: 3, um: 4 })).status).toBe(200);
    expect((await send({ ev: 'active', id: ID2, v: '1.3.0', p: 'mac', l: 'es', ai: 'unavailable', t: { merge: 1, 'ai-chat': 1 }, q: 5 }, 'US')).status).toBe(200);
    expect((await send({ ev: 'usage', id: ID, v: '1.3.0', t: { merge: 1 }, um: 6 })).status).toBe(200);

    const s = await stats();
    expect(s.ok).toBe(true);
    expect(s.today).toMatchObject({ users: 2, tasks: 6, questions: 8, installs: 1 });
    expect(s.totals).toMatchObject({ installs: 2, active: 2, tasks: 6, questions: 8, wau: 2, mau: 2 });
    expect(s.tools[0]).toEqual({ k: 'merge', n: 4, users: 2 });
    expect(s.tools.find((t: Row) => t.k === 'ai-chat')).toEqual({ k: 'ai-chat', n: 1, users: 1 });
    expect(s.countries.map((c: Row) => c.k).sort()).toEqual(['BD', 'US']);
    expect(s.platforms.map((c: Row) => c.k).sort()).toEqual(['mac', 'win']);
    expect(s.ai.find((a: Row) => a.k === 'available').n).toBe(1);
    expect(s.series.at(-1)).toMatchObject({ users: 2, tasks: 6, questions: 8, uiMin: 10, installs: 1 });
  });

  it('drops unknown tools, junk fields and oversized numbers', async () => {
    await send({ ev: 'usage', id: ID, v: 'x<script>', p: 'beos', t: { merge: 9999, 'file.pdf': 3, __proto__: 1 }, q: -4, um: 99999, name: 'secret.pdf' });
    const s = await stats();
    expect(s.tools).toEqual([{ k: 'merge', n: 500, users: 1 }]);
    expect(s.today).toMatchObject({ tasks: 500, questions: 0 });
    expect(s.series.at(-1).uiMin).toBe(1440);
    expect(s.platforms).toEqual([{ k: 'other', n: 1 }]);
    expect(s.versions).toEqual([{ k: null, n: 1 }]);
    // Nothing but the known columns is stored.
    const cols = (sqlite.prepare('PRAGMA table_info(installs)').all() as Row[]).map((c) => c.name);
    expect(cols).not.toContain('name');
  });

  it('rejects bad events', async () => {
    expect((await send({ ev: 'hack', id: ID })).status).toBe(400);
    expect((await send({ ev: 'usage', id: 'not-hex' })).status).toBe(400);
    expect((await call('/e', { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await call('/e', { method: 'POST', body: JSON.stringify({ ev: 'usage', id: ID, pad: 'x'.repeat(5000) }) })).status).toBe(413);
    expect((await stats()).totals.installs).toBe(0);
  });

  it('counts an uninstall once and measures how long it was kept', async () => {
    await send({ ev: 'install', id: ID, v: '1.3.0', ag: 3 });
    const page = await call(`/u?id=${ID}&v=1.3.0`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Unique PDF was removed');
    await call(`/u?id=${ID}&v=1.3.0`); // reload
    await call('/u'); // no id: not counted
    const s = await stats();
    expect(s.today.uninstalls).toBe(1);
    expect(s.totals).toMatchObject({ installs: 1, uninstalled: 1, active: 0 });
    expect(s.totals.avgLifeDays).toBeCloseTo(3, 0);
    expect(s.lifeBuckets).toEqual([{ k: '3-7 days', n: 1 }]);
    expect(s.uninstallVersions).toEqual([{ k: '1.3.0', n: 1 }]);
  });

  it('counts updates', async () => {
    await send({ ev: 'install', id: ID, v: '1.2.0' });
    await send({ ev: 'update', id: ID, v: '1.3.0', pv: '1.2.0' });
    const s = await stats();
    expect(s.range.updates).toBe(1);
    expect(s.versions).toEqual([{ k: '1.3.0', n: 1 }]);
  });

  it('protects the stats with STATS_KEY when set', async () => {
    env.STATS_KEY = 'k3y';
    expect((await call('/api/stats')).status).toBe(401);
    expect((await call('/api/stats', { headers: { 'x-stats-key': 'k3y' } })).status).toBe(200);
    expect((await call('/api/stats?key=k3y')).status).toBe(200);
    // Events still come in without the key.
    expect((await send({ ev: 'active', id: ID, v: '1.3.0' })).status).toBe(200);
  });

  it('serves the dashboard, health and CORS', async () => {
    const page = await call('/');
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Unique PDF Tracker');
    expect(await (await call('/health')).text()).toBe('ok');
    const pre = await call('/e', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect((await call('/nope')).status).toBe(404);
  });

  it('explains a missing database binding', async () => {
    env = {} as typeof env;
    const res = await call('/api/stats');
    expect(res.status).toBe(503);
    expect(((await res.json()) as Row).error).toMatch(/D1 database/);
  });
});
