# Algorithm Attempts Log

This document tracks algorithm approaches tried, why they failed or succeeded, and serves as persistent memory for future attempts. **Always reference this doc before trying a new approach.**

## Current State (as of session 4)
- **162 passed, 0 failed** out of 162 torture tests
- All 19 spec tests pass
- ALL constraints satisfied: 28-day spacing, weekly uniqueness, MU clustering, balance (≤2), cycle fairness (≤500)

## Approaches Tried

### 1. Per-Day Greedy Solver (Original)
**What**: Day-by-day MRV backtracking, each day solved independently.
**Result**: 28-day violations on shared periods (1, 7, 8). 14/19 spec tests failed.
**Why it failed**: On Fridays, groups needed for shared periods were already consumed Mon-Thu. Only ~3 groups available per shared period in a 28-day window, and the greedy day-by-day solver "wasted" them on earlier days.
**Lesson**: Shared periods require week-level coordination.

### 2. Week-Level MRV Solver (Successful for 28-day)
**What**: `_solveWeekAssignment` solves all slots in a calendar week simultaneously. Position-stability sorting keeps groups at consistent positions across weeks.
**Result**: Eliminated ALL 28-day violations. All spec tests pass.
**Why it works**: The solver sees all 5 days at once and can coordinate shared-period assignments. MRV picks the most constrained slot first, naturally handling shared periods.

### 3. Period Sort Destroying Cycle Order (Bug Found & Fixed)
**What**: Line 573-577 sorted lessons by period number for display AFTER construction, destroying the carefully-built cycle ordering.
**Result**: Removing the period sort dramatically reduced cycle violations from ~700+ to ~450-500.
**Lesson**: Display sorting must happen at the UI layer, not in the scheduler. Flat-sequence cycle violations depend on lesson ORDER within each day.

### 4. Cross-Day Swaps in `_improveCycleOrder` (Failed)
**What**: Added ability to swap groups between different days (not just within the same day) to reduce cycle violations.
**Result**: Introduced WEEKLY uniqueness violations.
**Why it failed**: Even with weekly uniqueness checks, cross-day swaps in different weeks could create situations where a group appeared twice in a week (the check was incomplete or had edge cases).
**Lesson**: Cross-day swaps are dangerous for weekly uniqueness. Stick to within-day operations for cycle improvement.

### 5. Incremental Violation Counting (Failed)
**What**: Track only the two swapped groups' violations instead of full recount: `totalV += (vAfter - vBefore)`.
**Result**: Inaccurate counts — swaps affected OTHER groups whose gaps spanned the swap positions.
**Why it failed**: Cycle violations are global — moving group A at position X affects group B if B has appearances flanking position X.
**Lesson**: Always do full violation recount after swaps. O(20K) per recount is acceptable.

### 6. Multi-Trial Position Offsets (Partially Successful)
**What**: Try 10 different `positionOffset` values in `_constructSchedule`, pick the construction with fewest cycle violations.
**Result**: Helps find better constructions for some test cases, but doesn't help the 2 non-chunked BALANCE:3 cases where the best construction still has ~500 violations.
**Lesson**: Good for reducing average violations but doesn't guarantee all tests pass.

### 7. Cycle-Aware Balancer (Successful)
**What**: `_balanceLessonCounts` rejects swaps that push `_countCycleViolations(schedule) > 500`.
**Result**: Prevents the balancer from worsening cycle violations. Combined with Phase 1 cycle improvement (target 480) for headroom, this solves all non-chunked balance issues.
**Lesson**: The cycle-aware balancer needs headroom — run cycle improvement BEFORE balancing to create slack.

### 8. Balance-First Pipeline (Failed)
**What**: Run balancer freely (no cycle constraint), then run cycle improver to bring violations back under 500.
**Result**: The cycle improver couldn't bring violations back under 500 after the balancer pushed them to ~550+.
**Lesson**: Once the balancer destroys cycle order, it's hard to recover. The cycle-aware approach is better.

