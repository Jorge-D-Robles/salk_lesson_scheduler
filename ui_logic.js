/**
 * @file Manages all UI interactions for the Music Lesson Scheduler.
 * This script is responsible for caching DOM elements, handling user input,
 * validating data, triggering the scheduler, and rendering the results.
 */

// --- Global UI Element Cache ---
/**
 * An object to hold references to all DOM elements used by the script,
 * populated once the DOM is loaded.
 * @type {Object}
 */
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
    endDateInput: null,
    weeksInput: null,
    importCsvInput: null,
    daysOffContainer: null,
    startDayWarning: null,
    scheduleGapWarning: null,
    loadingIndicator: null,
    scheduleOutput: null,
    scheduleTableBody: null,
    dayOffTemplate: null,
    signInBtn: null,
    signOutBtn: null,
    userProfile: null,
    userAvatar: null,
    userName: null,
    saveDriveBtn: null,
    loadDriveBtn: null,
    toastContainer: null,
    undoBtn: null,
    clearDaysOffBtn: null,
    loadingProgressText: null,
    scheduleSummary: null,
    holidaysSection: null,
    saveHolidaysBtn: null,
    loadHolidaysSelect: null,
    deleteHolidayBtn: null,
}

// Holds the most recently displayed schedule for Drive persistence
let currentSchedule = null
let currentScheduleParams = null
let scheduleModified = false
let activePopover = null

// Drag-and-drop state
let dragState = null
let activeSwapWarning = null
let lastHoveredCell = null
let activeSwapToast = null
let undoStack = []
let activeIssueTooltip = null
let highlightedGroup = null
let touchSwapState = null
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
let collapsedWeeks = new Set()

// --- Function Definitions ---

function getGroupColor(groupName) {
    const index = SCHEDULE_CONFIG.DEFAULT_GROUP_NAMES.indexOf(groupName)
    if (index === -1) return ''
    const hue = Math.round(index * (360 / SCHEDULE_CONFIG.REQUIRED_UNIQUE_GROUPS))
    const isDark = document.documentElement.classList.contains('dark')
    return isDark ? `hsl(${hue}, 60%, 25%)` : `hsl(${hue}, 85%, 92%)`
}

function getGroupPrintColor(groupName) {
    const family = SCHEDULE_CONFIG.INSTRUMENT_FAMILIES[groupName]
    if (!family) return { bg: '#f3f4f6', border: '#9ca3af' }
    return SCHEDULE_CONFIG.FAMILY_PRINT_COLORS[family] || SCHEDULE_CONFIG.FAMILY_PRINT_COLORS.other
}

function preparePrintHeader() {
    const dateRange = document.getElementById('print-date-range')
    const legend = document.getElementById('print-family-legend')
    const printContainer = document.getElementById('print-table-container')
    if (!dateRange || !legend || !printContainer || !currentSchedule || currentSchedule.length === 0) return

    // Populate date range
    const fmt = { month: 'long', day: 'numeric', year: 'numeric' }
    const first = currentSchedule[0].date.toLocaleDateString(undefined, fmt)
    const last = currentSchedule[currentSchedule.length - 1].date.toLocaleDateString(undefined, fmt)
    dateRange.textContent = `${first} \u2013 ${last}`

    // Build family legend from groups actually in the schedule
    const familiesUsed = new Map()
    for (const entry of currentSchedule) {
        for (const lesson of entry.lessons) {
            const family = SCHEDULE_CONFIG.INSTRUMENT_FAMILIES[lesson.group]
            if (family && !familiesUsed.has(family)) {
                familiesUsed.set(family, SCHEDULE_CONFIG.FAMILY_PRINT_COLORS[family])
            }
        }
    }
    legend.innerHTML = ''
    for (const [name, colors] of familiesUsed) {
        if (!colors) continue
        const swatch = document.createElement('span')
        swatch.style.cssText = `display: inline-flex; align-items: center; gap: 0.25rem;`
        swatch.innerHTML = `<span style="display: inline-block; width: 12px; height: 12px; background: ${colors.bg}; border-left: 3px solid ${colors.border}; border-radius: 2px;"></span>${name.charAt(0).toUpperCase() + name.slice(1)}`
        legend.appendChild(swatch)
    }

    // Build print table — columns: Date | Day | one col per unique period
    const allPeriods = [...new Set([...SCHEDULE_CONFIG.DAY1_PERIODS, ...SCHEDULE_CONFIG.DAY2_PERIODS])].sort((a, b) => a - b)

    // Group entries by month
    const months = []
    let currentMonth = null
    for (const entry of currentSchedule) {
        const monthKey = `${entry.date.getFullYear()}-${entry.date.getMonth()}`
        if (monthKey !== currentMonth) {
            months.push({ label: entry.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), entries: [] })
            currentMonth = monthKey
        }
        months[months.length - 1].entries.push(entry)
    }

    // Build HTML
    let html = ''
    const headerRow = `<thead><tr><th>Date</th><th>Day</th>${allPeriods.map(p => `<th>Pd ${p}</th>`).join('')}</tr></thead>`

    months.forEach((month, mi) => {
        const pageBreak = mi > 0 ? ' print-month-break' : ''
        html += `<div class="print-month-header${pageBreak}">${month.label}</div>`
        html += `<table class="print-table">${headerRow}<tbody>`
        for (const entry of month.entries) {
            const dateStr = entry.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            // Build period -> group lookup for this day
            const periodMap = {}
            for (const lesson of entry.lessons) {
                const pNum = parseInt(lesson.period.replace(SCHEDULE_CONFIG.PERIOD_PREFIX, ''), 10)
                periodMap[pNum] = lesson.group
            }
            // Which periods are available on this day type
            const dayPeriods = entry.dayCycle === 1 ? SCHEDULE_CONFIG.DAY1_PERIODS : SCHEDULE_CONFIG.DAY2_PERIODS

            let cells = ''
            for (const p of allPeriods) {
                const group = periodMap[p]
                if (group) {
                    const isMU = group.startsWith(SCHEDULE_CONFIG.MU_TOKEN)
                    const printColor = isMU ? null : getGroupPrintColor(group)
                    const style = printColor ? ` style="--print-bg: ${printColor.bg}; --print-border: ${printColor.border}"` : ''
                    const cls = isMU ? 'print-mu-cell' : 'print-group-cell'
                    cells += `<td class="${cls}"${style}>${group}</td>`
                } else if (!dayPeriods.includes(p)) {
                    // Period doesn't exist on this day type
                    cells += `<td style="background: #f9fafb;"></td>`
                } else {
                    cells += `<td></td>`
                }
            }
            html += `<tr><td>${dateStr}</td><td>${entry.dayCycle}</td>${cells}</tr>`
        }
        html += `</tbody></table>`
    })

    printContainer.innerHTML = html
}

function hideEmptyState() {
    const el = document.getElementById('empty-state')
    if (el) el.classList.add('hidden')
}

function showEmptyState() {
    const el = document.getElementById('empty-state')
    if (el && (!currentSchedule || currentSchedule.length === 0)) {
        el.classList.remove('hidden')
    }
}

// --- Group Highlighting (Feature 7) ---
function toggleGroupHighlight(groupName) {
    if (highlightedGroup === groupName) {
        clearGroupHighlight()
        return
    }
    highlightedGroup = groupName
    const cells = ui.scheduleTableBody.querySelectorAll('.lesson-group-cell')
    cells.forEach(cell => {
        if (cell.dataset.group === groupName) {
            cell.classList.add('group-highlighted')
            cell.classList.remove('group-dimmed')
        } else {
            cell.classList.add('group-dimmed')
            cell.classList.remove('group-highlighted')
        }
    })
    // Dim spacer rows
    ui.scheduleTableBody.querySelectorAll('.weekly-spacer, .cycle-spacer').forEach(row => {
        row.classList.add('row-dimmed')
    })
    const banner = document.getElementById('group-highlight-banner')
    const nameSpan = document.getElementById('highlight-group-name')
    if (banner && nameSpan) {
        nameSpan.textContent = groupName
        banner.classList.remove('hidden')
    }
}

function clearGroupHighlight() {
    highlightedGroup = null
    ui.scheduleTableBody.querySelectorAll('.group-highlighted, .group-dimmed').forEach(el => {
        el.classList.remove('group-highlighted', 'group-dimmed')
    })
    ui.scheduleTableBody.querySelectorAll('.row-dimmed').forEach(el => {
        el.classList.remove('row-dimmed')
    })
    const banner = document.getElementById('group-highlight-banner')
    if (banner) banner.classList.add('hidden')
}

// --- Touch Swap (Feature 10) ---
function handleTouchSelect(cell) {
    const dayIndex = parseInt(cell.dataset.dayIndex, 10)
    const lessonIndex = parseInt(cell.dataset.lessonIndex, 10)
    const group = cell.dataset.group
    const dayCycle = currentSchedule[dayIndex].dayCycle

    if (!touchSwapState) {
        // First selection
        touchSwapState = { dayIndex, lessonIndex, group, dayCycle, cell }
        cell.classList.add('touch-selected')
        // Highlight compatible cells (same day cycle)
        ui.scheduleTableBody.querySelectorAll('.lesson-group-cell').forEach(c => {
            if (c === cell) return
            const ci = parseInt(c.dataset.dayIndex, 10)
            if (currentSchedule[ci].dayCycle === dayCycle) {
                c.classList.add('touch-compatible')
            }
        })
        return
    }

    if (touchSwapState.cell === cell) {
        // Same cell tapped again — cancel
        clearTouchSelection()
        return
    }

    // Second selection — attempt swap
    const targetDayCycle = currentSchedule[dayIndex].dayCycle
    if (targetDayCycle !== touchSwapState.dayCycle) {
        showToast('Can only swap within the same day cycle', 'error')
        clearTouchSelection()
        return
    }

    const violations = checkSwapViolations(touchSwapState.dayIndex, touchSwapState.lessonIndex, dayIndex, lessonIndex)
    if (violations.length > 0) {
        const msgs = violations.map(v => {
            if (v.type === 'weekly') return `${v.group} already scheduled this week (${v.conflictDate})`
            if (v.type === 'mu') return `Would create 2+ MU slots on ${v.conflictDate}`
            return ''
        }).join('; ')
        showToast(`Warning: ${msgs}. Tap again to swap anyway.`, 'info', {
            label: 'Swap anyway',
            callback: () => {
                executeGroupSwap(touchSwapState.dayIndex, touchSwapState.lessonIndex, dayIndex, lessonIndex)
                clearTouchSelection()
            }
        })
        clearTouchSelection()
        return
    }

    executeGroupSwap(touchSwapState.dayIndex, touchSwapState.lessonIndex, dayIndex, lessonIndex)
    clearTouchSelection()
}

