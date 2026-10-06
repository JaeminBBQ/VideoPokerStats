# Bankroll Monte Carlo cross-check

An independent simulation of session survival. It plays real hands through the engine (`deal`, then `analyzeHand`, then `draw`, then `payout`) and does not use the analytic risk pipeline (`src/engine/outcomes.ts`, `src/lib/risk.ts`). If the two methods disagree beyond sampling error, one of them has a bug.

## Model
- Units are 1 max bet. Each hand costs 1 and returns `payout(game, final)`.
- Each hand is dealt from a fresh 52-card deck. With probability e the player holds the best hold whose EV is more than `EV_EPSILON` below the optimum (a "mistake"). Otherwise the player holds `analyzeHand(...)[0]`.
- A session has 2,000 hands. With starting bankroll B, the session survives iff B + (net before hand i) ≥ 1 for every hand i. Each simulated path records 1 − min(net before hand i), which is the bankroll it needed. Survival at B is the fraction of paths that needed B or less.
- Every session uses its own `mulberry32` stream seeded from (seed, session index), so the results are reproducible and don't depend on the worker count. The runs used 8 worker threads, and each worker builds its own tables.
- Survival SE = sqrt(p(1−p)/n). The "bankroll needed" for q% survival is the smallest B that at least q% of sessions survived.

## Commands (seed 1, 30,000 sessions × 2,000 hands = 60M hands per run)
```
node scripts/bankroll-sim.ts job-8-5 0 2000 30000 1
node scripts/bankroll-sim.ts job-8-5 0.01 2000 30000 1
node scripts/bankroll-sim.ts lb-deuces-16-13 0 2000 30000 1
node scripts/bankroll-sim.ts lb-deuces-16-13 0.01 2000 30000 1
```
Each run took about 131–138 s on 8 cores, or about 436k–457k hands/sec including table builds. The total was about 9 minutes for 240M hands.

## Return sanity check (e = 0)
| Game | Simulated return | 1 SE | Published | z |
|---|---:|---:|---:|---:|
| job-8-5 | 97.2386% | 0.0560% | 97.3000% | −1.10 |
| lb-deuces-16-13 | 96.8598% | 0.0655% | 96.7651% | +1.45 |

Both are within 3 SE of the published return. At e = 0.01 the returns are 97.1492% (JoB) and 96.5075% (DW). They are below published, as expected, because a 1% mistake rate costs EV.

## Results

### Jacks or Better — 8/5 (job-8-5)  e=0  2000 hands/session  30000 sessions  seed=1  workers=8

```
hands 60,000,000  time 137.5s  436,339 hands/sec (incl. table builds)
mistakes made 0 (0.000% of hands)
mean return 97.2386% ± 0.0560% (1 SE; sd/hand 4.337)  published 97.3000%  z=-1.10
mean net/hand -0.02761 vs return-1 -0.02700  mean session net -55.2 bets
```

| Bankroll (bets) | Survival | ± 1 SE | Ruined sessions |
|---:|---:|---:|---:|
| 50 | 14.550% | 0.204% | 25635 |
| 100 | 38.820% | 0.281% | 18354 |
| 150 | 66.730% | 0.272% | 9981 |
| 200 | 86.880% | 0.195% | 3936 |
| 300 | 99.530% | 0.039% | 141 |
| 400 | 100.000% | 0.000% | 0 |
| 600 | 100.000% | 0.000% | 0 |
| 800 | 100.000% | 0.000% | 0 |
| 1200 | 100.000% | 0.000% | 0 |
| 1600 | 100.000% | 0.000% | 0 |

| Survival target | Bankroll needed (bets) |
|---:|---:|
| 50% | 120 |
| 90% | 211 |
| 95% | 237 |
| 99% | 283 |

### Jacks or Better — 8/5 (job-8-5)  e=0.01  2000 hands/session  30000 sessions  seed=1  workers=8

