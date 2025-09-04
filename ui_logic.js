// --- UI Logic and Event Handling ---

let lastScheduleParams = {}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("schedule-form")
    const generateBtn = document.getElementById("generate-btn")
    const rerollBtn = document.getElementById("reroll-btn")
    const saveCsvBtn = document.getElementById("save-csv-btn")
    const addDayOffBtn = document.getElementById("add-day-off")
    const historyCheckbox = document.getElementById("history-checkbox")
    const historyContainer = document.getElementById("history-container")
    const historyTextarea = document.getElementById("history-data")
    const validationBox = document.getElementById("history-validation-box")

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

    historyCheckbox.addEventListener("change", () => {
        historyContainer.classList.toggle("hidden", !historyCheckbox.checked)
        // Trigger validation when showing the box for the first time
        if (historyCheckbox.checked) {
            handleHistoryValidation()
        } else {
            validationBox.classList.add("hidden")
        }
    })

    // --- Live Validation Event Listener ---
    historyTextarea.addEventListener("input", handleHistoryValidation)

    function handleHistoryValidation() {
        const text = historyTextarea.value
        const { errors, uniqueGroupCount } = validateHistory(text)

        if (text.trim() === "") {
            validationBox.classList.add("hidden")
            return
        }

        validationBox.classList.remove("hidden")
        if (errors.length > 0) {
            validationBox.innerHTML = `<ul>${errors
                .map((e) => `<li>- ${e}</li>`)
                .join("")}</ul>`
            validationBox.className =
                "mt-2 p-3 rounded-md text-sm bg-red-50 text-red-700"
        } else {
            validationBox.innerHTML = `✅ All checks pass. Found ${uniqueGroupCount} of 22 required unique groups.`
            validationBox.className =
                "mt-2 p-3 rounded-md text-sm bg-green-50 text-green-800"
        }
    }

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
            const { startDate, dayCycle, daysOff, weeks, scheduleHistory } =
                lastScheduleParams
            const scheduleBuilder = new ScheduleBuilder(
                startDate,
                dayCycle,
                daysOff,
                weeks,
                scheduleHistory
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
                generateBtn.disabled = false
            }
        }, 250)
    }

    function validateHistory(text) {
        const errors = []
        const lines = text.split("\n")
        const uniqueGroups = new Set()
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line === "") continue

            const parts = line.split(",")
            if (parts.length !== 3) {
                errors.push(
                    `<b>Line ${
                        i + 1
                    }:</b> Invalid format. Expected Date,Period,Group.`
                )
                continue // Can't validate other parts if format is wrong
            }

            const [date, periodStr, group] = parts.map((p) => p.trim())
            const period = parseInt(periodStr, 10)

            if (!dateRegex.test(date)) {
                errors.push(
                    `<b>Line ${
                        i + 1
                    }:</b> Invalid date format for '${date}'. Expected YYYY-MM-DD.`
                )
            }
            if (isNaN(period)) {
                errors.push(
                    `<b>Line ${
                        i + 1
                    }:</b> Period '${periodStr}' is not a valid number.`
                )
            }
            if (!group) {
                errors.push(`<b>Line ${i + 1}:</b> Group name cannot be empty.`)
            }

            if (group && group.toUpperCase() !== "MU") {
                uniqueGroups.add(group)
            }
        }

        if (uniqueGroups.size !== 22 && text.trim() !== "") {
            errors.push(
                `<b>Overall:</b> Found ${uniqueGroups.size} unique groups. The schedule requires exactly <b>22</b> unique non-MU groups.`
            )
        }
        return { errors, uniqueGroupCount: uniqueGroups.size }
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
            alert("Please fill in all required fields for the new schedule.")
            return null
        }

        let scheduleHistory = null
        if (historyCheckbox.checked) {
            const historyText = document
                .getElementById("history-data")
                .value.trim()

            // Submission-time validation
            const { errors } = validateHistory(historyText)
            if (errors.length > 0) {
                alert(
                    "There are errors in your history data. Please fix them before generating a schedule:\n\n- " +
                        errors.join("\n- ").replace(/<b>|<\/b>/g, "")
                )
                return null
            }
            if (!historyText) {
                alert(
                    "Please paste the schedule history data when the checkbox is selected."
                )
                return null
            }

            const parsedHistory = []
            const lines = historyText.split("\n")

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim()
                if (line === "") continue

                const parts = line.split(",")
                const [date, periodStr, group] = parts.map((p) => p.trim())
                const period = parseInt(periodStr, 10)
                parsedHistory.push({ date, period, group })
            }
            scheduleHistory = parsedHistory
        }

        return { startDate, dayCycle, daysOff, weeks, scheduleHistory }
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
