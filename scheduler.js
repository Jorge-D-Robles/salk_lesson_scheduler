// --- Core Scheduling Logic ---

/**
 * Represents a single day in the schedule. It holds the date, the day cycle number,
 * and a list of lessons scheduled for that day.
 * @class
 */
class ScheduleEntry {
    /**
     * @param {Date} date - The date for this schedule entry.
     * @param {number} dayCycle - The cycle day number (e.g., 1 or 2).
     */
    constructor(date, dayCycle) {
        this.date = date
        this.dayCycle = dayCycle
        this.lessons = []
    }

    /**
     * Adds a lesson to the schedule for this day.
     * @param {number} period - The period number for the lesson.
     * @param {string} group - The group assigned to the lesson (e.g., "A", "B", "MU").
     */
    addLesson(period, group) {
        this.lessons.push({ period: `Pd ${period}`, group })
    }
}

/**
 * Builds the schedule using an optimized backtracking algorithm.
 *
 * The core of the scheduler is the `solve` method, which uses a recursive backtracking
 * approach to fill available lesson slots. It prioritizes finding a "perfect" schedule
 * where each group has a lesson at least 28 days apart for the same period. If that's
 * not possible, it falls back to a 21-day constraint to ensure a high-quality schedule
 * is still produced.
 *
 * State is managed efficiently using Maps and Sets for quick lookups and updates,
 * and the backtracking mechanism ensures the state is correctly restored when a
 * particular path in the search tree fails.
 * @class
 */
class ScheduleBuilder {
    /**
     * @param {string} startDate - The start date for the schedule in "YYYY-MM-DD" format.
     * @param {number} dayCycle - The starting day cycle number.
     * @param {string[]} daysOff - An array of dates to exclude from the schedule, in "YYYY-MM-DD" format.
     * @param {number} weeks - The number of weeks the schedule should cover.
     * @param {Object[]|null} scheduleHistory - Optional existing schedule data to inform initial state.
     */
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

        // Determine lesson groups from history or create a default set.
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

