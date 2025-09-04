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
            alert("Please fill in all required fields for the new schedule.")
            return null
        }

        let scheduleHistory = null
        if (historyCheckbox.checked) {
            const historyGroups = document
                .getElementById("history-groups")
                .value.trim()
                .split(/\s+/)
                .filter(Boolean)
            const historyStartDate =
                document.getElementById("history-start-date").value
            const historyDayCycle = parseInt(
                document.getElementById("history-day-cycle").value,
                10
            )

            if (historyGroups.length !== 22) {
                alert(
                    `Schedule history requires exactly 22 group names separated by spaces. You provided ${historyGroups.length}.`
                )
                return null
            }
            if (!historyStartDate || isNaN(historyDayCycle)) {
                alert(
                    "Please provide a valid start date and day cycle for the schedule history."
                )
                return null
            }

            scheduleHistory = {
                groups: historyGroups,
                startDate: historyStartDate,
                startCycle: historyDayCycle,
            }
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
