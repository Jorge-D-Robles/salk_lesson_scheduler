/**
 * @file Web Worker for offloading heavy schedule computation from the main thread.
 * Handles buildSchedule, recalculateFromDay, and recalculateAfterDay operations.
 */

importScripts('scheduler.js')

/**
 * Converts a date string (YYYY-MM-DD) to a local-midnight Date object.
 */
function parseLocalDate(str) {
    const parts = str.split('-')
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
}

/**
 * Formats a Date as YYYY-MM-DD in local time.
 * Using toISOString() would shift dates in non-UTC timezones.
 */
function toLocalDateString(d) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

/**
 * Converts a ScheduleEntry array to plain objects for postMessage.
 */
function serializeSchedule(schedule) {
    return schedule.map(entry => ({
        date: toLocalDateString(entry.date),
        dayCycle: entry.dayCycle,
        lessons: entry.lessons.map(l => ({ period: l.period, group: l.group })),
    }))
}

/**
 * Converts plain objects back to ScheduleEntry instances.
 */
function deserializeSchedule(data) {
    return data.map(item => {
        const entry = new ScheduleEntry(parseLocalDate(item.date), item.dayCycle)
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
 * Deserializes params (originalEndDate, daysOff) from the main thread.
 */
function deserializeParams(params) {
    return {
        originalEndDate: parseLocalDate(params.originalEndDate),
        daysOff: params.daysOff || [],
    }
}

self.onmessage = function (e) {
    const { id, type, payload } = e.data
    try {
        let result
        switch (type) {
            case 'buildSchedule': {
                const { startDate, dayCycle, daysOff, weeks, scheduleHistory } = payload
                const builder = new ScheduleBuilder(startDate, dayCycle, daysOff, weeks, scheduleHistory)
                const schedule = builder.buildSchedule((data) => {
                    self.postMessage({ id, type: 'progress', data })
                })
                result = {
                    schedule: serializeSchedule(schedule),
                    achievedDayRule: builder.achievedDayRule,
                }
                break
            }
            case 'recalculateFromDay': {
                const schedule = deserializeSchedule(payload.schedule)
                const params = deserializeParams(payload.params)
                const out = recalculateFromDay(schedule, payload.dayIndex, params)
                result = {
                    schedule: serializeSchedule(out.schedule),
                    achievedDayRule: out.builder.achievedDayRule,
                }
                break
            }
            case 'recalculateAfterDay': {
                const schedule = deserializeSchedule(payload.schedule)
                const params = deserializeParams(payload.params)
                const out = recalculateAfterDay(schedule, payload.dayIndex, params)
                result = {
                    schedule: serializeSchedule(out.schedule),
                    achievedDayRule: out.builder.achievedDayRule,
                }
                break
            }
            default:
                throw new Error(`Unknown message type: ${type}`)
        }
        self.postMessage({ id, result })
    } catch (err) {
        self.postMessage({ id, error: err.message || String(err) })
    }
}
