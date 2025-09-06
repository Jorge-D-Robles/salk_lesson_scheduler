// --- Core Scheduling Logic ---

/**
 * Represents a single day in the schedule.
 */
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

/**
 * Builds the schedule using a final, optimized backtracking algorithm guided by a powerful heuristic.
 */
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
                groupsFromHistory.size === 22
                    ? [...groupsFromHistory]
                    : Array.from({ length: 22 }, (_, i) =>
                          String.fromCharCode("A".charCodeAt(0) + i)
                      )
        } else {
            this.LESSON_GROUPS = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            )
        }

        this.periodAssignments = {}
        this.LESSON_GROUPS.forEach((g) => (this.periodAssignments[g] = {}))
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
            if (this.periodAssignments[lesson.group]) {
                const parts = lesson.date.split("-").map((p) => parseInt(p, 10))
                const historyDate = new Date(parts[0], parts[1] - 1, parts[2])
                const periodNum = parseInt(
                    String(lesson.period).replace("Pd ", ""),
                    10
                )
                const existingDate =
                    this.periodAssignments[lesson.group][periodNum]
                if (!existingDate || historyDate > existingDate) {
                    this.periodAssignments[lesson.group][periodNum] =
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

    isValid(group, slot, schedule) {
        const { date, period } = slot
        const periodStr = `Pd ${period}`

        // 1. Weekly Constraint
        const getWeekIdentifier = (d) => {
            const newD = new Date(d)
            newD.setHours(0, 0, 0, 0)
            const day = newD.getDay()
            const diff = newD.getDate() - day + (day === 0 ? -6 : 1)
            return new Date(newD.setDate(diff)).toDateString()
        }
        const weekId = getWeekIdentifier(date)
        for (const entry of schedule) {
            if (getWeekIdentifier(entry.date) === weekId) {
                if (entry.lessons.some((l) => l.group === group)) return false
            }
        }

        // 2. 21-Day Constraint
        let mostRecentDate = this.periodAssignments[group]?.[period] || null
        for (const entry of schedule) {
            for (const lesson of entry.lessons) {
                if (lesson.group === group && lesson.period === periodStr) {
                    if (!mostRecentDate || entry.date > mostRecentDate) {
                        mostRecentDate = entry.date
                    }
                }
            }
        }
        if (mostRecentDate) {
            const daysSince = (date - mostRecentDate) / (1000 * 60 * 60 * 24)
            if (daysSince < 21) return false
        }

        // 3. MU Clustering Constraint
        const todaysLessons =
            schedule.find((d) => d.date.toDateString() === date.toDateString())
                ?.lessons || []
        if (group === "MU" && todaysLessons.some((l) => l.group === "MU"))
            return false

        return true
    }

    solve(slots, index, schedule) {
        if (index >= slots.length) {
            return schedule // Success
        }

        const slot = slots[index]
        const { date, dayCycle } = slot

        // Find or create the current day's entry in the schedule
        let dayEntry = schedule.find(
            (d) => d.date.toDateString() === date.toDateString()
        )
        if (!dayEntry) {
            const displayCycle = dayCycle % 2 === 0 ? 2 : 1
            dayEntry = new ScheduleEntry(date, displayCycle)
            schedule.push(dayEntry)
            schedule.sort((a, b) => a.date - b.date)
        }

        const candidates = [...this.LESSON_GROUPS, "MU"]

        // --- HEURISTIC: Sort candidates to try the most promising ones first ---
        candidates.sort((a, b) => {
            if (a === "MU") return 1 // Try MU last
            if (b === "MU") return -1

            let lastDateA = this.periodAssignments[a]?.[slot.period] || null
            let lastDateB = this.periodAssignments[b]?.[slot.period] || null

            // This loop is a bit slow but necessary for correctness in backtracking
            for (const entry of schedule) {
                for (const lesson of entry.lessons) {
                    if (
                        lesson.group === a &&
                        lesson.period === `Pd ${slot.period}`
                    )
                        lastDateA = entry.date
                    if (
                        lesson.group === b &&
                        lesson.period === `Pd ${slot.period}`
                    )
                        lastDateB = entry.date
                }
            }
            lastDateA = lastDateA || new Date(0)
            lastDateB = lastDateB || new Date(0)

            return lastDateB - lastDateA // Sort descending by date (most recent is smaller)
        })

        for (const group of candidates) {
            if (this.isValid(group, slot, schedule)) {
                dayEntry.addLesson(slot.period, group)

                const result = this.solve(slots, index + 1, schedule)
                if (result) return result // Propagate success

                dayEntry.lessons.pop() // Backtrack
            }
        }

        // If no candidate worked, backtrack by removing the day entry if it was just added
        if (dayEntry.lessons.length === 0) {
            schedule.pop()
        }

        return null // Trigger backtracking
    }

    buildSchedule() {
        const slots = this.generateAllSlots()
        return this.solve(slots, 0, []) || []
    }
}