```
hands 60,000,000  time 131.4s  456,788 hands/sec (incl. table builds)
mistakes made 601,253 (1.002% of hands)
mean return 97.1492% ± 0.0566% (1 SE; sd/hand 4.385)  published 97.3000%  z=-2.66
mean net/hand -0.02851 vs return-1 -0.02700  mean session net -57.0 bets
```

| Bankroll (bets) | Survival | ± 1 SE | Ruined sessions |
|---:|---:|---:|---:|
| 50 | 14.240% | 0.202% | 25728 |
| 100 | 37.657% | 0.280% | 18703 |
| 150 | 65.210% | 0.275% | 10437 |
| 200 | 86.493% | 0.197% | 4052 |
| 300 | 99.437% | 0.043% | 169 |
| 400 | 99.993% | 0.005% | 2 |
| 600 | 100.000% | 0.000% | 0 |
| 800 | 100.000% | 0.000% | 0 |
| 1200 | 100.000% | 0.000% | 0 |
| 1600 | 100.000% | 0.000% | 0 |

| Survival target | Bankroll needed (bets) |
|---:|---:|
| 50% | 123 |
| 90% | 213 |
| 95% | 239 |
| 99% | 287 |

### Deuces Wild — 16/13 (lb-deuces-16-13)  e=0  2000 hands/session  30000 sessions  seed=1  workers=8

```
hands 60,000,000  time 131.7s  455,486 hands/sec (incl. table builds)
mistakes made 0 (0.000% of hands)
mean return 96.8598% ± 0.0655% (1 SE; sd/hand 5.071)  published 96.7651%  z=1.45
mean net/hand -0.03140 vs return-1 -0.03235  mean session net -62.8 bets
```

| Bankroll (bets) | Survival | ± 1 SE | Ruined sessions |
|---:|---:|---:|---:|
| 50 | 11.240% | 0.182% | 26628 |
| 100 | 26.420% | 0.255% | 22074 |
| 150 | 45.140% | 0.287% | 16458 |
| 200 | 65.620% | 0.274% | 10314 |
| 300 | 93.730% | 0.140% | 1881 |
| 400 | 99.723% | 0.030% | 83 |
| 600 | 100.000% | 0.000% | 0 |
| 800 | 100.000% | 0.000% | 0 |
| 1200 | 100.000% | 0.000% | 0 |
| 1600 | 100.000% | 0.000% | 0 |

| Survival target | Bankroll needed (bets) |
|---:|---:|
| 50% | 162 |
| 90% | 279 |
| 95% | 310 |
| 99% | 365 |

### Deuces Wild — 16/13 (lb-deuces-16-13)  e=0.01  2000 hands/session  30000 sessions  seed=1  workers=8

```
hands 60,000,000  time 133.7s  448,753 hands/sec (incl. table builds)
mistakes made 600,707 (1.001% of hands)
mean return 96.5075% ± 0.0642% (1 SE; sd/hand 4.976)  published 96.7651%  z=-4.01
mean net/hand -0.03493 vs return-1 -0.03235  mean session net -69.9 bets
```

| Bankroll (bets) | Survival | ± 1 SE | Ruined sessions |
|---:|---:|---:|---:|
| 50 | 10.757% | 0.179% | 26773 |
| 100 | 25.270% | 0.251% | 22419 |
| 150 | 43.447% | 0.286% | 16966 |
| 200 | 64.213% | 0.277% | 10736 |
| 300 | 93.343% | 0.144% | 1997 |
| 400 | 99.720% | 0.031% | 84 |
| 600 | 100.000% | 0.000% | 0 |
| 800 | 100.000% | 0.000% | 0 |
| 1200 | 100.000% | 0.000% | 0 |
| 1600 | 100.000% | 0.000% | 0 |

| Survival target | Bankroll needed (bets) |
|---:|---:|
| 50% | 167 |
| 90% | 282 |
| 95% | 313 |
| 99% | 368 |
