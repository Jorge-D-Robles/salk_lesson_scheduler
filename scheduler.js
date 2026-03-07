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
    constructor(startDate, dayCycle, daysOff, weeks, scheduleHistory = null) {
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
     * Period-centric day solver with MRV heuristic.
     * Candidate groups are tried in the given order (cycle priority).
     * @private
     */
    _solveDayAssignment(periods, candidateGroups, date, weekId, weeklyAssignments, periodRotation, periodAssignments, calendarFloor) {
        const numPeriods = periods.length
        const oneDayMs = 86400000

        const validGroupsPerPeriod = periods.map((period) => {
            const valid = []
            for (const group of candidateGroups) {
                if (group === "MU") { valid.push(group); continue }
                if (weeklyAssignments.get(weekId)?.has(group)) continue
                if (periodRotation[group]?.has(period)) continue
                if (calendarFloor > 0) {
                    const lastDate = periodAssignments[group]?.[period]
                    if (lastDate && (date - lastDate) / oneDayMs < calendarFloor) continue
                }
                valid.push(group)
            }
            return { period, valid }
        })

        const assignment = new Array(numPeriods).fill(null)
        const usedGroups = new Set()

        const solve = (depth) => {
            if (depth >= numPeriods) return true

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
     * Constructive cycle-based scheduling.
     *
     * For each day:
     * 1. Build candidate list: pending groups (sorted by lastGlobalPos asc), then next-cycle, then MU
     * 2. Solve period assignment using MRV backtracking
     * 3. Reorder lessons within the day: non-MU sorted by lastGlobalPos ascending
     *    This ensures the flat lesson sequence preserves cycle ordering
     * @private
     */
    _constructSchedule(days, calendarFloor = 14) {
        const schedule = []
        const weeklyAssignments = new Map()
        const periodAssignments = this._deepCopyAssignments()
        const periodRotation = {}
        for (const group of this.LESSON_GROUPS) {
            periodRotation[group] = { 1: new Set(), 2: new Set() }
        }

        // Pre-populate weekly assignments from history so groups already
        // scheduled earlier in the starting week aren't double-booked.
        if (this.initialWeeklyGroups && this.initialWeeklyGroups.size > 0 && days.length > 0) {
            const firstWeekId = this.getWeekIdentifier(days[0].date)
            weeklyAssignments.set(firstWeekId, new Set(this.initialWeeklyGroups))
        }

        const lastGlobalPos = {}
        if (this.historicalLessonCounts) {
            // Seed ordering from historical counts: groups with fewer lessons
            // get lower (= earlier) positions so they're scheduled first,
            // naturally balancing counts across chunks.
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

        for (const day of days) {
            const { date, dayCycle, periods } = day
            const weekId = this.getWeekIdentifier(date)
            if (!weeklyAssignments.has(weekId))
                weeklyAssignments.set(weekId, new Set())

            const pending = [...pendingInCycle]
                .filter((g) => !weeklyAssignments.get(weekId)?.has(g))
                .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b])

            const nextCycle = this.LESSON_GROUPS
                .filter((g) => !pendingInCycle.has(g))
                .filter((g) => !weeklyAssignments.get(weekId)?.has(g))
                .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b])

            const dayType = dayCycle % 2 === 0 ? 2 : 1
            const dayTypePeriods = dayType === 1 ? DAY1_PERIODS : DAY2_PERIODS

            // Build per-day-type rotation view for the solver
            const currentRotation = {}
            for (const g of this.LESSON_GROUPS) {
                currentRotation[g] = periodRotation[g][dayType]
            }

            // Try pending-only first (with MU fill) to preserve cycle order
            const pendingOnly = [...pending, "MU"]
            let result = this._solveDayAssignment(
                periods, pendingOnly, date, weekId,
                weeklyAssignments, currentRotation, periodAssignments, calendarFloor
            )

            // If pending-only fails, allow next-cycle groups too
            if (!result) {
                const candidates = [...pending, ...nextCycle, "MU"]
                result = this._solveDayAssignment(
                    periods, candidates, date, weekId,
                    weeklyAssignments, currentRotation, periodAssignments, calendarFloor
                )
            }

            // Last resort: ignore cycle tracking, just find valid assignment
            if (!result) {
                const allCandidates = [
                    ...this.LESSON_GROUPS
                        .filter((g) => !weeklyAssignments.get(weekId)?.has(g))
                        .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b]),
                    "MU"
                ]
                result = this._solveDayAssignment(
                    periods, allCandidates, date, weekId,
                    weeklyAssignments, currentRotation, periodAssignments, calendarFloor
                )
            }

            // Final fallback: drop rotation constraint, keep only weekly + calendar
            if (!result) {
                const allCandidates = [
                    ...this.LESSON_GROUPS
                        .filter((g) => !weeklyAssignments.get(weekId)?.has(g))
                        .sort((a, b) => lastGlobalPos[a] - lastGlobalPos[b]),
                    "MU"
                ]
                const emptyRotation = {}
                for (const g of this.LESSON_GROUPS) emptyRotation[g] = new Set()
                result = this._solveDayAssignment(
                    periods, allCandidates, date, weekId,
                    weeklyAssignments, emptyRotation, periodAssignments, calendarFloor
                )
            }

            if (!result) return null

            const nonMU = result.filter((a) => a.group !== "MU")
            const mu = result.filter((a) => a.group === "MU")

            nonMU.sort((a, b) => lastGlobalPos[a.group] - lastGlobalPos[b.group])

            const dayEntry = new ScheduleEntry(date, dayType)
            for (const { period, group } of [...nonMU, ...mu]) {
                dayEntry.addLesson(period, group)
                if (group !== "MU") {
                    weeklyAssignments.get(weekId).add(group)
                    if (!periodAssignments[group]) periodAssignments[group] = {}
                    periodAssignments[group][period] = date
                    lastGlobalPos[group] = globalPos++
                    pendingInCycle.delete(group)
                    periodRotation[group][dayType].add(period)
                    if (dayTypePeriods.every(p => periodRotation[group][dayType].has(p))) {
                        periodRotation[group][dayType] = new Set()
                    }
                }
            }

            // Sort lessons by period number for display
            dayEntry.lessons.sort((a, b) => {
                const pA = parseInt(a.period.replace('Pd ', ''), 10)
                const pB = parseInt(b.period.replace('Pd ', ''), 10)
                return pA - pB
            })

            if (pendingInCycle.size === 0) {
                pendingInCycle = new Set(this.LESSON_GROUPS)
            }

            schedule.push(dayEntry)
        }

        return schedule
    }

    /**
     * Post-processing pass: reduce lesson-count spread when it exceeds
     * the theoretical minimum of 1. Scans from the end of the schedule
     * and swaps over-represented groups with under-represented ones,
     * provided all constraints (weekly uniqueness, period day-rule) hold.
     * @private
     */
    _balanceLessonCounts(schedule, dayRule) {
        const counts = {}
        for (const g of this.LESSON_GROUPS) counts[g] = 0
        for (const day of schedule) {
            for (const l of day.lessons) {
                if (l.group !== "MU") counts[l.group]++
            }
        }

        let maxC = Math.max(...Object.values(counts))
        let minC = Math.min(...Object.values(counts))
        if (maxC - minC <= 1) return

        const oneDayMs = 86400000
        const firstWeekId = schedule.length > 0
            ? this.getWeekIdentifier(schedule[0].date) : null

        for (let d = schedule.length - 1; d >= 0 && maxC - minC > 1; d--) {
            const day = schedule[d]
            const weekId = this.getWeekIdentifier(day.date)

            const weekGroups = new Set()
            for (const s of schedule) {
                if (this.getWeekIdentifier(s.date) === weekId) {
                    for (const l of s.lessons) {
                        if (l.group !== "MU") weekGroups.add(l.group)
                    }
                }
            }

            // Include groups from history that were in this week
            if (weekId === firstWeekId && this.initialWeeklyGroups) {
                for (const g of this.initialWeeklyGroups) weekGroups.add(g)
            }

            for (let li = 0; li < day.lessons.length && maxC - minC > 1; li++) {
                const lesson = day.lessons[li]
                if (lesson.group === "MU" || counts[lesson.group] !== maxC) continue

                const periodNum = parseInt(lesson.period.replace("Pd ", ""), 10)

                for (const candidate of this.LESSON_GROUPS) {
                    if (counts[candidate] !== minC) continue
                    if (weekGroups.has(candidate)) continue
                    if (day.lessons.some((l) => l.group === candidate)) continue

                    let tooClose = false
                    for (const s of schedule) {
                        if (s === day) continue
                        for (const l of s.lessons) {
                            if (l.group === candidate) {
                                const p = parseInt(l.period.replace("Pd ", ""), 10)
                                if (p === periodNum && Math.abs((day.date - s.date) / oneDayMs) < dayRule) {
                                    tooClose = true
                                }
                            }
                        }
                        if (tooClose) break
                    }
                    if (tooClose) continue

                    const oldGroup = lesson.group
                    lesson.group = candidate
                    counts[oldGroup]--
                    counts[candidate]++

                    maxC = Math.max(...Object.values(counts))
                    minC = Math.min(...Object.values(counts))
                    break
                }
            }
        }
    }

    buildSchedule() {
        const slots = this.generateAllSlots()
        if (slots.length === 0) return []

        const days = this._groupSlotsByDay(slots)

        // Try with 14-day calendar floor, fall back to rotation-only
        let schedule = this._constructSchedule(days, 14)
        if (!schedule) {
            schedule = this._constructSchedule(days, 0)
        }
        if (schedule) {
            this.achievedDayRule = 28
            this._balanceLessonCounts(schedule, 14)
            return schedule
        }

        return []
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
