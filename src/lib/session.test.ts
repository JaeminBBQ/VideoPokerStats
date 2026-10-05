import { describe, expect, it } from 'vitest';
import { startSession } from './bankroll.ts';
import { closeSession, SESSION_LOG_CAP, type Lifetime, type SessionLogEntry } from './session.ts';

const s = {
  ...startSession(2000, 1000),
  balanceCents: 1975,
  hands: 4,
  coinInCents: 100,
  wonCents: 75,
  theoReturnCents: 97.3,
};

const EMPTY: Lifetime = { coinInCents: 0 };

const oldEntry: SessionLogEntry = {
  endedAt: 900,
  startedAt: 1,
  startCents: 1000,
  endCents: 950,
  hands: 2,
  coinInCents: 50,
  wonCents: 0,
  points: 0,
  denomination: 0.05,
  gameIds: ['job-8-5'],
};

describe('closeSession', () => {
  it('moves the session coin-in into lifetime and logs a summary newest-first', () => {
    const lifetime: Lifetime = { coinInCents: 500 };
    const out = closeSession(s, 0.05, ['job-8-5', 'lb-deuces-16-13'], lifetime, [oldEntry], 2000);
    expect(out.lifetime).toEqual({ coinInCents: 600 });
    expect(out.log).toHaveLength(2);
    expect(out.log[0]).toEqual({
      endedAt: 2000,
      startedAt: 1000,
      startCents: 2000,
      endCents: 1975,
      hands: 4,
      coinInCents: 100,
      wonCents: 75,
      points: 1, // $1 of coin-in
      denomination: 0.05,
      gameIds: ['job-8-5', 'lb-deuces-16-13'],
    });
    expect(out.log[1]).toEqual(oldEntry);
    expect(lifetime).toEqual({ coinInCents: 500 }); // inputs untouched
  });

  it('caps the log at the newest 20 entries', () => {
    // Oldest entries first: endedAt descends from 29 to 0, so 29 is the newest old entry.
    const old = Array.from({ length: 30 }, (_, i) => ({
      ...oldEntry,
      endedAt: 29 - i,
      startedAt: i,
    }));
    const out = closeSession(s, 0.05, [], EMPTY, old, 2000);
    expect(out.log).toHaveLength(SESSION_LOG_CAP);
    expect(out.log[0].endedAt).toBe(2000);
    expect(out.log[SESSION_LOG_CAP - 1].endedAt).toBe(11); // oldest old entries (0..10) are dropped
  });
});
