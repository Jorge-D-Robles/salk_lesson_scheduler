/**
 * @file Contains the core backtracking algorithm for generating the music lesson schedule.
 */

// --- Constants for Scheduling Rules ---
const PERFECT_SCHEDULE_DAY_RULE = 28
const HIGH_QUALITY_DAY_RULE = 21
const REQUIRED_UNIQUE_GROUPS = 22

/**
 * Represents a single day in the schedule.
 * @class
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
 * Builds the schedule using an optimized backtracking algorithm.
 * @class
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
            // 1. Only one MU per day.
            return !muDays.has(dateStr)
        }

        // 2. Group can't have more than one lesson per week.
        if (weeklyAssignments.get(weekId)?.has(group)) {
            return false
        }

        // 3. Lesson for the same group/period must be `dayRule` days apart.
        const lastDate = periodAssignments[group]?.[period]
        if (lastDate && (date - lastDate) / (1000 * 60 * 60 * 24) < dayRule) {
            return false
        }
        return true
    }

    solve(
        slots,
        index,
        schedule,
        weeklyAssignments,
        periodAssignments,
        muDays,
        dayRule
    ) {
        if (index >= slots.length) return true

        const slot = slots[index]
        const { date, period, dayCycle } = slot
        const dateStr = date.toDateString()
        const weekId = this.getWeekIdentifier(date)
        if (!weeklyAssignments.has(weekId))
            weeklyAssignments.set(weekId, new Set())

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
                // Apply Changes
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

                // Recurse
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

                // Backtrack
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
        return false
    }

    buildSchedule() {
        const slots = this.generateAllSlots()
        if (slots.length === 0) return []

        const weeklyAssignments = new Map()
        const muDays = new Set()
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

        // Reset state for the second attempt
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
        return []
    }
}
