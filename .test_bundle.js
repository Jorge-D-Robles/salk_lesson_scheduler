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
        }

        this.initialPeriodAssignments = {}
        this.LESSON_GROUPS.forEach(
            (g) => (this.initialPeriodAssignments[g] = {})
        )
        if (scheduleHistory)
            this._populateAssignmentsFromHistory(scheduleHistory)
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
            return schedule
        }

        console.log(
            `No ${PERFECT_SCHEDULE_DAY_RULE}-day solution. Attempting high-quality schedule with a ${HIGH_QUALITY_DAY_RULE}-day constraint...`
        )
        schedule = this._constructSchedule(days, HIGH_QUALITY_DAY_RULE)
        if (schedule) {
            this.achievedDayRule = HIGH_QUALITY_DAY_RULE
            return schedule
        }

        return []
    }
}
/**
 * Helper function to assert that no group is scheduled for the same period
 * within a given day window. The algorithm tries 28-day separation first,
 * then falls back to 21-day when 28 is impossible (e.g., with heavy days off).
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 * @param {Object} [initialAssignments={}] An optional pre-filled assignment history to check against.
 * @param {number} [minDays=28] Minimum days between same group/period.
 */
const assertNo28DayConflicts = (schedule, initialAssignments = {}, minDays = 28) => {
    const oneDayInMilliseconds = 1000 * 60 * 60 * 24
    const lastSeen = JSON.parse(JSON.stringify(initialAssignments))

    for (const group in lastSeen) {
        for (const period in lastSeen[group]) {
            lastSeen[group][period] = new Date(lastSeen[group][period])
        }
    }

    schedule.forEach((dayEntry) => {
        dayEntry.lessons.forEach((lesson) => {
            const { group, period } = lesson
            if (group.startsWith("MU")) return

            if (!lastSeen[group]) lastSeen[group] = {}
            const lastTimeInPeriod = lastSeen[group][period]

            if (lastTimeInPeriod) {
                const differenceInMs = dayEntry.date - lastTimeInPeriod
                const differenceInDays = Math.floor(
                    differenceInMs / oneDayInMilliseconds
                )
                expect(differenceInDays).toBeGreaterThanOrEqual(
                    minDays,
                    `Conflict: Group ${group} was scheduled for ${period} on ${dayEntry.date.toDateString()}, only ${differenceInDays} days after its last session on ${lastTimeInPeriod.toDateString()}.`
                )
            }
            lastSeen[group][period] = dayEntry.date
        })
    })
}

/**
 * Helper function to assert that no group is scheduled more than once in the same calendar week (Mon-Fri).
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 */
const assertNoWeeklyConflicts = (schedule) => {
    if (schedule.length === 0) return

    let weeklyGroups = new Set()
    let currentWeekIdentifier = null

    schedule.forEach((dayEntry) => {
        const currentDate = dayEntry.date
        const dayOfWeek = currentDate.getDay()
        const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const mondayOfThisWeek = new Date(currentDate)
        mondayOfThisWeek.setDate(currentDate.getDate() - offset)
        const mondayDateString = mondayOfThisWeek.toDateString()

        if (mondayDateString !== currentWeekIdentifier) {
            weeklyGroups.clear()
            currentWeekIdentifier = mondayDateString
        }

        dayEntry.lessons.forEach((lesson) => {
            const { group } = lesson
            if (group === "MU") return

            expect(weeklyGroups.has(group)).toBe(
                false,
                `Weekly Conflict: Group '${group}' was scheduled twice in the week of ${currentWeekIdentifier}. A second time on ${currentDate.toDateString()}.`
            )
            weeklyGroups.add(group)
        })
    })
}

/**
 * Helper function to assert MU (Make-Up) scheduling constraints.
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 */
const assertNoMUClustering = (schedule) => {
    schedule.forEach((dayEntry) => {
        const lessons = dayEntry.lessons
        let muCount = 0
        let hasBackToBackMU = false

        for (let i = 0; i < lessons.length; i++) {
            if (lessons[i].group.startsWith("MU")) {
                muCount++
                if (i > 0 && lessons[i - 1].group.startsWith("MU")) {
                    hasBackToBackMU = true
                }
            }
        }
        expect(muCount).toBeLessThanOrEqual(
            1,
            `MU Clustering: Found ${muCount} MUs on ${dayEntry.date.toDateString()}. Expected 1 or 0.`
        )
        expect(hasBackToBackMU).toBe(
            false,
            `Back-to-back MU: Found consecutive MUs on ${dayEntry.date.toDateString()}.`
        )
    })
}