        // Initialize period assignments, optionally populating from history.
        this.initialPeriodAssignments = {}
        this.LESSON_GROUPS.forEach(
            (g) => (this.initialPeriodAssignments[g] = {})
        )
        if (scheduleHistory)
            this._populateAssignmentsFromHistory(scheduleHistory)
    }

    /**
     * Populates the initial state of period assignments from historical schedule data.
     * This ensures that the new schedule respects the most recent lesson for each group and period.
     * @param {Object[]} history - The historical schedule data.
     * @private
     */
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
                // Only update if the history shows a more recent lesson.
                if (!existingDate || historyDate > existingDate) {
                    this.initialPeriodAssignments[lesson.group][periodNum] =
                        historyDate
                }
            }
        })
    }

    /**
     * Generates all available lesson slots for the entire scheduling period.
     * It accounts for weekends and specified days off.
     * @returns {Object[]} An array of slot objects, each with a date, period, and dayCycle.
     */
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
                // Determine available periods based on the day cycle (odd/even).
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

    /**
     * Calculates a unique identifier for the week of a given date.
     * This is used to enforce the rule that a group can only have one lesson per week.
     * @param {Date} d - The date.
     * @returns {string} A string representing the start date of the week (Monday).
     */
    getWeekIdentifier(d) {
        const newD = new Date(d)
        newD.setHours(0, 0, 0, 0)
        const day = newD.getDay()
        const diff = newD.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
        return new Date(newD.setDate(diff)).toDateString()
    }

    /**
     * The core recursive backtracking function that attempts to solve the schedule.
     *
     * @param {Object[]} slots - The array of all available lesson slots to be filled.
     * @param {number} index - The current slot index being processed.
     * @param {ScheduleEntry[]} schedule - The schedule being built (mutated during recursion).
     * @param {Map<string, Set<string>>} weeklyAssignments - Tracks which groups have been assigned in a given week.
     * @param {Object} periodAssignments - Tracks the last assignment date for each group and period.
     * @param {Set<string>} muDays - Tracks dates where a Make-Up (MU) lesson has been placed.
     * @param {number} dayRule - The minimum number of days between lessons for the same group in the same period.
     * @returns {boolean} `true` if a valid schedule was found from the current state, `false` otherwise.
     */
    solve(
        slots,
        index,
        schedule,
        weeklyAssignments,
        periodAssignments,
        muDays,
        dayRule
    ) {
        // Base case: If all slots are filled, we have a solution.
        if (index >= slots.length) return true

        const slot = slots[index]
        const { date, period, dayCycle } = slot
        const dateStr = date.toDateString()
        const weekId = this.getWeekIdentifier(date)

        // Ensure a Set exists for the current week's assignments.
        if (!weeklyAssignments.has(weekId)) {
            weeklyAssignments.set(weekId, new Set())
        }
        const groupsThisWeek = weeklyAssignments.get(weekId)
        const muPlacedToday = muDays.has(dateStr)

        // Generate a list of candidate groups to try for this slot.
        // Sorting candidates by their last assignment date helps prune the search space
        // by trying groups that haven't had a lesson in a while first.
        const candidates = [...this.LESSON_GROUPS, "MU"]
        candidates.sort((a, b) => {
            if (a === "MU") return 1 // Try MU last
            if (b === "MU") return -1
            const lastDateA = periodAssignments[a]?.[period] || new Date(0)
            const lastDateB = periodAssignments[b]?.[period] || new Date(0)
            return lastDateA - lastDateB // Sort ascending by last lesson date
        })

        for (const group of candidates) {
            // --- Constraint Checking ---
            let isValid = true
            if (group === "MU") {
                // 1. Only one MU per day.
                if (muPlacedToday) isValid = false
            } else {
                // 2. Group can't have more than one lesson per week.
                if (groupsThisWeek.has(group)) isValid = false
                // 3. Lesson for the same group/period must be `dayRule` days apart.
                const lastDate = periodAssignments[group]?.[period]
                if (
                    lastDate &&
                    (date - lastDate) / (1000 * 60 * 60 * 24) < dayRule
                ) {
                    isValid = false
                }
            }

            if (isValid) {
                // --- Apply Changes ---
                let dayEntry = schedule.find(
                    (d) => d.date.toDateString() === dateStr
                )
                if (!dayEntry) {
                    const displayCycle = dayCycle % 2 === 0 ? 2 : 1
                    dayEntry = new ScheduleEntry(date, displayCycle)
                    schedule.push(dayEntry)
                    schedule.sort((a, b) => a.date - b.date) // Keep schedule sorted
                }
                dayEntry.addLesson(period, group)

                // --- Update State (in-place for performance) ---
                let addedToWeek = false
                let previousDate = null
                if (group === "MU") {
                    muDays.add(dateStr)
                } else {
                    if (!groupsThisWeek.has(group)) {
                        groupsThisWeek.add(group)
                        addedToWeek = true
                    }
                    if (!periodAssignments[group]) {
                        periodAssignments[group] = {}
                    }
                    previousDate = periodAssignments[group][period]
                    periodAssignments[group][period] = date
                }

                // --- Recurse ---
                if (
                    this.solve(
                        slots,
                        index + 1,
                        schedule,
                        weeklyAssignments,
                        periodAssignments,
                        muDays,
                        dayRule
                    )
                ) {
                    return true // Solution found, propagate success up the call stack.
                }

                // --- Backtrack: Undo Changes ---
                // If the recursive call failed, we need to undo our changes to explore other possibilities.
                dayEntry.lessons.pop()
                if (dayEntry.lessons.length === 0) {
                    schedule.pop() // Remove the day entry if it's now empty.
                }

                if (group === "MU") {
                    muDays.delete(dateStr)
                } else {
                    if (addedToWeek) {
                        groupsThisWeek.delete(group)
                    }
                    // Restore the previous date for this group/period assignment.
                    if (previousDate !== null) {
                        periodAssignments[group][period] = previousDate
                    } else {
                        delete periodAssignments[group][period]
                    }
                }
            }
        }

        // If no candidate led to a solution, return false to trigger backtracking in the parent call.
        return false
    }

    /**
     * Initializes and runs the scheduling process.
     * It first attempts to find a "perfect" schedule with a 28-day rule.
     * If that fails, it falls back to a 21-day rule to find a "high-quality" schedule.
     * @returns {ScheduleEntry[]} The generated schedule, or an empty array if no solution is found.
     */
    buildSchedule() {
        const slots = this.generateAllSlots()
        if (slots.length === 0) return []

        // Initialize state with shared mutable data structures for the solver.
        const weeklyAssignments = new Map()
        const muDays = new Set()

        // Deep copy initial assignments to keep the original state clean.
        const periodAssignments = {}
        for (const group in this.initialPeriodAssignments) {
            periodAssignments[group] = {}
            for (const period in this.initialPeriodAssignments[group]) {
                periodAssignments[group][period] = new Date(
                    this.initialPeriodAssignments[group][period]
                )
            }
        }

        console.log(
            "Attempting to find a perfect schedule with a 28-day constraint..."
        )
        let schedule = []
        // First attempt with the stricter 28-day rule.
        if (
            this.solve(
                slots,
                0,
                schedule,
                weeklyAssignments,
                periodAssignments,
                muDays,
                28
            )
        ) {
            return schedule
        }

        // --- Reset State for Second Attempt ---
        schedule = []
        weeklyAssignments.clear()
        muDays.clear()
        // Restore period assignments to their initial state before the first solve attempt.
        for (const group in periodAssignments) {
            for (const period in periodAssignments[group]) {
                if (this.initialPeriodAssignments[group]?.[period]) {
                    periodAssignments[group][period] = new Date(
                        this.initialPeriodAssignments[group][period]
                    )
                } else {
                    delete periodAssignments[group][period]
                }
            }
        }

        console.log(
            "No 28-day solution found. Attempting a high-quality schedule with a 21-day constraint..."
        )
        // Second attempt with the more lenient 21-day rule.
        if (
            this.solve(
                slots,
                0,
                schedule,
                weeklyAssignments,
                periodAssignments,
                muDays,
                21
            )
        ) {
            return schedule
        }

        // Return an empty array if no solution could be found with either rule.
        return []
    }
}
