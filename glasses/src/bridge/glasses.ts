/**
 * Glasses bridge: the ONLY runtime importer of @evenrealities/even_hub_sdk (loaded with a dynamic import,
 * and only once a host is detected). Thin adapter over the pure modules in this folder:
 *   host.ts (detection, timeouts) · storage.ts (bridge storage backend) · events.ts (eventTypeOf, enum check)
 *   lifecycle.ts (page create/upgrade, input → store.codeGesture, teardown) · queue.ts (serialized debounced writes)
 *
 * Boot (main.tsx, after `void app.store.hydrate()`):
 *   void import('./bridge/glasses.ts').then((m) => m.startGlasses(app.store, app));
 * The second argument is optional; without `storage` the bridge store isn't attached, without `engine`
 * the worker isn't terminated on SYSTEM_EXIT, and without `voice` long press does nothing.
 */
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import type { MicPort, VoiceController } from '../voice/controller.ts';
import { glassesText, type Store } from '../app/store.ts';
import type { AppStorage } from '../core/storage.ts';
import { enumMismatches, eventTypeOf } from './events.ts';
import { hasHost, withTimeout } from './host.ts';
import { createGlassesController, type GlassesController, type GlassesPort, type LogFn } from './lifecycle.ts';
import { createBridgeBackend } from './storage.ts';

export interface GlassesWiring {
  storage?: Pick<AppStorage, 'setRemote'>;
  engine?: { dispose(): void };
  /** Voice (VOICE.md): long press/release drive the controller; audioEvent PCM goes to controller.feed. */
  voice?: { controller: VoiceController; attachMic(mic: MicPort | null): void };
}

/** audioControl is a BLE round trip; treat no answer within this as failure (mic considered off). */
export const MIC_CONTROL_TIMEOUT_MS = 4000;

/** waitForEvenAppBridge never blocks the phone UI longer than this (U10). */
export const BRIDGE_WAIT_MS = 1500;

/** The single full-screen capture text container (research/04-validation.md §3). */
const MAIN = { containerID: 1, containerName: 'main' } as const;

const log: LogFn = (level, msg, ...data) => {
  if (level === 'warn') console.warn(`[glasses] ${msg}`, ...data);
  else if (import.meta.env.DEV) console.debug(`[glasses] ${msg}`, ...data);
};

let active: GlassesController | null = null;

export async function startGlasses(store: Store, wiring: GlassesWiring = {}): Promise<void> {
  if (active || !hasHost()) return;
  let sdk: typeof import('@evenrealities/even_hub_sdk');
  try {
    sdk = await import('@evenrealities/even_hub_sdk');
  } catch (err) {
    log('warn', 'SDK failed to load', err);
    return;
  }
  const bridge: EvenAppBridge | null = await withTimeout(sdk.waitForEvenAppBridge(), BRIDGE_WAIT_MS, null);
  if (!bridge) {
    log('warn', `no bridge within ${BRIDGE_WAIT_MS} ms`);
    return;
  }
  if (active) return;

  if (import.meta.env.DEV) {
    const bad = enumMismatches(sdk.OsEventTypeList as unknown as Record<string, unknown>);
    if (bad.length) console.warn('[glasses] OsEventTypeList differs from core/input.ts EVT:', bad);
  }

  // Storage: dual-write to the bridge from now on, then pick up bridge values if nothing was found/changed yet.
  if (wiring.storage) {
    wiring.storage.setRemote(createBridgeBackend(bridge));
    void store.hydrate({ onlyIfPristine: true });
  }

  const { TextContainerProperty, CreateStartUpPageContainer, TextContainerUpgrade, StartUpPageCreateResult } = sdk;
  const page = (content: string) => ({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        borderWidth: 0,
        borderColor: 0,
        paddingLength: 4,
        ...MAIN,
        content,
        isEventCapture: 1,
      }),
    ],
  });

  const port: GlassesPort = {
    async create(text) {
      const res = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page(text)));
      if (res !== StartUpPageCreateResult.success) log('warn', `createStartUpPageContainer → ${String(res)} (${StartUpPageCreateResult[res] ?? '?'})`);
      return res === StartUpPageCreateResult.success;
    },
    async upgrade(text) {
      return (await bridge.textContainerUpgrade(new TextContainerUpgrade({ ...MAIN, content: text }))) === true;
    },
  };

  // Glasses mic for voice entry: 16 kHz s16le mono PCM arrives as onEvenHubEvent audioEvent.audioPcm.
  const { AudioInputSource } = sdk;
  const mic: MicPort = {
    open: () =>
      withTimeout(
        Promise.resolve()
          .then(() => bridge.audioControl(true, AudioInputSource.Glasses))
          .then((ok) => ok === true),
        MIC_CONTROL_TIMEOUT_MS,
        false,
      ),
    close: () =>
      withTimeout(
        Promise.resolve()
          .then(() => bridge.audioControl(false))
          .catch((err: unknown) => {
          log('warn', 'audioControl(false) failed', err);
          return false;
        }),
        MIC_CONTROL_TIMEOUT_MS,
        false,
      ),
  };
  wiring.voice?.attachMic(mic);

  let unsubEvents: (() => void) | null = null;
  const onPageHide = () => controller.dispose();

  const controller = createGlassesController({
    port,
    store,
    text: () => glassesText(store.getState()),
    now: () => performance.now(),
    log,
    voice: wiring.voice?.controller,
    onTeardown(reason) {
      unsubEvents?.();
      unsubEvents = null;
      window.removeEventListener('pagehide', onPageHide);
      if (reason === 'sysExit') wiring.engine?.dispose();
      wiring.voice?.attachMic(null);
      if (active === controller) active = null;
      log('debug', `teardown (${reason})`);
    },
  });
  active = controller;
  window.addEventListener('pagehide', onPageHide);

  const created = controller.start();
  unsubEvents = bridge.onEvenHubEvent((e: EvenHubEvent) => {
    if (e.audioEvent) {
      wiring.voice?.controller.feed(e.audioEvent.audioPcm);
      if (!e.sysEvent && !e.textEvent) return;
    }
    const sysType = eventTypeOf(e.sysEvent);
    const textType = eventTypeOf(e.textEvent);
    if (sysType === null && textType === null) return;
    const action = controller.handle(sysType, textType);
    // eventSource is logged only; never branched on (§2).
    log('debug', 'event', { sysType, textType, eventSource: e.sysEvent?.eventSource, action });
  });
  if (controller.disposed) {
    unsubEvents();
    unsubEvents = null;
  }
  await created;
}
