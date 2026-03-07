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

`ScheduleBuilder` uses a constructive cycle-based approach with day-level MRV backtracking and **per-day-type period rotation** as the primary constraint.

For each day, it builds a candidate list prioritizing pending groups (those not yet seen in the current cycle), tries pending-only first with MU fill to preserve cycle order, then falls back to including next-cycle groups. Within each day, periods are assigned using MRV (Minimum Remaining Values) backtracking. Lessons are sorted by period number ascending for display.

Available periods depend on the day cycle: Day 1 (odd) = `DAY1_PERIODS` [1, 4, 7, 8], Day 2 (even) = `DAY2_PERIODS` [1, 2, 3, 7, 8].

**Per-day-type period rotation**: Each group tracks TWO rotation sets — one for Day 1 periods and one for Day 2 periods. A group can only use period P on day type T if P is NOT in its Day-T used set. Once all periods for that day type are used, the set resets. A secondary 14-day calendar floor prevents same group/period pairs from appearing within 14 calendar days regardless of day type. The solver has a 4-tier fallback: (1) pending groups only, (2) pending + next-cycle, (3) all groups ignoring cycle, (4) all groups ignoring both cycle and rotation constraints.

### Key Constraints (priority order)

1. **Per-day-type period rotation** (highest priority): A group must use all periods available on a day type before repeating any on that day type (Day 1: 4 periods, Day 2: 5 periods). A 14-day calendar floor also applies across day types.
2. **Weekly uniqueness**: No group scheduled more than once per calendar week.
3. **MU limit**: At most 1 Make-Up (MU) slot per day.
4. **Balance**: Max-min lesson count difference across all groups ≤ 2. Post-processing swap validation uses a 14-day calendar floor.
5. **Cycle fairness** (best effort): All 22 groups should appear before any group repeats. Violations scale with schedule length (≤500 for 40+ week schedules).

### Test Helper Functions

`scheduler.spec.js` uses assertion helpers: `assertNoRotationViolations` (bounded, max 20), `assertNo28DayConflicts` (secondary 14-day calendar floor check), `assertNoWeeklyConflicts`, `assertNoMUClustering`, `assertBalancedUsage`, `assertAllGroupsAppearBetweenRepetitions` (bounded, max 500).

`testing/helpers.mjs` provides CLI equivalents: `loadScheduler`, `runChecks`, `weekdaysInRange`, `allMondaysInRange`, `allFridaysInRange`.
