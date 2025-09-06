/**
 * @file Manages all UI interactions for the Music Lesson Scheduler.
 */

// --- Global UI Element Cache ---
const ui = {
    form: null,
    generateBtn: null,
    saveCsvBtn: null,
    addDayOffBtn: null,
    historyCheckbox: null,
    historyContainer: null,
    historyTextarea: null,
    validationBox: null,
    startDateInput: null,
    daysOffContainer: null,
    startDayWarning: null,
    scheduleGapWarning: null,
    loadingIndicator: null,
    scheduleOutput: null,
    scheduleTableBody: null,
    dayOffTemplate: null,
}

// --- Function Definitions ---

/**
 * Handles the main form submission to generate and display the schedule.
 */
function runScheduler() {
    ui.loadingIndicator.classList.remove("hidden")
    ui.scheduleOutput.classList.add("hidden")
    ui.generateBtn.disabled = true

    setTimeout(() => {
        try {
            const params = getScheduleParameters()
            if (!params) return // Validation failed
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
                `An error occurred: ${error.message}. Please check your inputs.`
            )
        } finally {
            ui.loadingIndicator.classList.add("hidden")
            ui.scheduleOutput.classList.remove("hidden")
            runAllValidations()
        }
    }, 250)
}

/**
 * Displays or hides a UI warning if the selected start date is not a Monday.
 */
function checkStartDateWarning() {
    const dateValue = ui.startDateInput.value
    if (!dateValue) {
        ui.startDayWarning.classList.add("hidden")
        return
    }
    const dateObj = new Date(dateValue + "T00:00:00")
    const day = dateObj.getDay()
    ui.startDayWarning.classList.toggle("hidden", day === 1)
}

/**
 * Acts as the master validation controller.
 */
function runAllValidations() {
    ui.scheduleGapWarning.classList.add("hidden")

    if (!ui.historyCheckbox.checked) {
        ui.validationBox.classList.add("hidden")
        ui.startDateInput.classList.remove("border-red-500")
        updateGenerateButtonState()
        return
    }

    const text = ui.historyTextarea.value
    const { errors, uniqueGroupCount, maxDate } = validateHistory(text)
    const startDate = new Date(ui.startDateInput.value + "T00:00:00")

    if (maxDate && startDate <= maxDate) {
        errors.push(
            `<b>Overall:</b> Start date must be after the last date in the history (${maxDate.toLocaleDateString()}).`
        )
        ui.startDateInput.classList.add("border-red-500")
    } else {
        ui.startDateInput.classList.remove("border-red-500")
    }

    if (maxDate && errors.length === 0) {
        let nextWorkday = new Date(maxDate.getTime())
        nextWorkday.setDate(nextWorkday.getDate() + 1)
        while (nextWorkday.getDay() === 0 || nextWorkday.getDay() === 6) {
            nextWorkday.setDate(nextWorkday.getDate() + 1)
        }
        if (startDate.getTime() > nextWorkday.getTime()) {
            ui.scheduleGapWarning.classList.remove("hidden")
        }
    }

    if (text.trim() === "" || errors.length > 0) {
        ui.validationBox.classList.remove("hidden")
        ui.validationBox.innerHTML = `<ul>${errors
            .map((e) => `<li>- ${e}</li>`)
            .join("")}</ul>`
        ui.validationBox.className =
            "mt-2 p-3 rounded-md text-sm bg-red-50 text-red-700"
    } else {
        ui.validationBox.classList.remove("hidden")
        ui.validationBox.innerHTML = `✅ All checks pass. Found ${uniqueGroupCount} of 22 required unique groups.`
        ui.validationBox.className =
            "mt-2 p-3 rounded-md text-sm bg-green-50 text-green-800"
    }
    updateGenerateButtonState(errors)
}

/**
 * Enables or disables the 'Generate Schedule' button based on validation results.
 */
function updateGenerateButtonState(errors = null) {
    if (!ui.historyCheckbox.checked) {
        ui.generateBtn.disabled = false
        return
    }
    if (errors === null) {
        errors = validateHistory(ui.historyTextarea.value).errors
    }
    ui.generateBtn.disabled = errors.length > 0
}

/**
 * Parses a single line of text from the history textarea.
 */
function parseScheduleLine(line) {
    if (line.includes("\t")) {
        return line.split("\t")
    } else {
        const columns = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || []
        return columns.map((col) => col.trim().replace(/^"|"$/g, ""))
    }
}

/**
 * Performs a comprehensive validation of the pasted schedule history text.
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
            : lines

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
 * Gathers all user inputs from the form and parses them.
 */