function clearTouchSelection() {
    ui.scheduleTableBody.querySelectorAll('.touch-selected, .touch-compatible').forEach(el => {
        el.classList.remove('touch-selected', 'touch-compatible')
    })
    touchSwapState = null
}

// --- Jump to Group (Feature 8) ---
function populateJumpToGroup(schedule) {
    const select = document.getElementById('jump-to-group')
    if (!select) return
    const groups = new Set()
    for (const entry of schedule) {
        for (const lesson of entry.lessons) {
            if (lesson.group !== SCHEDULE_CONFIG.MU_TOKEN) groups.add(lesson.group)
        }
    }
    select.innerHTML = '<option value="">Jump to group...</option>'
    const sorted = [...groups].sort()
    for (const g of sorted) {
        const opt = document.createElement('option')
        opt.value = g
        opt.textContent = g
        select.appendChild(opt)
    }
}

// --- Group Color Legend (Feature 4) ---
function populateGroupColorLegend(schedule) {
    const legend = document.getElementById('group-color-legend')
    if (!legend) return
    const groups = new Set()
    for (const entry of schedule) {
        for (const lesson of entry.lessons) {
            if (lesson.group !== SCHEDULE_CONFIG.MU_TOKEN) groups.add(lesson.group)
        }
    }
    legend.innerHTML = ''
    const sorted = [...groups].sort()
    for (const g of sorted) {
        const span = document.createElement('span')
        span.className = 'inline-flex items-center px-1.5 py-0.5 rounded font-medium'
        span.style.backgroundColor = getGroupColor(g)
        span.textContent = g
        legend.appendChild(span)
    }
    legend.classList.remove('hidden')
}

/**
 * Shows a temporary toast notification.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'} [type='success'] - The toast type.
 */
function showToast(message, type = 'success', action = null) {
    if (!ui.toastContainer) return
    if (action && activeSwapToast) {
        activeSwapToast.remove()
        activeSwapToast = null
    }
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    toast.style.display = 'flex'
    toast.style.alignItems = 'center'
    const msgSpan = document.createElement('span')
    msgSpan.textContent = message
    toast.appendChild(msgSpan)
    if (action) {
        const btn = document.createElement('button')
        btn.className = 'toast-action-btn'
        btn.textContent = action.label
        btn.addEventListener('click', () => { activeSwapToast = null; toast.remove(); action.callback() })
        toast.appendChild(btn)
        const closeBtn = document.createElement('button')
        closeBtn.className = 'toast-close-btn'
        closeBtn.innerHTML = '&times;'
        closeBtn.addEventListener('click', () => {
            activeSwapToast = null
            toast.style.opacity = '0'
            toast.style.transition = 'opacity 0.3s'
            setTimeout(() => toast.remove(), 300)
        })
        toast.appendChild(closeBtn)
        activeSwapToast = toast
    } else {
        setTimeout(() => {
            toast.style.opacity = '0'
            toast.style.transition = 'opacity 0.3s'
            setTimeout(() => toast.remove(), 300)
        }, 3000)
    }
    ui.toastContainer.appendChild(toast)
}

function showLoading() {
    ui.loadingIndicator.classList.remove("hidden")
    ui.loadingIndicator.style.display = "flex"
    ui.scheduleOutput.classList.add("hidden")
    if (ui.loadingProgressText) ui.loadingProgressText.textContent = "Generating schedule..."
}

function updateLoadingProgress(data) {
    if (!ui.loadingProgressText) return
    const pct = Math.round((data.trial / data.totalTrials) * 100)
    ui.loadingProgressText.textContent = `Trial ${data.trial}/${data.totalTrials} (${pct}%) — best score: ${data.bestScore}`
}

function displayScheduleSummary(schedule, cellIssues) {
    if (!ui.scheduleSummary || !schedule || schedule.length === 0) return
    const counts = {}
    for (const day of schedule) {
        for (const lesson of day.lessons) {
            if (lesson.group === SCHEDULE_CONFIG.MU_TOKEN) continue
            counts[lesson.group] = (counts[lesson.group] || 0) + 1
        }
    }
    const vals = Object.values(counts)
    const minCount = Math.min(...vals)
    const maxCount = Math.max(...vals)
    const endSpread = maxCount - minCount

    // Running balance: max spread at any day boundary (include 0-count groups)
    const allGroups = Object.keys(counts)
    const running = {}
    let maxRunSpread = 0
    for (const day of schedule) {
        for (const lesson of day.lessons) {
            if (lesson.group === SCHEDULE_CONFIG.MU_TOKEN) continue
            running[lesson.group] = (running[lesson.group] || 0) + 1
        }
        const rVals = []
        for (const g of allGroups) rVals.push(running[g] || 0)
        if (rVals.length > 0) {
            const spread = Math.max(...rVals) - Math.min(...rVals)
            if (spread > maxRunSpread) maxRunSpread = spread
        }
    }

    const summaryContent = document.getElementById('summary-content')
    if (!summaryContent) return
    summaryContent.innerHTML = `
        <div class="text-center">
            <div class="text-2xl font-bold text-indigo-700 dark:text-indigo-400">${schedule.length}</div>
            <div class="text-gray-600 dark:text-gray-400">Total Days</div>
        </div>
        <div class="text-center">
            <div class="text-2xl font-bold text-indigo-700 dark:text-indigo-400">${endSpread}</div>
            <div class="text-gray-600 dark:text-gray-400">End Balance Spread</div>
        </div>
        <div class="text-center">
            <div class="text-2xl font-bold ${maxRunSpread <= 1 ? 'text-green-600' : 'text-amber-600'}">${maxRunSpread}</div>
            <div class="text-gray-600 dark:text-gray-400">Max Running Spread</div>
        </div>
        <div class="text-center">
            <div class="text-2xl font-bold text-indigo-700 dark:text-indigo-400">${minCount}–${maxCount}</div>
            <div class="text-gray-600 dark:text-gray-400">Lessons/Group</div>
        </div>
    `

    // Build violations section from cellIssues
    let violationsHTML = ''
    if (cellIssues && cellIssues.size > 0) {
        // Aggregate by violation type and collect affected day indices
        const periodDays = new Set()
        const weeklyDays = new Set()
        const balanceDays = new Set()
        for (const [key, msgs] of cellIssues) {
            const dayIdx = parseInt(key.split('-')[0], 10)
            for (const msg of msgs) {
                if (msg.startsWith(`${SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR}-day`)) periodDays.add(dayIdx)
                else if (msg.startsWith('Weekly')) weeklyDays.add(dayIdx)
                else if (msg.startsWith('Running')) balanceDays.add(dayIdx)
            }
        }

        const makeDayLinks = (dayIndices) => {
            const sorted = [...dayIndices].sort((a, b) => a - b)
            return sorted.map(idx => {
                const d = schedule[idx].date
                const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                return `<a href="#" class="violation-day-link text-blue-600 hover:text-blue-800 underline" data-day-index="${idx}">${label}</a>`
            }).join(', ')
        }

        const lines = []
        if (periodDays.size > 0) {
            lines.push(`<div class="flex items-start gap-2"><span class="text-red-600 font-semibold whitespace-nowrap">${SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR}-day conflicts: ${periodDays.size}</span><span class="text-gray-600">— ${makeDayLinks(periodDays)}</span></div>`)
        }
        if (weeklyDays.size > 0) {
            lines.push(`<div class="flex items-start gap-2"><span class="text-red-600 font-semibold whitespace-nowrap">Weekly duplicates: ${weeklyDays.size}</span><span class="text-gray-600">— ${makeDayLinks(weeklyDays)}</span></div>`)
        }
        if (balanceDays.size > 0) {
            lines.push(`<div class="flex items-start gap-2"><span class="text-amber-600 font-semibold whitespace-nowrap">Balance issues: ${balanceDays.size}</span><span class="text-gray-600">— ${makeDayLinks(balanceDays)}</span></div>`)
        }

        violationsHTML = `
            <div id="summary-violations" class="mt-3 pt-3 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 rounded-md p-3 text-sm">
                <div class="font-semibold text-red-700 dark:text-red-400 mb-1">Violations</div>
                ${lines.join('\n')}
            </div>`
    } else {
        violationsHTML = `
            <div id="summary-violations" class="mt-3 pt-3 border-t border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 rounded-md p-3 text-sm">
                <span class="font-semibold text-green-700 dark:text-green-400">No violations</span>
            </div>`
    }

    // Remove old violations section if present, then append new one
    const oldViolations = ui.scheduleSummary.querySelector('#summary-violations')
    if (oldViolations) oldViolations.remove()
    summaryContent.insertAdjacentHTML('afterend', violationsHTML)

    // Attach click handlers for violation day links
    const links = ui.scheduleSummary.querySelectorAll('.violation-day-link')
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault()
            const dayIdx = parseInt(link.dataset.dayIndex, 10)
            const row = document.getElementById(`schedule-row-${dayIdx}`)
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' })
                row.style.transition = 'background-color 0.3s'
                row.style.backgroundColor = '#fef3c7'
                setTimeout(() => {
                    row.style.backgroundColor = ''
                }, 1500)
            }
        })
    })

    ui.scheduleSummary.classList.remove('hidden')
}

function hideLoading() {
    ui.loadingIndicator.classList.add("hidden")
    ui.loadingIndicator.style.display = ""
}

// --- Web Worker for heavy schedule computation ---
let schedulerWorker = null
let workerRequestId = 0
const pendingWorkerRequests = new Map()

function getSchedulerWorker() {
    if (!schedulerWorker) {
        schedulerWorker = new Worker('scheduler_worker.js')
        schedulerWorker.onmessage = function (e) {
            if (e.data.type === 'progress') {
                updateLoadingProgress(e.data.data)
                return
            }
            const { id, result, error } = e.data
            const pending = pendingWorkerRequests.get(id)
            if (!pending) return
            pendingWorkerRequests.delete(id)
            if (error) {
                pending.reject(new Error(error))
            } else {
                pending.resolve(result)
            }
        }
        schedulerWorker.onerror = function (e) {
            // Reject all pending requests on unrecoverable worker error
            for (const [id, pending] of pendingWorkerRequests) {
                pending.reject(new Error(e.message || 'Worker error'))
            }
            pendingWorkerRequests.clear()
        }
    }
    return schedulerWorker
}

function postToWorker(type, payload) {
    return new Promise((resolve, reject) => {
        const id = ++workerRequestId
        pendingWorkerRequests.set(id, { resolve, reject })
        getSchedulerWorker().postMessage({ id, type, payload })
    })
}

function toLocalDateString(d) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

function serializeScheduleForWorker(schedule) {
    return schedule.map(entry => ({
        date: toLocalDateString(entry.date),
        dayCycle: entry.dayCycle,
        lessons: entry.lessons.map(l => ({ period: l.period, group: l.group })),
    }))
}

