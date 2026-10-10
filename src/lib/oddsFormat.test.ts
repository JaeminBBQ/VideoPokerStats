import { describe, expect, it } from 'vitest';
import { pace, pct, percent2, sessionLabel, signedBets, withArticle } from './oddsFormat.ts';

describe('percent2', () => {
  it('keeps 2 significant figures in percent form', () => {
    expect(percent2(2 / 47)).toBe('4.3%');
    expect(percent2(1 / 47)).toBe('2.1%');
    expect(percent2(0.0009250693802035153)).toBe('0.093%');
    expect(percent2(0.00006167129201356769)).toBe('0.0062%');
    expect(percent2(0.2823311748381129)).toBe('28%');
  });
});

describe('pace', () => {
  it('whole hours from 10 up', () => {
    expect(pace(0.000024894352953567522)).toBe('about every 67 hours');
    expect(pace(1e-7)).toBe('about every 16,667 hours');
  });
  it('one decimal from 1 to 10 hours', () => {
    expect(pace(1 / 1020)).toBe('about every 1.7 hours');
  });
  it('minutes under an hour', () => {
    expect(pace(1 / 423)).toBe('about every 42 minutes');
    expect(pace(1 / 87)).toBe('about every 9 minutes');
    expect(pace(1 / 8)).toBe('about every 1 minute');
  });
  it('omits under a minute or when impossible', () => {
    expect(pace(1 / 2)).toBeNull();
    expect(pace(0)).toBeNull();
  });
});

describe('withArticle', () => {
  it.each([
    ['Royal Flush', 'a Royal Flush'],
    ['Four Deuces', 'Four Deuces'],
    ['Wild Royal Flush', 'a Wild Royal Flush'],
    ['Ace High', 'an Ace High'],
  ])('%s → %s', (label, want) => expect(withArticle(label)).toBe(want));
});

describe('pct', () => {
  it('whole percents from 10% up', () => {
    expect(pct(0.15)).toBe('15%');
    expect(pct(0.82)).toBe('82%');
  });
  it('one decimal below 10%', () => {
    expect(pct(0.003)).toBe('0.3%');
    expect(pct(0.081)).toBe('8.1%');
  });
  it('tiny and zero', () => {
    expect(pct(0.0005)).toBe('<0.1%');
    expect(pct(0)).toBe('0%');
  });
});

describe('sessionLabel', () => {
  it('names sub-hour sessions by hands, the rest in hours', () => {
    expect(sessionLabel(100)).toBe('100 hands');
    expect(sessionLabel(600)).toBe('1 hour');
    expect(sessionLabel(2400)).toBe('4 hours');
    expect(sessionLabel(24000)).toBe('40 hours');
  });
});

describe('signedBets', () => {
  it('one decimal with a sign, real minus for negatives', () => {
    expect(signedBets(-16.2094)).toBe('−16.2');
    expect(signedBets(-129.675)).toBe('−129.7');
    expect(signedBets(0.4)).toBe('+0.4');
    expect(signedBets(0)).toBe('0.0');
  });
});
