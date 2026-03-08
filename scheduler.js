/**
 * @file Contains the core scheduling algorithm for generating the music lesson schedule.
 * It uses a constructive cycle-based approach with within-day reordering
 * to maintain full-cycle fairness across all groups.
 */

// --- Constants for Scheduling Rules ---
const DAY1_PERIODS = [1, 4, 7, 8]
const DAY2_PERIODS = [1, 2, 3, 7, 8]
const ALL_UNIQUE_PERIODS = [1, 2, 3, 4, 7, 8]
const REQUIRED_UNIQUE_GROUPS = 22

class ScheduleEntry {
    constructor(date, dayCycle) {
        this.date = date
        this.dayCycle = dayCycle
        this.lessons = []
    }
    addLesson(period, group) {
        this.lessons.push({ period: `Pd ${period}`, group })
    }
}

class ScheduleBuilder {
    constructor(startDate, dayCycle, daysOff, weeks, scheduleHistory = null, cumulativeCounts = null) {
        const startParts = startDate.split("-")
        this.startDate = new Date(
            startParts[0],
            startParts[1] - 1,
            startParts[2]
        )
        this.dayCycle = dayCycle
        this.daysOff = daysOff
            .map((d) => {
                if (!d) return null
                const parts = d.split("-").map((p) => parseInt(p, 10))
                return new Date(parts[0], parts[1] - 1, parts[2]).toDateString()
            })
            .filter(Boolean)
        this.weeks = weeks

        if (
            scheduleHistory &&
            Array.isArray(scheduleHistory) &&
            scheduleHistory.length > 0
        ) {
            const groupsFromHistory = new Set(
                scheduleHistory.map((item) => item.group).filter(Boolean)
            )
            groupsFromHistory.delete("MU")
            this.LESSON_GROUPS =
                groupsFromHistory.size === REQUIRED_UNIQUE_GROUPS
                    ? [...groupsFromHistory]
                    : Array.from({ length: REQUIRED_UNIQUE_GROUPS }, (_, i) =>
                          String.fromCharCode("A".charCodeAt(0) + i)
                      )
        } else {
            this.LESSON_GROUPS = Array.from(
                { length: REQUIRED_UNIQUE_GROUPS },
                (_, i) => String.fromCharCode("A".charCodeAt(0) + i)
            )
            // Shuffle group order deterministically based on start date
            // so different schedules rotate which groups land at cycle
            // boundaries (where most ordering violations occur).
            this._shuffleGroups(this.startDate)
        }

        this.initialPeriodAssignments = {}
        this.LESSON_GROUPS.forEach((g) => {
            this.initialPeriodAssignments[g] = {}
        })
        if (scheduleHistory)
            this._populateAssignmentsFromHistory(scheduleHistory)

        // Override historical lesson counts with accurate cumulative counts
        // when provided. The 4-week history window has poor rank correlation
        // with true accumulated balance; cumulative counts fix this.
        if (cumulativeCounts) {
            this.historicalLessonCounts = {}
            this.LESSON_GROUPS.forEach((g) => {
                this.historicalLessonCounts[g] = cumulativeCounts[g] || 0
            })
            // Mark as cumulative so the balancer uses direct counts
            // instead of amplified deviation
            this._hasCumulativeCounts = true
        }
    }

    _shuffleGroups(seed) {
        // Deterministic Fisher-Yates shuffle using a simple hash of the seed date
        // and days-off count so different absence patterns rotate which groups
        // land at cycle boundaries.
        let h = seed.getFullYear() * 10000 + (seed.getMonth() + 1) * 100 + seed.getDate()
        for (let k = 0; k < this.daysOff.length; k++) {
            h = (h * 31 + this.daysOff[k].charCodeAt(k % this.daysOff[k].length)) | 0
        }
        const pseudoRandom = () => {
            h = (h * 1103515245 + 12345) & 0x7fffffff
            return h / 0x7fffffff
        }
        for (let i = this.LESSON_GROUPS.length - 1; i > 0; i--) {
            const j = Math.floor(pseudoRandom() * (i + 1))
            const tmp = this.LESSON_GROUPS[i]
            this.LESSON_GROUPS[i] = this.LESSON_GROUPS[j]
            this.LESSON_GROUPS[j] = tmp
        }
    }

