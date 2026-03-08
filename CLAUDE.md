# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static web app that generates music lesson schedules for 22 student instrumental groups at Jonas E. Salk Middle School. It solves a constraint satisfaction problem (CSP) using a constructive cycle-based algorithm with MRV backtracking.

## Running Tests

### Browser (Jasmine)
Tests use Jasmine 5.10.0 and run in the browser.

```bash
# Start a local server, then open http://localhost:8000/SpecRunner.html
python -m http.server 8000
```

### CLI (Node.js)
CLI test runners in `testing/` can run without a browser:

```bash
# Run spec-equivalent tests (mirrors scheduler.spec.js cases)
node testing/run_spec_tests.mjs

# Run torture tests (extreme edge cases, both day cycles)
node testing/run_torture_tests.mjs
```

Both scripts exit with code 1 on failure. They share helpers from `testing/helpers.mjs`.

There is no build step, linter, or package manager. The app runs as a static site directly in the browser.

## Architecture

### Source Files

- **`scheduler.js`** — Core scheduling algorithm. Contains `ScheduleEntry` (single day with lessons) and `ScheduleBuilder` (solver). No DOM access.
- **`ui_logic.js`** — All DOM interaction: collects form inputs, calls `ScheduleBuilder.buildSchedule()`, renders the result table, handles CSV export.
- **`scheduler.spec.js`** — Jasmine test suite for `scheduler.js`. Tests are never in `ui_logic.js`.
- **`scheduler_torture.spec.js`** — Jasmine torture test suite with extreme edge cases (heavy days off, short weeks, long schedules, boundary patterns).
- **`testing/`** — CLI test runners and shared helpers for Node.js-based testing.

### Scheduling Algorithm

`ScheduleBuilder` uses a constructive cycle-based approach with **week-level MRV backtracking** and a **28-day calendar spacing rule** as the primary period constraint.

**Construction** (`_constructSchedule`): Groups days by calendar week and solves all slots in each week simultaneously using `_solveWeekAssignment`. This week-level approach prevents the greedy day-by-day solver from exhausting scarce shared-period groups. The solver has a 4-tier fallback: (1) pending groups only, (2) pending + next-cycle, (3) all groups ignoring cycle, (4) all groups with reduced 21-day floor. Multi-trial with 10+ position offsets picks the best construction by combined cycle violations + balance spread.

**Post-processing pipeline** (`buildSchedule`):
1. `_repairViolations`: targeted swaps to fix any remaining 28-day violations
2. `_improveCycleOrder`: within-day swaps to reduce cycle violations (Phase 1 targets 480 for headroom)
3. `_balanceLessonCounts`: cycle-aware balance swaps + MU fill/replace strategies
4. Interleaved cycle improvement + balance passes

Available periods depend on the day cycle: Day 1 (odd) = `DAY1_PERIODS` [1, 4, 7, 8], Day 2 (even) = `DAY2_PERIODS` [1, 2, 3, 7, 8]. **Period numbers are global** — period 1 is the same period regardless of whether it falls on a Day 1 or Day 2.

**Chunked scheduling**: For multi-chunk scheduling (building 8-week blocks with history import), the constructor accepts an optional `cumulativeCounts` parameter with accurate accumulated lesson counts per group. This is critical for cross-chunk balance — 4-week period history alone has poor rank correlation with true global balance. When cumulative counts are provided, `_getAdjustedCounts()` uses them directly; otherwise it amplifies 4-week history deviation by 2x.

### Key Constraints (priority order)

1. **28-day calendar spacing** (highest priority): No group can have the same period number within 28 calendar days. Period numbers are global across day types.
2. **Weekly uniqueness**: No group scheduled more than once per calendar week.
3. **MU limit**: At most 1 Make-Up (MU) slot per day.
4. **Balance**: Max-min lesson count difference across all groups ≤ 2. Post-processing swap validation uses the 28-day floor.
5. **Cycle fairness** (best effort): All 22 groups should appear before any group repeats. Violations scale with schedule length (≤500 for 40+ week schedules).

### Test Helper Functions

`scheduler.spec.js` uses assertion helpers: `assertNo28DayConflicts` (28-day calendar spacing check), `assertNoWeeklyConflicts`, `assertNoMUClustering`, `assertBalancedUsage`, `assertAllGroupsAppearBetweenRepetitions` (bounded, max 500).

`testing/helpers.mjs` provides CLI equivalents: `loadScheduler`, `runChecks`, `weekdaysInRange`, `allMondaysInRange`, `allFridaysInRange`.

### Algorithm Attempts Log

**`ALGORITHM_ATTEMPTS.md`** documents all algorithm approaches tried, why they failed or succeeded, and known remaining issues. **Always read this file before attempting a new algorithm change** to avoid repeating failed approaches. Update it whenever you try something that doesn't work.
