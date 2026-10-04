import { useEffect, useRef, useState } from 'react';
import {
  EngineClient,
  GAMES,
  GAME_LIST,
  cardToString,
  deal,
  rankOf,
  type Card,
  type GameId,
  type HoldEv,
} from './engine/index.ts';
import { grade, type Grade } from './lib/grade.ts';
import { recordHand, resetGame, type HandRecord, type Totals, type TotalsEntry } from './lib/stats.ts';
import {
  createStorage,
  DEFAULT_SETTINGS,
  DENOM_LABELS,
  DENOMINATIONS,
  type Settings,
} from './lib/storage.ts';
import CardView, { type CardEmphasis } from './components/CardView.tsx';
import Paytable from './components/Paytable.tsx';
import StatsPanel from './components/StatsPanel.tsx';
import TopHolds from './components/TopHolds.tsx';

const engine = new EngineClient();
const storage = createStorage(window.localStorage);

/** 32 fresh random bits from the platform CSPRNG per call, scaled to [0, 1). */
function secureRng(): () => number {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  };
}

function sanitizeSettings(s: Settings): Settings {
  return {
    gameId: GAMES[s.gameId] ? s.gameId : DEFAULT_SETTINGS.gameId,
    denomination: (DENOMINATIONS as readonly number[]).includes(s.denomination)
      ? s.denomination
      : DEFAULT_SETTINGS.denomination,
  };
}

