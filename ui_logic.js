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

// --- Function Definitions ---

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
            if (lesson.group === 'MU') continue
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
            if (lesson.group === 'MU') continue
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
            <div class="text-2xl font-bold text-indigo-700">${schedule.length}</div>
            <div class="text-gray-600">Total Days</div>
        </div>
        <div class="text-center">
            <div class="text-2xl font-bold text-indigo-700">${endSpread}</div>
            <div class="text-gray-600">End Balance Spread</div>
        </div>
        <div class="text-center">
            <div class="text-2xl font-bold ${maxRunSpread <= 1 ? 'text-green-600' : 'text-amber-600'}">${maxRunSpread}</div>
            <div class="text-gray-600">Max Running Spread</div>
        </div>
        <div class="text-center">
            <div class="text-2xl font-bold text-indigo-700">${minCount}–${maxCount}</div>
            <div class="text-gray-600">Lessons/Group</div>
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
                if (msg.startsWith('28-day')) periodDays.add(dayIdx)
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
            lines.push(`<div class="flex items-start gap-2"><span class="text-red-600 font-semibold whitespace-nowrap">28-day conflicts: ${periodDays.size}</span><span class="text-gray-600">— ${makeDayLinks(periodDays)}</span></div>`)
        }
        if (weeklyDays.size > 0) {
            lines.push(`<div class="flex items-start gap-2"><span class="text-red-600 font-semibold whitespace-nowrap">Weekly duplicates: ${weeklyDays.size}</span><span class="text-gray-600">— ${makeDayLinks(weeklyDays)}</span></div>`)
        }
        if (balanceDays.size > 0) {
            lines.push(`<div class="flex items-start gap-2"><span class="text-amber-600 font-semibold whitespace-nowrap">Balance issues: ${balanceDays.size}</span><span class="text-gray-600">— ${makeDayLinks(balanceDays)}</span></div>`)
        }

        violationsHTML = `
            <div id="summary-violations" class="mt-3 pt-3 border-t border-red-200 bg-red-50 rounded-md p-3 text-sm">
                <div class="font-semibold text-red-700 mb-1">Violations</div>
                ${lines.join('\n')}
            </div>`
    } else {
        violationsHTML = `
            <div id="summary-violations" class="mt-3 pt-3 border-t border-green-200 bg-green-50 rounded-md p-3 text-sm">
                <span class="font-semibold text-green-700">No violations</span>
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
        if (group.startsWith('MU')) continue
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
    if (!newGroup.startsWith('MU')) return []
    const entry = currentSchedule[dayIndex]
    let muCount = 0
    for (let i = 0; i < entry.lessons.length; i++) {
        if (i === lessonIndex) continue
        if (entry.lessons[i].group.startsWith('MU')) muCount++
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

    const params = getScheduleParameters()
    if (!params) return // Validation failed, so stop.
    const { startDate, dayCycle, daysOff, weeks, scheduleHistory } = params

    showLoading()
    ui.generateBtn.disabled = true

    postToWorker('buildSchedule', { startDate, dayCycle, daysOff, weeks, scheduleHistory })
        .then(result => {
            const schedule = rehydrateSchedule(result.schedule)
            schedule.achievedDayRule = result.achievedDayRule
            displaySchedule(schedule)
            currentSchedule = schedule
            storeScheduleParams(startDate, weeks, daysOff)
            scheduleModified = false
            updateSaveButtonUnsaved(false)
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
        ui.validationBox.innerHTML = `✅ All checks pass. Found ${uniqueGroupCount} of 22 required unique groups.`
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

    // Skip header row if present
    const startIndex =
        lines[0].toLowerCase().includes("date") ||
        lines[0].toLowerCase().includes("period")
            ? 1
            : 0

    const entries = []
    for (let i = startIndex; i < lines.length; i++) {
        const columns = parseScheduleLine(lines[i])
        const dateStr = columns[0]
        const dateObj = new Date(dateStr)
        if (isNaN(dateObj.getTime())) continue

        const dayCycleStr = columns[1]
        const dayCycle = parseInt(dayCycleStr, 10)
        const entry = new ScheduleEntry(dateObj, isNaN(dayCycle) ? 1 : dayCycle)

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
            if (lesson.group === 'MU') continue
            const periodNum = parseInt(lesson.period.replace(/\D/g, ''), 10)
            // Look back for conflicts within 28 calendar days
            for (let j = i - 1; j >= 0; j--) {
                const prev = schedule[j]
                const gap = Math.round((entry.date - prev.date) / 86400000)
                if (gap >= 28) break
                for (let lj = 0; lj < prev.lessons.length; lj++) {
                    const other = prev.lessons[lj]
                    if (other.group === 'MU') continue
                    if (other.group === lesson.group) {
                        const otherPeriod = parseInt(other.period.replace(/\D/g, ''), 10)
                        if (otherPeriod === periodNum) {
                            addIssue(i, li, `28-day period conflict: ${lesson.group} had Pd ${periodNum} on ${prev.date.toLocaleDateString()} (${gap}d ago)`)
                            addIssue(j, lj, `28-day period conflict: ${other.group} has Pd ${periodNum} again on ${entry.date.toLocaleDateString()} (${gap}d later)`)
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
            if (group === 'MU') continue
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
            if (lesson.group !== 'MU') allGroups.add(lesson.group)
        }
    }
    const running = {}
    for (let i = 0; i < schedule.length; i++) {
        const entry = schedule[i]
        for (let li = 0; li < entry.lessons.length; li++) {
            const group = entry.lessons[li].group
            if (group === 'MU') continue
            running[group] = (running[group] || 0) + 1
        }
        const vals = []
        for (const g of allGroups) vals.push(running[g] || 0)
        if (vals.length > 0) {
            const spread = Math.max(...vals) - Math.min(...vals)
            if (spread > 1) {
                // Mark all lessons on this day
                for (let li = 0; li < entry.lessons.length; li++) {
                    if (entry.lessons[li].group !== 'MU') {
                        addIssue(i, li, `Running balance spread is ${spread} after this day`)
                    }
                }
            }
        }
    }

    return issues
}

function displaySchedule(schedule) {
    ui.scheduleTableBody.innerHTML = ""

    if (schedule.length === 0) {
        ui.scheduleTableBody.innerHTML = `<tr><td colspan="13" class="text-center py-4">No schedule generated. Check dates and days off.</td></tr>`
        return
    }

    const cellIssues = computeCellIssues(schedule)

    let currentWeekIdentifier = getWeekIdentifier(schedule[0].date)
    let fourWeekBoundary = new Date(schedule[0].date.getTime())
    fourWeekBoundary.setDate(fourWeekBoundary.getDate() + 28)

    schedule.forEach((entry, index) => {
        // Sort lessons by period number for display
        entry.lessons.sort((a, b) => parseInt(a.period.replace("Pd ", ""), 10) - parseInt(b.period.replace("Pd ", ""), 10))

        const entryWeekIdentifier = getWeekIdentifier(entry.date)
        if (entryWeekIdentifier !== currentWeekIdentifier) {
            const spacerRow = document.createElement("tr")
            spacerRow.className = "bg-gray-200 weekly-spacer"
            spacerRow.innerHTML = `<td colspan="13" class="py-1"></td>`
            ui.scheduleTableBody.appendChild(spacerRow)
            currentWeekIdentifier = entryWeekIdentifier
        }

        const row = document.createElement("tr")
        row.id = `schedule-row-${index}`
        const formattedDate = entry.date.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        })

        let rowHTML = `<td class="px-1 py-3 text-center action-col"><button class="day-delete-btn" data-day-index="${index}" title="Remove this day">&times;</button></td><td class="px-2 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${formattedDate}</td><td class="px-2 py-3 whitespace-nowrap text-sm text-center text-gray-700">${entry.dayCycle}</td>`
        for (let i = 0; i < 5; i++) {
            if (entry.lessons[i]) {
                const groupClass = entry.lessons[i].group.startsWith("MU")
                    ? "text-red-600"
                    : "text-gray-800"
                const issues = cellIssues.get(`${index}-${i}`)
                const indicator = issues
                    ? `<span class="cell-issue-indicator" data-issues="${issues.join('\n').replace(/"/g, '&quot;')}">&#9888;</span>`
                    : ''
                rowHTML += `<td class="px-2 py-3 whitespace-nowrap text-sm text-gray-500">${entry.lessons[i].period}</td><td draggable="true" class="px-2 py-3 whitespace-nowrap text-sm ${groupClass} font-semibold lesson-group-cell" data-day-index="${index}" data-lesson-index="${i}" data-group="${entry.lessons[i].group}">${entry.lessons[i].group}${indicator}</td>`
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
                cycleSpacerRow.innerHTML = `<td colspan="13" class="py-2 text-center text-sm font-semibold text-indigo-700">--- End of 4-Week Period ---</td>`
                ui.scheduleTableBody.appendChild(cycleSpacerRow)
                fourWeekBoundary.setDate(fourWeekBoundary.getDate() + 28)
            }
        }
    })
    displayScheduleSummary(schedule, cellIssues)
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
        .forEach((th) => {
            if (th.classList.contains('action-col')) return
            header.push(`"${th.innerText}"`)
        })
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
            if (col.classList.contains('action-col')) return
            rowData.push('"' + col.innerText.replace(/"/g, '""') + '"')
        })
        csv.push(rowData.join(","))
    })
    downloadCSV(csv.join("\n"), filename)
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

function initialize() {
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
}

// --- Application Entry Point ---
document.addEventListener("DOMContentLoaded", initialize)
