import { describe, expect, it } from 'vitest';
import { getAdvW } from '@evenrealities/pretext';
import { SUIT_SYMBOLS, parseCard } from '../../../src/engine/cards.ts';
import { GLASSES_SUITS, JOKER, LETTER_SUITS, cardGrid, glassesCard, isValidCard, phoneCard } from './cards.ts';

describe('cards', () => {
  it('glasses suits avoid ♦ and are all in the firmware font', () => {
    expect(GLASSES_SUITS).toEqual(['♣', '◆', '♥', '♠']);
    expect(GLASSES_SUITS).not.toContain('♦');
    for (const s of GLASSES_SUITS) expect(getAdvW(s.codePointAt(0)!)).toBeGreaterThan(0);
    // The engine map is the one we must not use: its diamond is missing from the font.
    expect(getAdvW(SUIT_SYMBOLS[1].codePointAt(0)!)).toBe(0);
  });

  it('labels follow engine suit order c d h s', () => {
    expect(glassesCard(parseCard('Ks'))).toBe('K♠');
    expect(glassesCard(parseCard('Td'))).toBe('T◆');
    expect(glassesCard(parseCard('2c'))).toBe('2♣');
    expect(glassesCard(parseCard('Ah'))).toBe('A♥');
    expect(glassesCard(parseCard('Kd'), true)).toBe('Kd');
    expect(LETTER_SUITS.join('')).toBe('cdhs');
    expect(glassesCard(JOKER)).toBe('Jk');
  });

  it('phone labels use 10 and ♦', () => {
    expect(phoneCard(parseCard('Td'))).toBe('10♦');
    expect(phoneCard(parseCard('Qc'))).toBe('Q♣');
    expect(phoneCard(JOKER)).toBe('Joker');
  });

  it('grid covers each of the 52 cards once, aces first', () => {
    const grid = cardGrid();
    expect(grid).toHaveLength(13);
    for (const row of grid) expect(row).toHaveLength(4);
    const flat = grid.flat();
    expect(new Set(flat).size).toBe(52);
    expect(Math.min(...flat)).toBe(0);
    expect(Math.max(...flat)).toBe(51);
    expect(glassesCard(grid[0][0])).toBe('A♠');
  });

  it('isValidCard checks the deck size', () => {
    expect(isValidCard(0, 52)).toBe(true);
    expect(isValidCard(51, 52)).toBe(true);
    expect(isValidCard(52, 52)).toBe(false);
    expect(isValidCard(52, 53)).toBe(true);
    expect(isValidCard(-1, 52)).toBe(false);
    expect(isValidCard(1.5, 52)).toBe(false);
    expect(isValidCard('3', 52)).toBe(false);
  });
});