    _populateAssignmentsFromHistory(history) {
        const startWeekId = this.getWeekIdentifier(this.startDate)
        this.initialWeeklyGroups = new Set()
        this.historicalLessonCounts = {}
        this.LESSON_GROUPS.forEach((g) => (this.historicalLessonCounts[g] = 0))

        history.forEach((lesson) => {
            if (
                !lesson.group ||
                !lesson.period ||
                !lesson.date ||
                lesson.group === "MU"
            )
                return
            if (this.initialPeriodAssignments[lesson.group]) {
                const parts = lesson.date.split("-").map((p) => parseInt(p, 10))
                const historyDate = new Date(parts[0], parts[1] - 1, parts[2])
                const periodNum = parseInt(
                    String(lesson.period).replace("Pd ", ""),
                    10
                )
                const existingDate =
                    this.initialPeriodAssignments[lesson.group][periodNum]
                if (!existingDate || historyDate > existingDate) {
                    this.initialPeriodAssignments[lesson.group][periodNum] =
                        historyDate
                }

                // Track groups already scheduled in the starting week
                if (this.getWeekIdentifier(historyDate) === startWeekId) {
                    this.initialWeeklyGroups.add(lesson.group)
                }

                // Count total lessons per group for balance-aware ordering
                this.historicalLessonCounts[lesson.group]++
            }
        })

    }

    generateAllSlots() {
        const slots = []
        let currentDate = new Date(this.startDate.getTime())
        let currentDayCycle = this.dayCycle
        const endDate = new Date(this.startDate.getTime())
        endDate.setDate(endDate.getDate() + this.weeks * 7)

        while (currentDate < endDate) {
            const isWeekday =
                currentDate.getDay() > 0 && currentDate.getDay() < 6
            const isDayOff = this.daysOff.includes(currentDate.toDateString())
            if (isWeekday && !isDayOff) {
                const periods =
                    currentDayCycle % 2 !== 0 ? DAY1_PERIODS : DAY2_PERIODS
                periods.forEach((p) => {
                    slots.push({
                        date: new Date(currentDate.getTime()),
                        period: p,
                        group: null,
                        dayCycle: currentDayCycle,
                    })
                })
                currentDayCycle++
            }
            currentDate.setDate(currentDate.getDate() + 1)
        }
        return slots
    }

    getWeekIdentifier(d) {
        const newD = new Date(d)
        newD.setHours(0, 0, 0, 0)
        const day = newD.getDay()
        const diff = newD.getDate() - day + (day === 0 ? -6 : 1)
        return new Date(newD.setDate(diff)).toDateString()
    }

    _deepCopyAssignments() {
        const copy = JSON.parse(JSON.stringify(this.initialPeriodAssignments))
        for (const group in copy) {
            for (const period in copy[group]) {
                copy[group][period] = new Date(copy[group][period])
            }
        }
        return copy
    }

    _groupSlotsByDay(slots) {
        const dayMap = new Map()
        for (const slot of slots) {
            const key = slot.date.toDateString()
            if (!dayMap.has(key)) {
                dayMap.set(key, {
                    date: slot.date,
                    dayCycle: slot.dayCycle,
                    periods: [],
                })
            }
            dayMap.get(key).periods.push(slot.period)
        }
        return [...dayMap.values()].sort((a, b) => a.date - b.date)
    }

    /**
     * Group days into sub-arrays by calendar week using getWeekIdentifier.
     * @private
     */
    _groupDaysByWeek(days) {
        const weeks = []
        let currentWeek = null
        let currentWeekId = null
        for (const day of days) {
            const weekId = this.getWeekIdentifier(day.date)
            if (weekId !== currentWeekId) {
                currentWeek = []
                weeks.push(currentWeek)
                currentWeekId = weekId
            }
            currentWeek.push(day)
        }
        return weeks
    }

    /**
     * Period-centric day solver with MRV heuristic.
     * Uses calendar floor (28-day spacing) as the primary period constraint.
     * Groups are sorted by staleness (longest gap since last using each period).
     * @private
     */
    _solveDayAssignment(periods, candidateGroups, date, weekId, weeklyAssignments, periodAssignments, calendarFloor) {
        const numPeriods = periods.length
        const oneDayMs = 86400000

        const validGroupsPerPeriod = periods.map((period) => {
            const valid = []
            for (const group of candidateGroups) {
                if (group === "MU") { valid.push(group); continue }
                if (weeklyAssignments.get(weekId)?.has(group)) continue
                if (calendarFloor > 0) {
                    const lastDate = periodAssignments[group]?.[period]
                    if (lastDate && (date - lastDate) / oneDayMs < calendarFloor) continue
                }
                valid.push(group)
            }

            // Staleness sort: prefer groups with longest gap since last using
            // this period (naturally promotes period variety). MU always last.
            valid.sort((a, b) => {
                if (a === "MU") return 1
                if (b === "MU") return -1
                const lastA = periodAssignments[a]?.[period]?.getTime() || 0
                const lastB = periodAssignments[b]?.[period]?.getTime() || 0
                if (lastA !== lastB) return lastA - lastB
                return candidateGroups.indexOf(a) - candidateGroups.indexOf(b)
            })

            return { period, valid }
        })

        const assignment = new Array(numPeriods).fill(null)
        const usedGroups = new Set()

        const solve = (depth) => {
            if (depth >= numPeriods) return true

            // MRV: pick period with fewest valid groups
            let bestIdx = -1
            let bestCount = Infinity
            for (let i = 0; i < numPeriods; i++) {
                if (assignment[i] !== null) continue
                let count = 0
                for (const g of validGroupsPerPeriod[i].valid) {
                    if (!usedGroups.has(g)) count++
                }
                if (count < bestCount) {
                    bestCount = count
                    bestIdx = i
                }
            }

            const idx = bestIdx
            const { valid } = validGroupsPerPeriod[idx]

            for (const group of valid) {
                if (usedGroups.has(group)) continue
                assignment[idx] = group
                usedGroups.add(group)
                if (solve(depth + 1)) return true
                usedGroups.delete(group)
                assignment[idx] = null
            }

            return false
        }

        if (solve(0)) {
            return periods.map((p, i) => ({ period: p, group: assignment[i] }))
        }
        return null
    }

