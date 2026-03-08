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

### 14. Day-Stability in Week Solver (Successful — Cycle Reduction)
**What**: Track which physical day-of-week each group was on in the previous week (`prevDayOfWeek`). In the week solver's group sort, add day-stability as the primary criterion (above position-stability): prefer groups that were on the same physical day last week for each slot.
**Result**: Reduced cycle violations by ~30% (152→107 for clean 16-week schedule). Groups staying on the same day went from 11-16 to 20 out of 22 per week boundary.
**Why it works**: Cycle violations are caused by groups changing their position in the flat sequence between weeks. Position changes are primarily caused by groups moving to different days. By keeping groups on the same day, their flat-sequence positions remain stable, minimizing violations.
**Trade-off**: Hard day-stability causes BALANCE issues for Levittown tests with heavy absences (10+ sick days). Fixed with dual-trial approach: try construction both with and without day-stability, pick the best result based on combined violation + spread score.
**Key insight**: Remaining ~107 violations are STRUCTURAL — caused by alternating day types (D1 has 4 slots, D2 has 5). When a day switches from D2→D1, groups systematically shift by -1 position, creating unavoidable violations. Zero violations is not achievable with the current day-type structure.

### 15. Cross-Day Group Swaps Within Same Week (Successful — Cycle Reduction)
**What**: Post-processing pass that tries swapping two groups' slot assignments between different days WITHIN the same week. Groups exchange periods and days. Safe for weekly uniqueness since each group still appears once per week.
**Result**: Reduces violations by ~22 (from 129 to 107 for clean 16-week case).
**Why it works**: Targeted repositioning of groups that ended up on suboptimal days. The 28-day constraint is checked for both groups at their new positions.
**Note**: Unlike Attempt #4 (cross-day swaps between different weeks, which broke weekly uniqueness), these swaps are strictly within the same week and are safe.

### 16. LRU Within-Day Reordering (Successful — Minor Cycle Reduction)
**What**: Final reordering pass that sorts each day's non-MU lessons by "last seen position" ascending (most stale groups first, MU at end). Processes days sequentially, updating lastSeen after each.
**Result**: Reduces violations by ~7 (from 114 to 107). Modest but consistent improvement.
**Why it works**: Directly maximizes gaps between consecutive appearances of the same group. Equivalent to optimal within-day ordering for minimizing current-day violations.

### 17. Soft Day-Stability (Combined Score) (Failed)
**What**: Instead of hard day-stability priority, use a combined score: `positionDistance + dayBonus` where dayBonus is -5 for same-day match. This was intended to be a softer preference.
**Result**: 21 failures (vs 3 for hard day-stability). MUCH worse than either pure approach.
**Why it failed**: The combined score neither properly optimizes position stability nor day stability. The -5 bonus corrupts the position-distance ranking without being strong enough to enforce day matching.
**Lesson**: Don't mix apples and oranges in sort scores. Either make day-stability a separate priority level or don't use it at all.

### 18. Cycle-Sorted prevPositions (Failed)
**What**: Changed prevPositions to record the cycle-order position (sorted by lastGlobalPos) instead of period-sorted position. This was intended to align prevPositions with the flat sequence used for cycle analysis.
**Result**: Worse violations (161 vs 137). The solver's slot indices are in day+period order, so comparing with cycle-order positions is meaningless (different coordinate systems).
**Lesson**: prevPositions must use the same coordinate system as the solver's slot indexing (day+period order), not the cycle analysis ordering.

## Structural Cycle Violation Analysis
- With 22 groups and alternating D1/D2 day types, zero cycle violations is **mathematically impossible**
- D1 days have 4 slots, D2 days have 5. Week types alternate: (4,5,4,5,4)=22 and (5,4,5,4,5)=23
- When week type changes, groups on affected days shift by ±1 position in the flat sequence
- A -1 shift means the gap between consecutive appearances is 21 instead of 22, missing 1 group → violation
- ~80-100 violations per 16-week schedule are structural; remaining ~7-30 are fixable with ordering

## Rules for Future Attempts
1. Never sort lessons by period within `_constructSchedule` — display sorting is UI-layer only
2. Cross-day swaps WITHIN the same week are safe for weekly uniqueness; cross-WEEK swaps are NOT
3. Always do full violation recount, never incremental
4. The cycle-aware balancer is the right approach — don't go back to unconstrained balancing
5. Test with BOTH `node testing/run_spec_tests.mjs` AND `node testing/run_torture_tests.mjs`
6. For chunked scheduling, pass `cumulativeCounts` to `ScheduleBuilder` for accurate balance
7. Don't try to fix bad data with clever algorithms — fix the data instead
8. Day-stability must use dual-trial approach (with/without) to handle heavy-absence schedules
9. Don't combine different metrics into a single sort score — use separate priority levels
