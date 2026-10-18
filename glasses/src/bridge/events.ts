/**
 * SDK-free event helpers for the bridge (pure; tested in Node). The SDK itself is only imported by glasses.ts.
 */
import { EVT } from '../core/input.ts';

/** An event envelope as the SDK delivers it (`sysEvent` / `textEvent`). */
export interface EventEnvelope {
  eventType?: number | null;
}

/**
 * research/04-validation.md §3: an absent envelope is no event; a present envelope without `eventType` is a
 * CLICK (protobuf omits the zero value).
 */
export function eventTypeOf(envelope: EventEnvelope | null | undefined): number | null {
  if (!envelope) return null;
  return envelope.eventType ?? EVT.CLICK;
}

/** core/input.ts EVT key → SDK `OsEventTypeList` member name. */
export const SDK_EVENT_NAMES: Readonly<Record<keyof typeof EVT, string>> = {
  CLICK: 'CLICK_EVENT',
  SCROLL_TOP: 'SCROLL_TOP_EVENT',
  SCROLL_BOTTOM: 'SCROLL_BOTTOM_EVENT',
  DOUBLE: 'DOUBLE_CLICK_EVENT',
  FG_ENTER: 'FOREGROUND_ENTER_EVENT',
  FG_EXIT: 'FOREGROUND_EXIT_EVENT',
  ABNORMAL_EXIT: 'ABNORMAL_EXIT_EVENT',
  SYS_EXIT: 'SYSTEM_EXIT_EVENT',
  LONG_PRESS: 'LONG_PRESS_EVENT',
  LONG_RELEASE: 'LONG_PRESS_RELEASE_EVENT',
};

/**
 * Compares the SDK's runtime `OsEventTypeList` object with the local EVT numbers.
 * Returns one message per mismatch (empty = aligned).
 */
export function enumMismatches(sdkEnum: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(EVT) as (keyof typeof EVT)[]) {
    const name = SDK_EVENT_NAMES[key];
    if (sdkEnum[name] !== EVT[key]) out.push(`OsEventTypeList.${name} = ${String(sdkEnum[name])}, core/input EVT.${key} = ${EVT[key]}`);
  }
  return out;
}