    /**
     * Week-level MRV backtracking solver.
     * Assigns all slots within a calendar week simultaneously so that
     * shared-period groups are coordinated across days.
     *
     * Constraints enforced:
     *   - 28-day (or calendarFloor) spacing against periodAssignments (prior weeks)
     *   - Each non-MU group at most once per week
     *   - At most 1 MU per day
     *
     * Within-week 28-day conflicts are impossible because weekly uniqueness
     * means a group can only appear once, so the same group+period can't
     * recur within 7 days.
     * @private
     */
    _solveWeekAssignment(weekDays, candidateGroups, periodAssignments, calendarFloor, prevPositions, balanceCounts, prevDayOfWeek) {
        const oneDayMs = 86400000

        // Build flat slot list from all days in the week
        const slots = []
        for (let dayIdx = 0; dayIdx < weekDays.length; dayIdx++) {
            const day = weekDays[dayIdx]
            for (const period of day.periods) {
                slots.push({ dayIdx, date: day.date, period })
            }
        }

        const numSlots = slots.length
        const numDays = weekDays.length

        // Quick feasibility check: enough candidates + MU to fill all slots?
        const realCandidates = candidateGroups.filter(g => g !== "MU").length
        if (realCandidates + numDays < numSlots) return null

        // Pre-compute candidate index for fast lookup
        const candidateIdx = new Map()
        candidateGroups.forEach((g, i) => candidateIdx.set(g, i))

        // Pre-compute valid groups per slot (28-day constraint against prior weeks)
        const validGroupsPerSlot = slots.map((slot, slotIndex) => {
            const valid = []
            for (const group of candidateGroups) {
                if (group === "MU") { valid.push(group); continue }
                if (calendarFloor > 0) {
                    const lastDate = periodAssignments[group]?.[slot.period]
                    if (lastDate && (slot.date - lastDate) / oneDayMs < calendarFloor) continue
                }
                valid.push(group)
            }

            // Sort valid groups for this slot. When balance counts are
            // provided (chunked/history mode), prefer underused groups first
            // to prevent balance accumulation across chunks. Otherwise use
            // day-stability and position-stability to preserve cycle ordering.
            // MU always last.
            const slotDow = slot.date.getDay()
            valid.sort((a, b) => {
                if (a === "MU") return 1
                if (b === "MU") return -1
                if (balanceCounts) {
                    const countA = balanceCounts[a] || 0
                    const countB = balanceCounts[b] || 0
                    if (countA !== countB) return countA - countB
                }
                // Day stability: prefer groups that were on the same
                // physical day last week to minimize position shifts
                if (prevDayOfWeek) {
                    const matchA = prevDayOfWeek[a] === slotDow ? 0 : 1
                    const matchB = prevDayOfWeek[b] === slotDow ? 0 : 1
                    if (matchA !== matchB) return matchA - matchB
                }
                const prevA = prevPositions?.[a]
                const prevB = prevPositions?.[b]
                if (prevA !== undefined && prevB !== undefined) {
                    const distA = Math.abs(prevA - slotIndex)
                    const distB = Math.abs(prevB - slotIndex)
                    if (distA !== distB) return distA - distB
                }
                // Fallback: staleness for period variety
                const lastA = periodAssignments[a]?.[slot.period]?.getTime() || 0
                const lastB = periodAssignments[b]?.[slot.period]?.getTime() || 0
                if (lastA !== lastB) return lastA - lastB
                return (candidateIdx.get(a) || 0) - (candidateIdx.get(b) || 0)
            })

            return valid
        })

        // Early out: if any slot has 0 valid groups, no solution exists
        if (validGroupsPerSlot.some(v => v.length === 0)) return null

        const assignment = new Array(numSlots).fill(null)
        const usedGroups = new Set()
        const muPerDay = new Array(numDays).fill(0)
        let backtracks = 0
        const BACKTRACK_LIMIT = 50000

        const solve = (depth) => {
            if (depth >= numSlots) return true
            if (++backtracks > BACKTRACK_LIMIT) return false

            // MRV: pick unassigned slot with fewest valid remaining candidates
            let bestIdx = -1
            let bestCount = Infinity
            for (let i = 0; i < numSlots; i++) {
                if (assignment[i] !== null) continue
                let count = 0
                for (const g of validGroupsPerSlot[i]) {
                    if (g === "MU") {
                        if (muPerDay[slots[i].dayIdx] < 1) count++
                    } else {
                        if (!usedGroups.has(g)) count++
                    }
                }
                if (count === 0) return false  // forward check: dead end
                if (count < bestCount) {
                    bestCount = count
                    bestIdx = i
                }
            }

            const idx = bestIdx
            const slot = slots[idx]

            for (const group of validGroupsPerSlot[idx]) {
                if (group === "MU") {
                    if (muPerDay[slot.dayIdx] >= 1) continue
                    assignment[idx] = group
                    muPerDay[slot.dayIdx]++
                    if (solve(depth + 1)) return true
                    if (backtracks > BACKTRACK_LIMIT) return false
                    muPerDay[slot.dayIdx]--
                    assignment[idx] = null
                } else {
                    if (usedGroups.has(group)) continue
                    assignment[idx] = group
                    usedGroups.add(group)
                    if (solve(depth + 1)) return true
                    if (backtracks > BACKTRACK_LIMIT) return false
                    usedGroups.delete(group)
                    assignment[idx] = null
                }
            }

            return false
        }

        if (solve(0)) {
            return slots.map((slot, i) => ({
                dayIdx: slot.dayIdx,
                period: slot.period,
                group: assignment[i]
            }))
        }
        return null
    }