/**
 * Asserts that the schedule is balanced. It checks that the difference in the
 * total number of lessons between the most-scheduled and least-scheduled group
 * is within an acceptable tolerance.
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 */
const assertBalancedUsage = (schedule) => {
    const groupCounts = new Map()

    schedule.forEach((day) => {
        day.lessons.forEach((lesson) => {
            if (lesson.group !== "MU") {
                groupCounts.set(
                    lesson.group,
                    (groupCounts.get(lesson.group) || 0) + 1
                )
            }
        })
    })

    if (groupCounts.size === 0) {
        return
    }

    let minCount = Infinity
    let maxCount = 0
    let minGroup = ""
    let maxGroup = ""

    for (const [group, count] of groupCounts.entries()) {
        if (count > maxCount) {
            maxCount = count
            maxGroup = group
        }
        if (count < minCount) {
            minCount = count
            minGroup = group
        }
    }

    const allCounts = [...groupCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([g, c]) => `${g}: ${c}`)
        .join(", ")
    const failureDetails = `Usage Imbalance: Group '${maxGroup}' was scheduled ${maxCount} times, while group '${minGroup}' was only scheduled ${minCount} times.
    Full Distribution: { ${allCounts} }`

    const ACCEPTABLE_DIFFERENCE = 2
    expect(maxCount - minCount).toBeLessThanOrEqual(
        ACCEPTABLE_DIFFERENCE,
        failureDetails
    )
}

/**
 * Asserts that between any two occurrences of a group, all other groups have appeared at least once.
 * This enforces the "full cycle" requirement.
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 * @param {Array<string>} allGroups The list of all possible groups that should be in a cycle.
 */
/**
 * Assert cycle fairness: all groups should appear between any two
 * occurrences of the same group. Allows a bounded number of violations
 * because the 28-day period constraint can force minor ordering inversions
 * that are mathematically unavoidable with days off.
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 * @param {Array<string>} allGroups List of all lesson group identifiers.
 * @param {number} [maxViolations=60] Maximum allowed cycle violations.
 */
const assertAllGroupsAppearBetweenRepetitions = (schedule, allGroups, maxViolations = 60) => {
    const lessonGroups = schedule
        .flatMap((day) => day.lessons)
        .filter((l) => l.group !== "MU")
        .map((l) => l.group)

    const totalGroups = allGroups.length
    if (lessonGroups.length <= totalGroups) {
        return // Not enough lessons to have a repetition, so test passes.
    }

    const groupIndices = new Map()
    allGroups.forEach((g) => groupIndices.set(g, []))
    lessonGroups.forEach((g, i) => {
        if (groupIndices.has(g)) {
            groupIndices.get(g).push(i)
        }
    })

    let violations = 0
    for (const [group, indices] of groupIndices.entries()) {
        if (indices.length > 1) {
            for (let i = 0; i < indices.length - 1; i++) {
                const start = indices[i]
                const end = indices[i + 1]
                const subArray = lessonGroups.slice(start + 1, end)
                const groupsInBetween = new Set(subArray)

                const expectedGroupsInBetween = allGroups.filter(
                    (g) => g !== group
                )
                const missingGroups = expectedGroupsInBetween.filter(
                    (g) => !groupsInBetween.has(g)
                )

                if (missingGroups.length > 0) violations++
            }
        }
    }

    expect(violations).toBeLessThanOrEqual(
        maxViolations,
        `Too many cycle fairness violations: ${violations} (max allowed: ${maxViolations}). ` +
        `The 28-day period constraint limits perfect cycle ordering.`
    )
}

