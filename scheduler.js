// --- Core Scheduling Logic ---

/**
 * Represents a single day in the schedule.
 */
class ScheduleEntry {
    constructor(date, dayCycle) {
        this.date = date
        this.dayCycle = dayCycle // Store the day cycle
        this.lessons = [] // An array of {period, group} objects
    }

    addLesson(period, group) {
        this.lessons.push({ period: `Pd ${period}`, group })
    }
}

/**
 * The main class for building the schedule based on new 25/26 rules.
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
                const parts = d.split("-")
                return new Date(parts[0], parts[1] - 1, parts[2]).toDateString()
            })
            .filter(Boolean)
        this.weeks = weeks
        this.schedule = []

        this.DAY1_PERIODS = [1, 4, 7, 8]
        this.DAY2_PERIODS = [1, 2, 3, 7, 8]

        // Step 1: Determine the set of all unique lesson groups.
        if (
            scheduleHistory &&
            Array.isArray(scheduleHistory) &&
            scheduleHistory.length > 0
        ) {
            const groupsFromHistory = new Set(
                scheduleHistory.map((item) => item.group).filter(Boolean)
            )
            groupsFromHistory.delete("MU")

            if (groupsFromHistory.size !== 22) {
                throw new Error(
                    `History data must contain exactly 22 unique non-MU groups. Found ${groupsFromHistory.size}.`
                )
            }

            this.LESSON_GROUPS = [...groupsFromHistory]
        } else {
            // Fallback to default A-V groups if no history is provided.
            this.LESSON_GROUPS = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            )
        }

        // Step 2: Initialize the data structure for storing the last seen date for each group/period.
        this.periodAssignments = {}
        this.LESSON_GROUPS.forEach((g) => (this.periodAssignments[g] = {}))

        // Step 3: Populate this structure from the history, if it exists.
        if (
            scheduleHistory &&
            Array.isArray(scheduleHistory) &&
            scheduleHistory.length > 0
        ) {
            this._populateAssignmentsFromHistory(scheduleHistory)
        }

        // Step 4: Create the rotating group sets for the scheduling algorithm.
        this.groupSets = []
        const allGroupsCopy = [...this.LESSON_GROUPS]
        if (allGroupsCopy.length > 0) {
            this.groupSets.push(allGroupsCopy.splice(0, 5))
            this.groupSets.push(allGroupsCopy.splice(0, 5))
            this.groupSets.push(allGroupsCopy.splice(0, 4))
            this.groupSets.push(allGroupsCopy.splice(0, 4))
            this.groupSets.push(allGroupsCopy.splice(0, 4))
        }
    }

    _populateAssignmentsFromHistory(history) {
        history.forEach((lesson) => {
            if (!lesson.group || !lesson.period || !lesson.date) return
            if (this.periodAssignments[lesson.group]) {
                const parts = lesson.date.split("-").map((p) => parseInt(p, 10))
                const historyDate = new Date(parts[0], parts[1] - 1, parts[2])
                const existingDate =
                    this.periodAssignments[lesson.group][lesson.period]
                if (!existingDate || historyDate > existingDate) {
                    this.periodAssignments[lesson.group][lesson.period] =
                        historyDate
                }
            }
        })
    }

    setupNextGroupCycle() {
        this.groupSets.push(this.groupSets.shift())
        this.groupSets.forEach((set) => {
            if (set.length > 1) {
                set.push(set.shift())
            }
        })
        return this.groupSets.flat()
    }

    findBestGroupForPeriod(groupsForCycle, date, period, isMercySearch) {
        let mercyCandidate = {
            group: "MU",
            indexInCycle: -1,
            daysSince: -1,
        }
        for (let i = 0; i < groupsForCycle.length; i++) {
            const potentialGroup = groupsForCycle[i]
            const lastAssignmentDate =
                this.periodAssignments[potentialGroup][period]
            const daysSince = lastAssignmentDate
                ? (date - lastAssignmentDate) / (1000 * 60 * 60 * 24)
                : Infinity
            if (!isMercySearch) {
                if (daysSince >= 28) {
                    return { group: potentialGroup, indexInCycle: i, daysSince }
                }
            } else {
                if (daysSince > mercyCandidate.daysSince) {
                    mercyCandidate = {
                        group: potentialGroup,
                        indexInCycle: i,
                        daysSince: daysSince,
                    }
                }
            }
        }
        const notFound = { group: "MU", indexInCycle: -1, daysSince: -1 }
        return isMercySearch ? mercyCandidate : notFound
    }

    buildSchedule() {
        let currentDate = new Date(this.startDate.getTime())
        let endDate = new Date(this.startDate.getTime())
        endDate.setDate(endDate.getDate() + this.weeks * 7)
        let groupsForCycle = this.groupSets.flat()
        let weeklyLessonCount = 0
        let usedGroupsThisWeek = new Set()

        while (currentDate < endDate) {
            const dayOfWeek = currentDate.getDay()
            if (dayOfWeek === 1) {
                weeklyLessonCount = 0
                usedGroupsThisWeek.clear()
            }
            const isWeekday = dayOfWeek > 0 && dayOfWeek < 6
            const isDayOff = this.daysOff.includes(currentDate.toDateString())

            if (isWeekday && !isDayOff) {
                // --- FIX: Calculate the correct 1 or 2 day cycle for display ---
                const displayCycle = this.dayCycle % 2 === 0 ? 2 : 1
                const entry = new ScheduleEntry(
                    new Date(currentDate.getTime()),
                    displayCycle // Pass the correct 1 or 2 value
                )

                const periodsForDay =
                    this.dayCycle % 2 !== 0
                        ? this.DAY1_PERIODS
                        : this.DAY2_PERIODS
                for (const period of periodsForDay) {
                    if (weeklyLessonCount >= 22) {
                        entry.addLesson(period, "MU")
                    } else {
                        if (groupsForCycle.length === 0) {
                            groupsForCycle = this.setupNextGroupCycle()
                        }

                        const usedGroupsToday = entry.lessons.map(
                            (l) => l.group
                        )
                        const weeklyAvailableGroups = (groupPool) =>
                            groupPool.filter(
                                (g) =>
                                    !usedGroupsThisWeek.has(g) &&
                                    !usedGroupsToday.includes(g)
                            )
                        let assignment = this.findBestGroupForPeriod(
                            weeklyAvailableGroups(groupsForCycle),
                            currentDate,
                            period,
                            false
                        )
                        if (assignment.group === "MU") {
                            assignment = this.findBestGroupForPeriod(
                                weeklyAvailableGroups(this.LESSON_GROUPS),
                                currentDate,
                                period,
                                false
                            )
                        }
                        if (assignment.group === "MU") {
                            assignment = this.findBestGroupForPeriod(
                                weeklyAvailableGroups(this.LESSON_GROUPS),
                                currentDate,
                                period,
                                true
                            )
                        }
                        if (
                            assignment.group !== "MU" &&
                            assignment.daysSince >= 28
                        ) {
                            entry.addLesson(period, assignment.group)
                            usedGroupsThisWeek.add(assignment.group)
                            this.periodAssignments[assignment.group][period] =
                                new Date(currentDate.getTime())
                            const indexInCycle = groupsForCycle.indexOf(
                                assignment.group
                            )
                            if (indexInCycle > -1) {
                                groupsForCycle.splice(indexInCycle, 1)
                            }
                        } else {
                            entry.addLesson(period, "MU")
                        }
                    }
                    weeklyLessonCount++
                }
                this.schedule.push(entry)
                this.dayCycle++ // The internal counter still increments normally
            }
            currentDate.setDate(currentDate.getDate() + 1)
        }
        return this.schedule
    }
}