    /**
     * Constructive cycle-based scheduling with 28-day calendar spacing.
     *
     * Iterates by calendar week to coordinate shared-period assignments
     * across all days in the week simultaneously, preventing the greedy
     * day-by-day approach from exhausting scarce shared-period groups.
     *
     * For each week:
     * 1. Build candidate list: pending groups (sorted by lastGlobalPos asc), then next-cycle, then MU
     * 2. Solve all slots in the week using week-level MRV backtracking
     * 3. Process results day-by-day: reorder by lastGlobalPos, update state
     * @private
     */
    _constructSchedule(days, calendarFloor = 28, positionOffset = 0, dayStability = true) {
        const schedule = []
        const weeklyAssignments = new Map()
        const periodAssignments = this._deepCopyAssignments()

        // Pre-populate weekly assignments from history so groups already
        // scheduled earlier in the starting week aren't double-booked.
        if (this.initialWeeklyGroups && this.initialWeeklyGroups.size > 0 && days.length > 0) {
            const firstWeekId = this.getWeekIdentifier(days[0].date)
            weeklyAssignments.set(firstWeekId, new Set(this.initialWeeklyGroups))
        }

        const lastGlobalPos = {}
        if (this.historicalLessonCounts) {
            const sorted = [...this.LESSON_GROUPS].sort(
                (a, b) => this.historicalLessonCounts[a] - this.historicalLessonCounts[b]
            )
            sorted.forEach((g, i) => {
                lastGlobalPos[g] = i - REQUIRED_UNIQUE_GROUPS
            })
        } else {
            for (const g of this.LESSON_GROUPS) {
                lastGlobalPos[g] = -REQUIRED_UNIQUE_GROUPS
            }
        }
        let globalPos = 0

        let pendingInCycle = new Set(this.LESSON_GROUPS)

        // Track running lesson counts for balance-aware construction
        const runningCounts = {}
        for (const g of this.LESSON_GROUPS) runningCounts[g] = 0

        const weekGroups = this._groupDaysByWeek(days)

        // Track each group's position in the previous week's flat sequence
        // for position-stability sorting in the solver.
        // Initialize from cycle order so the first week starts with a
        // good position mapping that subsequent weeks can stabilize on.
        let prevPositions = {}
        const numG = this.LESSON_GROUPS.length
        const initSorted = [...this.LESSON_GROUPS]
            .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b])
        initSorted.forEach((g, i) => { prevPositions[g] = (i + positionOffset) % numG })

        // Track which day-of-week each group was on last week for day-stability sorting
        let prevDayOfWeek = null

        for (const weekDays of weekGroups) {
            const weekId = this.getWeekIdentifier(weekDays[0].date)
            if (!weeklyAssignments.has(weekId))
                weeklyAssignments.set(weekId, new Set())

            const weeklyUsed = weeklyAssignments.get(weekId)

            const pendingAll = [...pendingInCycle]
                .filter(g => !weeklyUsed.has(g))
                .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b])

            const nextAll = this.LESSON_GROUPS
                .filter(g => !pendingInCycle.has(g))
                .filter(g => !weeklyUsed.has(g))
                .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b])

            // Compute balance counts for history mode (chunked scheduling)
            let balanceCounts = null
            if (this.historicalLessonCounts) {
                balanceCounts = {}
                for (const g of this.LESSON_GROUPS) {
                    balanceCounts[g] = (this.historicalLessonCounts[g] || 0) + runningCounts[g]
                }
            }

            // Tier 1: pending only
            let result = this._solveWeekAssignment(
                weekDays, [...pendingAll, "MU"], periodAssignments, calendarFloor, prevPositions, balanceCounts, prevDayOfWeek
            )

            // Tier 2: add next-cycle groups
            if (!result) {
                result = this._solveWeekAssignment(
                    weekDays, [...pendingAll, ...nextAll, "MU"], periodAssignments, calendarFloor, prevPositions, balanceCounts, prevDayOfWeek
                )
            }

            // Tier 3: all groups ignoring cycle
            if (!result) {
                const available = this.LESSON_GROUPS
                    .filter(g => !weeklyUsed.has(g))
                    .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b])
                result = this._solveWeekAssignment(
                    weekDays, [...available, "MU"], periodAssignments, calendarFloor, prevPositions, balanceCounts, prevDayOfWeek
                )
            }

            // Tier 4: reduced floor (21-day minimum spacing)
            if (!result) {
                const available = this.LESSON_GROUPS
                    .filter(g => !weeklyUsed.has(g))
                    .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b])
                result = this._solveWeekAssignment(
                    weekDays, [...available, "MU"], periodAssignments, 21, prevPositions, balanceCounts, prevDayOfWeek
                )
            }

            if (!result) return null

            // Group results by day
            const dayResults = weekDays.map(() => [])
            for (const { dayIdx, period, group } of result) {
                dayResults[dayIdx].push({ period, group })
            }

            // Process each day's results: update state, build schedule entries
            for (let i = 0; i < weekDays.length; i++) {
                const day = weekDays[i]
                const dayType = day.dayCycle % 2 === 0 ? 2 : 1
                const dayResult = dayResults[i]

                const nonMU = dayResult.filter(a => a.group !== "MU")
                const mu = dayResult.filter(a => a.group === "MU")

                nonMU.sort((a, b) => lastGlobalPos[a.group] - lastGlobalPos[b.group])

                const dayEntry = new ScheduleEntry(day.date, dayType)
                for (const { period, group } of [...nonMU, ...mu]) {
                    dayEntry.addLesson(period, group)
                    if (group !== "MU") {
                        weeklyUsed.add(group)
                        if (!periodAssignments[group]) periodAssignments[group] = {}
                        periodAssignments[group][period] = day.date
                        lastGlobalPos[group] = globalPos++
                        pendingInCycle.delete(group)
                        runningCounts[group]++
                    }
                }

                // Note: lessons kept in cycle order for flat-sequence fairness.
                // Display sorting is done in post-processing.

                if (pendingInCycle.size === 0) {
                    pendingInCycle = new Set(this.LESSON_GROUPS)
                }

                schedule.push(dayEntry)
            }

            // Record positions and day-of-week for next week's stability sort
            prevPositions = {}
            if (dayStability) prevDayOfWeek = {}
            let pos = 0
            for (let i = 0; i < weekDays.length; i++) {
                const dayResult = dayResults[i]
                const dow = weekDays[i].date.getDay()
                const sorted = [...dayResult].sort((a, b) => a.period - b.period)
                for (const { group } of sorted) {
                    if (group !== "MU") {
                        prevPositions[group] = pos
                        if (dayStability) prevDayOfWeek[group] = dow
                    }
                    pos++
                }
            }
        }

        return schedule
    }

    /**
     * Check if assigning a group to a period on a date would conflict with
     * a historical period assignment (from schedule history in chunked mode).
     * @private
     */
    /**
     * Compute balance-adjusted counts incorporating historical data.
     * When cumulative counts are available (accurate), use them directly.
     * When only 4-week history is available, amplify deviation from mean.
     * @private
     */
    _getAdjustedCounts() {
        const counts = {}
        if (this._hasCumulativeCounts) {
            // Cumulative counts are accurate — use directly
            for (const g of this.LESSON_GROUPS) {
                counts[g] = this.historicalLessonCounts[g] || 0
            }
        } else if (this.historicalLessonCounts) {
            // 4-week history: amplify deviation to compensate for limited window
            const histVals = Object.values(this.historicalLessonCounts)
            const histMean = histVals.reduce((a, b) => a + b, 0) / histVals.length
            for (const g of this.LESSON_GROUPS) {
                const hist = this.historicalLessonCounts[g] || 0
                counts[g] = Math.round(hist + (hist - histMean))
            }
        } else {
            for (const g of this.LESSON_GROUPS) counts[g] = 0
        }
        return counts
    }

    _hasHistoricalConflict(group, periodNum, date, dayRule) {
        const oneDayMs = 86400000
        const histDate = this.initialPeriodAssignments?.[group]?.[periodNum]
        return histDate && Math.abs((date - histDate) / oneDayMs) < dayRule
    }

    /**
     * Post-processing repair: scan for remaining 28-day violations (from Tier 4
     * fallback) and attempt within-day group swaps to fix them.
     * @private
     */
    _repairViolations(schedule, calendarFloor) {
        const oneDayMs = 86400000

        const findViolations = () => {
            const violations = []
            const history = {}
            for (let d = 0; d < schedule.length; d++) {
                const day = schedule[d]
                for (const lesson of day.lessons) {
                    if (lesson.group === "MU") continue
                    const p = lesson.period
                    if (!history[lesson.group]) history[lesson.group] = {}
                    if (!history[lesson.group][p]) history[lesson.group][p] = []
                    history[lesson.group][p].push({ dayIdx: d, date: day.date })
                }
            }
            for (const group in history) {
                for (const period in history[group]) {
                    const occ = history[group][period]
                    occ.sort((a, b) => a.date - b.date)
                    // Check first occurrence against historical period assignment
                    if (occ.length > 0) {
                        const periodNum = parseInt(period.replace("Pd ", ""), 10)
                        if (this._hasHistoricalConflict(group, periodNum, occ[0].date, calendarFloor)) {
                            violations.push({ group, period, dayIdx: occ[0].dayIdx })
                        }
                    }
                    for (let i = 1; i < occ.length; i++) {
                        if ((occ[i].date - occ[i - 1].date) / oneDayMs < calendarFloor) {
                            violations.push({ group, period, dayIdx: occ[i].dayIdx })
                        }
                    }
                }
            }
            return violations
        }

        let violations = findViolations()
        let maxIter = violations.length * 10

        while (violations.length > 0 && maxIter-- > 0) {
            const v = violations[0]
            const dayEntry = schedule[v.dayIdx]
            const lessonIdx = dayEntry.lessons.findIndex(
                l => l.group === v.group && l.period === v.period
            )
            if (lessonIdx === -1) { violations.shift(); continue }

            let swapped = false
            for (let li = 0; li < dayEntry.lessons.length; li++) {
                if (li === lessonIdx) continue
                const other = dayEntry.lessons[li]
                if (other.group === "MU") continue

                // Swap groups between the two lessons (keep periods)
                const g1 = dayEntry.lessons[lessonIdx].group
                const g2 = other.group
                dayEntry.lessons[lessonIdx].group = g2
                other.group = g1

                const newV = findViolations()
                if (newV.length < violations.length) {
                    violations = newV
                    swapped = true
                    break
                }

                // Undo
                dayEntry.lessons[lessonIdx].group = g1
                other.group = g2
            }

            if (!swapped) violations.shift()
        }
    }

    /**
     * Post-processing pass: reduce lesson-count spread when it exceeds
     * the theoretical minimum of 1. Scans from the end of the schedule
     * and swaps over-represented groups with under-represented ones,
     * provided all constraints (weekly uniqueness, period day-rule) hold.
     * @private
     */
    _balanceLessonCounts(schedule, dayRule) {
        const oneDayMs = 86400000
        const firstWeekId = schedule.length > 0
            ? this.getWeekIdentifier(schedule[0].date) : null

        // Pre-compute week groups for each week (cache to avoid recomputation)
        const weekGroupsCache = new Map()
        const getWeekGroups = (weekId) => {
            if (weekGroupsCache.has(weekId)) return new Set(weekGroupsCache.get(weekId))
            const groups = new Set()
            for (const s of schedule) {
                if (this.getWeekIdentifier(s.date) === weekId) {
                    for (const l of s.lessons) {
                        if (l.group !== "MU") groups.add(l.group)
                    }
                }
            }
            if (weekId === firstWeekId && this.initialWeeklyGroups) {
                for (const g of this.initialWeeklyGroups) groups.add(g)
            }
            weekGroupsCache.set(weekId, groups)
            return new Set(groups)
        }

        for (let pass = 0; pass < 10; pass++) {
            const counts = this._getAdjustedCounts()
            for (const day of schedule) {
                for (const l of day.lessons) {
                    if (l.group !== "MU") counts[l.group]++
                }
            }

            let maxC = Math.max(...Object.values(counts))
            let minC = Math.min(...Object.values(counts))
            if (maxC - minC <= 1) return

            let improved = false
            weekGroupsCache.clear()

            // Alternate scan direction each pass
            const start = pass % 2 === 0 ? schedule.length - 1 : 0
            const end = pass % 2 === 0 ? -1 : schedule.length
            const step = pass % 2 === 0 ? -1 : 1

            for (let d = start; d !== end && maxC - minC > 1; d += step) {
                const day = schedule[d]
                const weekId = this.getWeekIdentifier(day.date)
                const weekGroups = getWeekGroups(weekId)

                for (let li = 0; li < day.lessons.length && maxC - minC > 1; li++) {
                    const lesson = day.lessons[li]
                    if (lesson.group === "MU" || counts[lesson.group] !== maxC) continue

                    const periodNum = parseInt(lesson.period.replace("Pd ", ""), 10)

                    const sortedCandidates = [...this.LESSON_GROUPS]
                        .sort((a, b) => counts[a] - counts[b])
                    for (const candidate of sortedCandidates) {
                        if (counts[candidate] >= counts[lesson.group] - 1) continue
                        if (weekGroups.has(candidate)) continue
                        if (day.lessons.some((l) => l.group === candidate)) continue

                        let tooClose = false
                        // Check against historical period assignments (chunked mode)
                        if (this._hasHistoricalConflict(candidate, periodNum, day.date, dayRule)) tooClose = true
                        for (const s of schedule) {
                            if (tooClose) break
                            if (s === day) continue
                            for (const l of s.lessons) {
                                if (l.group === candidate) {
                                    const p = parseInt(l.period.replace("Pd ", ""), 10)
                                    if (p === periodNum && Math.abs((day.date - s.date) / oneDayMs) < dayRule) {
                                        tooClose = true
                                    }
                                }
                            }
                        }
                        if (tooClose) continue

                        const oldGroup = lesson.group
                        lesson.group = candidate

                        counts[oldGroup]--
                        counts[candidate]++
                        weekGroupsCache.clear()
                        improved = true

                        maxC = Math.max(...Object.values(counts))
                        minC = Math.min(...Object.values(counts))
                        break
                    }
                }
            }

            if (!improved) break
        }

        // Additional strategy: fill MU slots with underused groups
        // to increase their counts without displacing other groups.
        {
            const counts = this._getAdjustedCounts()
            for (const day of schedule) {
                for (const l of day.lessons) {
                    if (l.group !== "MU") counts[l.group]++
                }
            }
            let maxC = Math.max(...Object.values(counts))
            let minC = Math.min(...Object.values(counts))

            if (maxC - minC > 1) {
                weekGroupsCache.clear()
                for (let d = 0; d < schedule.length && maxC - minC > 1; d++) {
                    const day = schedule[d]
                    const weekId = this.getWeekIdentifier(day.date)
                    const weekGroups = getWeekGroups(weekId)

                    for (let li = 0; li < day.lessons.length && maxC - minC > 1; li++) {
                        const lesson = day.lessons[li]
                        if (lesson.group !== "MU") continue

                        const periodNum = parseInt(lesson.period.replace("Pd ", ""), 10)
                        const sortedCandidates = [...this.LESSON_GROUPS]
                            .sort((a, b) => counts[a] - counts[b])

                        for (const candidate of sortedCandidates) {
                            if (counts[candidate] >= maxC - 1) break
                            if (weekGroups.has(candidate)) continue
                            if (day.lessons.some(l => l.group === candidate)) continue

                            let tooClose = false
                            if (this._hasHistoricalConflict(candidate, periodNum, day.date, dayRule)) tooClose = true
                            for (const s of schedule) {
                                if (tooClose) break
                                if (s === day) continue
                                for (const l of s.lessons) {
                                    if (l.group === candidate) {
                                        const p = parseInt(l.period.replace("Pd ", ""), 10)
                                        if (p === periodNum && Math.abs((day.date - s.date) / oneDayMs) < dayRule) {
                                            tooClose = true
                                        }
                                    }
                                }
                            }
                            if (tooClose) continue

                            lesson.group = candidate

                            counts[candidate]++
                            weekGroupsCache.clear()
                            minC = Math.min(...Object.values(counts))
                            break
                        }
                    }
                }
            }
        }

        // Additional strategy: replace overused groups with MU to reduce their counts
        {
            const counts = this._getAdjustedCounts()
            for (const day of schedule) {
                for (const l of day.lessons) {
                    if (l.group !== "MU") counts[l.group]++
                }
            }
            let maxC = Math.max(...Object.values(counts))
            let minC = Math.min(...Object.values(counts))

            if (maxC - minC > 1) {
                for (let d = schedule.length - 1; d >= 0 && maxC - minC > 1; d--) {
                    const day = schedule[d]
                    // Only if this day doesn't already have MU
                    if (day.lessons.some(l => l.group === "MU")) continue

                    for (let li = 0; li < day.lessons.length && maxC - minC > 1; li++) {
                        const lesson = day.lessons[li]
                        if (lesson.group === "MU") continue
                        if (counts[lesson.group] !== maxC) continue

                        const oldGroup = lesson.group
                        lesson.group = "MU"

                        counts[oldGroup]--
                        maxC = Math.max(...Object.values(counts))
                        break
                    }
                }
            }
        }
    }

    _combinedBalanceSpread(schedule) {
        const counts = this._getAdjustedCounts()
        for (const d of schedule) {
            for (const l of d.lessons) {
                if (l.group !== "MU") counts[l.group]++
            }
        }
        const vals = Object.values(counts)
        return Math.max(...vals) - Math.min(...vals)
    }

    buildSchedule() {
        const slots = this.generateAllSlots()
        if (slots.length === 0) return []

        const days = this._groupSlotsByDay(slots)

        let bestSchedule = null
        let bestSpread = Infinity

        const tryConstruction = (offset, dayStab) => {
            let schedule = this._constructSchedule(days, 28, offset, dayStab)
            if (!schedule) schedule = this._constructSchedule(days, 21, offset, dayStab)
            if (schedule) {
                this._repairViolations(schedule, 28)
                const s = this._combinedBalanceSpread(schedule)
                if (!bestSchedule || s < bestSpread) {
                    bestSpread = s
                    bestSchedule = schedule
                }
            }
        }

        tryConstruction(0, true)
        tryConstruction(0, false)

        if (bestSpread > 1) {
            for (const offset of [7, 11, 3, 15, 19, 5, 9, 13, 17, 1]) {
                tryConstruction(offset, true)
                tryConstruction(offset, false)
                if (bestSpread <= 1) break
            }
        }

        if (!bestSchedule) return []

        this.achievedDayRule = 28
        this._balanceLessonCounts(bestSchedule, 28)
        this._balanceLessonCounts(bestSchedule, 28)
        this._balanceLessonCounts(bestSchedule, 28)
        return bestSchedule
    }
}

