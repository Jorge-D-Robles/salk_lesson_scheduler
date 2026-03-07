/**
 * @file Contains the core scheduling algorithm for generating the music lesson schedule.
 * It uses a constructive cycle-based approach with within-day reordering
 * to maintain full-cycle fairness across all groups.
 */

// --- Constants for Scheduling Rules ---
const PERFECT_SCHEDULE_DAY_RULE = 28
const HIGH_QUALITY_DAY_RULE = 21
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
        this.LESSON_GROUPS.forEach(
            (g) => (this.initialPeriodAssignments[g] = {})
        )
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
                    currentDayCycle % 2 !== 0 ? [1, 4, 7, 8] : [1, 2, 3, 7, 8]
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
    _solveDayAssignment(periods, candidateGroups, date, weekId, weeklyAssignments, periodAssignments, dayRule) {
        const numPeriods = periods.length
        const oneDayMs = 1000 * 60 * 60 * 24

        const validGroupsPerPeriod = periods.map((period) => {
            const valid = []
            for (const group of candidateGroups) {
                if (group === "MU") { valid.push(group); continue }
                if (weeklyAssignments.get(weekId)?.has(group)) continue
                const lastDate = periodAssignments[group]?.[period]
                if (lastDate && (date - lastDate) / oneDayMs < dayRule) continue
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
    _constructSchedule(days, dayRule) {
        const schedule = []
        const weeklyAssignments = new Map()
        const periodAssignments = this._deepCopyAssignments()

        const lastGlobalPos = {}
        for (const g of this.LESSON_GROUPS) {
            lastGlobalPos[g] = -REQUIRED_UNIQUE_GROUPS
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

            // Try pending-only first (with MU fill) to preserve cycle order
            const pendingOnly = [...pending, "MU"]
            let result = this._solveDayAssignment(
                periods, pendingOnly, date, weekId,
                weeklyAssignments, periodAssignments, dayRule
            )

            // If pending-only fails, allow next-cycle groups too
            if (!result) {
                const candidates = [...pending, ...nextCycle, "MU"]
                result = this._solveDayAssignment(
                    periods, candidates, date, weekId,
                    weeklyAssignments, periodAssignments, dayRule
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
                    weeklyAssignments, periodAssignments, dayRule
                )
            }

            if (!result) return null

            const nonMU = result.filter((a) => a.group !== "MU")
            const mu = result.filter((a) => a.group === "MU")

            nonMU.sort((a, b) => lastGlobalPos[a.group] - lastGlobalPos[b.group])

            const dayEntry = new ScheduleEntry(date, dayCycle % 2 === 0 ? 2 : 1)
            for (const { period, group } of [...nonMU, ...mu]) {
                dayEntry.addLesson(period, group)
                if (group !== "MU") {
                    weeklyAssignments.get(weekId).add(group)
                    if (!periodAssignments[group]) periodAssignments[group] = {}
                    periodAssignments[group][period] = date
                    lastGlobalPos[group] = globalPos++
                    pendingInCycle.delete(group)
                }
            }

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

        console.log(
            `Attempting to find a perfect schedule with a ${PERFECT_SCHEDULE_DAY_RULE}-day constraint...`
        )
        let schedule = this._constructSchedule(days, PERFECT_SCHEDULE_DAY_RULE)
        if (schedule) {
            this.achievedDayRule = PERFECT_SCHEDULE_DAY_RULE
            this._balanceLessonCounts(schedule, PERFECT_SCHEDULE_DAY_RULE)
            return schedule
        }

        console.log(
            `No ${PERFECT_SCHEDULE_DAY_RULE}-day solution. Attempting high-quality schedule with a ${HIGH_QUALITY_DAY_RULE}-day constraint...`
        )
        schedule = this._constructSchedule(days, HIGH_QUALITY_DAY_RULE)
        if (schedule) {
            this.achievedDayRule = HIGH_QUALITY_DAY_RULE
            this._balanceLessonCounts(schedule, HIGH_QUALITY_DAY_RULE)
            return schedule
        }

        return []
    }
}
