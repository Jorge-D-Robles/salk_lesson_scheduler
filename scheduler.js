/**
 * @file Contains the core backtracking algorithm for generating the music lesson schedule.
 * It is responsible for the pure, stateful logic of schedule creation, independent of the UI.
 */

// --- Constants for Scheduling Rules ---
/** The ideal minimum number of days between lessons for the same group/period. */
const PERFECT_SCHEDULE_DAY_RULE = 28
/** The absolute minimum number of days between lessons for the same group/period. */
const HIGH_QUALITY_DAY_RULE = 21
/** The required number of unique, non-MU (Make-Up) groups in a valid schedule history. */
const REQUIRED_UNIQUE_GROUPS = 22

/**
 * Represents a single day in the schedule, containing the date, day cycle, and scheduled lessons.
 * @class
 */
class ScheduleEntry {
    constructor(date, dayCycle) {
        /** @type {Date} The date for this entry. */
        this.date = date
        /** @type {number} The day cycle (1 or 2) for this entry. */
        this.dayCycle = dayCycle
        /** @type {Array<Object>} A list of lessons for this day. */
        this.lessons = []
    }
    /**
     * Adds a lesson to this day's schedule.
     * @param {number} period - The lesson period number.
     * @param {string} group - The name of the group.
     */
    addLesson(period, group) {
        this.lessons.push({ period: `Pd ${period}`, group })
    }
}

/**
 * Builds the schedule using an optimized backtracking algorithm.
 * This class encapsulates all the state and logic needed to generate a valid schedule.
 * @class
 */
class ScheduleBuilder {
    /**
     * @param {string} startDate - The start date in "YYYY-MM-DD" format.
     * @param {number} dayCycle - The starting day cycle (1 or 2).
     * @param {string[]} daysOff - An array of dates to exclude, in "YYYY-MM-DD" format.
     * @param {number} weeks - The number of weeks to generate the schedule for.
     * @param {Array<Object>|null} scheduleHistory - Parsed historical schedule data.
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

        // Determine the list of lesson groups from history or use a default set.
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

    /**
     * Processes the schedule history to find the most recent lesson for each group/period combination.
     * @private
     * @param {Array<Object>} history - The raw historical data.
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
                if (!existingDate || historyDate > existingDate) {
                    this.initialPeriodAssignments[lesson.group][periodNum] =
                        historyDate
                }
            }
        })
    }

    /**
     * Generates a flat list of all available lesson slots (date/period combinations)
     * based on the start date, weeks, and days off.
     * @returns {Array<Object>} A list of all available slots to be filled.
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
     * Gets a unique string identifier for the calendar week of a given date (specifically, the date of that week's Monday).
     * @param {Date} d - The date to get the week identifier for.
     * @returns {string} The date string of the Monday of that week.
     */
    getWeekIdentifier(d) {
        const newD = new Date(d)
        newD.setHours(0, 0, 0, 0)
        const day = newD.getDay()
        const diff = newD.getDate() - day + (day === 0 ? -6 : 1)
        return new Date(newD.setDate(diff)).toDateString()
    }

    /**
     * Checks if a given group can be validly placed in a specific time slot based on all scheduling rules.
     * @private
     * @param {string} group - The group to check.
     * @param {Object} slot - The slot to place the group in.
     * @param {Map<string, Set<string>>} weeklyAssignments - Current weekly assignments.
     * @param {Object} periodAssignments - Current period assignments.
     * @param {Set<string>} muDays - A set of dates that already have a Make-Up lesson.
     * @param {number} dayRule - The minimum number of days between lessons.
     * @returns {boolean} True if the placement is valid, false otherwise.
     */
    _isGroupValidForSlot(
        group,
        slot,
        weeklyAssignments,
        periodAssignments,
        muDays,
        dayRule
    ) {
        const { date, period } = slot
        const dateStr = date.toDateString()
        const weekId = this.getWeekIdentifier(date)

        if (group === "MU") {
            // Rule: Only one MU per day.
            return !muDays.has(dateStr)
        }
        // Rule: Group can't have more than one lesson per week.
        if (weeklyAssignments.get(weekId)?.has(group)) {
            return false
        }
        // Rule: Lesson for the same group/period must be `dayRule` days apart.
        const lastDate = periodAssignments[group]?.[period]
        if (lastDate && (date - lastDate) / (1000 * 60 * 60 * 24) < dayRule) {
            return false
        }
        return true
    }