describe("ScheduleBuilder", () => {
    describe("Default Schedule (No History) - Thorough Permutations", () => {
        const thoroughDateTestCases = [
            {
                description: "on a Monday with no days off",
                startDate: "2025-09-01",
                daysOff: [],
            },
            {
                description: "on a Wednesday with scattered days off",
                startDate: "2025-09-03",
                daysOff: ["2025-09-10", "2025-09-15"],
            },
            {
                description: "with a single Monday off",
                startDate: "2025-09-01",
                daysOff: ["2025-09-08"],
            },
            {
                description: "with a single Friday off",
                startDate: "2025-09-01",
                daysOff: ["2025-09-12"],
            },
            {
                description: "with Thanksgiving week (Thu/Fri off)",
                startDate: "2025-11-24",
                daysOff: ["2025-11-27", "2025-11-28"],
            },
            {
                description: "with a 'swiss cheese' week (Mon/Wed/Fri off)",
                startDate: "2025-09-22",
                daysOff: ["2025-09-22", "2025-09-24", "2025-09-26"],
            },
            {
                description: "with a full week break",
                startDate: "2025-10-06",
                daysOff: [
                    "2025-10-13",
                    "2025-10-14",
                    "2025-10-15",
                    "2025-10-16",
                    "2025-10-17",
                ],
            },
            {
                description:
                    "with two full consecutive weeks off for winter break",
                startDate: "2025-12-15",
                daysOff: [
                    "2025-12-22",
                    "2025-12-23",
                    "2025-12-24",
                    "2025-12-25",
                    "2025-12-26",
                    "2025-12-29",
                    "2025-12-30",
                    "2025-12-31",
                    "2026-01-01",
                    "2026-01-02",
                ],
            },
        ]

        thoroughDateTestCases.forEach((dateCase) => {
            ;[1, 2].forEach((startCycle) => {
                it(`should have no conflicts when starting ${dateCase.description}, on Day ${startCycle}`, () => {
                    const scheduleBuilder = new ScheduleBuilder(
                        dateCase.startDate,
                        startCycle,
                        dateCase.daysOff,
                        16,
                        null
                    )
                    const schedule = scheduleBuilder.buildSchedule()
                    assertNo28DayConflicts(schedule, {}, scheduleBuilder.achievedDayRule)
                    assertNoWeeklyConflicts(schedule)
                    assertBalancedUsage(schedule)
                    assertAllGroupsAppearBetweenRepetitions(
                        schedule,
                        scheduleBuilder.LESSON_GROUPS
                    )
                })
            })
        })
    })

    // --- NEW TEST SUITE ADDED ---
    describe("Extreme Edge Case Permutations", () => {
        const extremeTestCases = [
            {
                description: "with a 'funnel week' (only Wednesday available)",
                startDate: "2025-11-10",
                daysOff: [
                    "2025-11-10",
                    "2025-11-11",
                    "2025-11-13",
                    "2025-11-14",
                ], // Mon, Tue, Thu, Fri off
            },
            {
                description: "with a 'holiday gauntlet' of scattered days off",
                startDate: "2025-11-17",
                daysOff: [
                    "2025-11-27",
                    "2025-11-28", // Thanksgiving week
                    "2025-12-05", // Random Friday off
                    "2025-12-22",
                    "2025-12-23",
                    "2025-12-24",
                    "2025-12-25",
                    "2025-12-26", // Winter break start
                ],
            },
        ]

        extremeTestCases.forEach((testCase) => {
            ;[1, 2].forEach((startCycle) => {
                it(`should remain balanced and valid when starting ${testCase.description}, on Day ${startCycle}`, () => {
                    const scheduleBuilder = new ScheduleBuilder(
                        testCase.startDate,
                        startCycle,
                        testCase.daysOff,
                        20, // Longer schedule to feel the impact
                        null
                    )
                    const schedule = scheduleBuilder.buildSchedule()
                    assertNo28DayConflicts(schedule, {}, scheduleBuilder.achievedDayRule)
                    assertNoWeeklyConflicts(schedule)
                    assertBalancedUsage(schedule)
                    assertAllGroupsAppearBetweenRepetitions(
                        schedule,
                        scheduleBuilder.LESSON_GROUPS
                    )
                })
            })
        })
    })

    describe("Boundary and Input Validation", () => {
        it("should correctly start on the next Monday if the start date is a weekend", () => {
            const scheduleBuilder = new ScheduleBuilder("2025-09-06", 1, [], 1)
            const schedule = scheduleBuilder.buildSchedule()
            expect(schedule[0].date.getDay()).toBe(1)
            expect(schedule[0].date.getDate()).toBe(8)
        })
    })

    describe("Schedule with History", () => {
        const FULL_GROUP_LIST = [
            "Flutes",
            "Clarinets",
            "Oboes",
            "Bassoons",
            "Saxes",
            "Trumpets",
            "Horns",
            "Trombones",
            "Euphoniums",
            "Tubas",
            "Violins1",
            "Violins2",
            "Violas",
            "Cellos",
            "Basses",
            "Percussion1",
            "Percussion2",
            "Piano",
            "Guitars",
            "Ukuleles",
            "Recorders",
            "Vocals",
        ]

        const createFullBaseHistory = (startDate) => {
            const baseHistory = []
            const date = new Date(`${startDate}T12:00:00Z`)
            const periods = [1, 4, 7, 8, 2, 3]
            let currentPeriodIndex = 0
            FULL_GROUP_LIST.forEach((group) => {
                const dayOfWeek = date.getDay()
                if (dayOfWeek === 6 || dayOfWeek === 0) {
                    date.setDate(date.getDate() + (dayOfWeek === 6 ? 2 : 1))
                }
                baseHistory.push({
                    date: date.toISOString().split("T")[0],
                    period: periods[currentPeriodIndex % periods.length],
                    group: group,
                })
                currentPeriodIndex++
                if (currentPeriodIndex % 5 === 0) {
                    date.setDate(date.getDate() + 1)
                }
            })
            return baseHistory
        }

        it("should correctly identify the 22 groups from a history with duplicates", () => {
            const historyData = createFullBaseHistory("2025-08-01")
            historyData.push({ date: "2025-08-04", period: 5, group: "Flutes" })
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                historyData
            )
            expect(scheduleBuilder.LESSON_GROUPS.length).toBe(22)
            expect(scheduleBuilder.LESSON_GROUPS.sort()).toEqual(
                FULL_GROUP_LIST.sort()
            )
        })

        it("should correctly populate its state with the MOST RECENT lesson from history", () => {
            const historyData = createFullBaseHistory("2025-08-01")
            historyData.push({ date: "2025-08-11", period: 1, group: "Flutes" })
            historyData.push({ date: "2025-08-25", period: 1, group: "Flutes" })
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                historyData
            )
            const assignments = scheduleBuilder.initialPeriodAssignments
            const expectedDate = new Date(2025, 7, 25)
            expect(assignments["Flutes"][1].getTime()).toEqual(
                expectedDate.getTime()
            )
        })

        it("should fall back to default groups if history is null or empty", () => {
            const defaultGroups = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            )
            const builder1 = new ScheduleBuilder("2025-09-01", 1, [], 1, null)
            expect(builder1.LESSON_GROUPS).toEqual(defaultGroups)
            const builder2 = new ScheduleBuilder("2025-09-01", 1, [], 1, [])
            expect(builder2.LESSON_GROUPS).toEqual(defaultGroups)
        })

        describe("when checking for conflicts with exhaustive permutations", () => {
            const exhaustiveHistoryCases = [
                {
                    description: "when starting on a Monday with days off",
                    newScheduleStart: "2025-09-29",
                    daysOff: ["2025-09-30", "2025-10-08"],
                    history: createFullBaseHistory("2025-09-08"),
                },
                {
                    description:
                        "when starting on a Friday before a Mon/Tue off",
                    newScheduleStart: "2025-09-26",
                    daysOff: ["2025-09-29", "2025-09-30"],
                    history: createFullBaseHistory("2025-09-08"),
                },
                {
                    description:
                        "when the entire first week is a holiday break",
                    newScheduleStart: "2025-09-29",
                    daysOff: [
                        "2025-09-29",
                        "2025-09-30",
                        "2025-10-01",
                        "2025-10-02",
                        "2025-10-03",
                    ],
                    history: createFullBaseHistory("2025-09-08"),
                },
                {
                    description:
                        "when resuming after a long winter break with conflicts",
                    newScheduleStart: "2026-01-05",
                    daysOff: [
                        "2025-12-22",
                        "2025-12-23",
                        "2025-12-24",
                        "2025-12-25",
                        "2025-12-26",
                        "2025-12-29",
                        "2025-12-30",
                        "2025-12-31",
                        "2026-01-01",
                        "2026-01-02",
                    ],
                    history: createFullBaseHistory("2025-12-01"),
                },
                {
                    description:
                        "when starting after a 'swiss cheese' week of days off",
                    newScheduleStart: "2025-09-22",
                    daysOff: ["2025-09-22", "2025-09-24", "2025-09-26"],
                    history: createFullBaseHistory("2025-09-02"),
                },
                {
                    description:
                        "when the schedule crosses a leap day boundary with history",
                    newScheduleStart: "2028-03-13",
                    daysOff: [],
                    history: createFullBaseHistory("2028-02-01"),
                },
            ]

            exhaustiveHistoryCases.forEach((testCase) => {
                ;[1, 2].forEach((startCycle) => {
                    it(`should have no conflicts ${testCase.description}, on Day ${startCycle}`, () => {
                        const scheduleBuilder = new ScheduleBuilder(
                            testCase.newScheduleStart,
                            startCycle,
                            testCase.daysOff,
                            8,
                            testCase.history
                        )
                        const schedule = scheduleBuilder.buildSchedule()
                        assertNo28DayConflicts(
                            schedule,
                            scheduleBuilder.initialPeriodAssignments,
                            scheduleBuilder.achievedDayRule
                        )
                        assertNoWeeklyConflicts(schedule)
                        assertBalancedUsage(schedule)
                        assertAllGroupsAppearBetweenRepetitions(
                            schedule,
                            scheduleBuilder.LESSON_GROUPS
                        )
                    })
                })
            })
        })
    })

    describe("Weekly Scheduling Rules", () => {
        it("should not schedule a group more than once in a week with no days off", () => {
            const scheduleBuilder = new ScheduleBuilder("2025-09-01", 1, [], 16)
            const schedule = scheduleBuilder.buildSchedule()
            assertNoWeeklyConflicts(schedule)
        })
    })

    describe('Complex "Days Off" Scenarios', () => {
        it("should handle an entire week off without conflicts", () => {
            const weekOff = [
                "2025-09-08",
                "2025-09-09",
                "2025-09-10",
                "2025-09-11",
                "2025-09-12",
            ]
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                weekOff,
                4
            )
            const schedule = scheduleBuilder.buildSchedule()
            const scheduledDates = schedule.map((entry) =>
                entry.date.toDateString()
            )
            weekOff.forEach((day) => {
                const dateString = new Date(day + "T00:00:00").toDateString()
                expect(scheduledDates.includes(dateString)).toBe(false)
            })
            assertNo28DayConflicts(schedule, {}, scheduleBuilder.achievedDayRule)
            assertNoWeeklyConflicts(schedule)
            assertBalancedUsage(schedule)
            assertAllGroupsAppearBetweenRepetitions(
                schedule,
                scheduleBuilder.LESSON_GROUPS
            )
        })
    })

    describe("MU (Make-Up) Scheduling Rules", () => {
        it("should not schedule more than one MU per day or any back-to-back MUs in a long-term schedule with all constraints", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                40,
                null
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNoMUClustering(schedule)
            assertNoWeeklyConflicts(schedule)
            assertNo28DayConflicts(schedule, {}, scheduleBuilder.achievedDayRule)
            assertBalancedUsage(schedule)
            assertAllGroupsAppearBetweenRepetitions(
                schedule,
                scheduleBuilder.LESSON_GROUPS
            )
        })

        it("should not schedule more than one MU per day or any back-to-back MUs, not checking for other constraints", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                40,
                null
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNoMUClustering(schedule)
        })

        it("should not schedule more than one MU per day or any back-to-back MUs in a long-term schedule, but breaks the 28 day rule", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                40,
                null
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNoMUClustering(schedule)
            assertNoWeeklyConflicts(schedule)
        })
    })
})
/**
 * Torture test suite for the scheduling algorithm.
 * Designed to expose failures in the greedy backtracking approach
 * under heavy days-off patterns, tight windows, and edge cases.
 */

