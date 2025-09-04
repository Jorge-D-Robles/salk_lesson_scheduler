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

describe("ScheduleBuilder", () => {
    describe("Default Schedule (No History)", () => {
        const dateTestCases = [
            {
                description: "when starting on a Monday with multiple days off",
                startDate: "2025-09-01",
                daysOff: ["2025-09-02", "2025-09-10", "2025-09-15"],
            },
            {
                description: "when starting on a Wednesday with no days off",
                startDate: "2025-09-03",
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

    describe("Schedule with History", () => {
        // By using beforeEach, we guarantee that `this.customHistory` is a fresh,
        // valid object before every single test in this suite runs.
        beforeEach(function () {
            this.customHistory = {
                groups: [
                    "Flutes",
                    "Clarinets",
                    "Oboes",
                    "Bassoons", // Day 1 (4)
                    "Saxes",
                    "Trumpets",
                    "Horns",
                    "Trombones",
                    "Euphoniums", // Day 2 (5)
                    "Tubas",
                    "Violins1",
                    "Violins2",
                    "Violas",
                    "Cellos", // Day 3 (5)
                    "Basses",
                    "Percussion1",
                    "Percussion2",
                    "Piano",
                    "Guitars", // Day 4 (5)
                    "Ukuleles",
                    "Recorders",
                    "Vocals", // Day 5 (3) -> Total 22
                ],
                startDate: "2025-09-01", // A Monday
                startCycle: 1,
            }
        })

        it("should correctly pre-populate its state from the provided history", function () {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-08",
                1,
                [],
                1,
                this.customHistory
            )

            const assignments = scheduleBuilder.periodAssignments
            const historyDate_Day1 = new Date("2025-09-01T00:00:00")
            const historyDate_Day2 = new Date("2025-09-02T00:00:00")
            const historyDate_Day3 = new Date("2025-09-03T00:00:00")

            // Day 1 (cycle 1 -> periods 1, 4, 7, 8)
            expect(assignments["Flutes"][1].getTime()).toEqual(
                historyDate_Day1.getTime()
            )
            expect(assignments["Bassoons"][8].getTime()).toEqual(
                historyDate_Day1.getTime()
            )

            // Day 2 (cycle 2 -> periods 1, 2, 3, 7, 8)
            expect(assignments["Saxes"][1].getTime()).toEqual(
                historyDate_Day2.getTime()
            )
            expect(assignments["Euphoniums"][8].getTime()).toEqual(
                historyDate_Day2.getTime()
            )

            // Day 3 (cycle 3 -> periods 1, 4, 7, 8)
            expect(assignments["Tubas"][1].getTime()).toEqual(
                historyDate_Day3.getTime()
            )
        })

        it("should generate a valid new schedule that respects the historical constraints", function () {
            const newScheduleStartDate = "2025-09-08" // The week after the history ends
            const scheduleBuilder = new ScheduleBuilder(
                newScheduleStartDate,
                1,
                [],
                16,
                this.customHistory
            )
            const newSchedule = scheduleBuilder.buildSchedule()

            // This ensures the new schedule is checked against the pre-populated history.
            assertNo28DayConflicts(
                newSchedule,
                scheduleBuilder.periodAssignments
            )
        })

        it("should fall back to default groups if history groups are not 22 names", function () {
            const invalidHistory = {
                groups: ["Group1", "Group2"], // Invalid length
                startDate: "2025-09-01",
                startCycle: 1,
            }
            const defaultGroups = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            )
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-08",
                1,
                [],
                1,
                invalidHistory
            )

            // It should ignore the invalid history and use the default A-V groups.
            expect(scheduleBuilder.LESSON_GROUPS).toEqual(defaultGroups)
            // Its internal assignments should be empty, as the history was ignored.
            expect(scheduleBuilder.periodAssignments["Group1"]).toBeUndefined()
        })

        it("should correctly identify all groups from the history", function () {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-08",
                1,
                [],
                1,
                this.customHistory
            )
            expect(scheduleBuilder.LESSON_GROUPS.sort()).toEqual(
                this.customHistory.groups.sort()
            )
        })
    })
})
