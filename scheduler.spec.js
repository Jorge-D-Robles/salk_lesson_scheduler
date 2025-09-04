/**
 * Helper function to assert that no group is scheduled for the same period
 * within a 28-day window.
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 */
const assertNo28DayConflicts = (schedule) => {
    const oneDayInMilliseconds = 1000 * 60 * 60 * 24
    // This object will track the last date a group was assigned to a specific period.
    const lastSeen = {}

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
                const differenceInDays = Math.round(
                    differenceInMs / oneDayInMilliseconds
                )

                expect(differenceInDays).toBeGreaterThanOrEqual(
                    28,
                    `Group ${group} was scheduled for ${period} again after only ${differenceInDays} days on ${dayEntry.date.toDateString()}`
                )
            }
            lastSeen[group][period] = dayEntry.date
        })
    })
}

describe("ScheduleBuilder", () => {
    describe("when using the default schedule (Groups A-V)", () => {
        const dateTestCases = [
            {
                description: "when starting on Monday with days off",
                startDate: "2025-09-01",
                daysOff: ["2025-09-02", "2025-09-03", "2025-09-15"],
            },
            {
                description: "when starting on Wednesday with no days off",
                startDate: "2025-09-03",
                daysOff: [],
            },
        ]

        dateTestCases.forEach((dateCase) => {
            ;[1, 2].forEach((startCycle) => {
                it(`should not have 28-day conflicts ${dateCase.description}, starting on Day ${startCycle}`, () => {
                    const scheduleBuilder = new ScheduleBuilder(
                        dateCase.startDate,
                        startCycle,
                        dateCase.daysOff,
                        16, // weeks
                        null // Explicitly use default groups
                    )
                    const schedule = scheduleBuilder.buildSchedule()
                    assertNo28DayConflicts(schedule)
                })
            })
        })

        it("should not schedule any lessons on weekends", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                4,
                null
            )
            const schedule = scheduleBuilder.buildSchedule()
            schedule.forEach((dayEntry) => {
                const dayOfWeek = dayEntry.date.getDay()
                expect(dayOfWeek).not.toBe(0)
                expect(dayOfWeek).not.toBe(6)
            })
        })

        it("should not schedule any lessons on specified days off", () => {
            const dayOff = "2025-09-03"
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [dayOff],
                2,
                null
            )
            const schedule = scheduleBuilder.buildSchedule()
            const dayOffDateString = new Date(
                dayOff + "T00:00:00"
            ).toDateString()
            schedule.forEach((dayEntry) => {
                expect(dayEntry.date.toDateString()).not.toBe(dayOffDateString)
            })
        })
    })

    describe("when using a custom schedule", () => {
        // Create a valid list of 22 custom group names for testing
        const customGroups = [
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
            "Violins 1",
            "Violins 2",
            "Violas",
            "Cellos",
            "Basses",
            "Percussion 1",
            "Percussion 2",
            "Piano",
            "Guitars",
            "Ukuleles",
            "Recorders",
            "Vocals",
        ]

        it("should correctly initialize with 22 custom group names", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                customGroups
            )
            expect(scheduleBuilder.LESSON_GROUPS).toEqual(customGroups)
        })

        it("should fall back to default groups if custom group list is not 22 names", () => {
            const invalidCustomGroups = ["Group1", "Group2"] // Not 22
            const defaultGroups = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            )

            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                1,
                invalidCustomGroups
            )
            expect(scheduleBuilder.LESSON_GROUPS).toEqual(defaultGroups)
        })

        it("should not have 28-day conflicts when using custom group names", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01", // Start Date
                1, // Start Cycle
                [], // Days Off
                16, // Weeks
                customGroups // Pass the custom groups
            )
            const schedule = scheduleBuilder.buildSchedule()

            // All scheduled groups should be from our custom list
            const allScheduledGroups = new Set()
            schedule.forEach((day) =>
                day.lessons.forEach((lesson) => {
                    if (lesson.group !== "MU") {
                        allScheduledGroups.add(lesson.group)
                    }
                })
            )

            // Verify that the groups in the schedule are the ones we provided
            expect(Array.from(allScheduledGroups).sort()).toEqual(
                customGroups.sort()
            )

            // Run the same rigorous conflict check
            assertNo28DayConflicts(schedule)
        })
    })
})