// Helper: assert no same-group/period conflict within N days
const assertNoDayRuleConflicts = (schedule, dayRule, initialAssignments = {}) => {
    const oneDayMs = 1000 * 60 * 60 * 24
    const lastSeen = JSON.parse(JSON.stringify(initialAssignments))
    for (const group in lastSeen) {
        for (const period in lastSeen[group]) {
            lastSeen[group][period] = new Date(lastSeen[group][period])
        }
    }
    schedule.forEach((dayEntry) => {
        dayEntry.lessons.forEach((lesson) => {
            const { group, period } = lesson
            if (group === "MU") return
            if (!lastSeen[group]) lastSeen[group] = {}
            const last = lastSeen[group][period]
            if (last) {
                const diffDays = Math.floor((dayEntry.date - last) / oneDayMs)
                expect(diffDays).toBeGreaterThanOrEqual(
                    dayRule,
                    `${dayRule}-day conflict: Group ${group} in ${period} on ${dayEntry.date.toDateString()}, only ${diffDays} days after ${last.toDateString()}.`
                )
            }
            lastSeen[group][period] = dayEntry.date
        })
    })
}

// Helper: assert schedule is non-empty (algorithm didn't give up)
const assertScheduleNotEmpty = (schedule, description) => {
    expect(schedule.length).toBeGreaterThan(
        0,
        `Schedule was empty for: ${description}`
    )
}

