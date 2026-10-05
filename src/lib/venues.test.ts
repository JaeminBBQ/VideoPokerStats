import { describe, expect, it } from 'vitest';
import { pickGameForVenue } from './venues.ts';

describe('pickGameForVenue', () => {
  it('keeps the current game when it is at the venue', () => {
    expect(pickGameForVenue('Legends Bay', 'bpd-7-5')).toBe('bpd-7-5');
    expect(pickGameForVenue('Legends Bay', 'lb-deuces-16-13')).toBe('lb-deuces-16-13');
  });
});
