import { useState } from 'react';
import { parseHand, type GameDef, type GameId } from '../engine/index.ts';
import { ODDS_BY_GAME, oneIn } from '../lib/odds.ts';
import { pace, percent2, withArticle } from '../lib/oddsFormat.ts';
import { isWildCard } from '../lib/wild.ts';
import MiniCard from './MiniCard.tsx';

interface Props {
  game: GameDef;
  gameId: GameId;
}

/** Categories too ordinary to headline the picker; they still appear in the table. */
const NOT_HEADLINE = new Set(['nothing', 'three-kind', 'two-pair', 'jacks-or-better']);

export default function OddsTab({ game, gameId }: Props) {
  const odds = ODDS_BY_GAME[gameId];
  const [selectedKey, setSelectedKey] = useState<string>(() => odds?.categories[0]?.key ?? '');

  if (!odds) {
    return (
      <section className="panel odds-panel">
        <h2>Odds — {game.name}</h2>
        <p>Odds for this game are coming; the trainer&apos;s feedback is exact either way.</p>
      </section>
    );
  }

  const headlines = odds.categories.filter((c) => !NOT_HEADLINE.has(c.key));
  const selected = odds.categories.find((c) => c.key === selectedKey) ?? headlines[0];
  const rows = odds.draws.filter(
    (d) => d.targets.includes(selected.key) && Number.isFinite(d.odds[selected.key]),
  );
  const perfectPace = pace(selected.perfect);

  return (
    <section className="panel odds-panel">
      <h2>Odds — {game.name}</h2>

      <h3>Pick a hand</h3>
      <div className="odds-chips" role="group" aria-label="Hand to see odds for">
        {headlines.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`odds-chip${c.key === selected.key ? ' active' : ''}`}
            onClick={() => setSelectedKey(c.key)}
            aria-pressed={c.key === selected.key}
          >
            {c.label}
          </button>
        ))}
      </div>

      <h3>Odds by what you hold</h3>
      <p className="odds-intro">Chance the final hand is {withArticle(selected.label)} after the draw.</p>
      <div className="odds-draws">
        {rows.map((d) => (
          <div className="odds-draw" key={d.label}>
            <div className="odds-draw-left">
              <div className="odds-draw-label">{d.label}</div>
              <span className="mini-hand">
                {parseHand(d.hand).map((c, i) => (
                  <MiniCard
                    key={i}
                    card={c}
                    wild={isWildCard(game, c)}
                    emphasis={i < d.hold ? 'normal' : 'dimmed'}
                  />
                ))}
              </span>
            </div>
            <div className="odds-draw-value">
              <div className="odds-one-in">{oneIn(d.odds[selected.key])}</div>
              <div className="odds-pct">{percent2(d.odds[selected.key])}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="stats-grid odds-summary">
        <div className="stat">
          <div className="stat-value">{oneIn(selected.dealt)}</div>
          <div className="stat-label">Dealt to you</div>
        </div>
        <div className="stat">
          <div className="stat-value">{oneIn(selected.perfect)}</div>
          <div className="stat-label">Over a session, playing perfectly</div>
          {perfectPace !== null && <div className="odds-hours">{perfectPace} at 600 hands/hour</div>}
        </div>
      </div>

      <h3>Every hand at a glance</h3>
      <table className="odds-table">
        <thead>
          <tr>
            <th>Hand</th>
            <th>Dealt</th>
            <th>Perfect play</th>
          </tr>
        </thead>
        <tbody>
          {odds.categories.map((c) => (
            <tr key={c.key} className={c.key === selected.key ? 'selected' : ''}>
              <td>{c.label}</td>
              <td>{oneIn(c.dealt)}</td>
              <td>{oneIn(c.perfect)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="odds-footnote">
        Dealt = in your first 5 cards. Perfect play = the final hand when every hold is the
        engine&apos;s best. Example hands&apos; discards don&apos;t block the draw. Every number is exact
        enumeration, not simulation.
      </p>
    </section>
  );
}