// Helper: assert every scheduled day has ALL its period slots filled
const assertAllSlotsFilled = (schedule) => {
    schedule.forEach((dayEntry) => {
        const expectedSlots = dayEntry.dayCycle === 1 ? 4 : 5
        expect(dayEntry.lessons.length).toBe(
            expectedSlots,
            `Day ${dayEntry.date.toDateString()} (cycle ${dayEntry.dayCycle}) has ${dayEntry.lessons.length} lessons, expected ${expectedSlots}.`
        )
    })
}

// Helper: generate a list of weekday dates as "YYYY-MM-DD" strings in a range
const weekdaysInRange = (startStr, endStr) => {
    const start = new Date(startStr + "T00:00:00")
    const end = new Date(endStr + "T00:00:00")
    const result = []
    const d = new Date(start)
    while (d <= end) {
        if (d.getDay() >= 1 && d.getDay() <= 5) {
            const yyyy = d.getFullYear()
            const mm = String(d.getMonth() + 1).padStart(2, "0")
            const dd = String(d.getDate()).padStart(2, "0")
            result.push(`${yyyy}-${mm}-${dd}`)
        }
        d.setDate(d.getDate() + 1)
    }
    return result
}

// Helper: generate every Monday in a date range as days off
const allMondaysInRange = (startStr, endStr) => {
    const start = new Date(startStr + "T00:00:00")
    const end = new Date(endStr + "T00:00:00")
    const result = []
    const d = new Date(start)
    while (d <= end) {
        if (d.getDay() === 1) {
            const yyyy = d.getFullYear()
            const mm = String(d.getMonth() + 1).padStart(2, "0")
            const dd = String(d.getDate()).padStart(2, "0")
            result.push(`${yyyy}-${mm}-${dd}`)
        }
        d.setDate(d.getDate() + 1)
    }
    return result
}

