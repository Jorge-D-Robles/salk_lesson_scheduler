/**
 * Shared test helpers for CLI-based scheduler testing.
 * These run in Node.js and mirror the Jasmine assertion logic from scheduler.spec.js.
 *
 * Usage: import { loadScheduler, runChecks, weekdaysInRange, ... } from './helpers.mjs'
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULER_PATH = join(__dirname, '..', 'scheduler.js');

const ONE_DAY_MS = 86400000;

/** Load ScheduleBuilder from scheduler.js using dynamic eval. */
export function loadScheduler() {
    const code = readFileSync(SCHEDULER_PATH, 'utf8');
    const fn = new Function(code + '\nreturn { ScheduleBuilder, ScheduleEntry };');
    return fn();
}

/** Generate weekday date strings (YYYY-MM-DD) in a range (inclusive). */
export function weekdaysInRange(startStr, endStr) {
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    const result = [];
    const d = new Date(start);
    while (d <= end) {
        if (d.getDay() >= 1 && d.getDay() <= 5) {
            result.push(
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            );
        }
        d.setDate(d.getDate() + 1);
    }
    return result;
}

/** Generate all Mondays in a date range as YYYY-MM-DD strings. */
export function allMondaysInRange(s, e) {
    return weekdaysInRange(s, e).filter(d => new Date(d + 'T00:00:00').getDay() === 1);
}

/** Generate all Fridays in a date range as YYYY-MM-DD strings. */
export function allFridaysInRange(s, e) {
    return weekdaysInRange(s, e).filter(d => new Date(d + 'T00:00:00').getDay() === 5);
}

/**
 * Run all constraint checks on a schedule. Returns an array of issue strings.
 * Empty array = all checks passed.
 *
 * Checks: slot fill, 21-day rule, weekly uniqueness, MU clustering, balance, cycle fairness.
 */
export function runChecks(schedule, builder, { maxCycleViolations = 60 } = {}) {
    const issues = [];
    if (schedule.length === 0) return ['EMPTY'];

    // All slots filled
    schedule.forEach(d => {
        const expected = d.dayCycle === 1 ? 4 : 5;
        if (d.lessons.length !== expected)
            issues.push(`SLOTS:${d.date.toDateString()} (${d.lessons.length}!=${expected})`);
    });

    // 21-day rule (guaranteed minimum separation)
    const lastSeen = {};
    schedule.forEach(d => d.lessons.forEach(l => {
        if (l.group === 'MU') return;
        if (!lastSeen[l.group]) lastSeen[l.group] = {};
        const last = lastSeen[l.group][l.period];
        if (last && (d.date - last) / ONE_DAY_MS < 21)
            issues.push(`21DAY:${l.group} ${l.period}`);
        lastSeen[l.group][l.period] = d.date;
    }));

    // Weekly uniqueness
    const weeks = new Map();
    schedule.forEach(d => {
        const day = d.date.getDay();
        const off = day === 0 ? 6 : day - 1;
        const mon = new Date(d.date);
        mon.setDate(d.date.getDate() - off);
        const wk = mon.toDateString();
        if (!weeks.has(wk)) weeks.set(wk, new Set());
        d.lessons.forEach(l => {
            if (l.group === 'MU') return;
            if (weeks.get(wk).has(l.group)) issues.push(`WEEKLY:${l.group}`);
            weeks.get(wk).add(l.group);
        });
    });

    // MU clustering (max 1 per day)
    schedule.forEach(d => {
        if (d.lessons.filter(l => l.group === 'MU').length > 1) issues.push('MU');
    });

    // Balance (max-min lesson count across groups ≤ 2)
    const counts = new Map();
    schedule.forEach(d => d.lessons.forEach(l => {
        if (l.group !== 'MU') counts.set(l.group, (counts.get(l.group) || 0) + 1);
    }));
    const vals = [...counts.values()];
    if (vals.length > 0 && Math.max(...vals) - Math.min(...vals) > 2)
        issues.push(`BALANCE:${Math.max(...vals) - Math.min(...vals)}`);

    // Cycle fairness (relaxed — bounded violations allowed)
    const seq = schedule.flatMap(d => d.lessons).filter(l => l.group !== 'MU').map(l => l.group);
    const allGroups = builder.LESSON_GROUPS;
    if (seq.length > allGroups.length) {
        const gi = new Map();
        allGroups.forEach(g => gi.set(g, []));
        seq.forEach((g, i) => { if (gi.has(g)) gi.get(g).push(i); });
        let violations = 0;
        for (const [group, indices] of gi.entries()) {
            for (let i = 0; i < indices.length - 1; i++) {
                const between = new Set(seq.slice(indices[i] + 1, indices[i + 1]));
                if (allGroups.filter(g => g !== group && !between.has(g)).length > 0) violations++;
            }
        }
        if (violations > maxCycleViolations) issues.push(`CYCLE:${violations}>${maxCycleViolations}`);
    }

    return issues;
}