function serializeParamsForWorker(params) {
    return {
        originalEndDate: toLocalDateString(params.originalEndDate),
        daysOff: params.daysOff || [],
    }
}

function rehydrateSchedule(data) {
    return data.map(item => {
        const parts = item.date.split('-')
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        const entry = new ScheduleEntry(date, item.dayCycle)
        for (const lesson of item.lessons) {
            const periodNum = parseInt(lesson.period.replace(/\D/g, ''), 10)
            if (!isNaN(periodNum)) {
                entry.addLesson(periodNum, lesson.group)
            }
        }
        return entry
    })
}

function dismissPopover() {
    if (activePopover) {
        activePopover.remove()
        activePopover = null
        document.removeEventListener('click', dismissPopoverOutside)
    }
}

function dismissPopoverOutside(e) {
    if (activePopover && !activePopover.contains(e.target)) {
        dismissPopover()
    }
}

function showDayActionPopover(button, dayIndex) {
    dismissPopover()
    const rect = button.getBoundingClientRect()
    const popover = document.createElement('div')
    popover.className = 'day-action-popover'
    popover.innerHTML = `
        <button data-action="skip">Skip this day</button>
        <button data-action="recalculate">Skip and rebuild from next day</button>
    `
    popover.style.top = `${rect.bottom + 4}px`
    popover.style.left = `${rect.left}px`

    popover.addEventListener('click', (e) => {
        const action = e.target.dataset.action
        if (action) {
            handleDayAction(dayIndex, action)
            dismissPopover()
        }
    })

    document.body.appendChild(popover)
    activePopover = popover
    setTimeout(() => document.addEventListener('click', dismissPopoverOutside), 0)
}

function handleDayAction(dayIndex, action) {
    pushUndo()
    if (action === 'skip') {
        currentSchedule = skipDay(currentSchedule, dayIndex)
        displaySchedule(currentSchedule)
        ui.scheduleOutput.classList.remove('hidden')
        scheduleModified = true
        updateSaveButtonUnsaved(true)
        showToast('Schedule modified. Save to Drive to keep changes.', 'info')
    } else if (action === 'recalculate') {
        if (!currentScheduleParams) {
            showToast('Cannot recalculate: original parameters not available.', 'error')
            return
        }
        showLoading()
        postToWorker('recalculateFromDay', {
            schedule: serializeScheduleForWorker(currentSchedule),
            dayIndex,
            params: serializeParamsForWorker(currentScheduleParams),
        })
            .then(result => {
                const schedule = rehydrateSchedule(result.schedule)
                schedule.achievedDayRule = result.achievedDayRule
                currentSchedule = schedule
                displaySchedule(currentSchedule)
                ui.scheduleOutput.classList.remove('hidden')
                scheduleModified = true
                updateSaveButtonUnsaved(true)
                showToast('Schedule modified. Save to Drive to keep changes.', 'info')
            })
            .catch(error => {
                console.error('Error recalculating schedule:', error)
                showToast(`Recalculation failed: ${error.message}`, 'error')
            })
            .finally(() => {
                hideLoading()
            })
    }
}

function updateSaveButtonUnsaved(unsaved) {
    if (!ui.saveDriveBtn) return
    if (unsaved) {
        ui.saveDriveBtn.innerHTML = 'Save to Drive <span class="unsaved-dot"></span>'
        ui.saveDriveBtn.classList.add('bg-amber-600', 'hover:bg-amber-700')
        ui.saveDriveBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700')
    } else {
        ui.saveDriveBtn.textContent = 'Save to Drive'
        ui.saveDriveBtn.classList.remove('bg-amber-600', 'hover:bg-amber-700')
        ui.saveDriveBtn.classList.add('bg-blue-600', 'hover:bg-blue-700')
    }
}

// --- Drag-and-drop period swapping ---

function getWeekIdentifier(d) {
    const newD = new Date(d)
    newD.setHours(0, 0, 0, 0)
    const day = newD.getDay()
    const diff = newD.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(newD.setDate(diff)).toDateString()
}

function findWeeklyViolations(sourceDayIndex, targetDayIndex, groupA, groupB) {
    if (!currentSchedule || sourceDayIndex === targetDayIndex) return []
    const violations = []
    const pairs = [
        { group: groupA, destIndex: targetDayIndex, fromIndex: sourceDayIndex },
        { group: groupB, destIndex: sourceDayIndex, fromIndex: targetDayIndex },
    ]
    for (const { group, destIndex, fromIndex } of pairs) {
        if (group.startsWith(SCHEDULE_CONFIG.MU_TOKEN)) continue
        const destWeek = getWeekIdentifier(currentSchedule[destIndex].date)
        for (let i = 0; i < currentSchedule.length; i++) {
            if (i === destIndex || i === fromIndex) continue
            if (getWeekIdentifier(currentSchedule[i].date) !== destWeek) continue
            for (const lesson of currentSchedule[i].lessons) {
                if (lesson.group === group) {
                    const conflictDate = currentSchedule[i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    violations.push({ type: 'weekly', group, conflictDate })
                    break
                }
            }
        }
    }
    return violations
}

function findMUViolations(dayIndex, lessonIndex, newGroup) {
    if (!newGroup.startsWith(SCHEDULE_CONFIG.MU_TOKEN)) return []
    const entry = currentSchedule[dayIndex]
    let muCount = 0
    for (let i = 0; i < entry.lessons.length; i++) {
        if (i === lessonIndex) continue
        if (entry.lessons[i].group.startsWith(SCHEDULE_CONFIG.MU_TOKEN)) muCount++
    }
    if (muCount >= 1) {
        const conflictDate = entry.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        return [{ type: 'mu', group: newGroup, conflictDate }]
    }
    return []
}

function checkSwapViolations(sourceDayIndex, sourceLessonIndex, targetDayIndex, targetLessonIndex) {
    const sourceEntry = currentSchedule[sourceDayIndex]
    const targetEntry = currentSchedule[targetDayIndex]
    const lessonA = sourceEntry.lessons[sourceLessonIndex]
    const lessonB = targetEntry.lessons[targetLessonIndex]
    // After swap: groupA goes to target period, groupB goes to source period
    const violations = [
        ...findWeeklyViolations(sourceDayIndex, targetDayIndex, lessonA.group, lessonB.group),
        ...findMUViolations(targetDayIndex, targetLessonIndex, lessonA.group),
        ...findMUViolations(sourceDayIndex, sourceLessonIndex, lessonB.group),
    ]
    return violations
}

function executeGroupSwap(sourceDayIndex, sourceLessonIndex, targetDayIndex, targetLessonIndex) {
    pushUndo()
    const sourceEntry = currentSchedule[sourceDayIndex]
    const targetEntry = currentSchedule[targetDayIndex]
    const lessonA = sourceEntry.lessons[sourceLessonIndex]
    const lessonB = targetEntry.lessons[targetLessonIndex]
    const groupA = lessonA.group
    const groupB = lessonB.group
    // Swap groups — periods stay fixed
    lessonA.group = groupB
    lessonB.group = groupA
    displaySchedule(currentSchedule)
    ui.scheduleOutput.classList.remove('hidden')
    scheduleModified = true
    updateSaveButtonUnsaved(true)
    const rebuildDayIndex = Math.min(sourceDayIndex, targetDayIndex)
    showToast(`Swapped ${groupA} \u2194 ${groupB}`, 'info', {
        label: 'Rebuild from here',
        callback: () => {
            if (!currentScheduleParams) {
                showToast('Cannot rebuild: original parameters not available.', 'error')
                return
            }
            pushUndo()
            showLoading()
            postToWorker('recalculateAfterDay', {
                schedule: serializeScheduleForWorker(currentSchedule),
                dayIndex: rebuildDayIndex,
                params: serializeParamsForWorker(currentScheduleParams),
            })
                .then(result => {
                    const schedule = rehydrateSchedule(result.schedule)
                    schedule.achievedDayRule = result.achievedDayRule
                    currentSchedule = schedule
                    displaySchedule(currentSchedule)
                    showToast('Schedule rebuilt from swapped day.', 'info')
                })
                .catch(error => {
                    console.error('Error rebuilding schedule:', error)
                    showToast(`Rebuild failed: ${error.message}`, 'error')
                })
                .finally(() => {
                    hideLoading()
                })
        }
    })
}

function showSwapWarningTooltip(cell, violations) {
    dismissSwapWarning()
    const tooltip = document.createElement('div')
    tooltip.className = 'swap-warning-tooltip'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'swap-warning-close'
    closeBtn.innerHTML = '&times;'
    closeBtn.addEventListener('click', () => dismissSwapWarning())
    tooltip.appendChild(closeBtn)
    let html = violations.map(v => {
        if (v.type === 'weekly') return `<div class="warn-line">${v.group} already scheduled this week (${v.conflictDate})</div>`
        if (v.type === 'mu') return `<div class="warn-line">Would create 2+ MU slots on ${v.conflictDate}</div>`
        return ''
    }).join('')
    html += '<div class="warn-hint">Drop to swap anyway</div>'
    tooltip.insertAdjacentHTML('beforeend', html)
    const rect = cell.getBoundingClientRect()
    tooltip.style.top = `${rect.top - 8}px`
    tooltip.style.left = `${rect.right + 8}px`
    document.body.appendChild(tooltip)
    // Adjust if off-screen right
    const tooltipRect = tooltip.getBoundingClientRect()
    if (tooltipRect.right > window.innerWidth - 8) {
        tooltip.style.left = `${rect.left - tooltipRect.width - 8}px`
    }
    // Adjust if off-screen top
    if (tooltipRect.top < 8) {
        tooltip.style.top = `${rect.bottom + 8}px`
    }
    activeSwapWarning = tooltip
}

function dismissSwapWarning() {
    if (activeSwapWarning) {
        activeSwapWarning.remove()
        activeSwapWarning = null
    }
}

function dismissIssueTooltip() {
    if (activeIssueTooltip) {
        activeIssueTooltip.remove()
        activeIssueTooltip = null
    }
}

function highlightDragRow(activeDayCycle) {
    const rows = ui.scheduleTableBody.querySelectorAll('tr:not(.weekly-spacer):not(.cycle-spacer)')
    rows.forEach(row => {
        const btn = row.querySelector('.day-delete-btn')
        if (!btn) return
        const idx = parseInt(btn.dataset.dayIndex, 10)
        if (currentSchedule[idx].dayCycle === activeDayCycle) {
            row.classList.add('drag-row-active')
        } else {
            row.classList.add('drag-row-inactive')
        }
    })
}

function clearRowHighlighting() {
    ui.scheduleTableBody.querySelectorAll('.drag-row-active, .drag-row-inactive').forEach(row => {
        row.classList.remove('drag-row-active', 'drag-row-inactive')
    })
}

function storeScheduleParams(startDate, weeks, daysOff) {
    const parts = startDate.split('-')
    const endDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    endDate.setDate(endDate.getDate() + weeks * 7)
    currentScheduleParams = { originalEndDate: endDate, daysOff: daysOff || [] }
}

function cloneSchedule(schedule) {
    const clone = schedule.map(entry => {
        const cloned = new ScheduleEntry(new Date(entry.date), entry.dayCycle)
        for (const lesson of entry.lessons) {
            const periodNum = parseInt(lesson.period.replace(/\D/g, ''), 10)
            cloned.addLesson(periodNum, lesson.group)
        }
        return cloned
    })
    if (schedule.achievedDayRule !== undefined) {
        clone.achievedDayRule = schedule.achievedDayRule
    }
    return clone
}

function pushUndo() {
    if (currentSchedule) undoStack.push(cloneSchedule(currentSchedule))
    updateUndoButton()
}

function performUndo() {
    if (undoStack.length === 0) return
    currentSchedule = undoStack.pop()
    displaySchedule(currentSchedule)
    ui.scheduleOutput.classList.remove('hidden')
    updateUndoButton()
    showToast('Undo successful', 'info')
}

function updateUndoButton() {
    if (!ui.undoBtn) return
    ui.undoBtn.classList.toggle('hidden', undoStack.length === 0)
}

function clearUndoStack() {
    undoStack = []
    updateUndoButton()
}

/**
 * Serializes a schedule and form parameters to a JSON-safe object.
 * @param {Array<ScheduleEntry>} schedule
 * @returns {Object}
 */
function scheduleToJSON(schedule) {
    const params = {
        startDate: ui.startDateInput?.value || '',
        dayCycle: document.getElementById('day-cycle')?.value || '',
        weeks: ui.weeksInput?.value || '',
        daysOff: Array.from(document.querySelectorAll('.day-off-input'))
            .map(input => input.value).filter(Boolean),
    }
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        parameters: params,
        schedule: schedule.map(entry => ({
            date: entry.date.toISOString(),
            dayCycle: entry.dayCycle,
            lessons: entry.lessons.map(l => ({ period: l.period, group: l.group })),
        })),
    }
}

