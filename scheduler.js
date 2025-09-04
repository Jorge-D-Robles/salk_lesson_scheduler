// --- Core Scheduling Logic ---

/**
 * Represents a single day in the schedule.
 */
class ScheduleEntry {
    constructor(date) {
        this.date = date
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
    constructor(startDate, dayCycle, daysOff, weeks, customGroups = null) {
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

        // Logic to use custom groups or fall back to default
        if (customGroups && customGroups.length === 22) {
            this.LESSON_GROUPS = customGroups
        } else {
            this.LESSON_GROUPS = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            ) // Groups A-V
        }

        this.DAY1_PERIODS = [1, 4, 7, 8]
        this.DAY2_PERIODS = [1, 2, 3, 7, 8]

        this.periodAssignments = {}
        this.LESSON_GROUPS.forEach((g) => (this.periodAssignments[g] = {}))

        this.groupSets = []
        const allGroupsCopy = [...this.LESSON_GROUPS]
        this.groupSets.push(allGroupsCopy.splice(0, 5))
        this.groupSets.push(allGroupsCopy.splice(0, 5))
        this.groupSets.push(allGroupsCopy.splice(0, 4))
        this.groupSets.push(allGroupsCopy.splice(0, 4))
        this.groupSets.push(allGroupsCopy.splice(0, 4))
    }

    /**
     * Rotates the bundles and the groups within them for the next cycle.
     */
    setupNextGroupCycle() {
        this.groupSets.push(this.groupSets.shift())
        this.groupSets.forEach((set) => {
            if (set.length > 1) {
                set.push(set.shift())
            }
        })
        return this.groupSets.flat()
    }

    /**
     * Finds the best available group for a period.
     */
    findBestGroupForPeriod(groupsForCycle, date, period, isMercySearch) {
        let mercyCandidate = {
            group: "MU",
            indexInCycle: -1,
            longestDaysSince: -1,
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
                    return {
                        group: potentialGroup,
                        indexInCycle: i,
                    }
                }
            } else {
                if (daysSince > mercyCandidate.longestDaysSince) {
                    mercyCandidate = {
                        group: potentialGroup,
                        indexInCycle: i,
                        longestDaysSince: daysSince,
                    }
                }
            }
        }
        return isMercySearch
            ? mercyCandidate
            : { group: "MU", indexInCycle: -1 }
    }

    /**
     * Generates the entire schedule.
     */
    buildSchedule() {
        let currentDate = new Date(this.startDate.getTime())
        let endDate = new Date(this.startDate.getTime())
        endDate.setDate(endDate.getDate() + this.weeks * 7)

        let groupsForCycle = this.groupSets.flat()
        let weeklyLessonCount = 0

        while (currentDate < endDate) {
            const dayOfWeek = currentDate.getDay()

            if (dayOfWeek === 1) {
                // Monday
                weeklyLessonCount = 0
            }

            const isWeekday = dayOfWeek > 0 && dayOfWeek < 6
            const isDayOff = this.daysOff.includes(currentDate.toDateString())

            if (isWeekday && !isDayOff) {
                const entry = new ScheduleEntry(new Date(currentDate.getTime()))
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

                        // Tier 1: Strict search on rotating pool
                        let assignment = this.findBestGroupForPeriod(
                            groupsForCycle,
                            currentDate,
                            period,
                            false
                        )

                        // Tier 2: Strict search on full pool
                        if (assignment.group === "MU") {
                            const usedGroupsToday = entry.lessons.map(
                                (l) => l.group
                            )
                            const allAvailableGroups =
                                this.LESSON_GROUPS.filter(
                                    (g) => !usedGroupsToday.includes(g)
                                )
                            assignment = this.findBestGroupForPeriod(
                                allAvailableGroups,
                                currentDate,
                                period,
                                false
                            )
                        }

                        // Tier 3: Mercy search fallback
                        if (assignment.group === "MU") {
                            assignment = this.findBestGroupForPeriod(
                                groupsForCycle,
                                currentDate,
                                period,
                                true
                            )
                        }

                        if (assignment.group !== "MU") {
                            entry.addLesson(period, assignment.group)
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
                this.dayCycle++
            }
            currentDate.setDate(currentDate.getDate() + 1)
        }
        return this.schedule
    }
}