function skipDay(schedule, dayIndex) {
    return [...schedule.slice(0, dayIndex), ...schedule.slice(dayIndex + 1)]
}

function recalculateFromDay(schedule, dayIndex, params) {
    const prior = schedule.slice(0, dayIndex)
    const deletedDay = schedule[dayIndex]

    const history = []
    for (const entry of prior) {
        const yyyy = entry.date.getFullYear()
        const mm = String(entry.date.getMonth() + 1).padStart(2, '0')
        const dd = String(entry.date.getDate()).padStart(2, '0')
        const formattedDate = `${yyyy}-${mm}-${dd}`
        for (const lesson of entry.lessons) {
            const periodNum = parseInt(lesson.period.replace('Pd ', ''), 10)
            history.push({ date: formattedDate, period: periodNum, group: lesson.group })
        }
    }

    const newStart = new Date(deletedDay.date)
    newStart.setDate(newStart.getDate() + 1)
    const newStartStr = `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, '0')}-${String(newStart.getDate()).padStart(2, '0')}`

    const nextDayCycle = deletedDay.dayCycle + 1
    const remainingWeeks = Math.max(1, Math.ceil((params.originalEndDate - newStart) / (7 * 86400000)))
    const filteredDaysOff = params.daysOff.filter(d => d >= newStartStr)

    const builder = new ScheduleBuilder(newStartStr, nextDayCycle, filteredDaysOff, remainingWeeks, history.length > 0 ? history : null)
    const newSchedule = builder.buildSchedule()

    return { schedule: [...prior, ...newSchedule], builder }
}

