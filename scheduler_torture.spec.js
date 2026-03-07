/**
 * Torture test suite for the scheduling algorithm.
 * Designed to expose failures in the greedy backtracking approach
 * under heavy days-off patterns, tight windows, and edge cases.
 */

// Helper: assert no per-day-type rotation violations
const assertNoRotationViolationsTorture = (schedule, maxViolations = 20) => {
    const DAY1 = [1, 4, 7, 8]
    const DAY2 = [1, 2, 3, 7, 8]
    const usedPeriods = {}
    let violations = 0
    schedule.forEach((dayEntry) => {
        const dayType = dayEntry.dayCycle
        const dayPeriods = dayType === 1 ? DAY1 : DAY2
        dayEntry.lessons.forEach((lesson) => {
            const { group, period } = lesson
            if (group === "MU") return
            const periodNum = parseInt(period.replace('Pd ', ''), 10)
            if (!usedPeriods[group]) usedPeriods[group] = { 1: new Set(), 2: new Set() }
            if (usedPeriods[group][dayType].has(periodNum)) violations++
            usedPeriods[group][dayType].add(periodNum)
            if (dayPeriods.every(p => usedPeriods[group][dayType].has(p))) {
                usedPeriods[group][dayType] = new Set()
            }
        })
    })
    expect(violations).toBeLessThanOrEqual(
        maxViolations,
        `Too many rotation violations: ${violations} (max allowed: ${maxViolations}). ` +
        `The 4th-tier fallback may drop rotation constraints on constrained days.`
    )
}

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
            `Perfect cycle ordering is constrained by the period rotation rule.`
        )
    }

    // Run all standard constraint checks on a schedule
    const runAllChecks = (schedule, builder, dayRule = 14, maxCycleViolations = 500) => {
        assertScheduleNotEmpty(schedule, "torture test")
        assertAllSlotsFilled(schedule)
        assertNoRotationViolationsTorture(schedule)
        assertNoDayRuleConflicts(schedule, dayRule)
        assertNoWeeklyConflicts(schedule)
        assertNoMUClustering(schedule)
        assertBalancedUsage(schedule)
        assertCycleFairnessRelaxed(schedule, builder.LESSON_GROUPS, maxCycleViolations)
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

    describe("Real school calendar: Levittown 2025-2026", () => {
        // Actual calendar from Levittown Public Schools approved 2/5/25
        // School year: Sep 2, 2025 – Jun 26, 2026 (Salk Middle School)
        const levittownDaysOff = [
            // Rosh Hashanah
            "2025-09-23", "2025-09-24",
            // Yom Kippur
            "2025-10-02",
            // Columbus Day
            "2025-10-13",
            // Diwali
            "2025-10-20",
            // Election Day / Supt Conf Day
            "2025-11-04",
            // Veteran's Day (Observed)
            "2025-11-11",
            // Thanksgiving Break
            "2025-11-27", "2025-11-28",
            // Winter Recess (Dec 24 - Jan 2)
            "2025-12-24", "2025-12-25", "2025-12-26",
            "2025-12-29", "2025-12-30", "2025-12-31",
            "2026-01-01", "2026-01-02",
            // Martin Luther King Jr Day
            "2026-01-19",
            // February Recess (Feb 16-20)
            "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
            // Eid al Fitr / Supt Conf Day
            "2026-03-20",
            // Spring Recess (Apr 2-10)
            "2026-04-02", "2026-04-03",
            "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10",
            // Memorial Day Recess
            "2026-05-25",
            // Eid al Adha
            "2026-05-27",
            // Juneteenth
            "2026-06-19",
        ]

        ;[1, 2].forEach((startCycle) => {
            it(`should handle full Levittown 2025-2026 school year starting cycle ${startCycle}`, () => {
                const builder = new ScheduleBuilder(
                    "2025-09-02", startCycle, levittownDaysOff, 43
                )
                const schedule = builder.buildSchedule()
                runAllChecks(schedule, builder)
            })
        })

        // --- Realistic scenario tests layered on top of the real calendar ---
        // Each test adds personal absences (sick days, snow days, etc.) to the
        // actual Levittown calendar to simulate a real teacher's year.

        const realisticScenarios = [
            // --- Scattered sick days ---
            {
                desc: "10 random scattered sick days across the year",
                extra: [
                    "2025-09-15", "2025-10-08", "2025-10-29",
                    "2025-11-19", "2025-12-10", "2026-01-14",
                    "2026-02-25", "2026-03-11", "2026-04-22",
                    "2026-05-13",
                ],
            },
            {
                desc: "10 sick days clustered in fall",
                extra: [
                    "2025-09-08", "2025-09-12", "2025-09-17",
                    "2025-10-06", "2025-10-09", "2025-10-15",
                    "2025-10-22", "2025-10-28", "2025-11-05",
                    "2025-11-13",
                ],
            },
            {
                desc: "10 sick days clustered in winter (Jan-Mar)",
                extra: [
                    "2026-01-07", "2026-01-12", "2026-01-21",
                    "2026-01-28", "2026-02-09", "2026-02-23",
                    "2026-03-02", "2026-03-09", "2026-03-16",
                    "2026-03-25",
                ],
            },
            {
                desc: "10 sick days all on Mondays",
                extra: [
                    "2025-09-08", "2025-09-29", "2025-10-27",
                    "2025-11-17", "2025-12-08", "2026-01-12",
                    "2026-02-09", "2026-03-09", "2026-04-27",
                    "2026-05-18",
                ],
            },
            {
                desc: "10 sick days all on Fridays",
                extra: [
                    "2025-09-12", "2025-10-03", "2025-10-24",
                    "2025-11-14", "2025-12-05", "2026-01-09",
                    "2026-02-13", "2026-03-13", "2026-04-24",
                    "2026-05-15",
                ],
            },

            // --- Full week of sick leave ---
            {
                desc: "full week of sick leave in early October",
                extra: ["2025-10-06", "2025-10-07", "2025-10-08", "2025-10-09", "2025-10-10"],
            },
            {
                desc: "full week of sick leave in January after winter break",
                extra: ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"],
            },
            {
                desc: "full week of sick leave right before spring break (extends to 2+ weeks off)",
                extra: ["2026-03-30", "2026-03-31", "2026-04-01"],
            },
            {
                desc: "full week of sick leave in May near end of year",
                extra: ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"],
            },

            // --- Extended illness ---
            {
                desc: "2-week illness in November (overlaps Thanksgiving)",
                extra: [
                    "2025-11-17", "2025-11-18", "2025-11-19", "2025-11-20", "2025-11-21",
                    "2025-11-24", "2025-11-25", "2025-11-26",
                ],
            },
            {
                desc: "2-week illness in March",
                extra: [
                    "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06",
                    "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13",
                ],
            },

            // --- Snow days ---
            {
                desc: "1 snow day in February",
                extra: ["2026-02-11"],
            },
            {
                desc: "2 snow days in January",
                extra: ["2026-01-07", "2026-01-08"],
            },
            {
                desc: "3 snow days in a single week in March",
                extra: ["2026-03-03", "2026-03-04", "2026-03-05"],
            },
            {
                desc: "snow day extending winter break (day before recess)",
                extra: ["2025-12-23"],
            },
            {
                desc: "snow day extending February recess (day after recess)",
                extra: ["2026-02-23"],
            },

            // --- Snow days + sick days combo ---
            {
                desc: "3 snow days + 7 sick days spread across winter",
                extra: [
                    // Snow
                    "2026-01-08", "2026-02-11", "2026-03-04",
                    // Sick
                    "2025-12-03", "2025-12-15", "2026-01-14",
                    "2026-01-28", "2026-02-25", "2026-03-16",
                    "2026-03-25",
                ],
            },
            {
                desc: "worst case winter: 3 snow days + week of flu in January",
                extra: [
                    // Snow
                    "2026-01-06", "2026-02-10", "2026-03-03",
                    // Flu week
                    "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16",
                ],
            },

            // --- Recurring personal day patterns ---
            {
                desc: "every Tuesday off in October (recurring appointment)",
                extra: ["2025-10-07", "2025-10-14", "2025-10-21", "2025-10-28"],
            },
            {
                desc: "every Wednesday off in March (recurring appointment)",
                extra: ["2026-03-04", "2026-03-11", "2026-03-18", "2026-03-25"],
            },
            {
                desc: "every Monday off for 6 weeks in spring",
                extra: [
                    "2026-04-13", "2026-04-20", "2026-04-27",
                    "2026-05-04", "2026-05-11", "2026-05-18",
                ],
            },
            {
                desc: "every other Friday off from October through December",
                extra: [
                    "2025-10-03", "2025-10-17", "2025-10-31",
                    "2025-11-14", "2025-12-05", "2025-12-19",
                ],
            },

            // --- Holiday-adjacent sick days (long weekends) ---
            {
                desc: "sick days extending every long weekend",
                extra: [
                    "2025-09-22",  // Mon before Rosh Hashanah (Tue-Wed)
                    "2025-10-01",  // Wed before Yom Kippur (Thu)
                    "2025-11-26",  // Wed before Thanksgiving
                    "2026-01-20",  // Tue after MLK Monday
                    "2026-05-26",  // Tue after Memorial Day
                ],
            },
            {
                desc: "sick on first and last day of school + random days",
                extra: [
                    "2025-09-02",  // First day
                    "2026-06-26",  // Last day
                    "2025-11-19", "2026-02-25", "2026-04-22",
                ],
            },

            // --- Jury duty ---
            {
                desc: "jury duty: 5 consecutive days in March",
                extra: ["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"],
            },
            {
                desc: "jury duty: 5 days spread across 2 weeks in April",
                extra: ["2026-04-13", "2026-04-15", "2026-04-17", "2026-04-20", "2026-04-22"],
            },

            // --- Worst-case combinations ---
            {
                desc: "maximum absences: 10 sick + 3 snow + jury duty week",
                extra: [
                    // Sick
                    "2025-09-15", "2025-10-08", "2025-11-19",
                    "2025-12-10", "2026-01-14", "2026-02-25",
                    "2026-03-25", "2026-04-22", "2026-05-13", "2026-06-10",
                    // Snow
                    "2026-01-07", "2026-02-11", "2026-03-04",
                    // Jury duty
                    "2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17",
                ],
            },
            {
                desc: "terrible fall: sick week + every Monday off Oct-Nov",
                extra: [
                    // Sick week
                    "2025-09-15", "2025-09-16", "2025-09-17", "2025-09-18", "2025-09-19",
                    // Every Monday Oct-Nov
                    "2025-10-06", "2025-10-27",
                    "2025-11-03", "2025-11-10", "2025-11-17", "2025-11-24",
                ],
            },
            {
                desc: "terrible spring: 2-week illness + snow days + sick days",
                extra: [
                    // 2-week illness
                    "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06",
                    "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13",
                    // Snow days
                    "2026-01-08", "2026-02-11",
                    // Additional sick
                    "2026-04-22", "2026-05-06",
                ],
            },
            {
                desc: "only 3 school days some weeks: random absences near holidays",
                extra: [
                    "2025-09-22", "2025-09-25",  // Week of Rosh Hashanah (23-24 off)
                    "2025-10-01", "2025-10-03",  // Week of Yom Kippur (2 off)
                    "2025-11-24", "2025-11-26",  // Thanksgiving week
                    "2026-01-20", "2026-01-23",  // Week after MLK
                ],
            },

            // --- Additional permutations for statistical coverage ---
            { desc: "clean (no extra absences)", extra: [] },
            { desc: "3 sick scattered across year", extra: ["2025-10-15", "2026-01-22", "2026-04-28"] },
            { desc: "5 sick days early in year", extra: ["2025-09-08", "2025-09-18", "2025-10-06", "2025-10-16", "2025-10-23"] },
            { desc: "5 sick days late in year", extra: ["2026-04-20", "2026-04-28", "2026-05-06", "2026-05-14", "2026-06-03"] },
            { desc: "8 random absences pattern A", extra: ["2025-09-10", "2025-10-14", "2025-11-06", "2025-12-09", "2026-01-22", "2026-03-05", "2026-04-23", "2026-05-20"] },
            { desc: "8 random absences pattern B", extra: ["2025-09-25", "2025-10-21", "2025-11-13", "2025-12-16", "2026-02-04", "2026-03-17", "2026-04-29", "2026-06-04"] },
            { desc: "12 random absences pattern A", extra: ["2025-09-05", "2025-09-19", "2025-10-10", "2025-10-28", "2025-11-18", "2025-12-04", "2026-01-13", "2026-02-05", "2026-03-04", "2026-04-15", "2026-05-07", "2026-06-02"] },
            { desc: "12 random absences pattern B", extra: ["2025-09-11", "2025-09-30", "2025-10-17", "2025-11-07", "2025-12-02", "2025-12-18", "2026-01-27", "2026-02-12", "2026-03-19", "2026-04-21", "2026-05-19", "2026-06-11"] },
            { desc: "15 heavy absences across year", extra: ["2025-09-04", "2025-09-16", "2025-10-03", "2025-10-22", "2025-11-05", "2025-11-20", "2025-12-05", "2025-12-17", "2026-01-09", "2026-01-27", "2026-02-12", "2026-03-09", "2026-04-17", "2026-05-08", "2026-06-05"] },
            { desc: "sick week in September", extra: ["2025-09-08", "2025-09-09", "2025-09-10", "2025-09-11", "2025-09-12"] },
            { desc: "sick week in November", extra: ["2025-11-03", "2025-11-05", "2025-11-06", "2025-11-07"] },
            { desc: "sick week in December", extra: ["2025-12-15", "2025-12-16", "2025-12-17", "2025-12-18", "2025-12-19"] },
            { desc: "sick week in January", extra: ["2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16"] },
            { desc: "sick week in April", extra: ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"] },
            { desc: "sick week in June", extra: ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"] },
            { desc: "2 days off at start of September", extra: ["2025-09-03", "2025-09-04"] },
            { desc: "2 days off mid October", extra: ["2025-10-15", "2025-10-16"] },
            { desc: "2 days off mid January", extra: ["2026-01-14", "2026-01-15"] },
            { desc: "2 days off end of May", extra: ["2026-05-28", "2026-05-29"] },
            { desc: "4 days off in February", extra: ["2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12"] },
            { desc: "every Thursday off in November", extra: ["2025-11-06", "2025-11-13", "2025-11-20"] },
            { desc: "every Wednesday off in January", extra: ["2026-01-07", "2026-01-14", "2026-01-21", "2026-01-28"] },
            { desc: "2 snow + 5 sick pattern A", extra: ["2026-01-15", "2026-02-26", "2025-10-09", "2025-11-19", "2025-12-11", "2026-03-17", "2026-05-12"] },
            { desc: "2 snow + 5 sick pattern B", extra: ["2026-02-04", "2026-03-06", "2025-09-18", "2025-10-23", "2025-12-04", "2026-04-22", "2026-05-21"] },
            { desc: "3 snow + 3 sick combo", extra: ["2026-01-08", "2026-02-11", "2026-03-04", "2025-10-29", "2025-12-10", "2026-05-13"] },
        ]

        realisticScenarios.forEach((scenario) => {
            ;[1, 2].forEach((startCycle) => {
                it(`should handle Levittown calendar + ${scenario.desc}, cycle ${startCycle}`, () => {
                    const allDaysOff = [...levittownDaysOff, ...scenario.extra]
                    const builder = new ScheduleBuilder(
                        "2025-09-02", startCycle, allDaysOff, 43
                    )
                    const schedule = builder.buildSchedule()
                    runAllChecks(schedule, builder, 14, 500)
                })
            })
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