type Phase = 'preparing' | 'ready' | 'dealt' | 'graded' | 'error';

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(storage.loadSettings()));
  const [phase, setPhase] = useState<Phase>('preparing');
  const [retryTick, setRetryTick] = useState(0);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [hand, setHand] = useState<Card[] | null>(null);
  const [heldMask, setHeldMask] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ holds: HoldEv[]; grade: Grade } | null>(null);
  const [history, setHistory] = useState<HandRecord[]>(() => storage.loadHistory());
  const [totals, setTotals] = useState<Totals>(() => storage.loadTotals());
  const [paytableOpen, setPaytableOpen] = useState(false);
  const dealBtnRef = useRef<HTMLButtonElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const gameId = settings.gameId;
  const game = GAMES[gameId];
  const isDeuces = game.rows.some((row) => row.key === 'four-deuces');

  // Prepare the engine's tables on load and on every game change (or retry). The synchronous
  // resets live in the event handlers below; the effect only kicks off the async prepare.
  useEffect(() => {
    let cancelled = false;
    engine.prepare(gameId).then(
      () => {
        if (!cancelled) setPhase('ready');
      },
      (err: unknown) => {
        if (!cancelled) {
          setEngineError(String(err));
          setPhase('error');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gameId, retryTick]);

  // Persist state as it changes (loads happen in the useState initializers above).
  useEffect(() => {
    storage.saveHistory(history);
  }, [history]);
  useEffect(() => {
    storage.saveTotals(totals);
  }, [totals]);
  useEffect(() => {
    storage.saveSettings(settings);
  }, [settings]);

  // Keep keyboard focus on the primary action: submit while a hand is out, deal after grading.
  useEffect(() => {
    if (phase === 'dealt') submitBtnRef.current?.focus();
    else if (phase === 'graded') dealBtnRef.current?.focus();
  }, [phase]);

  const dealNew = () => {
    setHand(deal(game.deckSize, secureRng()));
    setHeldMask(0);
    setResult(null);
    setPhase('dealt');
  };

  const submit = async () => {
    if (!hand || phase !== 'dealt' || busy) return;
    setBusy(true);
    try {
      const holds = await engine.analyze(gameId, hand);
      const g = grade(holds, heldMask);
      const state = recordHand(
        { history, totals },
        {
          ts: Date.now(),
          gameId,
          hand,
          heldMask,
          bestMask: g.bestMask,
          evHeld: g.evHeld,
          evBest: g.evBest,
          mode: 'deal',
        },
      );
      setHistory(state.history);
      setTotals(state.totals);
      setResult({ holds, grade: g });
      setPhase('graded');
    } catch (err) {
      setEngineError(String(err));
      setPhase('error');
    } finally {
      setBusy(false);
    }
  };

  const toggleHold = (i: number) => {
    if (phase !== 'dealt' || busy) return;
    setHeldMask((m) => m ^ (1 << i));
  };

  /** Switch games: reset the table state, then let the prepare effect re-arm the engine. */
  const switchGame = (id: GameId) => {
    setSettings((s) => ({ ...s, gameId: id }));
    setPhase('preparing');
    setEngineError(null);
    setHand(null);
    setHeldMask(0);
    setResult(null);
  };

  const retry = () => {
    setPhase('preparing');
    setEngineError(null);
    setHand(null);
    setHeldMask(0);
    setResult(null);
    setRetryTick((t) => t + 1);
  };

  // Global keyboard: 1–5 toggle holds; Enter/Space deals or submits. Re-subscribed every
  // render so the closures always see fresh state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      const isTyping = t instanceof HTMLElement && ['SELECT', 'INPUT', 'TEXTAREA'].includes(t.tagName);
      const isAction = t instanceof HTMLElement && ['BUTTON', 'A'].includes(t.tagName);
      if (e.key >= '1' && e.key <= '5') {
        if (isTyping) return;
        if (phase === 'dealt' && !busy) toggleHold(Number(e.key) - 1);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (isTyping || isAction) return; // focused controls handle these themselves
        e.preventDefault();
        if (busy) return;
        if (phase === 'ready' || phase === 'graded' || phase === 'error') dealNew();
        else if (phase === 'dealt') void submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const holdLabel = (mask: number) =>
    mask === 0 ? 'Discard all' : (hand ?? []).filter((_, i) => mask & (1 << i)).map(cardToString).join(' ');
  const money = (bets: number) => '$' + (bets * settings.denomination * 5).toFixed(2);

  const emphases: CardEmphasis[] = hand
    ? hand.map((_, i) => {
        if (!result) return 'normal';
        const m = 1 << i;
        if (result.grade.optimal) return heldMask & m ? 'correct' : 'normal';
        return result.grade.bestMask & m ? 'correct' : 'dimmed';
      })
    : [];

  const totalsEntry: TotalsEntry = totals[gameId] ?? { hands: 0, mistakes: 0, evLost: 0 };

  const resetStats = () => {
    const state = resetGame({ history, totals }, gameId);
    setHistory(state.history);
    setTotals(state.totals);
  };

  const canDeal = !busy && (phase === 'ready' || phase === 'graded' || phase === 'error');

  return (
    <div className="app">
      <header className="header">
        <h1>Video Poker Trainer</h1>
        <div className="game-picker">
          <label htmlFor="game-select">Game</label>
          <select
            id="game-select"
            value={gameId}
            onChange={(e) => switchGame(e.target.value as GameId)}
          >
            {GAME_LIST.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({(g.publishedReturn * 100).toFixed(2)}%)
              </option>
            ))}
          </select>
        </div>
        <p className="where">{game.where}</p>
        <Paytable game={game} open={paytableOpen} onToggle={() => setPaytableOpen((o) => !o)} />
      </header>

      {phase === 'preparing' && <div className="status">Preparing engine…</div>}
      {phase === 'error' && (
        <div className="status error">
          Engine error: {engineError}{' '}
          <button type="button" className="btn subtle" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <main>
        <div className="hand">
          {hand ? (
            hand.map((card, i) => (
              <CardView
                key={i}
                card={card}
                held={(heldMask & (1 << i)) !== 0}
                emphasis={emphases[i] ?? 'normal'}
                isWild={isDeuces && rankOf(card) === 0}
                disabled={phase !== 'dealt' || busy}
                onToggle={() => toggleHold(i)}
              />
            ))
          ) : (
            Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="card-slot">
                <div className="hold-tag" />
                <div className="card ghost" />
              </div>
            ))
          )}
        </div>

        <div className="controls">
          <button ref={dealBtnRef} type="button" className="btn primary" onClick={dealNew} disabled={!canDeal}>
            Deal
          </button>
          <button
            ref={submitBtnRef}
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={busy || phase !== 'dealt'}
          >
            Submit
          </button>
        </div>
        <p className="hint">Click a card or press 1–5 to hold · Enter/Space deals and submits</p>

        {result && (
          <div className="row">
            <section className="panel feedback" aria-live="polite">
              {result.grade.optimal ? (
                <div className="banner optimal">
                  ✔ Optimal
                  {result.grade.optimalMasks.length > 1
                    ? ` (${result.grade.optimalMasks.length} holds tie for best)`
                    : ''}
                </div>
              ) : (
                <>
                  <div className="banner mistake">✘ Mistake</div>
                  <div className="compare">
                    <div>
                      Best: <strong>{holdLabel(result.grade.bestMask)}</strong> (EV {result.grade.evBest.toFixed(4)})
                    </div>
                    <div>
                      Yours: <strong>{holdLabel(heldMask)}</strong> (EV {result.grade.evHeld.toFixed(4)})
                    </div>
                    <div>
                      Cost: {result.grade.evLost.toFixed(4)} bets = {money(result.grade.evLost)} at{' '}
                      {DENOM_LABELS[settings.denomination]} × 5
                    </div>
                  </div>
                </>
              )}
            </section>
            <TopHolds
              holds={result.holds}
              hand={hand ?? []}
              userMask={heldMask}
              userRank={result.grade.rank}
              evBest={result.grade.evBest}
            />
          </div>
        )}

        <StatsPanel
          gameName={game.name}
          totals={totalsEntry}
          denomination={settings.denomination}
          onDenominationChange={(d) => setSettings((s) => ({ ...s, denomination: d }))}
          onReset={resetStats}
        />
      </main>
    </div>
  );
}