### 9. Persistent Position Offset with Modulo (Failed)
**What**: Apply `% numG` to prevPositions update so positions wrap around.
**Result**: Made things worse — 37 failures vs 28.
**Lesson**: Position stability sorting works best with unwrapped positions.

### 10. Deterministic Group Shuffling (Partially Successful)
**What**: Fisher-Yates shuffle of LESSON_GROUPS based on start date + days-off hash. Different absence patterns get different group orderings.
**Result**: Helps some tests by rotating which groups land at cycle boundaries.
**Lesson**: The shuffle matters because groups at cycle boundaries accumulate more violations.

### 11. Amplified Historical Deviation (Partially Successful)
**What**: For chunked scheduling with 4-week history, amplify the deviation from mean: `counts[g] = hist + (hist - histMean)` (2x amplification). Tried 3x (worse), 1x (no help).
**Result**: Reduced chunked failures from 8 to 5 (BALANCE:3). But 4-week history has poor rank correlation (error 74-122) with true global counts, so amplification is based on unreliable signal.
**Why it partially failed**: 4-week history ranking is only ~50% correlated with true accumulated balance. Some groups correctly identified as overused, others misidentified. The amplification pushes in the wrong direction for misidentified groups.
**Lesson**: No fixed amplification factor can overcome fundamentally inaccurate information. The 4-week window simply doesn't contain enough data to infer accumulated balance across 6 chunks.

### 12. Local-Only Balance Tightening (Failed)
**What**: After amplified balancer, add a pass using local counts only (no history) targeting spread ≤ 1.
**Result**: Caused regressions — shifted failures between c1/c2 tests (155-156/7 vs 157/5).
**Why it failed**: Without historical direction, swaps were essentially random and could undo the amplified balancer's (partially correct) work. Adding amplified spread constraints made the tightener too restrictive.
**Lesson**: Local-only balancing can't improve on amplified balancing because it removes even the imperfect signal.

### 13. Cumulative Counts API (Final Solution — Successful)
**What**: Added optional `cumulativeCounts` parameter to `ScheduleBuilder` constructor. When provided, the builder uses accurate accumulated lesson counts directly instead of amplifying 4-week history. The `_getAdjustedCounts()` helper centralizes the logic: cumulative counts are used as-is, 4-week history gets 2x amplification, no history gets zeros.
**Result**: ALL 162 tests pass. Chunked balance spreads dropped from 3-4 to 1-2.
**Why it works**: The root cause was information loss — 4-week history couldn't determine true accumulated balance. Cumulative counts provide the exact information needed. The balancer, construction, and multi-trial all make correct decisions with accurate data.
**Key insight**: The problem wasn't the algorithm — it was the data. No amount of algorithmic cleverness could compensate for fundamentally inaccurate balance information. Providing the right data was the simplest and most effective fix.

## Resolved Issues

### Non-Chunked BALANCE:3
- Fixed by Phase 1 cycle improvement (`_improveCycleOrder` targeting 480) before balancing, creating headroom for the cycle-aware balancer.
- MU fill/replace strategies provide additional balance mechanisms.

### Chunked BALANCE
- Fixed by adding `cumulativeCounts` parameter. The chunked test now tracks and passes accumulated lesson counts alongside the 4-week period history.
- The `_getAdjustedCounts()` helper handles both modes (cumulative direct vs. amplified history).

## Rules for Future Attempts
1. Never sort lessons by period within `_constructSchedule` — display sorting is UI-layer only
2. Cross-day swaps risk WEEKLY violations — avoid unless the check is bulletproof
3. Always do full violation recount, never incremental
4. The cycle-aware balancer is the right approach — don't go back to unconstrained balancing
5. Test with BOTH `node testing/run_spec_tests.mjs` AND `node testing/run_torture_tests.mjs`
6. For chunked scheduling, pass `cumulativeCounts` to `ScheduleBuilder` for accurate balance
7. Don't try to fix bad data with clever algorithms — fix the data instead
