/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROD_MODEL_BASE_URL, resolveBaseUrl } from './config.ts';

const appJson = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
  version: string;
  permissions: { name: string; desc: string; whitelist?: string[] }[];
};
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

describe('voice config ↔ app.json', () => {
  it('network whitelist is exactly the model origin', () => {
    const net = appJson.permissions.find((p) => p.name === 'network');
    expect(net?.whitelist).toEqual([new URL(PROD_MODEL_BASE_URL).origin]);
  });
  it('asks for the glasses mic; descs are 1..300 chars', () => {
    expect(appJson.permissions.map((p) => p.name).sort()).toEqual(['g2-microphone', 'network']);
    for (const p of appJson.permissions) expect(p.desc.length).toBeGreaterThan(0), expect(p.desc.length).toBeLessThanOrEqual(300);
  });
  it('versions agree (0.4.0)', () => {
    expect(appJson.version).toBe('0.4.0');
    expect(pkg.version).toBe('0.4.0');
  });
  it('dev override only applies in dev builds', () => {
    expect(resolveBaseUrl(false, 'http://localhost:8788')).toBe(PROD_MODEL_BASE_URL);
    expect(resolveBaseUrl(true, 'http://localhost:8788/')).toBe('http://localhost:8788');
    expect(resolveBaseUrl(true, undefined)).toBe(PROD_MODEL_BASE_URL);
    expect(resolveBaseUrl(true, '  ')).toBe(PROD_MODEL_BASE_URL);
  });
});