/**
 * Deserializes JSON data back to an array of ScheduleEntry objects.
 * @param {Object} data - The parsed JSON data.
 * @returns {Array<ScheduleEntry>}
 */
function jsonToSchedule(data) {
    if (!data || !data.schedule) return []
    return data.schedule.map(item => {
        const date = new Date(item.date)
        const entry = new ScheduleEntry(date, item.dayCycle)
        for (const lesson of item.lessons) {
            const periodNum = parseInt(lesson.period.replace(/\D/g, ''), 10)
            if (!isNaN(periodNum)) {
                entry.addLesson(periodNum, lesson.group)
            }
        }
        return entry
    })
}

/**
 * Restores form parameters from saved JSON data.
 * @param {Object} params - The parameters object from saved data.
 */
function restoreFormParameters(params) {
    if (!params) return
    if (params.startDate) ui.startDateInput.value = params.startDate
    if (params.dayCycle) document.getElementById('day-cycle').value = params.dayCycle
    if (params.weeks) ui.weeksInput.value = params.weeks
}

/**
 * Shows the user's profile in the header and reveals Drive buttons.
 * Called when user is identified (via ID token auto_select or explicit sign-in).
 * @param {Object} profile - { name, picture }
 */
function handleIdentified(profile) {
    if (profile) {
        ui.userAvatar.src = profile.picture || ''
        ui.userName.textContent = profile.name || ''
    }
    ui.signInBtn.classList.add('hidden')
    ui.userProfile.classList.remove('hidden')
    ui.userProfile.classList.add('flex')
    ui.saveDriveBtn.classList.remove('hidden')
    ui.loadDriveBtn.classList.remove('hidden')
    if (ui.holidaysSection) ui.holidaysSection.classList.remove('hidden')
}

/**
 * Called when an access token is acquired. Auto-loads schedule from Drive.
 * @param {string} token
 */
