/** Host detection and timeouts for the bridge (pure; no SDK import). research/04-validation.md §5.6, U10. */

/** True inside the Even App WebView (or the simulator), which injects `flutter_inappwebview.callHandler`. */
export function hasHost(win: unknown = globalThis): boolean {
  try {
    const w = win as { flutter_inappwebview?: { callHandler?: unknown } } | null | undefined;
    return typeof w?.flutter_inappwebview?.callHandler === 'function';
  } catch {
    return false;
  }
}

/** Resolves with `p`'s value, or `fallback` if it rejects or takes longer than `ms`. Never rejects. */
export function withTimeout<T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
