import { describe, expect, it } from 'vitest';
import { EVT } from '../core/input.ts';
import { SDK_EVENT_NAMES, enumMismatches, eventTypeOf } from './events.ts';

/** OsEventTypeList as the SDK 0.0.16 .d.ts declares it (a numeric TS enum, with reverse mappings). */
const SDK_ENUM: Record<string, unknown> = {
  CLICK_EVENT: 0, SCROLL_TOP_EVENT: 1, SCROLL_BOTTOM_EVENT: 2, DOUBLE_CLICK_EVENT: 3, FOREGROUND_ENTER_EVENT: 4,
  FOREGROUND_EXIT_EVENT: 5, ABNORMAL_EXIT_EVENT: 6, SYSTEM_EXIT_EVENT: 7, IMU_DATA_REPORT: 8, LONG_PRESS_EVENT: 9,
  LONG_PRESS_RELEASE_EVENT: 10, 0: 'CLICK_EVENT', 3: 'DOUBLE_CLICK_EVENT',
};

describe('eventTypeOf', () => {
  it('absent envelope = no event', () => {
    expect(eventTypeOf(undefined)).toBeNull();
    expect(eventTypeOf(null)).toBeNull();
  });
  it('present envelope without eventType = CLICK (protobuf zero value)', () => {
    expect(eventTypeOf({})).toBe(EVT.CLICK);
    expect(eventTypeOf({ eventType: undefined })).toBe(EVT.CLICK);
  });
  it('passes the type through', () => {
    for (const v of Object.values(EVT)) expect(eventTypeOf({ eventType: v })).toBe(v);
  });
});

describe('enumMismatches', () => {
  it('is empty when the SDK enum matches EVT', () => {
    expect(enumMismatches(SDK_ENUM)).toEqual([]);
  });
  it('names every EVT key', () => {
    expect(Object.keys(SDK_EVENT_NAMES).sort()).toEqual(Object.keys(EVT).sort());
  });
  it('reports a shifted or missing value', () => {
    const bad = enumMismatches({ ...SDK_ENUM, DOUBLE_CLICK_EVENT: 9, SYSTEM_EXIT_EVENT: undefined });
    expect(bad).toHaveLength(2);
    expect(bad[0]).toContain('DOUBLE_CLICK_EVENT');
    expect(bad[1]).toContain('SYSTEM_EXIT_EVENT');
  });
});
