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
    // Initialize weekStartDate to the first day of the schedule to handle schedules that don't start on a Monday.
    let weekStartDate = new Date(schedule[0].date)

    schedule.forEach((dayEntry) => {
        const currentDate = dayEntry.date
        // If it's a Monday, this is the start of a new week.
        if (currentDate.getDay() === 1) {
            weeklyGroups.clear()
            weekStartDate = new Date(currentDate)
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
                `Weekly Conflict: Group '${group}' was scheduled twice in the week of ${weekStartDate.toDateString()}. A second time on ${currentDate.toDateString()}.`
            )

            // Add the group to the set for the current week.
            weeklyGroups.add(group)
        })
    })
}

describe("ScheduleBuilder", () => {
    describe("Default Schedule (No History)", () => {
        const dateTestCases = [
            {
                description: "when starting on a Monday with multiple days off",
                startDate: "2025-09-01",
                daysOff: ["2025-09-02", "2025-09-10", "2025-09-15"],
            },
            {
                description: "when starting on a Tuesday with no days off",
                startDate: "2025-09-02",
                daysOff: [],
            },
            {
                description: "when starting on a Wednesday with no days off",
                startDate: "2025-09-03",
                daysOff: [],
            },
            {
                description: "when starting on a Thursday with no days off",
                startDate: "2025-09-04",
                daysOff: [],
            },
            {
                description: "when starting on a Friday with no days off",
                startDate: "2025-09-05",
                daysOff: [],
            },
        ]

        dateTestCases.forEach((dateCase) => {
            ;[1, 2].forEach((startCycle) => {
                it(`should have no 28-day conflicts ${dateCase.description}, starting on Day ${startCycle}`, () => {
                    const scheduleBuilder = new ScheduleBuilder(
                        dateCase.startDate,
                        startCycle,
                        dateCase.daysOff,
                        16, // weeks
                        null // No history
                    )
                    const schedule = scheduleBuilder.buildSchedule()
                    assertNo28DayConflicts(schedule)
                })
            })
        })

        it("should not schedule any lessons on weekends", () => {
            const scheduleBuilder = new ScheduleBuilder("2025-09-01", 1, [], 4)
            const schedule = scheduleBuilder.buildSchedule()
            schedule.forEach((dayEntry) => {
                const dayOfWeek = dayEntry.date.getDay()
                expect(dayOfWeek).not.toBe(
                    0,
                    `A lesson was scheduled on a Sunday: ${dayEntry.date.toDateString()}`
                )
                expect(dayOfWeek).not.toBe(
                    6,
                    `A lesson was scheduled on a Saturday: ${dayEntry.date.toDateString()}`
                )
            })
        })

        it("should not schedule any lessons on specified days off", () => {
            const dayOff = "2025-09-03"
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [dayOff],
                2
            )
            const schedule = scheduleBuilder.buildSchedule()
            const dayOffDateString = new Date(
                dayOff + "T00:00:00"
            ).toDateString()
            schedule.forEach((dayEntry) => {
                expect(dayEntry.date.toDateString()).not.toBe(
                    dayOffDateString,
                    `A lesson was scheduled on a specified day off: ${dayOffDateString}`
                )
            })
        })
    })

    // --- NEW: Boundary and Input Validation Tests ---
    describe("Boundary and Input Validation", () => {
        it("should correctly start on the next Monday if the start date is a weekend", () => {
            // Saturday, September 6, 2025
            const scheduleBuilder = new ScheduleBuilder("2025-09-06", 1, [], 1)
            const schedule = scheduleBuilder.buildSchedule()
            // Expect the first scheduled day to be Monday, September 8, 2025
            expect(schedule[0].date.getDay()).toBe(1) // 1 = Monday
            expect(schedule[0].date.getDate()).toBe(8)
        })

        it("should maintain correctness when scheduling across a leap day", () => {
            // 2028 is a leap year. This schedule will run over Feb 29, 2028.
            const scheduleBuilder = new ScheduleBuilder("2028-02-14", 1, [], 4)
            const schedule = scheduleBuilder.buildSchedule()
            // If the date logic is correct, the core conflict rules should still hold true.
            assertNo28DayConflicts(schedule)
            assertNoWeeklyConflicts(schedule)
            // Expect more than 20 days in the schedule
            expect(schedule.length).toBeGreaterThanOrEqual(19)
        })
    })

    // --- REWRITTEN: Schedule with History Tests ---
    describe("Schedule with History", () => {
        it("should identify and de-duplicate unique groups from history data", () => {
            const historyData = [
                { date: "2025-08-01", period: 1, group: "Flutes" },
                { date: "2025-08-01", period: 4, group: "Oboes" },
                { date: "2025-08-02", period: 2, group: "Flutes" }, // Duplicate group name
            ]
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                historyData
            )
            // Should find 2 unique groups, not 3.
            expect(scheduleBuilder.LESSON_GROUPS.length).toBe(2)
            // Should contain the correct unique group names.
            expect(scheduleBuilder.LESSON_GROUPS.sort()).toEqual([
                "Flutes",
                "Oboes",
            ])
        })

        it("should correctly populate its state with the MOST RECENT lesson from history", () => {
            const historyData = [
                { date: "2025-08-11", period: 1, group: "Flutes" }, // Older lesson
                { date: "2025-08-12", period: 2, group: "Clarinets" },
                { date: "2025-08-25", period: 1, group: "Flutes" }, // Most recent lesson for Flutes/Pd1
            ]
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                historyData
            )
            const assignments = scheduleBuilder.periodAssignments
            const expectedDate = new Date(2025, 7, 25) // August 25, 2025
            expect(assignments["Flutes"][1].getTime()).toEqual(
                expectedDate.getTime()
            )
        })

        it("should fall back to default groups if history is null or empty", () => {
            const defaultGroups = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            )

            // Test with null history
            const builder1 = new ScheduleBuilder("2025-09-01", 1, [], 1, null)
            expect(builder1.LESSON_GROUPS).toEqual(defaultGroups)

            // Test with empty array history
            const builder2 = new ScheduleBuilder("2025-09-01", 1, [], 1, [])
            expect(builder2.LESSON_GROUPS).toEqual(defaultGroups)
        })

        it("should uphold all rules across the history/new schedule boundary", () => {
            const historyData = [
                // Schedule this lesson 15 days before the new schedule starts.
                // This creates a potential 28-day conflict.
                { date: "2025-08-18", period: 1, group: "Flutes" },
                { date: "2025-08-18", period: 4, group: "Clarinets" },
                { date: "2025-08-18", period: 7, group: "Oboes" },
                { date: "2025-08-18", period: 8, group: "Bassoons" },
            ]
            // New schedule starts Sept 2, which is 15 days after Aug 18.
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-02",
                2, // Day 2 Cycle uses Period 1
                [],
                8,
                historyData
            )

            const schedule = scheduleBuilder.buildSchedule()

            // The first lesson of the new schedule is on Tuesday, Sept 2 for Period 1.
            // Because Flutes/Pd1 was only 15 days ago, it should NOT be "Flutes".
            expect(schedule[0].lessons[0].group).not.toBe("Flutes")

            // The main assertion: The entire generated schedule should have no conflicts
            // when checked against the initial state provided by the history.
            assertNo28DayConflicts(schedule, scheduleBuilder.periodAssignments)
            assertNoWeeklyConflicts(schedule)
        })
    })

    describe("Weekly Scheduling Rules", () => {
        it("should not schedule a group more than once in a week with no days off", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01", // Monday
                1,
                [],
                16
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNoWeeklyConflicts(schedule)
        })

        it("should not schedule a group more than once in a week with one day off (Wednesday)", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01", // Monday
                1,
                ["2025-09-03"], // Wednesday Off
                16
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNoWeeklyConflicts(schedule)
        })

        it("should not schedule a group more than once in a week with two days off (Tue/Thu)", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01", // Monday
                1,
                ["2025-09-02", "2025-09-04"], // Tuesday & Thursday Off
                16
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNoWeeklyConflicts(schedule)
        })

        it("should not schedule a group more than once in a week with three days off (Mon/Wed/Fri)", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01", // Monday
                1,
                ["2025-09-01", "2025-09-03", "2025-09-05"], // Mon, Wed, Fri Off
                16
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNoWeeklyConflicts(schedule)
        })
    })

    // --- NEW: Complex "Days Off" Scenarios ---
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

            // Verify no lessons were scheduled during the week off.
            weekOff.forEach((day) => {
                const dateString = new Date(day + "T00:00:00").toDateString()
                expect(scheduledDates.includes(dateString)).toBe(false)
            })

            // Verify the core rules are still met for the entire schedule.
            assertNo28DayConflicts(schedule)
            assertNoWeeklyConflicts(schedule)
        })

        it("should handle consecutive days off at the start of a week", () => {
            const daysOff = ["2025-09-01", "2025-09-02", "2025-09-03"] // Mon, Tue, Wed
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                daysOff,
                8
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNo28DayConflicts(schedule)
            assertNoWeeklyConflicts(schedule)
        })

        it("should handle a week with only one available day", () => {
            const daysOff = [
                "2025-09-01",
                "2025-09-02",
                "2025-09-03",
                "2025-09-04",
            ] // Mon-Thu
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                daysOff,
                8
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNo28DayConflicts(schedule)
            assertNoWeeklyConflicts(schedule)
        })
    })
})