function getScheduleParameters() {
    const startDate = ui.startDateInput.value
    const dayCycle = parseInt(document.getElementById("day-cycle").value, 10)
    const weeks = parseInt(document.getElementById("weeks").value, 10)
    const daysOffInputs = document.querySelectorAll(".day-off-input")
    const daysOff = Array.from(daysOffInputs)
        .map((input) => input.value)
        .filter(Boolean)

    if (!startDate || isNaN(dayCycle) || isNaN(weeks)) {
        alert("Please fill in all required fields.")
        return null
    }

    let scheduleHistory = null
    if (ui.historyCheckbox.checked) {
        const historyText = ui.historyTextarea.value.trim()
        const { errors, maxDate } = validateHistory(historyText)
        const startDateObj = new Date(startDate + "T00:00:00")
        if (maxDate && startDateObj <= maxDate) {
            errors.push("Start date error")
        }
        if (errors.length > 0) {
            runAllValidations()
            alert("Please fix the errors in your inputs.")
            return null
        }

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
                    const period = parseInt(periodStr.replace(/\D/g, ""), 10)
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
 * Renders the generated schedule into the HTML table.
 */
function displaySchedule(schedule) {
    ui.scheduleTableBody.innerHTML = ""

    if (schedule.length === 0) {
        ui.scheduleTableBody.innerHTML = `<tr><td colspan="12" class="text-center py-4">No schedule generated. Check dates and days off.</td></tr>`
        return
    }

    const getWeekIdentifier = (d) => {
        const newD = new Date(d)
        newD.setHours(0, 0, 0, 0)
        const day = newD.getDay()
        const diff = newD.getDate() - day + (day === 0 ? -6 : 1)
        return new Date(newD.setDate(diff)).toDateString()
    }

    let currentWeekIdentifier = getWeekIdentifier(schedule[0].date)
    let fourWeekBoundary = new Date(schedule[0].date.getTime())
    fourWeekBoundary.setDate(fourWeekBoundary.getDate() + 28)

    schedule.forEach((entry, index) => {
        const entryWeekIdentifier = getWeekIdentifier(entry.date)
        if (entryWeekIdentifier !== currentWeekIdentifier) {
            const spacerRow = document.createElement("tr")
            spacerRow.className = "bg-gray-200 weekly-spacer"
            spacerRow.innerHTML = `<td colspan="12" class="py-1"></td>`
            ui.scheduleTableBody.appendChild(spacerRow)
            currentWeekIdentifier = entryWeekIdentifier
        }

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
                    ? "text-red-600"
                    : "text-gray-800"
                rowHTML += `<td class="px-2 py-3 whitespace-nowrap text-sm text-gray-500">${entry.lessons[i].period}</td><td class="px-2 py-3 whitespace-nowrap text-sm ${groupClass} font-semibold">${entry.lessons[i].group}</td>`
            } else {
                rowHTML +=
                    '<td class="px-2 py-3"></td><td class="px-2 py-3"></td>'
            }
        }
        row.innerHTML = rowHTML
        ui.scheduleTableBody.appendChild(row)

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
                ui.scheduleTableBody.appendChild(cycleSpacerRow)
                fourWeekBoundary.setDate(fourWeekBoundary.getDate() + 28)
            }
        }
    })
}

/**
 * Converts the content of the HTML schedule table into a CSV formatted string.
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
        if (row.classList.contains("weekly-spacer")) return
        if (row.classList.contains("cycle-spacer")) {
            csv.push("")
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

/**
 * The main entry point for the application. Caches DOM elements and attaches event listeners.
 */
function initialize() {
    // --- Cache all DOM elements into the ui object ---
    ui.form = document.getElementById("schedule-form")
    ui.generateBtn = document.getElementById("generate-btn")
    ui.saveCsvBtn = document.getElementById("save-csv-btn")
    ui.addDayOffBtn = document.getElementById("add-day-off")
    ui.historyCheckbox = document.getElementById("history-checkbox")
    ui.historyContainer = document.getElementById("history-container")
    ui.historyTextarea = document.getElementById("history-data")
    ui.validationBox = document.getElementById("history-validation-box")
    ui.startDateInput = document.getElementById("start-date")
    ui.daysOffContainer = document.getElementById("days-off-container")
    ui.startDayWarning = document.getElementById("start-day-warning")
    ui.scheduleGapWarning = document.getElementById("schedule-gap-warning")
    ui.loadingIndicator = document.getElementById("loading-indicator")
    ui.scheduleOutput = document.getElementById("schedule-output")
    ui.scheduleTableBody = document.querySelector("#schedule-table tbody")
    ui.dayOffTemplate = document.getElementById("day-off-template")

    // --- Attach Event Listeners ---
    ui.form.addEventListener("submit", (e) => {
        e.preventDefault()
        runScheduler()
    })
    ui.saveCsvBtn.addEventListener("click", () => {
        exportTableToCSV("musical-lesson-schedule.csv")
    })
    ui.startDateInput.addEventListener("change", () => {
        checkStartDateWarning()
        runAllValidations()
    })
    ui.historyTextarea.addEventListener("input", runAllValidations)
    ui.historyCheckbox.addEventListener("change", () => {
        ui.historyContainer.classList.toggle(
            "hidden",
            !ui.historyCheckbox.checked
        )
        runAllValidations()
    })
    ui.addDayOffBtn.addEventListener("click", () => {
        const newDayOff = ui.dayOffTemplate.content.cloneNode(true)
        ui.daysOffContainer.appendChild(newDayOff)
    })
    ui.daysOffContainer.addEventListener("click", (e) => {
        if (e.target.classList.contains("remove-day-off")) {
            e.target.parentElement.remove()
        }
    })

    // --- Initial Page Setup ---
    const today = new Date()
    ui.startDateInput.value = `${today.getFullYear()}-${String(
        today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

    checkStartDateWarning()
    runAllValidations()
}

// --- Application Entry Point ---
document.addEventListener("DOMContentLoaded", initialize)
