# Salk Middle School Lesson Scheduler

A constraint satisfaction solver that generates fair, conflict-free music lesson schedules for 22 student groups at Jonas E. Salk Middle School. Built as a static web app — no server, no build step, just open `index.html` in a browser.

## Running Tests

**Jasmine tests (browser):**
```bash
python -m http.server 8000
# Open http://localhost:8000/SpecRunner.html in your browser
```

**CLI tests (Node.js, no browser required):**
```bash
# Spec tests (19 scenarios covering core constraints)
node testing/run_spec_tests.mjs

# Torture tests (162 extreme edge cases, both day cycles, chunked scheduling)
node testing/run_torture_tests.mjs
```

**Bias analysis (statistical fairness report across 100+ scenarios):**
```bash
node testing/analyze_bias.mjs
# Open testing/bias_report.html in your browser
```

---

## The Problem

The music program pulls students out of academic classes for weekly instrumental lessons. This creates a scheduling conflict: if a student always misses the same class for their lesson, they fall behind in that subject. The scheduler must rotate which class each student misses while satisfying several hard constraints simultaneously.

### The Setup

The school uses a **two-day rotating cycle**. On odd-numbered school days (Day 1), lessons can happen during periods 1, 4, 7, and 8. On even-numbered school days (Day 2), lessons can happen during periods 1, 2, 3, 7, and 8. The cycle advances only on school days — weekends and days off don't count.

This means:
- Day 1 has **4 lesson slots**
- Day 2 has **5 lesson slots**
- A typical 5-day school week has either 22 or 23 total slots (depending on whether it starts on Day 1 or Day 2)
- Periods 1, 7, and 8 are **shared** — they appear on both day types
- Period 4 is exclusive to Day 1; periods 2 and 3 are exclusive to Day 2

There are **22 student groups** (labeled A through V), and each must have exactly one lesson per week. When a week has 23 slots but only 22 real groups, the extra slot is filled with a special **MU (Make-Up)** placeholder — a flexible period for extra help or makeup work.

### The Constraints

In priority order, the scheduler enforces:

1. **28-day period spacing** (hardest constraint): A group cannot be assigned to the same period number within 28 calendar days. This is what prevents students from repeatedly missing the same class. Period numbers are global — period 1 on Day 1 is the same class as period 1 on Day 2.

2. **Weekly uniqueness**: Each group appears at most once per calendar week. (They need exactly one lesson per week.)

3. **MU limit**: At most one MU slot per school day.

4. **Running balance**: At every point in the schedule, the difference between the most-taught and least-taught group must be ≤ 1. This prevents any group from getting ahead or falling behind as the year progresses.

5. **End-of-schedule balance**: The final lesson count spread across all groups must be ≤ 2.

6. **Cycle fairness** (best effort): All 22 groups should appear before any group repeats, like dealing a deck of cards.

### Why This Is Hard

The 28-day spacing rule is the root of the difficulty. Periods 1, 7, and 8 appear on *every* school day (both Day 1 and Day 2). Over 28 calendar days (4 weeks), a typical schedule has 20 school days, each consuming one group per shared period. That means ~20 of the 22 groups will have used period 1 in the last 28 days, leaving only ~2-3 groups eligible for period 1 on any given day. The same math applies to periods 7 and 8.

With only 2-3 valid groups per shared period and 3 shared periods per day, the assignments are tightly interlocked. A greedy day-by-day approach can paint itself into a corner — using a group for period 1 on Monday that was the *only* valid choice for period 7 on Friday.

Days off make it harder in a different way: they reduce the number of school days in a week, so a group might not appear at all that week, throwing off the running balance.

---

## How the Algorithm Works

The solver runs in two main stages: **construction** (building an initial schedule week by week) and **post-processing** (repairing any remaining constraint violations through targeted swaps).

### Stage 1: Construction

#### Slot Generation

The algorithm starts by generating every possible lesson slot: it walks forward from the start date, day by day, skipping weekends and days off. Each school day produces 4 or 5 slots depending on its day cycle. The result is a flat list of `{date, period, dayCycle}` objects.

#### Grouping by Week

Slots are grouped by day, then days are grouped by calendar week. This is the key architectural decision: **the solver works one week at a time**, not one day at a time. Solving all slots in a week simultaneously (typically ~22 slots) lets the algorithm see that a group needed for Friday's shared period shouldn't be consumed on Monday.

#### The Week-Level MRV Backtracking Solver

For each week, the algorithm runs a backtracking search across all slots in the week simultaneously. This is the heart of the scheduler.

**How it works:**

1. **Pre-compute valid groups per slot.** For each slot (a specific period on a specific day), filter the candidate groups to those that don't violate the 28-day spacing rule against prior weeks. Sort candidates by staleness — groups that haven't used this period in the longest time go first.

2. **Day-first MRV selection.** When choosing which slot to assign next, prefer the earliest unassigned day first (for running balance), then within that day pick the slot with the fewest valid remaining candidates. This is the **Minimum Remaining Values** heuristic — by tackling the most constrained slot first, the solver discovers dead ends early and backtracks quickly.

3. **Constraint checking during search.** As each group is assigned:
   - It's removed from the available pool for the rest of the week (weekly uniqueness)
   - MU count per day is tracked (max 1)
   - When all slots on a day are filled, a running balance check verifies the cumulative lesson counts across all groups still have spread ≤ 1

4. **Backtracking.** If a slot has no valid candidates remaining, the solver undoes the most recent assignment and tries the next candidate. A backtrack limit (80,000 steps) prevents runaway searches on pathological inputs.

#### Tiered Fallback

The week solver is called with progressively wider candidate pools:

- **Tier 1**: Only groups still "pending" in the current cycle (maintains cycle fairness)
- **Tier 2**: Pending + next-cycle groups (allows cycle breaks when necessary)
- **Tier 3**: All 22 groups regardless of cycle position
- All three tiers are tried first **with** the running balance constraint, then all three **without** it
- **Tier 4** (last resort): All groups with a relaxed 21-day spacing floor instead of 28

#### Balance-First Reordering

After the week solver assigns groups to slots, a second pass reorders *which* groups land on *which* days to optimize running balance. It sorts groups by their current lesson count (lowest first) and assigns them to the earliest days in the week, then verifies each day's assignments are still period-feasible using a per-day backtracking solver. If a day can't be solved, it tries swapping groups with later days.

#### Multi-Trial Search

The entire construction is run multiple times with different starting configurations: 22 position offsets (rotating which groups get priority in the first week) crossed with 2 day-stability modes (whether to prefer keeping groups on the same weekday as last week). The best result — scored by running balance violations and end-of-schedule spread — is kept.

### Stage 2: Post-Processing Pipeline

Even the best construction may have a few constraint violations. Four repair passes clean them up:

#### 1. Repair 28-Day Violations (`_repairViolations`)

Scans for any group+period pairs that appear within 28 calendar days of each other. For each violation, tries swapping the offending group with another group on the same day (different period). Accepts the swap if it reduces total violations without creating new ones.

#### 2. Repair Running Balance (`_repairRunningBalance`)

Finds the first day where the cumulative lesson count spread exceeds 1. Two strategies:

- **Cross-day swap**: Find a high-count group on a day at or before the violation, and a low-count group on a day after the violation. Swap them (changing which day each group appears on). Verify the swap doesn't create new balance violations in the affected date range, and doesn't violate 28-day spacing or weekly uniqueness.

- **Within-week swap**: If cross-day fails, try swapping groups between two days in the same week around the violation day.

Runs up to 60 passes, re-scanning for the earliest violation after each successful swap.

#### 3. Period Unblocking (`_unblockPeriods`)

Sometimes a low-count group is blocked from *all* periods on the violation day (every period was used by that group within the last 28 days). In this case, the repair can't place the group anywhere.

The unblocking pass changes which *period* the blocked group occupies on a prior day. By swapping the blocked group's period with another group on the same prior day, it frees up one period on the violation day. After unblocking, the running balance repair is re-run to complete the fix.

#### 4. Balance Lesson Counts (`_balanceLessonCounts`)

Reduces end-of-schedule count spread through three strategies:
- **Swap overused groups for underused ones** on days where the swap is constraint-safe
- **Fill MU slots** with underused groups to increase their count without displacing anyone
- **Replace overused groups with MU** to decrease their count (only on days without existing MU)

This pass is "safe" — if it worsens the running balance, all changes are reverted.

### DST Handling

All calendar-day calculations divide millisecond differences by 86,400,000 (one day in ms). Daylight Saving Time transitions shift clocks by ±1 hour, making a 28-calendar-day gap appear as 27.96 or 28.04 days in milliseconds. Without correction, this causes valid 28-day gaps to be incorrectly rejected.

The fix: `Math.round()` on all day-count calculations throughout the codebase (scheduler, tests, and assertion helpers).

### Chunked Scheduling

For multi-chunk scheduling (e.g., building 8-week blocks with 4-week history overlap), the constructor accepts a `cumulativeCounts` parameter — the true accumulated lesson count per group across all prior chunks. The 4-week history window alone has poor rank correlation with actual global balance; cumulative counts solve this by letting the balance-aware construction see accurate totals.

---

## Architecture

### Source Files

| File | Purpose |
|------|---------|
| `scheduler.js` | Core algorithm. `ScheduleEntry` (one day) and `ScheduleBuilder` (solver). No DOM access. |
| `ui_logic.js` | All DOM interaction: form inputs, schedule rendering, CSV export, drag-and-drop editing, undo. |
| `index.html` | Main application page. |
| `scheduler.spec.js` | Jasmine test suite — 19 scenarios covering all constraints. |
| `scheduler_torture.spec.js` | Jasmine torture tests — 162 extreme edge cases (heavy days off, short weeks, long schedules, chunked). |
| `testing/helpers.mjs` | Shared Node.js test helpers: `loadScheduler`, `runChecks`, date range utilities. |
| `testing/run_spec_tests.mjs` | CLI runner mirroring the Jasmine spec tests. |
| `testing/run_torture_tests.mjs` | CLI runner for torture tests. |
| `testing/analyze_bias.mjs` | Statistical bias analysis across 100+ scenarios, generates HTML report. |
| `ALGORITHM_ATTEMPTS.md` | Log of all algorithm approaches tried, what worked and what didn't. |

### Key Methods in `ScheduleBuilder`

| Method | Role |
|--------|------|
| `generateAllSlots()` | Walk calendar, produce all `{date, period}` slots |
| `_groupSlotsByDay(slots)` | Aggregate slots into per-day objects |
| `_groupDaysByWeek(days)` | Group days into calendar weeks |
| `_solveWeekAssignment(...)` | Week-level MRV backtracking solver |
| `_solveDayAssignment(...)` | Per-day MRV solver (used in balance-first reordering) |
| `_constructSchedule(...)` | Main construction loop: iterate weeks, call solvers, update state |
| `_repairViolations(...)` | Fix 28-day spacing violations via within-day swaps |
| `_repairRunningBalance(...)` | Fix running balance via cross-day swaps |
| `_unblockPeriods(...)` | Free blocked periods via prior-day period swaps |
| `_balanceLessonCounts(...)` | Reduce end-of-schedule count spread |
| `buildSchedule()` | Public entry point: multi-trial construction + post-processing pipeline |