// --- UI Logic and Event Handling ---

let lastScheduleParams = {}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("schedule-form")
    const generateBtn = document.getElementById("generate-btn")
    const rerollBtn = document.getElementById("reroll-btn")
    const saveCsvBtn = document.getElementById("save-csv-btn")
    const addDayOffBtn = document.getElementById("add-day-off")
    const customScheduleCheckbox = document.getElementById(
        "custom-schedule-checkbox"
    )
    const customScheduleContainer = document.getElementById(
        "custom-schedule-container"
    )

    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, "0")
    const dd = String(today.getDate()).padStart(2, "0")
    document.getElementById("start-date").value = `${yyyy}-${mm}-${dd}`

    addDayOffBtn.addEventListener("click", () => {
        const container = document.getElementById("days-off-container")
        const newDayOff = document.createElement("div")
        newDayOff.className = "flex items-center space-x-2 mt-2"
        newDayOff.innerHTML = `
        <input type="date" class="day-off-input block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2">
        <button type="button" class="remove-day-off bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg transition duration-300">-</button>
    `
        container.appendChild(newDayOff)
    })

    customScheduleCheckbox.addEventListener("change", () => {
        customScheduleContainer.classList.toggle(
            "hidden",
            !customScheduleCheckbox.checked
        )
    })

    document
        .getElementById("days-off-container")
        .addEventListener("click", (e) => {
            if (e.target.classList.contains("remove-day-off")) {
                e.target.parentElement.remove()
            }
        })

    form.addEventListener("submit", (e) => {
        e.preventDefault()
        runScheduler()
    })

    rerollBtn.addEventListener("click", () => {
        if (lastScheduleParams.startDate) {
            const { startDate, dayCycle, daysOff, weeks, customGroups } =
                lastScheduleParams
            const scheduleBuilder = new ScheduleBuilder(
                startDate,
                dayCycle,
                daysOff,
                weeks,
                customGroups
            )
            const schedule = scheduleBuilder.buildSchedule()
            displaySchedule(schedule)
        }
    })

    saveCsvBtn.addEventListener("click", () => {
        exportTableToCSV("musical-lesson-schedule.csv")
    })

    function runScheduler() {
        document.getElementById("loading-indicator").classList.remove("hidden")
        document.getElementById("schedule-output").classList.add("hidden")
        generateBtn.disabled = true

        setTimeout(() => {
            try {
                const params = getScheduleParameters()
                if (!params) return
                lastScheduleParams = params

                const { startDate, dayCycle, daysOff, weeks, customGroups } =
                    params
                const scheduleBuilder = new ScheduleBuilder(
                    startDate,
                    dayCycle,
                    daysOff,
                    weeks,
                    customGroups
                )
                const schedule = scheduleBuilder.buildSchedule()
                displaySchedule(schedule)
            } catch (error) {
                console.error("Error generating schedule:", error)
                alert(
                    "An error occurred. Please check your inputs and try again."
                )
            } finally {
                document
                    .getElementById("loading-indicator")
                    .classList.add("hidden")
                document
                    .getElementById("schedule-output")
                    .classList.remove("hidden")
                generateBtn.disabled = false
            }
        }, 250)
    }

    function getScheduleParameters() {
        const startDate = document.getElementById("start-date").value
        const dayCycle = parseInt(
            document.getElementById("day-cycle").value,
            10
        )
        const weeks = parseInt(document.getElementById("weeks").value, 10)
        const daysOffInputs = document.querySelectorAll(".day-off-input")
        const daysOff = Array.from(daysOffInputs)
            .map((input) => input.value)
            .filter(Boolean)

        if (!startDate || isNaN(dayCycle) || isNaN(weeks)) {
            alert(
                "Please fill in all required fields: Start Date, Day Cycle, and Weeks."
            )
            return null
        }
        if (dayCycle < 1 || dayCycle > 2) {
            alert("Starting Day Cycle must be 1 or 2.")
            return null
        }
        if (weeks < 1 || weeks > 52) {
            alert("Number of weeks must be between 1 and 52.")
            return null
        }

        let customGroups = null
        if (customScheduleCheckbox.checked) {
            const customGroupInputs = document.querySelectorAll(
                ".custom-group-input"
            )
            const allCustomGroups = []
            customGroupInputs.forEach((input) => {
                const groups = input.value
                    .split(",")
                    .map((g) => g.trim())
                    .filter(Boolean)
                allCustomGroups.push(...groups)
            })

            if (allCustomGroups.length !== 22) {
                alert(
                    `Custom schedule requires exactly 22 group names. You provided ${allCustomGroups.length}.`
                )
                return null
            }
            customGroups = allCustomGroups
        }

        return {
            startDate,
            dayCycle,
            daysOff,
            weeks,
            customGroups,
        }
    }

    function displaySchedule(schedule) {
        const tableBody = document.querySelector("#schedule-table tbody")
        tableBody.innerHTML = ""

        if (schedule.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="11" class="text-center py-4">No schedule generated for the selected dates. Check days off.</td></tr>`
            return
        }

        schedule.forEach((entry, index) => {
            if (entry.date.getDay() === 1 && index > 0) {
                const spacerRow = document.createElement("tr")
                spacerRow.className = "bg-gray-200"
                spacerRow.innerHTML = `<td colspan="11" class="py-1"></td>`
                tableBody.appendChild(spacerRow)
            }

            const row = document.createElement("tr")
            const formattedDate = entry.date.toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
            })

            let rowHTML = `<td class="px-2 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${formattedDate}</td>`

            for (let i = 0; i < 5; i++) {
                if (entry.lessons[i]) {
                    const groupClass = entry.lessons[i].group.startsWith("MU")
                        ? "text-red-600"
                        : "text-gray-800"
                    rowHTML += `
                        <td class="px-2 py-3 whitespace-nowrap text-sm text-gray-500">${entry.lessons[i].period}</td>
                        <td class="px-2 py-3 whitespace-nowrap text-sm ${groupClass} font-semibold">${entry.lessons[i].group}</td>
                    `
                } else {
                    rowHTML +=
                        '<td class="px-2 py-3"></td><td class="px-2 py-3"></td>'
                }
            }

            row.innerHTML = rowHTML
            tableBody.appendChild(row)
        })
    }

    function exportTableToCSV(filename) {
        const csv = []
        const rows = document.querySelectorAll("#schedule-table tr")

        const header = []
        document
            .querySelectorAll("#schedule-table th")
            .forEach((th) => header.push(`"${th.innerText}"`))
        csv.push(header.join(","))

        rows.forEach((row) => {
            if (row.querySelector('td[colspan="11"]')) {
                return
            }
            const cols = row.querySelectorAll("td")
            const rowData = []
            cols.forEach((col) => {
                rowData.push('"' + col.innerText.replace(/"/g, '""') + '"')
            })
            csv.push(rowData.join(","))
        })

        downloadCSV(csv.join("\n"), filename)
    }

    function downloadCSV(csv, filename) {
        const csvFile = new Blob([csv], { type: "text/csv" })
        const downloadLink = document.createElement("a")
        downloadLink.download = filename
        downloadLink.href = window.URL.createObjectURL(csvFile)
        downloadLink.style.display = "none"
        document.body.appendChild(downloadLink)
        downloadLink.click()
        document.body.removeChild(downloadLink)
    }
})
