/**
 * Helper function to assert that no group is scheduled for the same period
 * within a 28-day window.
 * @param {Array<ScheduleEntry>} schedule The generated schedule to test.
 */
const assertNo28DayConflicts = (schedule) => {
    const oneDayInMilliseconds = 1000 * 60 * 60 * 24
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
                    `Conflict for ${group} in ${period}`
                )
            }
            lastSeen[group][period] = dayEntry.date
        })
    })
}

describe("ScheduleBuilder", () => {
    describe("when using the default schedule", () => {
        it("should not have 28-day conflicts", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-01",
                1,
                [],
                16,
                null
            )
            const schedule = scheduleBuilder.buildSchedule()
            assertNo28DayConflicts(schedule)
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
    })

    describe("when using schedule history", () => {
        const historyGroups = [
            "A",
            "B",
            "C",
            "D",
            "E",
            "F",
            "G",
            "H",
            "I",
            "J",
            "K",
            "L",
            "M",
            "N",
            "O",
            "P",
            "Q",
            "R",
            "S",
            "T",
            "U",
            "V",
        ]

        const scheduleHistory = {
            groups: historyGroups,
            startDate: "2025-09-01", // A Monday
            startCycle: 1,
        }

        it("should correctly pre-populate its state from the history", () => {
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-08",
                1,
                [],
                1,
                scheduleHistory
            )

            // Test a few key assignments from the history
            const historyDate1 = new Date("2025-09-01T00:00:00") // Mon, Day 1
            const historyDate2 = new Date("2025-09-02T00:00:00") // Tue, Day 2

            // Day 1 Periods are 1, 4, 7, 8. Groups A, B, C, D
            expect(scheduleBuilder.periodAssignments["A"][1].getTime()).toEqual(
                historyDate1.getTime()
            )
            expect(scheduleBuilder.periodAssignments["D"][8].getTime()).toEqual(
                historyDate1.getTime()
            )

            // Day 2 Periods are 1, 2, 3, 7, 8. Groups E, F, G, H, I
            expect(scheduleBuilder.periodAssignments["E"][1].getTime()).toEqual(
                historyDate2.getTime()
            )
            expect(scheduleBuilder.periodAssignments["I"][8].getTime()).toEqual(
                historyDate2.getTime()
            )
        })

        it("should generate a valid new schedule respecting the history", () => {
            // Generate a new schedule starting the week after the history ends
            const scheduleBuilder = new ScheduleBuilder(
                "2025-09-08",
                1,
                [],
                16,
                scheduleHistory
            )

            const newSchedule = scheduleBuilder.buildSchedule()

            // Find the first time Group 'A' is scheduled for Period 1 in the new schedule
            let firstNewASlot = null
            for (const entry of newSchedule) {
                for (const lesson of entry.lessons) {
                    if (lesson.group === "A" && lesson.period === "Pd 1") {
                        firstNewASlot = entry.date
                        break
                    }
                }
                if (firstNewASlot) break
            }

            // The new lesson must be at least 28 days after its historical lesson
            const historyDate = new Date("2025-09-01T00:00:00")
            const diffInDays =
                (firstNewASlot - historyDate) / (1000 * 60 * 60 * 24)
            expect(diffInDays).toBeGreaterThanOrEqual(28)

            // Also ensure the entire generated schedule has no internal conflicts
            assertNo28DayConflicts(newSchedule)
        })
    })
})
