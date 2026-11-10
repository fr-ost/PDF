import { describe, expect, it } from 'vitest';
import { INITIAL_USAGE_STATE, USAGE_INTERVAL, afterSent, nextEvent, sanitizeUsageState, type UsageState } from '../../src/services/telemetry/usageStats';
import { USAGE_STATS_ENDPOINT } from '../../src/services/telemetry/endpoint';
import { EXTENSION_CSP } from '../../scripts/manifest';
import { readFileSync } from 'node:fs';

const NOW = Date.UTC(2026, 10, 10, 12);
const env = { version: '1.3.0', platform: 'win', language: 'en', ai: 'available', installedAt: NOW - 5 * 86_400_000 };
const on = (patch: Partial<UsageState> = {}): UsageState => ({ ...INITIAL_USAGE_STATE, consent: 'on', id: 'c'.repeat(32), ...patch, counts: { t: {}, q: 0, um: 0, ...(patch.counts ?? {}) } });

describe('usage stats rules', () => {
  it('sends nothing unless the user turned stats on', () => {
    expect(nextEvent(INITIAL_USAGE_STATE, env, NOW)).toBeNull();
    expect(nextEvent({ ...INITIAL_USAGE_STATE, consent: 'off' }, env, NOW)).toBeNull();
    // "on" without an id is not trusted.
    expect(sanitizeUsageState({ consent: 'on', id: 'zz' }).consent).toBe('unset');
  });

  it('registers first, then reports updates, then once a day, then every 30 minutes', () => {
    const first = nextEvent(on(), env, NOW)!;
    expect(first).toEqual({ ev: 'install', id: 'c'.repeat(32), v: '1.3.0', p: 'win', l: 'en', ai: 'available', ag: 5 });
    let s = afterSent(on(), first, env, NOW);
    expect(nextEvent(s, env, NOW + 1000)).toBeNull();

    s = { ...s, counts: { t: { merge: 2 }, q: 1, um: 3 } };
    expect(nextEvent(s, env, NOW + 1000)).toBeNull();
    const usage = nextEvent(s, env, NOW + USAGE_INTERVAL)!;
    expect(usage).toEqual({ ev: 'usage', id: s.id, v: '1.3.0', t: { merge: 2 }, q: 1, um: 3 });

    const next = { ...env, version: '1.4.0' };
    expect(nextEvent(s, next, NOW + 1000)).toMatchObject({ ev: 'update', pv: '1.3.0', v: '1.4.0' });
    expect(nextEvent(s, env, NOW + 86_400_000)).toMatchObject({ ev: 'active', t: { merge: 2 } });
  });

  it('keeps counters made while a send was in flight', () => {
    const s = on({ registered: true, reportedVersion: '1.3.0', lastActiveDay: '2026-11-10', counts: { t: { merge: 2, sign: 1 }, q: 2, um: 5 } });
    const ev = nextEvent(s, env, NOW + USAGE_INTERVAL)!;
    const meanwhile = { ...s, counts: { t: { merge: 3, sign: 1, compress: 1 }, q: 3, um: 6 } };
    expect(afterSent(meanwhile, ev, env, NOW + USAGE_INTERVAL).counts).toEqual({ t: { merge: 1, compress: 1 }, q: 1, um: 1 });
  });

  it('never puts anything but counts, versions and fixed values in an event', () => {
    const s = sanitizeUsageState({ consent: 'on', id: 'd'.repeat(32), counts: { t: { merge: 1, 'My Secret.pdf': 4, ['x'.repeat(40)]: 1 }, q: 1, um: 1 }, fileName: 'tax-return.pdf' });
    const ev = nextEvent(s, env, NOW)!;
    expect(Object.keys(ev).sort()).toEqual(['ag', 'ai', 'ev', 'id', 'l', 'p', 'q', 't', 'um', 'v']);
    expect(ev.t).toEqual({ merge: 1 });
    expect(JSON.stringify(ev)).not.toMatch(/pdf|secret|tax/i);
  });

  it('turning stats off forgets the id and counters', () => {
    const s = sanitizeUsageState({ consent: 'off', id: 'e'.repeat(32), registered: true, counts: { t: { merge: 4 }, q: 9, um: 9 } });
    expect(s).toMatchObject({ consent: 'off', id: '', registered: false, counts: { t: {}, q: 0, um: 0 } });
  });

  it('the manifest and the build check allow exactly the tracker as a remote host', () => {
    expect(USAGE_STATS_ENDPOINT).toMatch(/^https:\/\/[a-z0-9.-]+\.workers\.dev$/);
    const connect = EXTENSION_CSP.match(/connect-src ([^;]*)/)![1]!.split(' ');
    expect(connect).toEqual(["'self'", 'blob:', 'data:', USAGE_STATS_ENDPOINT]);
    expect(readFileSync('scripts/validate-build.mjs', 'utf8')).toContain(`const TRACKER = '${USAGE_STATS_ENDPOINT}'`);
  });
});