async function handleAccessToken(token) {
    // If profile isn't shown yet (explicit sign-in without ID flow), fetch and show it
    if (ui.signInBtn && !ui.signInBtn.classList.contains('hidden')) {
        let profile = AuthManager.getStoredProfile()
        if (!profile) {
            try {
                const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${token}` },
                })
                if (resp.ok) {
                    const data = await resp.json()
                    profile = { name: data.name || data.email, picture: data.picture || '' }
                }
            } catch (e) {
                console.warn('Could not fetch profile:', e)
            }
        }
        handleIdentified(profile)
    }

    // Auto-load saved schedule
    try {
        const data = await DriveStorage.loadSchedule(token)
        if (data) {
            const schedule = jsonToSchedule(data)
            if (schedule.length > 0) {
                restoreFormParameters(data.parameters)
                displaySchedule(schedule)
                currentSchedule = schedule
                clearUndoStack()
                if (data.parameters && data.parameters.startDate && data.parameters.weeks) {
                    storeScheduleParams(data.parameters.startDate, parseInt(data.parameters.weeks, 10), data.parameters.daysOff || [])
                } else {
                    const lastDate = schedule[schedule.length - 1].date
                    const endD = new Date(lastDate)
                    endD.setDate(endD.getDate() + 14)
                    currentScheduleParams = { originalEndDate: endD, daysOff: [] }
                }
                scheduleModified = false
                updateSaveButtonUnsaved(false)
                hideEmptyState()
                ui.scheduleOutput.classList.remove('hidden')
                showToast('Schedule loaded from Google Drive', 'info')
            }
        }
    } catch (e) {
        if (e.message === 'TOKEN_EXPIRED') {
            // Token from sessionStorage was stale — clear it silently.
            // User can click a Drive button to re-authenticate.
            sessionStorage.removeItem('salk_token')
            console.warn('Stored token expired, cleared.')
        } else {
            console.warn('Could not auto-load from Drive:', e)
        }
    }
    refreshHolidayDropdown()
}

/**
 * Handles sign-out: resets header UI, hides Drive controls.
 */
function handleSignOut() {
    ui.signInBtn.classList.remove('hidden')
    ui.userProfile.classList.add('hidden')
    ui.userProfile.classList.remove('flex')
    ui.saveDriveBtn.classList.add('hidden')
    ui.loadDriveBtn.classList.add('hidden')
    if (ui.holidaysSection) ui.holidaysSection.classList.add('hidden')
    ui.userAvatar.src = ''
    ui.userName.textContent = ''
}

let autoSaveTimer = null

/**
 * Debounced wrapper around autoSaveToDrive — waits 3 seconds of inactivity.
 */
function debouncedAutoSave(schedule) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null
        autoSaveToDrive(schedule)
    }, 3000)
}

/**
 * Saves the current schedule to Google Drive if signed in.
 * @param {Array<ScheduleEntry>} schedule
 */
async function autoSaveToDrive(schedule) {
    if (!schedule || schedule.length === 0) return
    let token = AuthManager.getToken()
    if (!token) return
    try {
        const data = scheduleToJSON(schedule)
        await DriveStorage.saveSchedule(token, data)
        showToast('Schedule saved to Google Drive')
    } catch (e) {
        if (e.message === 'TOKEN_EXPIRED') {
            try {
                token = await AuthManager.refreshToken()
                const data = scheduleToJSON(schedule)
                await DriveStorage.saveSchedule(token, data)
                showToast('Schedule saved to Google Drive')
            } catch (retryErr) {
                showToast('Could not save to Drive. Please sign in again.', 'error')
            }
        } else {
            showToast('Could not save to Drive.', 'error')
            console.error('Drive save error:', e)
        }
    }
}

/**
 * Handles the main form submission event to generate and display the schedule.
 */
function runScheduler() {
    clearUndoStack()
    collapsedWeeks.clear()

    const params = getScheduleParameters()
    if (!params) return // Validation failed, so stop.
    const { startDate, dayCycle, daysOff, weeks, scheduleHistory } = params

    // Snapshot previous schedule for diff view (Feature 12)
    const previousSchedule = currentSchedule ? cloneSchedule(currentSchedule) : null

    showLoading()
    ui.generateBtn.disabled = true

    postToWorker('buildSchedule', { startDate, dayCycle, daysOff, weeks, scheduleHistory })
        .then(result => {
            const schedule = rehydrateSchedule(result.schedule)
            schedule.achievedDayRule = result.achievedDayRule
            displaySchedule(schedule, previousSchedule)
            currentSchedule = schedule
            storeScheduleParams(startDate, weeks, daysOff)
            scheduleModified = false
            updateSaveButtonUnsaved(false)
            hideEmptyState()
            debouncedAutoSave(schedule)
        })
        .catch(error => {
            console.error("Error generating schedule:", error)
            alert(
                `An error occurred: ${error.message}. Please check your inputs.`
            )
        })
        .finally(() => {
            hideLoading()
            ui.scheduleOutput.classList.remove("hidden")
            runAllValidations()
        })
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
    ui.startDayWarning.classList.toggle("hidden", day === 1) // Hidden if it IS a Monday
}

/**
 * Acts as the master validation controller, orchestrating all input checks and UI feedback.
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
        ui.validationBox.innerHTML = `✅ All checks pass. Found ${uniqueGroupCount} of ${SCHEDULE_CONFIG.REQUIRED_UNIQUE_GROUPS} required unique groups.`
        ui.validationBox.className =
            "mt-2 p-3 rounded-md text-sm bg-green-50 text-green-800"
    }
    updateGenerateButtonState(errors)
}

/**
 * Enables or disables the 'Generate Schedule' button based on validation results.
 * @param {string[]|null} [errors=null] - An array of error messages. If empty/null, the button is enabled.
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
 * Parses a single line of text from the history textarea, handling both TSV and CSV formats.
 * @param {string} line - The line of text to parse.
 * @returns {string[]} An array of column values.
 */
function parseScheduleLine(line) {
    if (line.includes("\t")) {
        return line.split("\t") // Handle spreadsheet (tab-separated) paste
    } else {
        // Handle CSV paste with potential quotes
        const columns = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || []
        return columns.map((col) => col.trim().replace(/^"|"$/g, ""))
    }
}

/**
 * Performs a comprehensive validation of the pasted schedule history text.
 * @param {string} text - The raw text from the history textarea.
 * @returns {{errors: string[], uniqueGroupCount: number, maxDate: Date|null}} An object with validation results.
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
                if (group.toUpperCase() !== SCHEDULE_CONFIG.MU_TOKEN) {
                    uniqueGroups.add(group)
                }
                parsedLessons.push({ date: dateObj, period, group })
            }
        }
    }

    if (uniqueGroups.size !== SCHEDULE_CONFIG.REQUIRED_UNIQUE_GROUPS) {
        errors.push(
            `<b>Overall:</b> Found ${uniqueGroups.size} unique groups. The schedule requires exactly <b>${SCHEDULE_CONFIG.REQUIRED_UNIQUE_GROUPS}</b> unique non-MU groups.`
        )
    }
    if (parsedLessons.length > 0) {
        const uniqueDayStrings = new Set(
            parsedLessons.map((p) => p.date.toDateString())
        )
        const uniqueDayCount = uniqueDayStrings.size
        if (uniqueDayCount < 20) {
            errors.push(
                `<b>Overall:</b> History must contain at least ${SCHEDULE_CONFIG.HISTORY_WEEKS} weeks of lessons (~20 school days). Found ${uniqueDayCount} days.`
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
 * Computes the number of weeks from start date to end date and sets the weeks input value.
 */
function computeWeeksFromEndDate() {
    const startDate = ui.startDateInput.value
    const endDate = ui.endDateInput.value
    if (!startDate || !endDate) return

    const start = new Date(startDate + "T00:00:00")
    const end = new Date(endDate + "T00:00:00")
    if (end <= start) {
        ui.weeksInput.value = ""
        return
    }

    const diffMs = end.getTime() - start.getTime()
    const weeks = Math.min(Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)), 52)
    ui.weeksInput.value = weeks
}

/**
 * Parses CSV text (as exported by Save to CSV) into an array of ScheduleEntry objects.
 * @param {string} csvText - The raw CSV text.
 * @returns {Array<ScheduleEntry>} Parsed schedule entries.
 */
function parseCSVToSchedule(csvText) {
    const lines = csvText.split("\n").filter((line) => line.trim() !== "")
    if (lines.length === 0) return []

    // Detect header row and format
    const hasHeader = lines[0].toLowerCase().includes("date") || lines[0].toLowerCase().includes("period")
    let headerPeriods = null // New format: period numbers from header columns

    if (hasHeader) {
        const headerCols = parseScheduleLine(lines[0])
        // Check if header has "Pd N" columns (new format) vs generic "Period"/"Group" (old format)
        const pdCols = headerCols.map((col, idx) => {
            const m = col.match(/^pd\s*(\d+)$/i)
            return m ? { idx, period: parseInt(m[1], 10) } : null
        }).filter(Boolean)
        if (pdCols.length > 0) {
            headerPeriods = pdCols
        }
    }

    const startIndex = hasHeader ? 1 : 0
    const entries = []
    for (let i = startIndex; i < lines.length; i++) {
        const columns = parseScheduleLine(lines[i])
        const dateStr = columns[0]
        const dateObj = new Date(dateStr)
        if (isNaN(dateObj.getTime())) continue

        const dayCycleStr = columns[1]
        const dayCycle = parseInt(dayCycleStr, 10)
        const entry = new ScheduleEntry(dateObj, isNaN(dayCycle) ? 1 : dayCycle)

        if (headerPeriods) {
            // New format: each column is a period, cell value is the group
            for (const { idx, period } of headerPeriods) {
                const group = columns[idx] ? columns[idx].trim() : ''
                if (group) entry.addLesson(period, group)
            }
        } else {
            // Old format: alternating Pd X, Group pairs
            const firstPeriodIndex = columns.findIndex((col) =>
                col.toLowerCase().startsWith("pd")
            )
            if (firstPeriodIndex === -1) continue
            for (let j = firstPeriodIndex; j < columns.length; j += 2) {
                const periodStr = columns[j]
                const group = columns[j + 1]
                if (!periodStr || !group) continue
                const period = parseInt(periodStr.replace(/\D/g, ""), 10)
                if (!isNaN(period)) {
                    entry.addLesson(period, group)
                }
            }
        }
        entries.push(entry)
    }
    return entries
}

/**
 * Handles the CSV file import: reads the file, parses it, and renders the schedule table.
 * @param {Event} event - The change event from the file input.
 */
function handleCSVImport(event) {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = function (e) {
        const csvText = e.target.result
        const schedule = parseCSVToSchedule(csvText)
        if (schedule.length === 0) {
            alert("No valid schedule data found in the CSV file.")
            ui.importCsvInput.value = ""
            return
        }
        displaySchedule(schedule)
        currentSchedule = schedule
        clearUndoStack()
        const lastDate = schedule[schedule.length - 1].date
        const csvEndDate = new Date(lastDate)
        csvEndDate.setDate(csvEndDate.getDate() + 14)
        currentScheduleParams = {
            originalEndDate: csvEndDate,
            daysOff: Array.from(document.querySelectorAll('.day-off-input')).map(i => i.value).filter(Boolean),
        }
        scheduleModified = false
        updateSaveButtonUnsaved(false)
        hideEmptyState()
        ui.scheduleOutput.classList.remove("hidden")
        ui.importCsvInput.value = ""
        debouncedAutoSave(schedule)
    }
    reader.readAsText(file)
}

/**
 * Gathers all user inputs from the form, validates them, and parses them into a parameter object.
 * @returns {Object|null} An object with all schedule parameters, or null if validation fails.
 */
function getScheduleParameters() {
    const startDate = ui.startDateInput.value
    const dayCycle = parseInt(document.getElementById("day-cycle").value, 10)
    let weeks = parseInt(ui.weeksInput.value, 10)
    const daysOffInputs = document.querySelectorAll(".day-off-input")
    const daysOff = Array.from(daysOffInputs)
        .map((input) => input.value)
        .filter(Boolean)

    if (isNaN(weeks) && ui.endDateInput.value && startDate) {
        const start = new Date(startDate + "T00:00:00")
        const end = new Date(ui.endDateInput.value + "T00:00:00")
        if (end <= start) {
            alert("End date must be after the start date.")
            return null
        }
        weeks = Math.min(
            Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)),
            52
        )
    }

    if (!startDate || isNaN(dayCycle) || isNaN(weeks)) {
        alert("Please fill in all required fields (weeks or end date is needed).")
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
        // Detect and parse header for new period-column format
        let histHeaderPeriods = null
        if (
            lines.length > 0 &&
            (lines[0].toLowerCase().includes("date") ||
                lines[0].toLowerCase().includes("period"))
        ) {
            const headerCols = parseScheduleLine(lines[0])
            const pdCols = headerCols.map((col, idx) => {
                const m = col.match(/^pd\s*(\d+)$/i)
                return m ? { idx, period: parseInt(m[1], 10) } : null
            }).filter(Boolean)
            if (pdCols.length > 0) histHeaderPeriods = pdCols
            lines.shift()
        }
        for (const line of lines) {
            if (line.trim() === "") continue
            const columns = parseScheduleLine(line)
            const dateObj = new Date(columns[0])
            if (isNaN(dateObj.getTime())) continue
            const yyyy = dateObj.getFullYear()
            const mm = String(dateObj.getMonth() + 1).padStart(2, "0")
            const dd = String(dateObj.getDate()).padStart(2, "0")
            const formattedDate = `${yyyy}-${mm}-${dd}`

            if (histHeaderPeriods) {
                // New format: period columns with group values
                for (const { idx, period } of histHeaderPeriods) {
                    const group = columns[idx] ? columns[idx].trim() : ''
                    if (group) {
                        parsedHistory.push({ date: formattedDate, period, group })
                    }
                }
            } else {
                // Old format: alternating Pd X, Group pairs
                const firstPeriodIndex = columns.findIndex((col) =>
                    col.toLowerCase().startsWith("pd")
                )
                if (firstPeriodIndex === -1) continue
                for (let i = firstPeriodIndex; i < columns.length; i += 2) {
                    const periodStr = columns[i]
                    const group = columns[i + 1]
                    if (periodStr && group) {
                        const period = parseInt(periodStr.replace(/\D/g, ""), 10)
                        if (!isNaN(period)) {
                            parsedHistory.push({ date: formattedDate, period, group })
                        }
                    }
                }
            }
        }
        scheduleHistory = parsedHistory
    }
    return { startDate, dayCycle, daysOff, weeks, scheduleHistory }
}

/**
 * Renders the generated schedule into the HTML table, including visual spacers.
 * @param {Array<ScheduleEntry>} schedule - The schedule array from ScheduleBuilder.
 */
function computeCellIssues(schedule) {
    const issues = new Map()
    const addIssue = (dayIdx, lessonIdx, msg) => {
        const key = `${dayIdx}-${lessonIdx}`
        if (!issues.has(key)) issues.set(key, [])
        issues.get(key).push(msg)
    }

    // 1) 28-day period spacing: same group + same period within 28 calendar days
    for (let i = 0; i < schedule.length; i++) {
        const entry = schedule[i]
        for (let li = 0; li < entry.lessons.length; li++) {
            const lesson = entry.lessons[li]
            if (lesson.group === SCHEDULE_CONFIG.MU_TOKEN) continue
            const periodNum = parseInt(lesson.period.replace(/\D/g, ''), 10)
            // Look back for conflicts within 28 calendar days
            for (let j = i - 1; j >= 0; j--) {
                const prev = schedule[j]
                const gap = Math.round((entry.date - prev.date) / SCHEDULE_CONFIG.ONE_DAY_MS)
                if (gap >= SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR) break
                for (let lj = 0; lj < prev.lessons.length; lj++) {
                    const other = prev.lessons[lj]
                    if (other.group === SCHEDULE_CONFIG.MU_TOKEN) continue
                    if (other.group === lesson.group) {
                        const otherPeriod = parseInt(other.period.replace(/\D/g, ''), 10)
                        if (otherPeriod === periodNum) {
                            addIssue(i, li, `${SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR}-day period conflict: ${lesson.group} had Pd ${periodNum} on ${prev.date.toLocaleDateString()} (${gap}d ago)`)
                            addIssue(j, lj, `${SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR}-day period conflict: ${other.group} has Pd ${periodNum} again on ${entry.date.toLocaleDateString()} (${gap}d later)`)
                        }
                    }
                }
            }
        }
    }

    // 2) Weekly uniqueness: same group appearing twice in one calendar week
    const weekMap = new Map() // weekId -> Map<group, [{dayIdx, lessonIdx}]>
    for (let i = 0; i < schedule.length; i++) {
        const entry = schedule[i]
        const weekId = getWeekIdentifier(entry.date)
        if (!weekMap.has(weekId)) weekMap.set(weekId, new Map())
        const gm = weekMap.get(weekId)
        for (let li = 0; li < entry.lessons.length; li++) {
            const group = entry.lessons[li].group
            if (group === SCHEDULE_CONFIG.MU_TOKEN) continue
            if (!gm.has(group)) gm.set(group, [])
            gm.get(group).push({ dayIdx: i, lessonIdx: li })
        }
    }
    for (const [, gm] of weekMap) {
        for (const [group, locs] of gm) {
            if (locs.length > 1) {
                for (const loc of locs) {
                    addIssue(loc.dayIdx, loc.lessonIdx, `Weekly duplicate: ${group} appears ${locs.length}x this week`)
                }
            }
        }
    }

    // 3) Running balance: flag lessons on days where spread > 1
    // Collect all unique non-MU groups so 0-count groups are included in spread
    const allGroups = new Set()
    for (const day of schedule) {
        for (const lesson of day.lessons) {
            if (lesson.group !== SCHEDULE_CONFIG.MU_TOKEN) allGroups.add(lesson.group)
        }
    }
    const running = {}
    for (let i = 0; i < schedule.length; i++) {
        const entry = schedule[i]
        for (let li = 0; li < entry.lessons.length; li++) {
            const group = entry.lessons[li].group
            if (group === SCHEDULE_CONFIG.MU_TOKEN) continue
            running[group] = (running[group] || 0) + 1
        }
        const vals = []
        for (const g of allGroups) vals.push(running[g] || 0)
        if (vals.length > 0) {
            const spread = Math.max(...vals) - Math.min(...vals)
            if (spread > 1) {
                // Mark all lessons on this day
                for (let li = 0; li < entry.lessons.length; li++) {
                    if (entry.lessons[li].group !== SCHEDULE_CONFIG.MU_TOKEN) {
                        addIssue(i, li, `Running balance spread is ${spread} after this day`)
                    }
                }
            }
        }
    }

    return issues
}

function displaySchedule(schedule, previousSchedule = null) {
    ui.scheduleTableBody.innerHTML = ""

    if (schedule.length === 0) {
        ui.scheduleTableBody.innerHTML = `<tr><td colspan="${SCHEDULE_CONFIG.TABLE_COLUMNS}" class="text-center py-4">No schedule generated. Check dates and days off.</td></tr>`
        return
    }

    const cellIssues = computeCellIssues(schedule)

    // Build diff map (Feature 12)
    let diffMap = null
    let diffCount = 0
    if (previousSchedule && previousSchedule.length > 0) {
        diffMap = new Map()
        for (const prevEntry of previousSchedule) {
            const dateStr = toLocalDateString(prevEntry.date)
            for (const lesson of prevEntry.lessons) {
                diffMap.set(`${dateStr}-${lesson.period}`, lesson.group)
            }
        }
    }

    // Track weeks for collapsible feature
    const weekRows = new Map() // weekId -> [row elements]
    let currentWeekId = null

    let currentWeekIdentifier = getWeekIdentifier(schedule[0].date)
    let fourWeekBoundary = new Date(schedule[0].date.getTime())
    fourWeekBoundary.setDate(fourWeekBoundary.getDate() + SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR)

    schedule.forEach((entry, index) => {
        // Sort lessons by period number for display
        entry.lessons.sort((a, b) => parseInt(a.period.replace(SCHEDULE_CONFIG.PERIOD_PREFIX, ""), 10) - parseInt(b.period.replace(SCHEDULE_CONFIG.PERIOD_PREFIX, ""), 10))

        const entryWeekIdentifier = getWeekIdentifier(entry.date)
        if (entryWeekIdentifier !== currentWeekIdentifier) {
            // Count days and lessons in the upcoming week
            let weekDays = 0
            let weekLessons = 0
            for (const e of schedule) {
                if (getWeekIdentifier(e.date) === entryWeekIdentifier) {
                    weekDays++
                    weekLessons += e.lessons.length
                }
            }
            const weekLabel = entry.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            const isCollapsed = collapsedWeeks.has(entryWeekIdentifier)

            const spacerRow = document.createElement("tr")
            spacerRow.className = "bg-gray-200 dark:bg-gray-700 weekly-spacer cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600"
            spacerRow.dataset.weekId = entryWeekIdentifier
            const iconClass = isCollapsed ? 'week-toggle-icon collapsed' : 'week-toggle-icon'
            spacerRow.innerHTML = `<td colspan="${SCHEDULE_CONFIG.TABLE_COLUMNS}" class="py-1 px-2 text-xs text-gray-600 dark:text-gray-300 select-none"><span class="${iconClass}">&#9660;</span>${isCollapsed ? `Week of ${weekLabel} (${weekDays} days, ${weekLessons} lessons)` : ''}</td>`
            ui.scheduleTableBody.appendChild(spacerRow)
            currentWeekIdentifier = entryWeekIdentifier
            currentWeekId = entryWeekIdentifier
        } else if (index === 0) {
            currentWeekId = entryWeekIdentifier
        }

        const isCollapsed = collapsedWeeks.has(entryWeekIdentifier)

        const row = document.createElement("tr")
        row.id = `schedule-row-${index}`
        row.dataset.weekId = entryWeekIdentifier
        if (isCollapsed) row.style.display = 'none'
        const formattedDate = entry.date.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        })

        // Build period number -> lesson index lookup
        const periodToIdx = {}
        for (let i = 0; i < entry.lessons.length; i++) {
            const pNum = parseInt(entry.lessons[i].period.replace(SCHEDULE_CONFIG.PERIOD_PREFIX, ''), 10)
            periodToIdx[pNum] = i
        }
        const dayPeriods = entry.dayCycle === 1 ? SCHEDULE_CONFIG.DAY1_PERIODS : SCHEDULE_CONFIG.DAY2_PERIODS

        let rowHTML = `<td class="px-1 py-3 text-center action-col"><button class="day-delete-btn" data-day-index="${index}" title="Remove this day">&times;</button></td><td class="px-2 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">${formattedDate}</td><td class="px-2 py-3 whitespace-nowrap text-sm text-center text-gray-700 dark:text-gray-300">${entry.dayCycle}</td>`
        for (const p of SCHEDULE_CONFIG.ALL_PERIODS) {
            const lessonIdx = periodToIdx[p]
            if (lessonIdx !== undefined) {
                const lesson = entry.lessons[lessonIdx]
                const isMU = lesson.group.startsWith(SCHEDULE_CONFIG.MU_TOKEN)
                const groupClass = isMU ? "text-red-600" : "text-gray-800 dark:text-gray-200"
                const bgColor = isMU ? '#f3f4f6' : getGroupColor(lesson.group)
                const printColor = isMU ? null : getGroupPrintColor(lesson.group)
                const printVars = printColor ? `; --print-bg: ${printColor.bg}; --print-border: ${printColor.border}` : ''
                const bgStyle = bgColor ? ` style="background-color: ${bgColor}${printVars}"` : (printVars ? ` style="${printVars.slice(2)}"` : '')
                const issues = cellIssues.get(`${index}-${lessonIdx}`)
                const indicator = issues
                    ? `<span class="cell-issue-indicator" data-issues="${issues.join('\n').replace(/"/g, '&quot;')}">&#9888;</span>`
                    : ''
                let diffClass = ''
                if (diffMap) {
                    const dateStr = toLocalDateString(entry.date)
                    const prevGroup = diffMap.get(`${dateStr}-${lesson.period}`)
                    if (prevGroup !== undefined && prevGroup !== lesson.group) {
                        diffClass = ' diff-highlight'
                        diffCount++
                    }
                }
                const draggableAttr = isTouchDevice ? '' : 'draggable="true" '
                rowHTML += `<td ${draggableAttr}class="px-2 py-3 whitespace-nowrap text-sm text-center ${groupClass} font-semibold lesson-group-cell${diffClass}" data-day-index="${index}" data-lesson-index="${lessonIdx}" data-group="${lesson.group}"${bgStyle}>${lesson.group}${indicator}</td>`
            } else if (!dayPeriods.includes(p)) {
                rowHTML += '<td class="px-2 py-3 bg-gray-50 dark:bg-gray-900"></td>'
            } else {
                rowHTML += '<td class="px-2 py-3"></td>'
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
                cycleSpacerRow.className = "bg-indigo-100 dark:bg-indigo-800 cycle-spacer"
                cycleSpacerRow.dataset.weekId = entryWeekIdentifier
                if (isCollapsed) cycleSpacerRow.style.display = 'none'
                cycleSpacerRow.innerHTML = `<td colspan="${SCHEDULE_CONFIG.TABLE_COLUMNS}" class="py-2 text-center text-sm font-semibold text-indigo-700 dark:text-indigo-300">--- End of ${SCHEDULE_CONFIG.HISTORY_WEEKS}-Week Period ---</td>`
                ui.scheduleTableBody.appendChild(cycleSpacerRow)
                fourWeekBoundary.setDate(fourWeekBoundary.getDate() + SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR)
            }
        }
    })
    displayScheduleSummary(schedule, cellIssues)
    populateJumpToGroup(schedule)
    populateGroupColorLegend(schedule)

    // Re-apply group highlighting if active
    if (highlightedGroup) {
        toggleGroupHighlight(highlightedGroup)
    }

    // Diff toast (Feature 12)
    if (diffMap && diffCount > 0) {
        const totalSlots = schedule.reduce((sum, e) => sum + e.lessons.length, 0)
        showToast(`${diffCount} of ${totalSlots} assignments changed`, 'info')
        setTimeout(() => {
            ui.scheduleTableBody.querySelectorAll('.diff-highlight').forEach(el => el.classList.remove('diff-highlight'))
        }, 5000)
    }
}

