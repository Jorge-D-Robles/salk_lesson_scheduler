# Update Guide: How to Change the Scheduling Algorithm

This guide explains how to modify the Salk Middle School music lesson scheduler when requirements change. It covers every realistic change scenario, which files to edit, what to watch out for, and how to verify your changes.

**Before making any algorithm changes**, read `ALGORITHM_ATTEMPTS.md` — it documents every approach tried, what failed, and why. This prevents repeating known mistakes.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [The Central Config: `schedule_config.js`](#the-central-config)
3. [Simple Config Changes (One-File Edits)](#simple-config-changes)
4. [Structural Changes (Multi-File Edits)](#structural-changes)
5. [Algorithm Changes](#algorithm-changes)
6. [UI-Only Changes](#ui-only-changes)
7. [Adding New Constraints](#adding-new-constraints)
8. [Test Infrastructure](#test-infrastructure)
9. [Common Pitfalls](#common-pitfalls)
10. [Verification Checklist](#verification-checklist)

---

## Architecture Overview

```
schedule_config.js          ← Single source of truth for all constants
        │
        ├── scheduler.js         ← Core algorithm (no DOM access)
        │       ├── ScheduleEntry    ← Single day with lessons
        │       └── ScheduleBuilder  ← Constraint solver
        │
        ├── ui_logic.js          ← DOM interaction, rendering, CSV export
        ├── scheduler_worker.js  ← Web Worker wrapper for scheduler.js
        │
        ├── scheduler.spec.js           ← Jasmine browser tests (19 tests)
        ├── scheduler_torture.spec.js   ← Jasmine torture tests (162 tests)
        │
        └── testing/
            ├── helpers.mjs      ← CLI test helpers (loads config + scheduler via eval)
            ├── run_spec_tests.mjs
            ├── run_torture_tests.mjs
            ├── diagnose_balance.mjs
            ├── diagnose_balance_root.mjs
            ├── diagnose_cycle.mjs
            └── analyze_bias.mjs
```

### How loading works

- **Browser (index.html, SpecRunner.html):** `<script>` tags load `schedule_config.js` before `scheduler.js`. Both files create globals (`SCHEDULE_CONFIG`, `ScheduleBuilder`, etc.).
- **Web Worker (scheduler_worker.js):** `importScripts('schedule_config.js', 'scheduler.js')`.
- **Node.js CLI tests (testing/helpers.mjs):** `loadScheduler()` reads both files as strings and executes them together via `new Function(configCode + schedulerCode + 'return { ... }')`. The returned object includes `SCHEDULE_CONFIG`.

### Algorithm pipeline (scheduler.js)

`ScheduleBuilder.buildSchedule()` runs this pipeline:

1. **Multi-trial construction:** Tries `TOTAL_TRIALS` (44) combinations of position offsets × dayStability modes. Each trial runs `_constructSchedule()` which processes days week-by-week:
   - Groups days into calendar weeks via `_groupDaysByWeek()`
   - For each week, builds candidate groups in priority tiers (pending → next-cycle → all)
   - Solves all slots in the week simultaneously via `_solveWeekAssignment()` (MRV backtracking)
   - Falls back through 4 tiers: (1) pending only, (2) pending + next-cycle, (3) all groups, (4) all groups with reduced 21-day floor
   - After week solver, does balance-first reordering + per-day feasibility checks
   - Tracks running balance (max-min ≤ 1) at every day boundary during backtracking

2. **Post-processing pipeline** (on the best construction):
   - `_repairViolations()` — targeted within-day swaps to fix 28-day spacing violations
   - `_repairRunningBalance()` — cross-day swaps (any two days) to fix running balance violations
   - `_unblockPeriods()` — period swaps on prior days to unblock low-count groups from all-period-blocked situations
   - `_balanceLessonCounts()` — balance swaps + MU fill/replace strategies (safe: reverts if running balance worsens)

---

## The Central Config

All schedule-structure constants live in `schedule_config.js`:

```js
SCHEDULE_CONFIG = {
    DAY1_PERIODS: [1, 4, 7, 8],        // Periods available on odd day cycles
    DAY2_PERIODS: [1, 2, 3, 7, 8],      // Periods available on even day cycles
    REQUIRED_UNIQUE_GROUPS: 22,          // Total number of student groups
    DEFAULT_GROUP_NAMES: ["A", "B", ...],// Fallback names when no history
    CALENDAR_SPACING_FLOOR: 28,          // Min calendar days between same group+period
    REDUCED_SPACING_FLOOR: 21,           // Fallback spacing for Tier 4
    MU_LIMIT_PER_DAY: 1,                // Max Make-Up slots per day
    MU_TOKEN: "MU",                      // String identifier for Make-Up lessons
    RUNNING_BALANCE_THRESHOLD: 1,        // Max spread (max-min) at any day boundary
    END_BALANCE_THRESHOLD: 1,            // Max spread at end of schedule
    PERIOD_PREFIX: "Pd ",                // Display prefix for period numbers
    ONE_DAY_MS: 86400000,                // Milliseconds in one day
    HISTORY_WEEKS: 4,                    // Weeks of history used for continuity
    // Derived (auto-computed):
    MAX_PERIODS_PER_DAY: 5,              // max(DAY1.length, DAY2.length)
    TABLE_COLUMNS: 13,                   // 3 + MAX_PERIODS * 2
    TOTAL_TRIALS: 44,                    // REQUIRED_UNIQUE_GROUPS * 2
}
```

### What "derived" means

`MAX_PERIODS_PER_DAY`, `TABLE_COLUMNS`, and `TOTAL_TRIALS` are computed from other values. **Never edit them directly** — change the source values and they update automatically.

---

## Simple Config Changes (One-File Edits)

These changes only require editing `schedule_config.js`. Everything propagates automatically.

### Change the spacing rule (e.g., 28 days → 21 days)

Edit `CALENDAR_SPACING_FLOOR` in `schedule_config.js`:
```js
CALENDAR_SPACING_FLOOR: 21,  // was 28
```

Also consider adjusting `REDUCED_SPACING_FLOOR` (the Tier 4 fallback). It should be less than `CALENDAR_SPACING_FLOOR`:
```js
REDUCED_SPACING_FLOOR: 14,  // was 21
```

**Caveats:**
- Decreasing the spacing makes the problem easier — more assignments are valid. Tests should still pass.
- Increasing the spacing (e.g., 28 → 35) makes it harder. The algorithm may fail to find solutions for short schedules or heavy day-off patterns. Run all tests and check for empty schedules.
- User-facing strings like "28-day conflict" are generated dynamically using the config value, so they auto-update.
- The label `"Use schedule history from previous 4 weeks"` in `index.html` (line ~424) is static HTML and must be updated manually if `HISTORY_WEEKS` changes.

### Change the MU limit (e.g., 1 → 2 per day)

Edit `MU_LIMIT_PER_DAY` in `schedule_config.js`:
```js
MU_LIMIT_PER_DAY: 2,  // was 1
```

This value is checked in `_solveWeekAssignment()` (the `muPerDay >= SCHEDULE_CONFIG.MU_LIMIT_PER_DAY` guard). It controls how many MU slots are allowed per day during construction.

**Caveats:**
- The `assertNoMUClustering` test helper in `scheduler.spec.js` has a hardcoded check `expect(muCount).toBeLessThanOrEqual(1, ...)`. You must update this to use `SCHEDULE_CONFIG.MU_LIMIT_PER_DAY`.
- Similarly, the `runChecks` function in `testing/helpers.mjs` checks `d.lessons.filter(l => l.group === _cfg.MU_TOKEN).length > 1` — update the `> 1` to `> _cfg.MU_LIMIT_PER_DAY`.
- The `_balanceLessonCounts()` MU-replace strategy checks `day.lessons.some(l => l.group === MU_TOKEN)` to skip days that already have MU. With limit > 1, this logic needs adjustment to count MU occurrences instead.

### Change balance thresholds

Edit `RUNNING_BALANCE_THRESHOLD` and/or `END_BALANCE_THRESHOLD`:
```js
RUNNING_BALANCE_THRESHOLD: 2,  // was 1 — allows more imbalance during schedule
END_BALANCE_THRESHOLD: 2,      // was 1 — allows more imbalance at end
```

**Where these are used:**
- `RUNNING_BALANCE_THRESHOLD`: checked in `testing/helpers.mjs` (`runChecks` and `checkRunningBalance`)
- `END_BALANCE_THRESHOLD`: checked in `scheduler.spec.js` (`assertBalancedUsage`)
- The algorithm itself uses hardcoded `> 1` checks in `_solveWeekAssignment()` (line ~463, ~488), `_repairRunningBalance()` (line ~965, ~1028), `_unblockPeriods()` (line ~1123), and `_runningBalanceViolations()` (line ~1424). **These are currently NOT wired to the config threshold** — they use literal `> 1` because the algorithm was designed for threshold = 1. If you change the threshold, you must also update these comparisons in `scheduler.js` to use `SCHEDULE_CONFIG.RUNNING_BALANCE_THRESHOLD`.

### Change the period prefix display

Edit `PERIOD_PREFIX` in `schedule_config.js`:
```js
PERIOD_PREFIX: "Period ",  // was "Pd "
```

This affects how periods are stored in `ScheduleEntry.lessons[].period` (e.g., `"Period 1"` instead of `"Pd 1"`) and all `replace(SCHEDULE_CONFIG.PERIOD_PREFIX, "")` calls that extract the number.

**Caveats:**
- CSV export in `ui_logic.js` writes the period value directly, so exported CSVs will show the new prefix.
- CSV/history import parses period numbers using regex (`/\D/g`) in some places and `PERIOD_PREFIX` replacement in others. Verify that imports still work by testing with a previously exported CSV.

---

## Structural Changes (Multi-File Edits)

These require config changes PLUS algorithm or test adjustments.

### Add or remove a period from a day cycle

Edit `_DAY1` or `_DAY2` at the top of `schedule_config.js`:
```js
// Example: add period 5 to Day 1
const _DAY1 = Object.freeze([1, 4, 5, 7, 8])  // was [1, 4, 7, 8]
```

**What auto-updates:**
- `MAX_PERIODS_PER_DAY` — derived, recalculated
- `TABLE_COLUMNS` — derived, the HTML table header is built dynamically in `buildTableHeader()` (ui_logic.js)
- Slot generation in `generateAllSlots()` — uses `DAY1_PERIODS`/`DAY2_PERIODS` directly
- Test slot count assertions in `testing/helpers.mjs` and `scheduler_torture.spec.js` — use `_cfg.DAY1_PERIODS.length` / `_cfg.DAY2_PERIODS.length`

**What you must check manually:**
- **Period conflicts:** Adding a new shared period (one that appears in BOTH day arrays, like period 1, 7, or 8) makes the problem harder. The 28-day spacing constraint has fewer valid assignments for shared periods. Test thoroughly.
- **Period uniqueness:** Both arrays should contain only valid period numbers. The algorithm treats period numbers as global — period 1 on Day 1 is the same as period 1 on Day 2.
- **CSV import/export:** No changes needed — periods are stored by number.
- **Asymmetry:** It's fine for the arrays to have different lengths. `MAX_PERIODS_PER_DAY` handles this.

### Change the number of groups (e.g., 22 → 20)

Edit `_GROUP_COUNT` in `schedule_config.js`:
```js
const _GROUP_COUNT = 20  // was 22
```

**What auto-updates:**
- `REQUIRED_UNIQUE_GROUPS`, `DEFAULT_GROUP_NAMES` (now A-T instead of A-V), `TOTAL_TRIALS` (now 40)
- All validation checks that compare group counts
- Test assertions using `SCHEDULE_CONFIG.REQUIRED_UNIQUE_GROUPS`

**What you must adjust manually:**

1. **Test data in `scheduler.spec.js`:** The `FULL_GROUP_LIST` array (line ~306) has 22 specific instrument group names. If reducing to 20, remove 2 entries. If increasing, add entries. The list must have exactly `REQUIRED_UNIQUE_GROUPS` items:
   ```js
   const FULL_GROUP_LIST = [
       "Flutes", "Clarinets", "Oboes", /* ... exactly 20 entries ... */
   ]
   ```

2. **Algorithm tuning:** The algorithm's heuristics (backtrack limit of 80,000, 60 repair passes, balance pass limits of 10) were tuned for 22 groups. Fewer groups = easier problem (should work). More groups = harder problem — you may need to:
   - Increase `BACKTRACK_LIMIT` in `_solveWeekAssignment()` (currently 80,000, line ~409)
   - Increase repair pass limits in `_repairRunningBalance()` (currently 60 passes, line ~952)
   - Increase balance pass limits in `_balanceLessonCounts()` (currently 10, line ~1237)
   - Add more trials (increase `TOTAL_TRIALS` manually or adjust the formula)

3. **Feasibility check in `_solveWeekAssignment()`:** The quick feasibility check `realCandidates + numDays < numSlots` (line ~341) ensures enough groups exist to fill all slots. With fewer groups, you need more MU slots. Verify the algorithm handles this.

4. **Cycle fairness:** The cycle fairness check (all N groups appear before any repeats) in `ALGORITHM_ATTEMPTS.md` is bounded to ≤ 500 violations. This threshold may need adjustment for different group counts.

5. **Chunked scheduling tests:** In `testing/run_torture_tests.mjs`, the `runChunkedTest` function creates default groups using `SCHEDULE_CONFIG.DEFAULT_GROUP_NAMES`. This auto-updates.

6. **Analysis utilities:** `testing/diagnose_balance.mjs`, `testing/diagnose_balance_root.mjs`, `testing/analyze_bias.mjs` — these already use `SCHEDULE_CONFIG.DEFAULT_GROUP_NAMES` and `SCHEDULE_CONFIG.REQUIRED_UNIQUE_GROUPS`.

### Add a third day cycle (Day 3)

This is a significant structural change. Currently the algorithm assumes exactly 2 day cycles (odd = Day 1, even = Day 2).

**Files to modify:**

1. **`schedule_config.js`:** Add `DAY3_PERIODS` and update `MAX_PERIODS_PER_DAY`:
   ```js
   const _DAY1 = Object.freeze([1, 4, 7, 8])
   const _DAY2 = Object.freeze([1, 2, 3, 7, 8])
   const _DAY3 = Object.freeze([2, 4, 5, 8])  // new
   const _MAX_PERIODS = Math.max(_DAY1.length, _DAY2.length, _DAY3.length)
   ```

2. **`scheduler.js` — `generateAllSlots()`:** The period selection logic uses `currentDayCycle % 2 !== 0 ? DAY1_PERIODS : DAY2_PERIODS`. Replace with a function that handles 3 cycles:
   ```js
   // Replace: currentDayCycle % 2 !== 0 ? DAY1_PERIODS : DAY2_PERIODS
   // With something like:
   const cycleIndex = ((currentDayCycle - 1) % 3) + 1  // 1, 2, 3, 1, 2, 3...
   const periods = cycleIndex === 1 ? DAY1_PERIODS :
                   cycleIndex === 2 ? DAY2_PERIODS : DAY3_PERIODS
   ```

3. **`scheduler.js` — `_constructSchedule()`:** Line ~742 computes `dayType` as `day.dayCycle % 2 === 0 ? 2 : 1`. Update to handle 3 types.

4. **`ui_logic.js`:** The day cycle input (`<input id="day-cycle" min="1" max="2">`) in `index.html` must change to `max="3"`.

5. **Test files:** All tests that iterate `[1, 2].forEach((startCycle) => ...)` must include cycle 3.

6. **Torture test slot assertions:** The `assertAllSlotsFilled` function needs to handle the third cycle's period count.

---

## Algorithm Changes

### Changing the construction strategy

The construction happens in `_constructSchedule()` (scheduler.js, line ~525). It processes days week-by-week using `_solveWeekAssignment()`.

**Key methods and their roles:**
- `_groupDaysByWeek()` — groups days by calendar week
- `_solveWeekAssignment()` — MRV backtracking solver for all slots in a week
- `_solveDayAssignment()` — single-day MRV solver (used during balance-first reordering)

**If you change candidate selection (tiers):**
The tier system (lines ~600-630) controls which groups are tried in which order:
1. Pending in current cycle + MU
2. Pending + next-cycle groups + MU
3. All available + MU
4. All available + MU with reduced spacing floor

Adding a new tier or reordering them is straightforward — just modify the `candidateSets` array. Each tier first tries WITH balance constraint, then WITHOUT.

**If you change the backtracking heuristic:**
The `_solveWeekAssignment` solver uses day-first MRV (lines ~418-440): it processes the earliest day's most-constrained slot first. This is critical for running balance enforcement. The day-boundary balance check (lines ~453-464 and ~478-489) evaluates running counts after each day is fully assigned.

**WARNING:** Do not change to a different slot ordering without understanding the balance implications. The day-first approach was specifically designed so that running balance can be checked at day boundaries during construction. See `ALGORITHM_ATTEMPTS.md` entries 1-8 for failed alternatives.

### Changing post-processing repairs

Post-processing methods are called in `buildSchedule()` (lines ~1472-1508). The order matters:

1. `_repairViolations` — fixes 28-day spacing violations (from Tier 4 fallback)
2. `_repairRunningBalance` — fixes running balance (cross-day swaps)
3. `_unblockPeriods` — opens up period slots for blocked groups
4. `_balanceLessonCounts` — reduces end-of-schedule imbalance

**Safe to modify:** Each repair method is self-contained. You can:
- Increase iteration limits (pass counts)
- Add new repair strategies within existing methods
- Add new repair methods to the pipeline

**Dangerous to modify:**
- Changing the ORDER of repairs. `_repairViolations` must run first (fixes hard constraint violations). `_balanceLessonCounts` must run last (it's guarded — reverts if it worsens running balance).
- Removing the "safe revert" logic in `buildSchedule()` around `_balanceLessonCounts` (lines ~1490-1508). This prevents balance repair from worsening running balance.

### Changing the multi-trial system

`buildSchedule()` tries `TOTAL_TRIALS` constructions (22 offsets × 2 dayStability modes) and picks the one with the lowest score (running balance violations × 1000 + end spread).

**To change scoring:** Modify the `score` formula in `tryConstruction()` (line ~1448). Currently:
```js
const score = rbv * 1000 + endSpread
```
The 1000× multiplier prioritizes running balance over end spread. Adjust the weight to change priorities.

**To add early termination:** Currently breaks at `bestScore <= 1` (line ~1468). You can add other early-out conditions.

**To change trial parameters:** Modify the loop in lines ~1460-1465. The `offset` parameter rotates which groups start in which positions. The `dayStab` boolean controls day-of-week stability sorting.

---

## UI-Only Changes

### Changing table layout

The table header is generated dynamically in `buildTableHeader()` (ui_logic.js). It creates `MAX_PERIODS_PER_DAY` pairs of Period/Group columns. To change the header structure, edit this function.

The table body is rendered in `displaySchedule()` (ui_logic.js, line ~1369). Each row has:
- Action button column (delete day)
- Date column
- Day Cycle column
- `MAX_PERIODS_PER_DAY` pairs of period + group cells

### Changing CSS/styling

All styles are in `index.html` within `<style>` tags. The app uses Tailwind CSS via CDN for utility classes and custom CSS for specialized components (drag-and-drop, tooltips, toasts).

### Changing the summary card

The schedule summary is built in `displayScheduleSummary()` (ui_logic.js). It shows total days, lessons, violations, and uses `cellIssues` from `computeCellIssues()`.

### Changing violation indicators

Live violation detection happens in `computeCellIssues()` (ui_logic.js, line ~1270). It checks:
1. 28-day period spacing (uses `SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR` and `SCHEDULE_CONFIG.ONE_DAY_MS`)
2. Weekly uniqueness
3. Running balance

To add a new type of violation indicator, add a new check block in this function and choose a prefix string for the issue messages.

---

## Adding New Constraints

### Step-by-step process

1. **Define the constraint** — what must be true? Is it a hard constraint (must never be violated) or soft (best effort)?

2. **Add config values** — if the constraint has numeric parameters, add them to `schedule_config.js`:
   ```js
   MY_NEW_LIMIT: 3,  // at most 3 of something
   ```

3. **Enforce during construction** — hard constraints must be checked in `_solveWeekAssignment()`. Add your check where candidates are filtered (the `validGroupsPerSlot` computation, lines ~348-395) or where assignments are validated (the backtracking loop, lines ~445-497).

4. **Add repair** — if the construction can't always satisfy the constraint, add a post-processing repair method like `_repairViolations()`. Call it from `buildSchedule()` in the appropriate position.

5. **Add test checks** — update `runChecks()` in `testing/helpers.mjs` to validate the new constraint. Add equivalent checks to the Jasmine spec helpers in `scheduler.spec.js`.

6. **Add UI feedback** — if the constraint should show violations in the UI, add a check in `computeCellIssues()` (ui_logic.js).

### Example: "No group on the same day-of-week two weeks in a row"

1. Config: no new values needed (it's a structural rule)
2. Construction: in `_solveWeekAssignment()`, add tracking of which day-of-week each group was assigned last week. Filter candidates that violate the rule.
3. Repair: add `_repairDayOfWeekRepeat()` after `_repairViolations()`
4. Tests: add check in `runChecks()`:
   ```js
   // Day-of-week repeat check
   const prevDow = {}  // group → last day-of-week
   schedule.forEach(d => d.lessons.forEach(l => {
       if (l.group === _cfg.MU_TOKEN) return
       const dow = d.date.getDay()
       if (prevDow[l.group] === dow) issues.push(`DOW_REPEAT:${l.group}`)
       prevDow[l.group] = dow
   }))
   ```
5. UI: add check in `computeCellIssues()` with prefix `"Day-of-week repeat:"`

---

## Test Infrastructure

### Running tests

```bash
# CLI spec tests (19 tests, ~5 seconds)
node testing/run_spec_tests.mjs

# CLI torture tests (162 tests, ~3-5 minutes)
node testing/run_torture_tests.mjs

# Browser tests (all 181, requires local server)
python -m http.server 8000
# Open http://localhost:8000/SpecRunner.html
```

### Test file responsibilities

| File | Tests | What it covers |
|------|-------|---------------|
| `scheduler.spec.js` | 19 | Core constraints: 28-day, weekly, MU, balance, history handling |
| `scheduler_torture.spec.js` | 162 | Extreme edge cases: heavy days off, real school calendars, long schedules |
| `testing/run_spec_tests.mjs` | 19 | CLI mirror of spec tests |
| `testing/run_torture_tests.mjs` | 162 | CLI mirror of torture tests + chunked scheduling tests |

### Adding new test cases

**For a new day-off pattern:** Add to `tortureTests` in `testing/run_torture_tests.mjs` AND the corresponding `describe` block in `scheduler_torture.spec.js`. Both files should stay in sync.

**For a new constraint check:** Add to `runChecks()` in `testing/helpers.mjs` (CLI) AND add equivalent assertion helpers in `scheduler.spec.js` (browser).

**For realistic scenarios:** Add to the `realisticTests` array in `testing/run_torture_tests.mjs` and the `realisticScenarios` array in `scheduler_torture.spec.js`. These use the Levittown school calendar as a base.

### Diagnostic utilities

These are NOT test suites — they generate detailed analysis reports:

- `testing/diagnose_balance.mjs` — per-schedule balance distribution, root cause analysis
- `testing/diagnose_balance_root.mjs` — traces cycle boundaries to find why certain groups get more lessons
- `testing/diagnose_cycle.mjs` — detailed cycle violation analysis with date info
- `testing/analyze_bias.mjs` — statistical bias analysis across many scenarios, generates HTML report

Use these when tests fail to understand WHY a constraint is violated.

---

## Common Pitfalls

### DST handling
All calendar-day calculations use `Math.round(ms / ONE_DAY_MS)` instead of `Math.floor()`. This prevents DST transitions (spring forward/fall back) from making a 28-day gap appear as 27 or 29 days. **Never use `Math.floor()` for day-count calculations.**

### Period numbers are global
Period 1 on Day 1 is the same as Period 1 on Day 2. The 28-day spacing rule treats them identically. This means shared periods (those appearing in both day arrays) are the hardest to schedule — they have the most constraints.

### Weekly uniqueness is per calendar week (Mon-Fri)
The `getWeekIdentifier()` method computes the Monday of each week. A group can appear at most once per Mon-Fri week, regardless of day cycle.

### MU is not a real group
`MU` (Make-Up) is a placeholder token, not a student group. It:
- Is excluded from balance calculations
- Is excluded from cycle fairness checks
- Is excluded from weekly uniqueness checks
- Is limited to `MU_LIMIT_PER_DAY` per day
- Can be replaced with real groups by `_balanceLessonCounts()`

### The "safe revert" pattern
`buildSchedule()` saves the schedule state before `_balanceLessonCounts()` and reverts if running balance worsens. This is critical — balance repair can introduce running balance violations. Always follow this pattern when adding new post-processing steps that modify group assignments.

### History handling
When schedule history is provided (for continuity between chunks):
- `initialPeriodAssignments` tracks the last date each group used each period (for 28-day spacing)
- `initialWeeklyGroups` tracks groups already scheduled in the starting week (for weekly uniqueness)
- `historicalLessonCounts` tracks total lessons per group (for balance)
- `cumulativeCounts` (if provided) overrides `historicalLessonCounts` with accurate cross-chunk totals

### Don't sort lessons by period in scheduler.js
Display sorting (`lessons.sort(...)` by period number) must happen in `ui_logic.js`, not in `scheduler.js`. Sorting within the scheduler destroys the cycle ordering that the algorithm carefully constructs. See `ALGORITHM_ATTEMPTS.md` entry #3.

---

## Verification Checklist

After any change, verify in this order:

1. **Config consistency:** If you changed `schedule_config.js`, verify derived values are still correct:
   - `MAX_PERIODS_PER_DAY` = `max(DAY1.length, DAY2.length)`
   - `TABLE_COLUMNS` = `3 + MAX_PERIODS * 2`
   - `TOTAL_TRIALS` = `REQUIRED_UNIQUE_GROUPS * 2`

2. **CLI spec tests:** `node testing/run_spec_tests.mjs` — all 19 must pass

3. **CLI torture tests:** `node testing/run_torture_tests.mjs` — all 162 must pass

4. **Browser tests:** Open `SpecRunner.html` — all 181 Jasmine tests must pass

5. **Manual browser check:**
   - Open `index.html`
   - Generate a schedule with default parameters
   - Verify table renders correctly (correct number of columns, periods display properly)
   - Verify CSV export works (Save to CSV, open the file)
   - Verify drag-and-drop swap still works
   - Verify violation indicators appear correctly for manually-introduced violations

6. **Propagation check (for config changes):** Temporarily change a value (e.g., set `REQUIRED_UNIQUE_GROUPS` to 20), run tests, verify it propagates everywhere (tests should fail in expected ways), then revert.

7. **Update documentation:** After any algorithm change, update `ALGORITHM_ATTEMPTS.md` with what you tried and whether it worked.