    /**
     * The core recursive backtracking function that attempts to solve the schedule.
     * @private
     * @returns {boolean} True if a solution was found, false otherwise.
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
        if (index >= slots.length) return true // Base case: successfully filled all slots

        const slot = slots[index]
        const { date, period, dayCycle } = slot
        const dateStr = date.toDateString()
        const weekId = this.getWeekIdentifier(date)
        if (!weeklyAssignments.has(weekId))
            weeklyAssignments.set(weekId, new Set())

        // Prioritize candidates that haven't had a lesson in the longest time.
        const candidates = [...this.LESSON_GROUPS, "MU"]
        candidates.sort((a, b) => {
            if (a === "MU") return 1
            if (b === "MU") return -1
            const lastDateA = periodAssignments[a]?.[period] || new Date(0)
            const lastDateB = periodAssignments[b]?.[period] || new Date(0)
            return lastDateA - lastDateB
        })

        for (const group of candidates) {
            if (
                this._isGroupValidForSlot(
                    group,
                    slot,
                    weeklyAssignments,
                    periodAssignments,
                    muDays,
                    dayRule
                )
            ) {
                // --- Apply Changes (Try placing the group) ---
                let dayEntry = schedule.find(
                    (d) => d.date.toDateString() === dateStr
                )
                if (!dayEntry) {
                    dayEntry = new ScheduleEntry(
                        date,
                        dayCycle % 2 === 0 ? 2 : 1
                    )
                    schedule.push(dayEntry)
                    schedule.sort((a, b) => a.date - b.date)
                }
                dayEntry.addLesson(period, group)

                let addedToWeek = false
                let previousDate = null
                if (group === "MU") {
                    muDays.add(dateStr)
                } else {
                    const groupsThisWeek = weeklyAssignments.get(weekId)
                    if (!groupsThisWeek.has(group)) {
                        groupsThisWeek.add(group)
                        addedToWeek = true
                    }
                    if (!periodAssignments[group]) periodAssignments[group] = {}
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
                    return true
                }

                // --- Backtrack (Undo the changes if recursion failed) ---
                dayEntry.lessons.pop()
                if (dayEntry.lessons.length === 0) schedule.pop()

                if (group === "MU") {
                    muDays.delete(dateStr)
                } else {
                    if (addedToWeek) weeklyAssignments.get(weekId).delete(group)
                    if (previousDate !== null)
                        periodAssignments[group][period] = previousDate
                    else delete periodAssignments[group][period]
                }
            }
        }
        return false // No valid group found for this slot
    }

    /**
     * The main public method to generate the schedule. It orchestrates the process,
     * first trying for a "perfect" schedule, then falling back to a "high-quality" one.
     * @returns {Array<ScheduleEntry>} The final generated schedule.
     */
    buildSchedule() {
        const slots = this.generateAllSlots()
        if (slots.length === 0) return []

        const weeklyAssignments = new Map()
        const muDays = new Set()
        // Deep copy initial state to avoid mutation across attempts
        const periodAssignments = JSON.parse(
            JSON.stringify(this.initialPeriodAssignments)
        )
        for (const group in periodAssignments) {
            for (const period in periodAssignments[group]) {
                periodAssignments[group][period] = new Date(
                    periodAssignments[group][period]
                )
            }
        }

        console.log(
            `Attempting to find a perfect schedule with a ${PERFECT_SCHEDULE_DAY_RULE}-day constraint...`
        )
        let schedule = []
        if (
            this.solve(
                slots,
                0,
                schedule,
                weeklyAssignments,
                periodAssignments,
                muDays,
                PERFECT_SCHEDULE_DAY_RULE
            )
        ) {
            return schedule
        }

        // Reset state for the second, less strict attempt
        schedule = []
        weeklyAssignments.clear()
        muDays.clear()
        const freshAssignments = JSON.parse(
            JSON.stringify(this.initialPeriodAssignments)
        )
        for (const group in freshAssignments) {
            for (const period in freshAssignments[group]) {
                freshAssignments[group][period] = new Date(
                    freshAssignments[group][period]
                )
            }
        }

        console.log(
            `No ${PERFECT_SCHEDULE_DAY_RULE}-day solution. Attempting high-quality schedule with a ${HIGH_QUALITY_DAY_RULE}-day constraint...`
        )
        if (
            this.solve(
                slots,
                0,
                schedule,
                weeklyAssignments,
                freshAssignments,
                muDays,
                HIGH_QUALITY_DAY_RULE
            )
        ) {
            return schedule
        }
        return [] // Return empty if no solution is found
    }
}