function recalculateAfterDay(schedule, dayIndex, params) {
    const prior = schedule.slice(0, dayIndex + 1)

    const history = []
    for (const entry of prior) {
        const yyyy = entry.date.getFullYear()
        const mm = String(entry.date.getMonth() + 1).padStart(2, '0')
        const dd = String(entry.date.getDate()).padStart(2, '0')
        const formattedDate = `${yyyy}-${mm}-${dd}`
        for (const lesson of entry.lessons) {
            const periodNum = parseInt(lesson.period.replace('Pd ', ''), 10)
            history.push({ date: formattedDate, period: periodNum, group: lesson.group })
        }
    }

    const lastKeptDay = schedule[dayIndex]
    const newStart = new Date(lastKeptDay.date)
    newStart.setDate(newStart.getDate() + 1)
    const newStartStr = `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, '0')}-${String(newStart.getDate()).padStart(2, '0')}`

    const nextDayCycle = lastKeptDay.dayCycle + 1
    const remainingWeeks = Math.max(1, Math.ceil((params.originalEndDate - newStart) / (7 * 86400000)))
    const filteredDaysOff = params.daysOff.filter(d => d >= newStartStr)

    const builder = new ScheduleBuilder(newStartStr, nextDayCycle, filteredDaysOff, remainingWeeks, history.length > 0 ? history : null)
    const newSchedule = builder.buildSchedule()

    return { schedule: [...prior, ...newSchedule], builder }
}
