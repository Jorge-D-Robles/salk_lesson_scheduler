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

`ScheduleBuilder` uses a constructive cycle-based approach with day-level MRV backtracking:

1. **Pass 1**: Tries ≥28-day separation between same group/period assignments (top priority).
2. **Pass 2**: Falls back to ≥21-day separation if Pass 1 fails (only for extreme calendar gaps like 2-week winter break).

The algorithm tracks `achievedDayRule` (28 or 21) to indicate which pass succeeded.

For each day, it builds a candidate list prioritizing pending groups (those not yet seen in the current cycle), tries pending-only first with MU fill to preserve cycle order, then falls back to including next-cycle groups. Within each day, periods are assigned using MRV (Minimum Remaining Values) backtracking, and lessons are reordered by cycle position to maintain fairness in the flat sequence.

Available periods depend on the day cycle: Day 1 (odd) = [1, 4, 7, 8], Day 2 (even) = [1, 2, 3, 7, 8].

### Key Constraints (priority order)

1. **28-day rule** (highest priority): ≥28 days between the same group/period pair. Falls back to ≥21 only when mathematically impossible.
2. **Weekly uniqueness**: No group scheduled more than once per calendar week.
3. **MU limit**: At most 1 Make-Up (MU) slot per day.
4. **Balance**: Max-min lesson count difference across all groups ≤ 2.
5. **Cycle fairness** (best effort): All 22 groups should appear before any group repeats. Minor violations are acceptable (≤60) due to the 28-day period constraint creating unavoidable ordering conflicts.

### Test Helper Functions

`scheduler.spec.js` uses assertion helpers: `assertNo28DayConflicts`, `assertNoWeeklyConflicts`, `assertNoMUClustering`, `assertBalancedUsage`, `assertAllGroupsAppearBetweenRepetitions`.

`testing/helpers.mjs` provides CLI equivalents: `loadScheduler`, `runChecks`, `weekdaysInRange`, `allMondaysInRange`, `allFridaysInRange`.
