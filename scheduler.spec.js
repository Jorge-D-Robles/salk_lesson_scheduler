/**
 * Helper function to assert that no group is scheduled for the same period
 * within a 28-day window. It checks all lessons within the provided schedule array.
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 * @param {Object} [initialAssignments={}] An optional pre-filled assignment history to check against.
 */
const assertNo28DayConflicts = (schedule, initialAssignments = {}) => {
    const oneDayInMilliseconds = 1000 * 60 * 60 * 24
    // Deep copy the initial assignments to avoid modifying the original object during the test.
    const lastSeen = JSON.parse(JSON.stringify(initialAssignments))

    // Convert date strings in lastSeen back to Date objects for accurate comparison.
    for (const group in lastSeen) {
        for (const period in lastSeen[group]) {
            lastSeen[group][period] = new Date(lastSeen[group][period])
        }
    }

    schedule.forEach((dayEntry) => {
        dayEntry.lessons.forEach((lesson) => {
            const { group, period } = lesson

            if (group.startsWith("MU")) {
                return
            }

            if (!lastSeen[group]) {
                lastSeen[group] = {}
            }

            const lastTimeInPeriod = lastSeen[group][period]

            if (lastTimeInPeriod) {
                const differenceInMs = dayEntry.date - lastTimeInPeriod
                const differenceInDays = Math.floor(
                    differenceInMs / oneDayInMilliseconds
                )

                expect(differenceInDays).toBeGreaterThanOrEqual(
                    28,
                    `Conflict: Group ${group} was scheduled for ${period} on ${dayEntry.date.toDateString()}, only ${differenceInDays} days after its last session on ${lastTimeInPeriod.toDateString()}.`
                )
            }
            // Update the last seen date for this group/period combination.
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
    let currentWeekIdentifier = null // Use the date of the week's Monday as a unique ID

    schedule.forEach((dayEntry) => {
        const currentDate = dayEntry.date

        // Robustly determine the Monday of the current week to identify it.
        const dayOfWeek = currentDate.getDay() // 0=Sun, 1=Mon...
        const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const mondayOfThisWeek = new Date(currentDate)
        mondayOfThisWeek.setDate(currentDate.getDate() - offset)
        const mondayDateString = mondayOfThisWeek.toDateString()

        // If the current day is in a new week, reset the weekly group tracker.
        if (mondayDateString !== currentWeekIdentifier) {
            weeklyGroups.clear()
            currentWeekIdentifier = mondayDateString
        }

        dayEntry.lessons.forEach((lesson) => {
            const { group } = lesson
            // "MU" (Make-Up) groups are ignored as they aren't real assignments.
            if (group === "MU") {
                return
            }

            // Assert that the group has not been seen before in the current week.
            expect(weeklyGroups.has(group)).toBe(
                false,
                `Weekly Conflict: Group '${group}' was scheduled twice in the week of ${currentWeekIdentifier}. A second time on ${currentDate.toDateString()}.`
            )

            // Add the group to the set for the current week.
            weeklyGroups.add(group)
        })
    })
}

describe("ScheduleBuilder", () => {
    describe("Default Schedule (No History) - Thorough Permutations", () => {
        const thoroughDateTestCases = [
            // Basic Cases
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
            // Complex Day Off Cases
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
                        16, // weeks
                        null // No history
                    )
                    const schedule = scheduleBuilder.buildSchedule()
                    assertNo28DayConflicts(schedule)
                    assertNoWeeklyConflicts(schedule)
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
        // --- Basic History Integrity Tests ---
        it("should identify and de-duplicate unique groups from history data", () => {
            const historyData = [
                { date: "2025-08-01", period: 1, group: "Flutes" },
                { date: "2025-08-01", period: 4, group: "Oboes" },
                { date: "2025-08-02", period: 2, group: "Flutes" },
            ]
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                historyData
            )
            expect(scheduleBuilder.LESSON_GROUPS.length).toBe(2)
            expect(scheduleBuilder.LESSON_GROUPS.sort()).toEqual([
                "Flutes",
                "Oboes",
            ])
        })

        it("should correctly populate its state with the MOST RECENT lesson from history", () => {
            const historyData = [
                { date: "2025-08-11", period: 1, group: "Flutes" },
                { date: "2025-08-12", period: 2, group: "Clarinets" },
                { date: "2025-08-25", period: 1, group: "Flutes" },
            ]
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                historyData
            )
            const assignments = scheduleBuilder.periodAssignments
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

        // --- Exhaustive History Conflict Permutations ---
        describe("when checking for conflicts with exhaustive permutations", () => {
            const richConflictHistory = [
                { date: "2025-09-08", period: 1, group: "Flutes" },
                { date: "2025-09-08", period: 4, group: "Oboes" },
                { date: "2025-09-09", period: 1, group: "Clarinets" },
                { date: "2025-09-09", period: 2, group: "Bassoons" },
                { date: "2025-09-10", period: 7, group: "Saxes" },
                { date: "2025-09-11", period: 8, group: "Trumpets" },
                { date: "2025-09-12", period: 3, group: "Horns" },
            ]
            const decemberHistory = [
                { date: "2025-12-01", period: 1, group: "Flutes" },
                { date: "2025-12-02", period: 2, group: "Clarinets" },
                { date: "2025-12-05", period: 3, group: "Oboes" },
            ]
            const leapYearHistory = [
                { date: "2028-02-22", period: 1, group: "Flutes" },
                { date: "2028-02-24", period: 2, group: "Clarinets" },
            ]

            const exhaustiveHistoryCases = [
                {
                    description: "when starting on a Monday with days off",
                    newScheduleStart: "2025-09-29",
                    daysOff: ["2025-09-30", "2025-10-08"],
                    history: richConflictHistory,
                },
                {
                    description:
                        "when starting on a Friday before a Mon/Tue off",
                    newScheduleStart: "2025-09-26",
                    daysOff: ["2025-09-29", "2025-09-30"],
                    history: richConflictHistory,
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
                    history: richConflictHistory,
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
                    history: decemberHistory,
                },
                {
                    description:
                        "when starting after a 'swiss cheese' week of days off",
                    newScheduleStart: "2025-09-22",
                    daysOff: ["2025-09-22", "2025-09-24", "2025-09-26"],
                    history: richConflictHistory,
                },
                {
                    description:
                        "when the schedule crosses a leap day boundary with history",
                    newScheduleStart: "2028-03-13", // Monday, 18 days after the last history entry
                    daysOff: [],
                    history: leapYearHistory,
                },
            ]

            exhaustiveHistoryCases.forEach((testCase) => {
                ;[1, 2].forEach((startCycle) => {
                    it(`should have no conflicts ${testCase.description}, on Day ${startCycle}`, () => {
                        const scheduleBuilder = new ScheduleBuilder(
                            testCase.newScheduleStart,
                            startCycle,
                            testCase.daysOff,
                            8, // weeks
                            testCase.history
                        )
                        const schedule = scheduleBuilder.buildSchedule()
                        assertNo28DayConflicts(
                            schedule,
                            scheduleBuilder.periodAssignments
                        )
                        assertNoWeeklyConflicts(schedule)
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
            assertNo28DayConflicts(schedule)
            assertNoWeeklyConflicts(schedule)
        })
    })
})
