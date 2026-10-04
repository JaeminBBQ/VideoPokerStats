import { useEffect, useRef, useState } from 'react';
import {
  EngineClient,
  GAMES,
  GAME_LIST,
  cardToString,
  deal,
  disguiseHand,
  patternFor,
  rankOf,
  type Card,
  type GameId,
  type HoldEv,
  type MistakeSignature,
  type SimilarMatch,
} from './engine/index.ts';
import { grade, type Grade } from './lib/grade.ts';
import { recordHand, resetGame, type HandRecord, type Totals, type TotalsEntry } from './lib/stats.ts';
import {
  createStorage,
  DEFAULT_SETTINGS,
  DENOM_LABELS,
  DENOMINATIONS,
  type Mode,
  type Settings,
} from './lib/storage.ts';
import {
  applyDrillResult,
  applyNewMistake,
  confusionKey,
  drillSessionStats,
  groupConfusions,
  pickConfusion,
  type DrillState,
} from './lib/drill.ts';
import CardView, { type CardEmphasis } from './components/CardView.tsx';
import ChartTab from './components/ChartTab.tsx';
import DrillPanel from './components/DrillPanel.tsx';
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
  const mode: Settings['mode'] = {};
  if (typeof s.mode === 'object' && s.mode !== null && !Array.isArray(s.mode)) {
    for (const [k, v] of Object.entries(s.mode)) {
      if (GAMES[k as GameId] && (v === 'deal' || v === 'drill')) mode[k as GameId] = v;
    }
  }
  return {
    gameId: GAMES[s.gameId] ? s.gameId : DEFAULT_SETTINGS.gameId,
    denomination: (DENOMINATIONS as readonly number[]).includes(s.denomination)
      ? s.denomination
      : DEFAULT_SETTINGS.denomination,
    mode,
  };
}

type Phase = 'preparing' | 'ready' | 'dealt' | 'graded' | 'error';
type Tab = 'trainer' | 'chart';

/** What the hand currently out in Drill mode is about. */
interface DrillCtx {
  key: string;
  signature: MistakeSignature | null;
  match: SimilarMatch;
  streak: number;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('trainer');
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
  const [drillState, setDrillState] = useState<DrillState>(() => storage.loadDrill());
  const [drillCtx, setDrillCtx] = useState<DrillCtx | null>(null);
  const [drillPreparing, setDrillPreparing] = useState(false);
  const [lastDrill, setLastDrill] = useState<{ gameId: GameId; key: string } | null>(null);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [sessionStart] = useState(() => Date.now());
  const dealBtnRef = useRef<HTMLButtonElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const gameId = settings.gameId;
  const game = GAMES[gameId];
  const mode = settings.mode[gameId] ?? 'deal';
  const isDeuces = game.rows.some((row) => row.key === 'four-deuces');