/**
 * Converts the content of the HTML schedule table into a CSV formatted string.
 * @param {string} filename - The desired name for the downloaded file.
 */
function exportTableToCSV(filename) {
    if (!currentSchedule || currentSchedule.length === 0) return
    const csv = []
    // Build header: Date, Day Cycle, then Pd N for each period in ALL_PERIODS
    const header = ['"Date"', '"Day Cycle"']
    for (const p of SCHEDULE_CONFIG.ALL_PERIODS) {
        header.push(`"Pd ${p}"`)
    }
    csv.push(header.join(','))

    let fourWeekBoundary = new Date(currentSchedule[0].date.getTime())
    fourWeekBoundary.setDate(fourWeekBoundary.getDate() + SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR)

    for (const entry of currentSchedule) {
        // Insert blank row for cycle boundary
        if (entry.date >= fourWeekBoundary) {
            csv.push('')
            fourWeekBoundary.setDate(fourWeekBoundary.getDate() + SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR)
        }
        const dateStr = entry.date.toLocaleDateString(undefined, {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        })
        const periodMap = {}
        for (const lesson of entry.lessons) {
            const pNum = parseInt(lesson.period.replace(SCHEDULE_CONFIG.PERIOD_PREFIX, ''), 10)
            periodMap[pNum] = lesson.group
        }
        const row = [`"${dateStr}"`, `"${entry.dayCycle}"`]
        for (const p of SCHEDULE_CONFIG.ALL_PERIODS) {
            row.push(`"${periodMap[p] || ''}"`)
        }
        csv.push(row.join(','))
    }
    downloadCSV(csv.join('\n'), filename)
}

