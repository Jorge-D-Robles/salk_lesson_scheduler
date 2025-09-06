/**
 * @file Manages all UI interactions for the Music Lesson Scheduler.
 * This includes handling form inputs, validating user data, running the
 * scheduler, and displaying the results in a table.
 */

// --- UI Logic and Event Handling ---

/**
 * Stores the parameters of the last successfully generated schedule.
 * @type {Object}
 */
let lastScheduleParams = {}

document.addEventListener("DOMContentLoaded", () => {
    // --- Element Selectors ---
    const form = document.getElementById("schedule-form")
    const generateBtn = document.getElementById("generate-btn")
    const saveCsvBtn = document.getElementById("save-csv-btn")
    const addDayOffBtn = document.getElementById("add-day-off")
    const historyCheckbox = document.getElementById("history-checkbox")
    const historyContainer = document.getElementById("history-container")
    const historyTextarea = document.getElementById("history-data")
    const validationBox = document.getElementById("history-validation-box")
    const startDateInput = document.getElementById("start-date")

    // --- Initial Setup ---
    // Set the default start date to today.
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, "0")
    const dd = String(today.getDate()).padStart(2, "0")
    startDateInput.value = `${yyyy}-${mm}-${dd}`

    // --- Event Listeners ---
    startDateInput.addEventListener("change", () => {
        checkStartDateWarning()
        runAllValidations()
    })

    historyTextarea.addEventListener("input", runAllValidations)

    historyCheckbox.addEventListener("change", () => {
        historyContainer.classList.toggle("hidden", !historyCheckbox.checked)
        runAllValidations()
    })

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

    saveCsvBtn.addEventListener("click", () => {
        exportTableToCSV("musical-lesson-schedule.csv")
    })

    // --- Core UI Functions ---

    /**
     * Displays or hides a UI warning if the selected start date is not a Monday.
     */
    function checkStartDateWarning() {
        const warningBox = document.getElementById("start-day-warning")
        const dateValue = startDateInput.value
        if (!dateValue) {
            warningBox.classList.add("hidden")
            return
        }
        // Use T00:00:00 to ensure the date is parsed in the local timezone.
        const dateObj = new Date(dateValue + "T00:00:00")
        const day = dateObj.getDay() // 1 = Monday
        warningBox.classList.toggle("hidden", day === 1)
    }

    /**
     * Acts as the master validation controller. It's triggered on input changes
     * and orchestrates calls to `validateHistory`, checks date overlaps, and
     * updates the UI with validation messages and warnings.
     */
    function runAllValidations() {
        const gapWarningBox = document.getElementById("schedule-gap-warning")
        gapWarningBox.classList.add("hidden") // Reset gap warning

        if (!historyCheckbox.checked) {
            validationBox.classList.add("hidden")
            startDateInput.classList.remove("border-red-500")
            updateGenerateButtonState()
            return
        }

        const text = historyTextarea.value
        const { errors, uniqueGroupCount, maxDate } = validateHistory(text)
        const startDate = new Date(startDateInput.value + "T00:00:00")

        // Validate that the start date is after the last date in the history.
        if (maxDate && startDate <= maxDate) {
            errors.push(
                `<b>Overall:</b> Start date must be after the last date in the history (${maxDate.toLocaleDateString()}).`
            )
            startDateInput.classList.add("border-red-500")
        } else {
            startDateInput.classList.remove("border-red-500")
        }

        // Show a warning if there's a gap between the history's end and the new schedule's start.
        if (maxDate && errors.length === 0) {
            let nextWorkday = new Date(maxDate.getTime())
            nextWorkday.setDate(nextWorkday.getDate() + 1)
            while (nextWorkday.getDay() === 0 || nextWorkday.getDay() === 6) {
                nextWorkday.setDate(nextWorkday.getDate() + 1)
            }
            if (startDate.getTime() > nextWorkday.getTime()) {
                gapWarningBox.classList.remove("hidden")
            }
        }

        // Display validation results in the UI.
        if (text.trim() === "" || errors.length > 0) {
            validationBox.classList.remove("hidden")
            validationBox.innerHTML = `<ul>${errors
                .map((e) => `<li>- ${e}</li>`)
                .join("")}</ul>`
            validationBox.className =
                "mt-2 p-3 rounded-md text-sm bg-red-50 text-red-700"
        } else {
            validationBox.classList.remove("hidden")
            validationBox.innerHTML = `✅ All checks pass. Found ${uniqueGroupCount} of 22 required unique groups.`
            validationBox.className =
                "mt-2 p-3 rounded-md text-sm bg-green-50 text-green-800"
        }
        updateGenerateButtonState(errors)
    }

    /**
     * Enables or disables the 'Generate Schedule' button based on validation results.
     * @param {string[]|null} [errors=null] - An array of error messages. If null, re-validates.
     */
    function updateGenerateButtonState(errors = null) {
        if (!historyCheckbox.checked) {
            generateBtn.disabled = false
            return
        }
        if (errors === null) {
            errors = validateHistory(historyTextarea.value).errors
        }
        generateBtn.disabled = errors.length > 0
    }

    /**
     * Handles the main form submission. It shows a loading indicator, gathers form
     * parameters, calls the `ScheduleBuilder`, and then renders the result.
     * Uses a `setTimeout` to allow the UI to update before the potentially blocking
     * scheduling logic runs.
     */
    function runScheduler() {
        document.getElementById("loading-indicator").classList.remove("hidden")
        document.getElementById("schedule-output").classList.add("hidden")
        generateBtn.disabled = true

        setTimeout(() => {
            try {
                const params = getScheduleParameters()
                if (!params) return
                lastScheduleParams = params
                const { startDate, dayCycle, daysOff, weeks, scheduleHistory } =
                    params
                const scheduleBuilder = new ScheduleBuilder(
                    startDate,
                    dayCycle,
                    daysOff,
                    weeks,
                    scheduleHistory
                )
                const schedule = scheduleBuilder.buildSchedule()
                displaySchedule(schedule)
            } catch (error) {
                console.error("Error generating schedule:", error)
                alert(
                    `An error occurred: ${error.message}. Please check your inputs and try again.`
                )
            } finally {
                document
                    .getElementById("loading-indicator")
                    .classList.add("hidden")
                document
                    .getElementById("schedule-output")
                    .classList.remove("hidden")
                runAllValidations() // Re-enable button if necessary
            }
        }, 250) // 250ms delay for UI rendering
    }

    /**
     * Parses a single line of text from the history textarea, handling both
     * tab-separated and comma-separated (CSV) formats.
     * @param {string} line - The line of text to parse.
     * @returns {string[]} An array of column values.
     */
    function parseScheduleLine(line) {
        if (line.includes("\t")) {
            return line.split("\t") // Handle spreadsheet paste
        } else {
            // Handle CSV paste with potential quotes
            const columns = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || []
            return columns.map((col) => col.trim().replace(/^"|"$/g, ""))
        }
    }

    /**
     * Performs a comprehensive validation of the pasted schedule history text.
     * @param {string} text - The raw text from the history textarea.
     * @returns {{errors: string[], uniqueGroupCount: number, maxDate: Date|null}} An object containing validation results.
     */
    function validateHistory(text) {
        const errors = []
        const lines = text.split("\n").filter((line) => line.trim() !== "")
        const uniqueGroups = new Set()
        const parsedLessons = []
        let maxDate = null

        if (text.trim() === "") {
            errors.push("<b>Overall:</b> History data cannot be empty.")
            return { errors, uniqueGroupCount: 0, maxDate }
        }

        const dataLines =
            lines.length > 0 &&
            (lines[0].toLowerCase().includes("date") ||
                lines[0].toLowerCase().includes("period"))
                ? lines.slice(1)
                : lines // Skip header row if present

        if (dataLines.length === 0) {
            errors.push("<b>Overall:</b> No data rows found in the paste.")
            return { errors, uniqueGroupCount: 0, maxDate }
        }

        for (let i = 0; i < dataLines.length; i++) {
            const line = dataLines[i]
            const columns = parseScheduleLine(line)
            const dateStr = columns[0]
            const dateObj = new Date(dateStr)
            if (isNaN(dateObj.getTime())) {
                errors.push(
                    `<b>Line ${i + 1}:</b> Could not parse date '${dateStr}'.`
                )
                continue
            }
            if (maxDate === null || dateObj > maxDate) {
                maxDate = dateObj
            }
            const firstPeriodIndex = columns.findIndex((col) =>
                col.toLowerCase().startsWith("pd")
            )
            if (
                firstPeriodIndex === -1 ||
                (columns.length - firstPeriodIndex) % 2 !== 0
            ) {
                errors.push(
                    `<b>Line ${
                        i + 1
                    }:</b> Invalid column structure. Could not find valid Period/Group pairs.`
                )
                continue
            }
            for (let j = firstPeriodIndex; j < columns.length; j += 2) {
                const periodStr = columns[j]
                const group = columns[j + 1]
                if (!periodStr && !group) continue
                const period = parseInt(periodStr.replace(/\D/g, ""), 10)
                if (isNaN(period)) {
                    errors.push(
                        `<b>Line ${i + 1}, Column ${
                            j + 1
                        }:</b> Invalid period '${periodStr}'.`
                    )
                }
                if (!group) {
                    errors.push(
                        `<b>Line ${i + 1}, Column ${
                            j + 2
                        }:</b> Group name is missing.`
                    )
                } else {
                    if (group.toUpperCase() !== "MU") {
                        uniqueGroups.add(group)
                    }
                    parsedLessons.push({ date: dateObj, period, group })
                }
            }
        }

        if (uniqueGroups.size !== 22) {
            errors.push(
                `<b>Overall:</b> Found ${uniqueGroups.size} unique groups. The schedule requires exactly <b>22</b> unique non-MU groups.`
            )
        }
        if (parsedLessons.length > 0) {
            const uniqueDayStrings = new Set(
                parsedLessons.map((p) => p.date.toDateString())
            )
            const uniqueDayCount = uniqueDayStrings.size
            if (uniqueDayCount < 20) {
                errors.push(
                    `<b>Overall:</b> History must contain at least 4 weeks of lessons (~20 school days). Found ${uniqueDayCount} days.`
                )
            }
            if (uniqueDayCount > 40) {
                errors.push(
                    `<b>Overall:</b> History should not contain more than 8 weeks of lessons (~40 school days). Found ${uniqueDayCount} days.`
                )
            }
        }

        return { errors, uniqueGroupCount: uniqueGroups.size, maxDate }
    }

    /**
     * Gathers all user inputs from the form and parses them into an object
     * suitable for the `ScheduleBuilder`.
     * @returns {Object|null} An object with all schedule parameters, or null if validation fails.
     */
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
            alert("Please fill in all required fields for the new schedule.")
            return null
        }

        let scheduleHistory = null
        if (historyCheckbox.checked) {
            const historyText = document
                .getElementById("history-data")
                .value.trim()
            // Final validation check before submitting.
            const { errors, maxDate } = validateHistory(historyText)
            const startDateObj = new Date(startDate + "T00:00:00")
            if (maxDate && startDateObj <= maxDate) {
                errors.push("Start date error") // Add to trigger alert
            }
            if (errors.length > 0) {
                runAllValidations() // Ensure UI shows errors
                alert(
                    "There are errors in your inputs. Please fix the highlighted fields and messages."
                )
                return null
            }

            // Parse history text into the structured format required by ScheduleBuilder.
            const parsedHistory = []
            let lines = historyText.split("\n")
            if (
                lines.length > 0 &&
                (lines[0].toLowerCase().includes("date") ||
                    lines[0].toLowerCase().includes("period"))
            ) {
                lines.shift()
            }
            for (const line of lines) {
                if (line.trim() === "") continue
                const columns = parseScheduleLine(line)
                const firstPeriodIndex = columns.findIndex((col) =>
                    col.toLowerCase().startsWith("pd")
                )
                if (firstPeriodIndex === -1) continue
                const dateObj = new Date(columns[0])
                const yyyy = dateObj.getFullYear()
                const mm = String(dateObj.getMonth() + 1).padStart(2, "0")
                const dd = String(dateObj.getDate()).padStart(2, "0")
                const formattedDate = `${yyyy}-${mm}-${dd}`
                for (let i = firstPeriodIndex; i < columns.length; i += 2) {
                    const periodStr = columns[i]
                    const group = columns[i + 1]
                    if (periodStr && group) {
                        const period = parseInt(
                            periodStr.replace(/\D/g, ""),
                            10
                        )
                        if (!isNaN(period)) {
                            parsedHistory.push({
                                date: formattedDate,
                                period,
                                group,
                            })
                        }
                    }
                }
            }
            scheduleHistory = parsedHistory
        }

        return { startDate, dayCycle, daysOff, weeks, scheduleHistory }
    }

    /**
     * Renders the generated schedule into the HTML table. It dynamically
     * creates rows and includes visual spacers for readability.
     * @param {Array<ScheduleEntry>} schedule - The schedule array from `ScheduleBuilder`.
     */
    function displaySchedule(schedule) {
        const tableBody = document.querySelector("#schedule-table tbody")
        tableBody.innerHTML = ""

        if (schedule.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="12" class="text-center py-4">No schedule generated. Check dates and days off.</td></tr>`
            return
        }

        /**
         * Helper function to get a unique identifier for a calendar week (the date string of its Monday).
         * @param {Date} d The date to check.
         * @returns {string} The date string of the Monday of that week.
         */
        const getWeekIdentifier = (d) => {
            const newD = new Date(d)
            newD.setHours(0, 0, 0, 0)
            const day = newD.getDay() // 0=Sun, 1=Mon...
            const diff = newD.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
            return new Date(newD.setDate(diff)).toDateString()
        }

        // Initialize trackers for week and 4-week chronological periods.
        let currentWeekIdentifier = getWeekIdentifier(schedule[0].date)
        let fourWeekBoundary = new Date(schedule[0].date.getTime())
        fourWeekBoundary.setDate(fourWeekBoundary.getDate() + 28)

        schedule.forEach((entry, index) => {
            // Insert a visual spacer if the calendar week has changed since the last entry.
            const entryWeekIdentifier = getWeekIdentifier(entry.date)
            if (entryWeekIdentifier !== currentWeekIdentifier) {
                const spacerRow = document.createElement("tr")
                spacerRow.className = "bg-gray-200 weekly-spacer"
                spacerRow.innerHTML = `<td colspan="12" class="py-1"></td>`
                tableBody.appendChild(spacerRow)
                currentWeekIdentifier = entryWeekIdentifier
            }

            // Create and populate the main data row.
            const row = document.createElement("tr")
            const formattedDate = entry.date.toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
            })

            let rowHTML = `<td class="px-2 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${formattedDate}</td><td class="px-2 py-3 whitespace-nowrap text-sm text-center text-gray-700">${entry.dayCycle}</td>`

            for (let i = 0; i < 5; i++) {
                if (entry.lessons[i]) {
                    const groupClass = entry.lessons[i].group.startsWith("MU")
                        ? "text-red-600" // Highlight Make-Up lessons
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

            // Insert a visual spacer if a 4-week chronological boundary is crossed.
            const isNotLastDay = index + 1 < schedule.length
            if (isNotLastDay) {
                const currentDate = entry.date
                const nextDate = schedule[index + 1].date
                if (
                    currentDate < fourWeekBoundary &&
                    nextDate >= fourWeekBoundary
                ) {
                    const cycleSpacerRow = document.createElement("tr")
                    cycleSpacerRow.className = "bg-indigo-100 cycle-spacer"
                    cycleSpacerRow.innerHTML = `<td colspan="12" class="py-2 text-center text-sm font-semibold text-indigo-700">--- End of 4-Week Period ---</td>`
                    tableBody.appendChild(cycleSpacerRow)
                    // Advance the boundary for the next check.
                    fourWeekBoundary.setDate(fourWeekBoundary.getDate() + 28)
                }
            }
        })
    }

    /**
     * Converts the content of the HTML schedule table into a CSV formatted string.
     * @param {string} filename - The desired name for the downloaded file.
     */
    function exportTableToCSV(filename) {
        const csv = []
        const rows = document.querySelectorAll("#schedule-table tr")
        const header = []
        document
            .querySelectorAll("#schedule-table th")
            .forEach((th) => header.push(`"${th.innerText}"`))
        csv.push(header.join(","))

        rows.forEach((row) => {
            // Skip visual spacer rows in the CSV output.
            if (row.classList.contains("weekly-spacer")) {
                return
            }
            if (row.classList.contains("cycle-spacer")) {
                csv.push("") // Add a blank line for the cycle spacer
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

    /**
     * Triggers a browser download for the given CSV content.
     * @param {string} csv - The CSV content as a single string.
     * @param {string} filename - The name of the file to be downloaded.
     */
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

    // --- Page Initialization ---
    checkStartDateWarning()
    runAllValidations()
})