  const confusions = groupConfusions(history, game);
  const toDrill = confusions.filter((c) => !drillState[gameId]?.[c.key]?.cleared);
  const sessionDrill = drillSessionStats(history, gameId, sessionStart);

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
    storage.saveDrill(drillState);
  }, [drillState]);
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

  /** Pick a confusion and deal a fresh hand posing the same decision (D6). */
  const startDrill = async () => {
    if (busy) return;
    const picked = pickConfusion(
      confusions,
      drillState,
      gameId,
      secureRng(),
      lastDrill?.gameId === gameId ? lastDrill.key : undefined,
    );
    if (!picked) return;
    setLastDrill({ gameId, key: picked.key });
    const streak = drillState[gameId]?.[picked.key]?.streak ?? 0;
    if (picked.signature) {
      setDrillPreparing(true);
      setBusy(true);
      try {
        const { hand: h, match } = await engine.similar(gameId, picked.signature);
        setDrillCtx({ key: picked.key, signature: picked.signature, match, streak });
        setHand(h);
        setHeldMask(0);
        setResult(null);
        setPhase('dealt');
      } catch (err) {
        setEngineError(String(err));
        setPhase('error');
      } finally {
        setBusy(false);
        setDrillPreparing(false);
      }
    } else {
      // No chart classifier: replay the same misplayed hand with suits and order disguised.
      setDrillCtx({ key: picked.key, signature: null, match: 'exact', streak });
      setHand(disguiseHand(picked.example.hand, secureRng()));
      setHeldMask(0);
      setResult(null);
      setPhase('dealt');
    }
  };

  const submit = async () => {
    if (!hand || phase !== 'dealt' || busy) return;
    setBusy(true);
    try {
      const holds = await engine.analyze(gameId, hand);
      const g = grade(holds, heldMask);
      const isDrill = mode === 'drill' && drillCtx !== null;
      const rec: HandRecord = {
        ts: Date.now(),
        gameId,
        hand,
        heldMask,
        bestMask: g.bestMask,
        evHeld: g.evHeld,
        evBest: g.evBest,
        mode: isDrill ? 'drill' : 'deal',
      };
      const state = recordHand({ history, totals }, rec);
      setHistory(state.history);
      setTotals(state.totals);
      if (isDrill) {
        const next = applyDrillResult(drillState, gameId, drillCtx.key, g.optimal);
        setDrillState(next);
        setDrillCtx((c) => (c ? { ...c, streak: next[gameId]?.[c.key]?.streak ?? 0 } : c));
      } else if (!g.optimal) {
        setDrillState((s) => applyNewMistake(s, gameId, confusionKey(rec, game)));
      }
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
    setDrillCtx(null);
    setDrillPreparing(false);
    setLastDrill(null);
  };

  /** Switch modes: keep the engine prepared, but drop any hand in progress. */
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setSettings((s) => ({ ...s, mode: { ...s.mode, [gameId]: m } }));
    setPhase((p) => (p === 'preparing' || p === 'error' ? p : 'ready'));
    setHand(null);
    setHeldMask(0);
    setResult(null);
    setDrillCtx(null);
    setDrillPreparing(false);
    setLastDrill(null);
  };

  const retry = () => {
    setPhase('preparing');
    setEngineError(null);
    setHand(null);
    setHeldMask(0);
    setResult(null);
    setDrillCtx(null);
    setDrillPreparing(false);
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
        if (phase === 'ready' || phase === 'graded' || phase === 'error') {
          if (mode === 'drill') void startDrill();
          else dealNew();
        } else if (phase === 'dealt') void submit();
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
    // A reset game forgets its drill pool too (D7).
    setDrillState((d) => {
      if (!d[gameId]) return d;
      const next = { ...d };
      delete next[gameId];
      return next;
    });
  };

  const canDeal =
    !busy &&
    (phase === 'ready' || phase === 'graded' || phase === 'error') &&
    !(mode === 'drill' && toDrill.length === 0);

  const feedbackBestLine = result ? patternFor(game, (hand ?? []).filter((_, i) => result.grade.bestMask & (1 << i))) : null;
  const feedbackHeldLine = result ? patternFor(game, (hand ?? []).filter((_, i) => heldMask & (1 << i))) : null;

  return (
    <div className="app">
      <nav className="tabs" aria-label="Page">
        <button
          type="button"
          className={`tab${tab === 'trainer' ? ' active' : ''}`}
          onClick={() => setTab('trainer')}
        >
          Trainer
        </button>
        <button type="button" className={`tab${tab === 'chart' ? ' active' : ''}`} onClick={() => setTab('chart')}>
          Chart
        </button>
      </nav>

      <header className="header">
        <h1>Video Poker Trainer</h1>
        <div className="header-row">
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
          <div className="mode-switch" role="group" aria-label="Mode">
            <button type="button" className={mode === 'deal' ? 'active' : ''} onClick={() => switchMode('deal')}>
              Deal
            </button>
            <button type="button" className={mode === 'drill' ? 'active' : ''} onClick={() => switchMode('drill')}>
              Drill
            </button>
          </div>
        </div>
        <p className="where">{game.where}</p>
        <Paytable game={game} open={paytableOpen} onToggle={() => setPaytableOpen((o) => !o)} />
      </header>

      {tab === 'chart' ? (
        <main>
          <ChartTab game={game} gameId={gameId} />
        </main>
      ) : (
        <>
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
            {mode === 'drill' &&
              (drillCtx ? (
                <div className="drill-prompt" aria-live="polite">
                  {drillCtx.signature ? (
                    <>
                      Drill: you held <strong>{drillCtx.signature.chosenLabel}</strong> instead of{' '}
                      <strong>{drillCtx.signature.bestLabel}</strong>
                      {drillCtx.signature.sectionLabel ? ` (${drillCtx.signature.sectionLabel})` : ''} ·
                      streak {drillCtx.streak}/3
                    </>
                  ) : (
                    <>Drill: a hand you misplayed · streak {drillCtx.streak}/3</>
                  )}
                  {drillCtx.match !== 'exact' && (
                    <span className="drill-note">
                      {drillCtx.match === 'best-line'
                        ? 'closest available: same correct line'
                        : 'closest available: same number of deuces'}
                    </span>
                  )}
                </div>
              ) : drillPreparing ? (
                <div className="status">Preparing drill hand…</div>
              ) : toDrill.length === 0 ? (
                <div className="drill-prompt empty">
                  Nothing to drill for this game yet. Misplayed hands from Deal mode show up here.
                </div>
              ) : null)}

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
              <button
                ref={dealBtnRef}
                type="button"
                className="btn primary"
                onClick={() => {
                  if (mode === 'drill') void startDrill();
                  else dealNew();
                }}
                disabled={!canDeal}
              >
                {mode === 'drill' ? 'Next drill' : 'Deal'}
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
                          Best: <strong>{holdLabel(result.grade.bestMask)}</strong>
                          {feedbackBestLine ? <>: {feedbackBestLine.label}</> : null} (EV{' '}
                          {result.grade.evBest.toFixed(4)})
                        </div>
                        <div>
                          Yours: <strong>{holdLabel(heldMask)}</strong>
                          {feedbackHeldLine ? <>: {feedbackHeldLine.label}</> : null} (EV{' '}
                          {result.grade.evHeld.toFixed(4)})
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
                  game={game}
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

            {mode === 'drill' && (
              <DrillPanel
                game={game}
                gameId={gameId}
                confusions={confusions}
                drillState={drillState}
                session={sessionDrill}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
