import { cardToString, type GameDef, type GameId } from '../engine/index.ts';
import { CHART_BY_GAME } from '../lib/charts.ts';

interface Props {
  game: GameDef;
  gameId: GameId;
}

export default function ChartTab({ game, gameId }: Props) {
  const chart = CHART_BY_GAME[gameId];
  if (!chart) {
    return (
      <section className="panel chart-panel">
        <h2>Strategy chart — {game.name}</h2>
        <p>A chart for this game is coming; the trainer&apos;s feedback is exact either way.</p>
      </section>
    );
  }
  const sections = [...chart.sections].sort((a, b) => b.section - a.section);
  return (
    <section className="panel chart-panel">
      <h2>Strategy chart — {game.name}</h2>
      <p className="chart-returns">
        Perfect play {(chart.perfectReturn * 100).toFixed(4)}% · following this chart{' '}
        {(chart.chartReturn * 100).toFixed(4)}% · not optimal on {(chart.errorRate * 100).toFixed(2)}% of
        hands
      </p>
      <p className="chart-rule">{chart.rule}</p>
      {sections.map((section) => (
        <div className="chart-section" key={section.section}>
          <h3>{section.title}</h3>
          <table className="chart-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Line</th>
                <th>Used</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {section.lines.map((line, i) => (
                <tr key={line.key}>
                  <td>{i + 1}</td>
                  <td>{line.label}</td>
                  <td>{(line.share * 100).toFixed(1)}%</td>
                  <td className="chart-example">{line.example.map(cardToString).join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
