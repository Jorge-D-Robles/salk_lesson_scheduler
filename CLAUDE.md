# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static web app that generates music lesson schedules for 22 student instrumental groups at Jonas E. Salk Middle School. It solves a constraint satisfaction problem (CSP) using a backtracking algorithm.

## Running Tests

Tests use Jasmine 5.10.0 and run in the browser — there is no CLI test runner.

```bash
# Start a local server, then open http://localhost:8000/SpecRunner.html
python -m http.server 8000
```

There is no build step, linter, or package manager. The app runs as a static site directly in the browser.

## Architecture

Three source files with clear separation of concerns:

- **`scheduler.js`** — Core CSP algorithm. Contains `ScheduleEntry` (single day with lessons) and `ScheduleBuilder` (solver). No DOM access.
- **`ui_logic.js`** — All DOM interaction: collects form inputs, calls `ScheduleBuilder.buildSchedule()`, renders the result table, handles CSV export.
- **`scheduler.spec.js`** — Jasmine test suite for `scheduler.js`. Tests are never in `ui_logic.js`.

### Scheduling Algorithm

`ScheduleBuilder` runs a two-pass backtracking solver:

1. **Pass 1**: Tries ≥28-day separation between same group/period assignments.
2. **Pass 2**: Falls back to ≥21-day separation if Pass 1 fails.

Available periods depend on the day cycle: Day 1 = [1, 4, 7, 8], Day 2 = [1, 2, 3, 7, 8]. The algorithm uses a greedy heuristic — groups that haven't had a lesson in a period for the longest time are tried first.

### Key Constraints

- No group scheduled more than once per week.
- ≥28 days (ideal) or ≥21 days (fallback) between the same group/period pair.
- At most 1 Make-Up (MU) slot per day.
- All 22 groups must appear before any group repeats (full-cycle fairness).

### Test Helper Functions

`scheduler.spec.js` uses assertion helpers that validate constraint satisfaction across the full output: `assertNo28DayConflicts`, `assertNoWeeklyConflicts`, `assertNoMUClustering`, `assertBalancedUsage`, `assertAllGroupsAppearBetweenRepetitions`.
