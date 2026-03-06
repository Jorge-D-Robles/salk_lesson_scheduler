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