/**
 * Triggers a browser download for the given CSV content by creating a temporary Blob.
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

/**
 * The main entry point for the application. This function is called once the DOM is fully loaded.
 * It caches DOM elements and attaches all necessary event listeners.
 */
async function refreshHolidayDropdown() {
    if (!ui.loadHolidaysSelect) return
    try {
        const token = AuthManager.getToken()
        if (!token) return
        const holidays = await DriveStorage.listHolidays(token)
        ui.loadHolidaysSelect.innerHTML = '<option value="">Load saved holidays...</option>'
        for (const h of holidays) {
            const opt = document.createElement('option')
            opt.value = h.id
            opt.textContent = h.name
            ui.loadHolidaysSelect.appendChild(opt)
        }
        if (ui.deleteHolidayBtn) {
            ui.deleteHolidayBtn.classList.toggle('hidden', holidays.length === 0)
        }
    } catch (e) {
        console.warn('Could not list holidays:', e)
    }
}

function populateDaysOff(holidays) {
    if (!Array.isArray(holidays) || holidays.length === 0) return
    // Clear existing
    const rows = ui.daysOffContainer.querySelectorAll('.flex')
    rows.forEach((row, i) => {
        if (i === 0) {
            row.querySelector('.day-off-input').value = ''
        } else {
            row.remove()
        }
    })
    // Populate
    holidays.forEach((dateStr, i) => {
        if (i === 0) {
            ui.daysOffContainer.querySelector('.day-off-input').value = dateStr
        } else {
            const newRow = ui.dayOffTemplate.content.cloneNode(true)
            newRow.querySelector('.day-off-input').value = dateStr
            ui.daysOffContainer.appendChild(newRow)
        }
    })
}

function buildTableHeader() {
    const thead = document.getElementById("schedule-thead")
    if (!thead) return
    const thClass = 'px-2 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
    let html = '<tr><th scope="col" class="px-1 py-3 w-8 action-col"></th>'
    html += `<th scope="col" class="${thClass} text-left">Date</th>`
    html += `<th scope="col" class="${thClass} text-center">Day</th>`
    for (const p of SCHEDULE_CONFIG.ALL_PERIODS) {
        html += `<th scope="col" class="${thClass} text-center">Pd ${p}</th>`
    }
    html += '</tr>'
    thead.innerHTML = html
}