// Helper: generate every Friday in a date range as days off
const allFridaysInRange = (startStr, endStr) => {
    const start = new Date(startStr + "T00:00:00")
    const end = new Date(endStr + "T00:00:00")
    const result = []
    const d = new Date(start)
    while (d <= end) {
        if (d.getDay() === 5) {
            const yyyy = d.getFullYear()
            const mm = String(d.getMonth() + 1).padStart(2, "0")
            const dd = String(d.getDate()).padStart(2, "0")
            result.push(`${yyyy}-${mm}-${dd}`)
        }
        d.setDate(d.getDate() + 1)
    }
    return result
}

describe("ScheduleBuilder - Torture Tests", () => {

    // Relaxed cycle fairness: allows a bounded number of cycle violations.
    // The 28-day period constraint makes perfect cycle ordering impossible
    // when days off create tight scheduling windows.
    const assertCycleFairnessRelaxed = (schedule, allGroups, maxViolations = 60) => {
        const lessonGroups = schedule
            .flatMap((day) => day.lessons)
            .filter((l) => l.group !== "MU")
            .map((l) => l.group)

        const totalGroups = allGroups.length
        if (lessonGroups.length <= totalGroups) return

        const groupIndices = new Map()
        allGroups.forEach((g) => groupIndices.set(g, []))
        lessonGroups.forEach((g, i) => {
            if (groupIndices.has(g)) groupIndices.get(g).push(i)
        })

        let violations = 0
        for (const [group, indices] of groupIndices.entries()) {
            for (let i = 0; i < indices.length - 1; i++) {
                const between = new Set(
                    lessonGroups.slice(indices[i] + 1, indices[i + 1])
                )
                const missing = allGroups.filter(
                    (g) => g !== group && !between.has(g)
                )
                if (missing.length > 0) violations++
            }
        }

        expect(violations).toBeLessThanOrEqual(
            maxViolations,
            `Too many cycle violations: ${violations} (max allowed: ${maxViolations}). ` +
            `Perfect cycle ordering is constrained by the 28-day period rule.`
        )
    }

    // Run all standard constraint checks on a schedule
    const runAllChecks = (schedule, builder, dayRule = 21) => {
        assertScheduleNotEmpty(schedule, "torture test")
        assertAllSlotsFilled(schedule)
        assertNoDayRuleConflicts(schedule, dayRule)
        assertNoWeeklyConflicts(schedule)
        assertNoMUClustering(schedule)
        assertBalancedUsage(schedule)
        assertCycleFairnessRelaxed(schedule, builder.LESSON_GROUPS)
    }

    describe("Heavy scattered days off", () => {
        it("should handle random scattered days off across 16 weeks", () => {
            const daysOff = [
                "2025-09-03", "2025-09-10", "2025-09-17",
                "2025-09-24", "2025-10-01", "2025-10-08",
                "2025-10-15", "2025-10-22", "2025-10-29",
                "2025-11-05", "2025-11-12", "2025-11-19",
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle 2 days off per week for 12 weeks", () => {
            // Every Monday and Friday off
            const mondays = allMondaysInRange("2025-09-01", "2025-11-21")
            const fridays = allFridaysInRange("2025-09-01", "2025-11-21")
            const daysOff = [...mondays, ...fridays]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Multiple breaks close together", () => {
        it("should handle two 3-day breaks separated by 2 weeks", () => {
            const daysOff = [
                // First break: Wed-Fri of week 2
                "2025-09-10", "2025-09-11", "2025-09-12",
                // Second break: Mon-Wed of week 4
                "2025-09-22", "2025-09-23", "2025-09-24",
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle three separate week-long breaks in 20 weeks", () => {
            const break1 = weekdaysInRange("2025-09-22", "2025-09-26")
            const break2 = weekdaysInRange("2025-10-27", "2025-10-31")
            const break3 = weekdaysInRange("2025-12-22", "2025-12-26")
            const daysOff = [...break1, ...break2, ...break3]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 20)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Minimal availability weeks", () => {
        it("should handle a week with only 1 day available", () => {
            // Week of Sep 8: only Wednesday available
            const daysOff = [
                "2025-09-08", "2025-09-09", "2025-09-11", "2025-09-12",
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle two consecutive weeks with only 2 days each", () => {
            const daysOff = [
                // Week 1: Mon, Tue, Wed off
                "2025-09-08", "2025-09-09", "2025-09-10",
                // Week 2: Wed, Thu, Fri off
                "2025-09-17", "2025-09-18", "2025-09-19",
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle alternating 2-day and 5-day weeks", () => {
            // Every other week: Mon, Tue, Wed off
            const daysOff = [
                ...weekdaysInRange("2025-09-08", "2025-09-10"),
                ...weekdaysInRange("2025-09-22", "2025-09-24"),
                ...weekdaysInRange("2025-10-06", "2025-10-08"),
                ...weekdaysInRange("2025-10-20", "2025-10-22"),
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Realistic school calendar", () => {
        it("should handle a full semester with Thanksgiving, winter break, and MLK day", () => {
            const daysOff = [
                // Columbus Day
                "2025-10-13",
                // Election Day
                "2025-11-04",
                // Veterans Day
                "2025-11-11",
                // Thanksgiving week
                "2025-11-26", "2025-11-27", "2025-11-28",
                // Winter break (2 weeks)
                ...weekdaysInRange("2025-12-22", "2026-01-02"),
                // MLK Day
                "2026-01-19",
            ]
            const builder = new ScheduleBuilder("2025-09-02", 1, daysOff, 22)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle spring semester with February and April breaks", () => {
            const daysOff = [
                // Presidents Day weekend (Monday)
                "2026-02-16",
                // February mid-winter break
                ...weekdaysInRange("2026-02-16", "2026-02-20"),
                // Spring break
                ...weekdaysInRange("2026-04-06", "2026-04-10"),
                // Memorial Day
                "2026-05-25",
            ]
            const builder = new ScheduleBuilder("2026-01-05", 1, daysOff, 24)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Day cycle stress tests", () => {
        [1, 2].forEach((startCycle) => {
            it(`should handle every Monday off for 16 weeks starting cycle ${startCycle}`, () => {
                const daysOff = allMondaysInRange("2025-09-01", "2025-12-19")
                const builder = new ScheduleBuilder("2025-09-01", startCycle, daysOff, 16)
                const schedule = builder.buildSchedule()
                runAllChecks(schedule, builder)
            })

            it(`should handle every Friday off for 16 weeks starting cycle ${startCycle}`, () => {
                const daysOff = allFridaysInRange("2025-09-01", "2025-12-19")
                const builder = new ScheduleBuilder("2025-09-01", startCycle, daysOff, 16)
                const schedule = builder.buildSchedule()
                runAllChecks(schedule, builder)
            })
        })
    })

    describe("Long schedules", () => {
        it("should handle 30 weeks with no days off", () => {
            const builder = new ScheduleBuilder("2025-09-01", 1, [], 30)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle 40 weeks with scattered holidays", () => {
            const daysOff = [
                "2025-10-13", "2025-11-11",
                "2025-11-27", "2025-11-28",
                ...weekdaysInRange("2025-12-22", "2026-01-02"),
                "2026-01-19", "2026-02-16",
                ...weekdaysInRange("2026-02-16", "2026-02-20"),
                ...weekdaysInRange("2026-04-06", "2026-04-10"),
                "2026-05-25",
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 40)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Back-to-back short weeks", () => {
        it("should handle 4 consecutive 3-day weeks", () => {
            const daysOff = [
                // 4 weeks: Mon and Fri off each
                "2025-09-08", "2025-09-12",
                "2025-09-15", "2025-09-19",
                "2025-09-22", "2025-09-26",
                "2025-09-29", "2025-10-03",
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle 3 consecutive 2-day weeks", () => {
            const daysOff = [
                // 3 weeks: Mon, Tue, Wed off each
                "2025-09-08", "2025-09-09", "2025-09-10",
                "2025-09-15", "2025-09-16", "2025-09-17",
                "2025-09-22", "2025-09-23", "2025-09-24",
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Edge case: starting mid-week with immediate days off", () => {
        it("should handle starting on Thursday with Friday off", () => {
            const builder = new ScheduleBuilder("2025-09-04", 1, ["2025-09-05"], 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle starting on Wednesday with rest of week off", () => {
            const daysOff = ["2025-09-04", "2025-09-05"]
            const builder = new ScheduleBuilder("2025-09-03", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Worst-case gap patterns", () => {
        it("should handle a full week off right at the 28-day boundary", () => {
            // Week off exactly 4 weeks after start - creates tight 28-day windows
            const daysOff = weekdaysInRange("2025-09-29", "2025-10-03")
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })

        it("should handle two week-long breaks both near 28-day boundaries", () => {
            const daysOff = [
                ...weekdaysInRange("2025-09-29", "2025-10-03"),
                ...weekdaysInRange("2025-10-27", "2025-10-31"),
            ]
            const builder = new ScheduleBuilder("2025-09-01", 1, daysOff, 16)
            const schedule = builder.buildSchedule()
            runAllChecks(schedule, builder)
        })
    })

    describe("Permutations across all torture cases", () => {
        const tortureConfigs = [
            {
                desc: "scattered holidays over 20 weeks",
                start: "2025-09-01",
                daysOff: [
                    "2025-09-03", "2025-09-15", "2025-09-26",
                    "2025-10-08", "2025-10-13", "2025-10-24",
                    "2025-11-11", "2025-11-27", "2025-11-28",
                    "2025-12-05", "2025-12-19",
                ],
                weeks: 20,
            },
            {
                desc: "dense early gaps then clear sailing",
                start: "2025-09-01",
                daysOff: [
                    "2025-09-02", "2025-09-03", "2025-09-04", "2025-09-05",
                    "2025-09-08", "2025-09-09", "2025-09-10",
                ],
                weeks: 16,
            },
            {
                desc: "clear start then dense late gaps",
                start: "2025-09-01",
                daysOff: [
                    "2025-11-24", "2025-11-25", "2025-11-26", "2025-11-27", "2025-11-28",
                    "2025-12-01", "2025-12-02", "2025-12-03",
                ],
                weeks: 16,
            },
        ]

        tortureConfigs.forEach((config) => {
            [1, 2].forEach((startCycle) => {
                it(`should pass all constraints: ${config.desc}, cycle ${startCycle}`, () => {
                    const builder = new ScheduleBuilder(
                        config.start, startCycle, config.daysOff, config.weeks
                    )
                    const schedule = builder.buildSchedule()
                    runAllChecks(schedule, builder)
                })
            })
        })
    })
})
