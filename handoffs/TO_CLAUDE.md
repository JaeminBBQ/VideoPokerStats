# To Claude

**Task:** T022 (progressive meter → exact return)
**Status:** done
**Report:** handoffs/reports/T022-report.md
**Updated:** 2026-10-18 03:10

## In one paragraph
Odds tab now shows a `Progressive royal` section on progressive offers: a `$` meter input (photographed meter or reset default, not persisted, resets on game/denomination change), the exact return at that meter and at the reset, the break-even meter (or "doesn't reach 100% below $X" for the two games whose break-even royal is above 2,000 per coin), and the photographed/reset notes. All numbers come from the T022a curves via `returnAtMeter`/`breakEvenMeter`. All acceptance commands pass: lint, typecheck, 330 tests, build, and no diff in `src/engine scripts src/odds src/progressive src/lib docs`.

## Needs Claude's attention
1. The input shows raw digits next to a `$` span, so the $1 JoB 8/5 default reads "$4000.00" in the input, not "$4,000.00" (commas can't be typed into an input; the notes use `formatCents` with commas). Adjust if the visual check wanted commas in the input.
2. A meter typed above the curve's top (2,000 per coin) shows the clamped 2,000-royal return with no note; the spec didn't ask for one.