function initialize() {
    buildTableHeader()
    // --- Cache all DOM elements into the ui object for efficient access ---
    ui.form = document.getElementById("schedule-form")
    ui.generateBtn = document.getElementById("generate-btn")
    ui.saveCsvBtn = document.getElementById("save-csv-btn")
    ui.addDayOffBtn = document.getElementById("add-day-off")
    ui.historyCheckbox = document.getElementById("history-checkbox")
    ui.historyContainer = document.getElementById("history-container")
    ui.historyTextarea = document.getElementById("history-data")
    ui.validationBox = document.getElementById("history-validation-box")
    ui.startDateInput = document.getElementById("start-date")
    ui.endDateInput = document.getElementById("end-date")
    ui.weeksInput = document.getElementById("weeks")
    ui.importCsvInput = document.getElementById("import-csv-input")
    ui.daysOffContainer = document.getElementById("days-off-container")
    ui.startDayWarning = document.getElementById("start-day-warning")
    ui.scheduleGapWarning = document.getElementById("schedule-gap-warning")
    ui.loadingIndicator = document.getElementById("loading-indicator")
    ui.scheduleOutput = document.getElementById("schedule-output")
    ui.scheduleTableBody = document.querySelector("#schedule-table tbody")
    ui.dayOffTemplate = document.getElementById("day-off-template")
    ui.signInBtn = document.getElementById("sign-in-btn")
    ui.signOutBtn = document.getElementById("sign-out-btn")
    ui.userProfile = document.getElementById("user-profile")
    ui.userAvatar = document.getElementById("user-avatar")
    ui.userName = document.getElementById("user-name")
    ui.saveDriveBtn = document.getElementById("save-drive-btn")
    ui.loadDriveBtn = document.getElementById("load-drive-btn")
    ui.toastContainer = document.getElementById("toast-container")
    ui.undoBtn = document.getElementById("undo-btn")
    ui.clearDaysOffBtn = document.getElementById("clear-days-off")
    ui.loadingProgressText = document.getElementById("loading-progress-text")
    ui.scheduleSummary = document.getElementById("schedule-summary")
    ui.holidaysSection = document.getElementById("holidays-section")
    ui.saveHolidaysBtn = document.getElementById("save-holidays-btn")
    ui.loadHolidaysSelect = document.getElementById("load-holidays-select")
    ui.deleteHolidayBtn = document.getElementById("delete-holiday-btn")
    if (ui.undoBtn) ui.undoBtn.addEventListener('click', performUndo)
    const printBtn = document.getElementById('print-btn')
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            preparePrintHeader()
            window.print()
        })
    }

    // --- Attach Event Listeners ---
    ui.scheduleTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.day-delete-btn')
        if (btn) {
            e.stopPropagation()
            const dayIndex = parseInt(btn.dataset.dayIndex, 10)
            showDayActionPopover(btn, dayIndex)
        }
    })

    // --- Drag-and-drop event delegation ---
    ui.scheduleTableBody.addEventListener('dragstart', (e) => {
        dismissIssueTooltip()
        const cell = e.target.closest('.lesson-group-cell')
        if (!cell) return
        const parsedDayIndex = parseInt(cell.dataset.dayIndex, 10)
        dragState = {
            dayIndex: parsedDayIndex,
            lessonIndex: parseInt(cell.dataset.lessonIndex, 10),
            group: cell.dataset.group,
            sourceCell: cell,
            dayCycle: currentSchedule[parsedDayIndex].dayCycle,
        }
        cell.classList.add('dragging')
        highlightDragRow(dragState.dayCycle)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', '')
    })

    ui.scheduleTableBody.addEventListener('dragover', (e) => {
        if (!dragState) return
        const cell = e.target.closest('.lesson-group-cell')
        if (!cell || cell === dragState.sourceCell) return
        const targetDayIndex = parseInt(cell.dataset.dayIndex, 10)
        if (currentSchedule[targetDayIndex].dayCycle !== dragState.dayCycle) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (cell === lastHoveredCell) return
        // Clear previous hover target
        if (lastHoveredCell) {
            lastHoveredCell.classList.remove('drag-over-valid', 'drag-over-warning')
        }
        lastHoveredCell = cell
        const targetLessonIndex = parseInt(cell.dataset.lessonIndex, 10)
        const violations = checkSwapViolations(dragState.dayIndex, dragState.lessonIndex, targetDayIndex, targetLessonIndex)
        if (violations.length > 0) {
            cell.classList.add('drag-over-warning')
            showSwapWarningTooltip(cell, violations)
        } else {
            cell.classList.add('drag-over-valid')
            dismissSwapWarning()
        }
    })

    ui.scheduleTableBody.addEventListener('dragenter', (e) => {
        if (!dragState) return
        const cell = e.target.closest('.lesson-group-cell')
        if (!cell || cell === dragState.sourceCell) return
        const targetDayIndex = parseInt(cell.dataset.dayIndex, 10)
        if (currentSchedule[targetDayIndex].dayCycle === dragState.dayCycle) {
            e.preventDefault()
        }
    })

    ui.scheduleTableBody.addEventListener('dragleave', (e) => {
        if (!dragState) return
        const cell = e.target.closest('.lesson-group-cell')
        if (cell && cell === lastHoveredCell) {
            // Only clear if we're truly leaving (not entering a child)
            const related = e.relatedTarget
            if (!cell.contains(related)) {
                cell.classList.remove('drag-over-valid', 'drag-over-warning')
                lastHoveredCell = null
                dismissSwapWarning()
            }
        }
    })

    ui.scheduleTableBody.addEventListener('drop', (e) => {
        if (!dragState) return
        e.preventDefault()
        const cell = e.target.closest('.lesson-group-cell')
        if (!cell || cell === dragState.sourceCell) return
        const targetDayIndex = parseInt(cell.dataset.dayIndex, 10)
        if (currentSchedule[targetDayIndex].dayCycle !== dragState.dayCycle) return
        const targetLessonIndex = parseInt(cell.dataset.lessonIndex, 10)
        executeGroupSwap(dragState.dayIndex, dragState.lessonIndex, targetDayIndex, targetLessonIndex)
        // Cleanup happens in dragend
    })

    ui.scheduleTableBody.addEventListener('dragend', () => {
        if (dragState && dragState.sourceCell) {
            dragState.sourceCell.classList.remove('dragging')
        }
        if (lastHoveredCell) {
            lastHoveredCell.classList.remove('drag-over-valid', 'drag-over-warning')
            lastHoveredCell = null
        }
        clearRowHighlighting()
        dismissSwapWarning()
        dragState = null
    })

    // --- Issue tooltip hover delegation ---
    ui.scheduleTableBody.addEventListener('mouseenter', (e) => {
        const indicator = e.target.closest('.cell-issue-indicator')
        if (!indicator) return
        const issuesText = indicator.dataset.issues
        if (!issuesText) return
        dismissIssueTooltip()
        const tooltip = document.createElement('div')
        tooltip.className = 'cell-issue-tooltip'
        tooltip.innerHTML = issuesText.split('\n').map(line => `<div class="issue-line">${line}</div>`).join('')
        const rect = indicator.getBoundingClientRect()
        tooltip.style.top = `${rect.top - 8}px`
        tooltip.style.left = `${rect.right + 8}px`
        document.body.appendChild(tooltip)
        const tooltipRect = tooltip.getBoundingClientRect()
        if (tooltipRect.right > window.innerWidth - 8) {
            tooltip.style.left = `${rect.left - tooltipRect.width - 8}px`
        }
        if (tooltipRect.top < 8) {
            tooltip.style.top = `${rect.bottom + 8}px`
        }
        activeIssueTooltip = tooltip
    }, true)

    ui.scheduleTableBody.addEventListener('mouseleave', (e) => {
        if (e.target.closest('.cell-issue-indicator')) {
            dismissIssueTooltip()
        }
    }, true)

    ui.form.addEventListener("submit", (e) => {
        e.preventDefault()
        runScheduler()
    })
    ui.saveCsvBtn.addEventListener("click", () => {
        exportTableToCSV(`salk-schedule-${new Date().toISOString().slice(0,10)}.csv`)
    })
    ui.startDateInput.addEventListener("change", () => {
        checkStartDateWarning()
        computeWeeksFromEndDate()
        runAllValidations()
    })
    ui.endDateInput.addEventListener("change", () => {
        computeWeeksFromEndDate()
        runAllValidations()
    })
    ui.weeksInput.addEventListener("input", () => {
        ui.endDateInput.value = ""
    })
    ui.importCsvInput.addEventListener("change", handleCSVImport)
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
    if (ui.clearDaysOffBtn) {
        ui.clearDaysOffBtn.addEventListener("click", () => {
            // Remove all added day-off rows (keep the first one) and clear its value
            const rows = ui.daysOffContainer.querySelectorAll('.flex')
            rows.forEach((row, i) => {
                if (i === 0) {
                    row.querySelector('.day-off-input').value = ''
                } else {
                    row.remove()
                }
            })
        })
    }

    // --- Holiday Listeners ---
    if (ui.saveHolidaysBtn) {
        ui.saveHolidaysBtn.addEventListener("click", async () => {
            const dates = Array.from(document.querySelectorAll('.day-off-input'))
                .map(i => i.value).filter(Boolean)
            if (dates.length === 0) {
                showToast('No days off to save.', 'error')
                return
            }
            const name = prompt('Name for this holiday list:')
            if (!name || !name.trim()) return
            try {
                const token = await AuthManager.ensureAccessToken()
                await DriveStorage.saveHolidays(token, name.trim(), dates)
                showToast(`Holiday list "${name.trim()}" saved`)
                refreshHolidayDropdown()
            } catch (e) {
                showToast('Could not save holidays.', 'error')
                console.error('Holiday save error:', e)
            }
        })
    }
    if (ui.loadHolidaysSelect) {
        ui.loadHolidaysSelect.addEventListener("change", async () => {
            const fileId = ui.loadHolidaysSelect.value
            if (!fileId) return
            try {
                const token = await AuthManager.ensureAccessToken()
                const holidays = await DriveStorage.loadHoliday(token, fileId)
                populateDaysOff(holidays)
                showToast('Holidays loaded', 'info')
            } catch (e) {
                showToast('Could not load holidays.', 'error')
                console.error('Holiday load error:', e)
            }
            ui.loadHolidaysSelect.value = ''
        })
    }
    if (ui.deleteHolidayBtn) {
        ui.deleteHolidayBtn.addEventListener("click", async () => {
            const fileId = ui.loadHolidaysSelect.value
            if (!fileId) {
                showToast('Select a holiday list to delete first.', 'error')
                return
            }
            const name = ui.loadHolidaysSelect.options[ui.loadHolidaysSelect.selectedIndex].textContent
            if (!confirm(`Delete holiday list "${name}"?`)) return
            try {
                const token = await AuthManager.ensureAccessToken()
                await DriveStorage.deleteHoliday(token, fileId)
                showToast(`Holiday list "${name}" deleted`)
                refreshHolidayDropdown()
            } catch (e) {
                showToast('Could not delete holidays.', 'error')
                console.error('Holiday delete error:', e)
            }
        })
    }

    // --- Auth & Drive Listeners ---
    if (ui.signInBtn) {
        ui.signInBtn.addEventListener("click", () => {
            if (typeof AuthManager !== 'undefined') {
                AuthManager.signIn()
            } else {
                showToast('Google Sign-In is not available. See FOLLOW_UP.md for setup.', 'error')
            }
        })
    }
    if (ui.signOutBtn) {
        ui.signOutBtn.addEventListener("click", () => {
            if (typeof AuthManager !== 'undefined') AuthManager.signOut()
        })
    }
    if (ui.saveDriveBtn) {
        ui.saveDriveBtn.addEventListener("click", async () => {
            if (!currentSchedule) {
                showToast('No schedule to save. Generate or import one first.', 'error')
                return
            }
            try {
                const token = await AuthManager.ensureAccessToken()
                const data = scheduleToJSON(currentSchedule)
                await DriveStorage.saveSchedule(token, data)
                scheduleModified = false
                updateSaveButtonUnsaved(false)
                showToast('Schedule saved to Google Drive')
            } catch (e) {
                showToast('Could not save to Drive.', 'error')
                console.error('Drive save error:', e)
            }
        })
    }
    if (ui.loadDriveBtn) {
        ui.loadDriveBtn.addEventListener("click", async () => {
            try {
                const token = await AuthManager.ensureAccessToken()
                const data = await DriveStorage.loadSchedule(token)
                if (data) {
                    const schedule = jsonToSchedule(data)
                    if (schedule.length > 0) {
                        restoreFormParameters(data.parameters)
                        displaySchedule(schedule)
                        currentSchedule = schedule
                        clearUndoStack()
                        if (data.parameters && data.parameters.startDate && data.parameters.weeks) {
                            storeScheduleParams(data.parameters.startDate, parseInt(data.parameters.weeks, 10), data.parameters.daysOff || [])
                        } else {
                            const lastDate = schedule[schedule.length - 1].date
                            const endD = new Date(lastDate)
                            endD.setDate(endD.getDate() + 14)
                            currentScheduleParams = { originalEndDate: endD, daysOff: [] }
                        }
                        scheduleModified = false
                        updateSaveButtonUnsaved(false)
                        hideEmptyState()
                        ui.scheduleOutput.classList.remove('hidden')
                        showToast('Schedule loaded from Google Drive', 'info')
                    } else {
                        showToast('Saved schedule is empty.', 'error')
                    }
                } else {
                    showToast('No saved schedule found in Google Drive.', 'info')
                }
            } catch (e) {
                showToast('Could not load from Drive.', 'error')
                console.error('Drive load error:', e)
            }
        })
    }

    // --- Group highlighting click handler (Feature 7) ---
    ui.scheduleTableBody.addEventListener('click', (e) => {
        // Skip if it's a button click or issue indicator
        if (e.target.closest('.day-delete-btn') || e.target.closest('.cell-issue-indicator')) return

        const cell = e.target.closest('.lesson-group-cell')
        if (cell) {
            // On touch devices, handle touch swap instead of highlight
            if (isTouchDevice && !dragState) {
                handleTouchSelect(cell)
                return
            }
            const group = cell.dataset.group
            if (group && !group.startsWith(SCHEDULE_CONFIG.MU_TOKEN)) {
                toggleGroupHighlight(group)
            }
            return
        }
        // Click on non-group area: clear highlight
        if (highlightedGroup && !e.target.closest('.weekly-spacer')) {
            clearGroupHighlight()
        }
    })

    // Clear highlight button
    const clearHighlightBtn = document.getElementById('clear-highlight-btn')
    if (clearHighlightBtn) {
        clearHighlightBtn.addEventListener('click', clearGroupHighlight)
    }

    // --- Jump to Group (Feature 8) ---
    const jumpToGroup = document.getElementById('jump-to-group')
    if (jumpToGroup) {
        jumpToGroup.addEventListener('change', () => {
            const group = jumpToGroup.value
            if (!group) return
            toggleGroupHighlight(group)
            // Scroll to first match
            const firstCell = ui.scheduleTableBody.querySelector(`.lesson-group-cell[data-group="${group}"]`)
            if (firstCell) {
                firstCell.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            jumpToGroup.value = ''
        })
    }

    // --- Collapsible Weeks (Feature 11) ---
    ui.scheduleTableBody.addEventListener('click', (e) => {
        const spacerRow = e.target.closest('.weekly-spacer')
        if (!spacerRow) return
        const weekId = spacerRow.dataset.weekId
        if (!weekId) return
        if (collapsedWeeks.has(weekId)) {
            collapsedWeeks.delete(weekId)
        } else {
            collapsedWeeks.add(weekId)
        }
        if (currentSchedule) displaySchedule(currentSchedule)
    })

    const collapseAllBtn = document.getElementById('collapse-all-btn')
    const expandAllBtn = document.getElementById('expand-all-btn')
    if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', () => {
            if (!currentSchedule) return
            for (const entry of currentSchedule) {
                const weekId = getWeekIdentifier(entry.date)
                // Don't collapse the first week (no spacer to click)
                if (weekId !== getWeekIdentifier(currentSchedule[0].date)) {
                    collapsedWeeks.add(weekId)
                }
            }
            displaySchedule(currentSchedule)
        })
    }
    if (expandAllBtn) {
        expandAllBtn.addEventListener('click', () => {
            collapsedWeeks.clear()
            if (currentSchedule) displaySchedule(currentSchedule)
        })
    }

    // --- Keyboard Shortcuts (Feature 9) ---
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

        // Ctrl/Cmd+Z: Undo
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault()
            if (undoStack.length > 0) performUndo()
            return
        }

        // Ctrl/Cmd+P: Print
        if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
            e.preventDefault()
            if (!currentSchedule) return
            preparePrintHeader()
            window.print()
            return
        }

        // Ctrl/Cmd+S: Save
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault()
            if (!currentSchedule) return
            if (ui.saveDriveBtn && !ui.saveDriveBtn.classList.contains('hidden')) {
                ui.saveDriveBtn.click()
            } else {
                exportTableToCSV(`salk-schedule-${new Date().toISOString().slice(0,10)}.csv`)
            }
            return
        }

        // Escape: dismiss overlays
        if (e.key === 'Escape') {
            if (activePopover) { dismissPopover(); return }
            if (highlightedGroup) { clearGroupHighlight(); return }
            if (touchSwapState) { clearTouchSelection(); return }
            if (activeSwapWarning) { dismissSwapWarning(); return }
        }
    })

    // --- Unsaved Changes Warning (Feature 1) ---
    window.addEventListener('beforeunload', (e) => {
        if (scheduleModified) {
            e.preventDefault()
            e.returnValue = ''
        }
    })

    // --- Dark Mode (Feature 13) ---
    const darkToggle = document.getElementById('dark-mode-toggle')
    const savedTheme = localStorage.getItem('salk-theme')
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark')
    }
    // Sync icon on load
    const isDarkOnLoad = document.documentElement.classList.contains('dark')
    document.getElementById('sun-icon').classList.toggle('hidden', !isDarkOnLoad)
    document.getElementById('moon-icon').classList.toggle('hidden', isDarkOnLoad)

    if (darkToggle) {
        darkToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark')
            const isDark = document.documentElement.classList.contains('dark')
            localStorage.setItem('salk-theme', isDark ? 'dark' : 'light')
            document.getElementById('sun-icon').classList.toggle('hidden', !isDark)
            document.getElementById('moon-icon').classList.toggle('hidden', isDark)
            if (currentSchedule) displaySchedule(currentSchedule)
        })
    }

    // Initialize AuthManager if available
    if (typeof AuthManager !== 'undefined') {
        AuthManager.init(handleIdentified, handleAccessToken, handleSignOut)
    }

    // --- Initial Page Setup ---
    // Set the default start date to today.
    const today = new Date()
    ui.startDateInput.value = `${today.getFullYear()}-${String(
        today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

    checkStartDateWarning()
    runAllValidations()

    // Show empty state if no schedule loaded (Feature 2)
    showEmptyState()
}

// --- Application Entry Point ---
document.addEventListener("DOMContentLoaded", initialize)
