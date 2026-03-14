#!/usr/bin/env node
/**
 * CLI torture test runner with extreme edge cases.
 * Tests heavy days-off patterns, minimal availability, long schedules,
 * and 28-day boundary stress cases across both day cycles.
 *
 * Usage: node testing/run_torture_tests.mjs
 */
import { loadScheduler, runChecks, analyzeCycleViolations, weekdaysInRange, allMondaysInRange, allFridaysInRange } from './helpers.mjs';

const { ScheduleBuilder, SCHEDULE_CONFIG } = loadScheduler();

const tortureTests = [
    { desc: 'Scattered days off', start: '2025-09-01', daysOff: ['2025-09-03', '2025-09-10', '2025-09-17', '2025-09-24', '2025-10-01', '2025-10-08', '2025-10-15', '2025-10-22', '2025-10-29', '2025-11-05', '2025-11-12', '2025-11-19'], weeks: 16 },
    { desc: 'Mon+Fri off 12wk', start: '2025-09-01', daysOff: [...allMondaysInRange('2025-09-01', '2025-11-21'), ...allFridaysInRange('2025-09-01', '2025-11-21')], weeks: 16 },
    { desc: 'Two 3-day breaks', start: '2025-09-01', daysOff: ['2025-09-10', '2025-09-11', '2025-09-12', '2025-09-22', '2025-09-23', '2025-09-24'], weeks: 16 },
    { desc: 'Three week-long breaks', start: '2025-09-01', daysOff: [...weekdaysInRange('2025-09-22', '2025-09-26'), ...weekdaysInRange('2025-10-27', '2025-10-31'), ...weekdaysInRange('2025-12-22', '2025-12-26')], weeks: 20 },
    { desc: '1 day available week', start: '2025-09-01', daysOff: ['2025-09-08', '2025-09-09', '2025-09-11', '2025-09-12'], weeks: 16 },
    { desc: 'Two 2-day weeks', start: '2025-09-01', daysOff: ['2025-09-08', '2025-09-09', '2025-09-10', '2025-09-17', '2025-09-18', '2025-09-19'], weeks: 16 },
    { desc: 'Alt 2/5-day weeks', start: '2025-09-01', daysOff: [...weekdaysInRange('2025-09-08', '2025-09-10'), ...weekdaysInRange('2025-09-22', '2025-09-24'), ...weekdaysInRange('2025-10-06', '2025-10-08'), ...weekdaysInRange('2025-10-20', '2025-10-22')], weeks: 16 },
    { desc: 'Full semester', start: '2025-09-02', daysOff: ['2025-10-13', '2025-11-04', '2025-11-11', '2025-11-26', '2025-11-27', '2025-11-28', ...weekdaysInRange('2025-12-22', '2026-01-02'), '2026-01-19'], weeks: 22 },
    { desc: 'Spring semester', start: '2026-01-05', daysOff: ['2026-02-16', ...weekdaysInRange('2026-02-16', '2026-02-20'), ...weekdaysInRange('2026-04-06', '2026-04-10'), '2026-05-25'], weeks: 24 },
    { desc: 'Every Mon off', start: '2025-09-01', daysOff: allMondaysInRange('2025-09-01', '2025-12-19'), weeks: 16 },
    { desc: 'Every Fri off', start: '2025-09-01', daysOff: allFridaysInRange('2025-09-01', '2025-12-19'), weeks: 16 },
    { desc: '30wk clean', start: '2025-09-01', daysOff: [], weeks: 30 },
    { desc: '40wk holidays', start: '2025-09-01', daysOff: ['2025-10-13', '2025-11-11', '2025-11-27', '2025-11-28', ...weekdaysInRange('2025-12-22', '2026-01-02'), '2026-01-19', '2026-02-16', ...weekdaysInRange('2026-02-16', '2026-02-20'), ...weekdaysInRange('2026-04-06', '2026-04-10'), '2026-05-25'], weeks: 40 },
    { desc: '4x 3-day wks', start: '2025-09-01', daysOff: ['2025-09-08', '2025-09-12', '2025-09-15', '2025-09-19', '2025-09-22', '2025-09-26', '2025-09-29', '2025-10-03'], weeks: 16 },
    { desc: '3x 2-day wks', start: '2025-09-01', daysOff: ['2025-09-08', '2025-09-09', '2025-09-10', '2025-09-15', '2025-09-16', '2025-09-17', '2025-09-22', '2025-09-23', '2025-09-24'], weeks: 16 },
    { desc: 'Start Thu Fri off', start: '2025-09-04', daysOff: ['2025-09-05'], weeks: 16 },
    { desc: 'Start Wed rest off', start: '2025-09-03', daysOff: ['2025-09-04', '2025-09-05'], weeks: 16 },
    { desc: '28-day boundary', start: '2025-09-01', daysOff: weekdaysInRange('2025-09-29', '2025-10-03'), weeks: 16 },
    { desc: 'Two 28-day boundaries', start: '2025-09-01', daysOff: [...weekdaysInRange('2025-09-29', '2025-10-03'), ...weekdaysInRange('2025-10-27', '2025-10-31')], weeks: 16 },
    { desc: 'Dense early gaps', start: '2025-09-01', daysOff: ['2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05', '2025-09-08', '2025-09-09', '2025-09-10'], weeks: 16 },
    { desc: 'Dense late gaps', start: '2025-09-01', daysOff: ['2025-11-24', '2025-11-25', '2025-11-26', '2025-11-27', '2025-11-28', '2025-12-01', '2025-12-02', '2025-12-03'], weeks: 16 },
    // Real school calendar: Levittown Public Schools 2025-2026 (approved 2/5/25)
    { desc: 'Levittown 2025-2026', start: '2025-09-02', daysOff: [
        '2025-09-23', '2025-09-24', '2025-10-02', '2025-10-13', '2025-10-20',
        '2025-11-04', '2025-11-11', '2025-11-27', '2025-11-28',
        '2025-12-24', '2025-12-25', '2025-12-26', '2025-12-29', '2025-12-30', '2025-12-31',
        '2026-01-01', '2026-01-02', '2026-01-19',
        '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
        '2026-03-20',
        '2026-04-02', '2026-04-03', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10',
        '2026-05-25', '2026-05-27', '2026-06-19',
    ], weeks: 43 },
];

// --- Realistic Levittown scenarios: school calendar + personal absences ---
const levittownBase = [
    '2025-09-23', '2025-09-24', '2025-10-02', '2025-10-13', '2025-10-20',
    '2025-11-04', '2025-11-11', '2025-11-27', '2025-11-28',
    '2025-12-24', '2025-12-25', '2025-12-26', '2025-12-29', '2025-12-30', '2025-12-31',
    '2026-01-01', '2026-01-02', '2026-01-19',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
    '2026-03-20',
    '2026-04-02', '2026-04-03', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10',
    '2026-05-25', '2026-05-27', '2026-06-19',
];

const realisticTests = [
    { desc: 'LV + 10 random sick days', extra: ['2025-09-15','2025-10-08','2025-10-29','2025-11-19','2025-12-10','2026-01-14','2026-02-25','2026-03-11','2026-04-22','2026-05-13'] },
    { desc: 'LV + 10 sick days fall', extra: ['2025-09-08','2025-09-12','2025-09-17','2025-10-06','2025-10-09','2025-10-15','2025-10-22','2025-10-28','2025-11-05','2025-11-13'] },
    { desc: 'LV + 10 sick days winter', extra: ['2026-01-07','2026-01-12','2026-01-21','2026-01-28','2026-02-09','2026-02-23','2026-03-02','2026-03-09','2026-03-16','2026-03-25'] },
    { desc: 'LV + 10 sick Mondays', extra: ['2025-09-08','2025-09-29','2025-10-27','2025-11-17','2025-12-08','2026-01-12','2026-02-09','2026-03-09','2026-04-27','2026-05-18'] },
    { desc: 'LV + 10 sick Fridays', extra: ['2025-09-12','2025-10-03','2025-10-24','2025-11-14','2025-12-05','2026-01-09','2026-02-13','2026-03-13','2026-04-24','2026-05-15'] },
    { desc: 'LV + sick week Oct', extra: ['2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-10-10'] },
    { desc: 'LV + sick week after winter break', extra: ['2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09'] },
    { desc: 'LV + sick days before spring break', extra: ['2026-03-30','2026-03-31','2026-04-01'] },
    { desc: 'LV + sick week May', extra: ['2026-05-04','2026-05-05','2026-05-06','2026-05-07','2026-05-08'] },
    { desc: 'LV + 2wk illness Nov/Thanksgiving', extra: ['2025-11-17','2025-11-18','2025-11-19','2025-11-20','2025-11-21','2025-11-24','2025-11-25','2025-11-26'] },
    { desc: 'LV + 2wk illness Mar', extra: ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-09','2026-03-10','2026-03-11','2026-03-12','2026-03-13'] },
    { desc: 'LV + 1 snow day Feb', extra: ['2026-02-11'] },
    { desc: 'LV + 2 snow days Jan', extra: ['2026-01-07','2026-01-08'] },
    { desc: 'LV + 3 snow days in 1 week Mar', extra: ['2026-03-03','2026-03-04','2026-03-05'] },
    { desc: 'LV + snow extending winter break', extra: ['2025-12-23'] },
    { desc: 'LV + snow extending Feb recess', extra: ['2026-02-23'] },
    { desc: 'LV + 3 snow + 7 sick winter', extra: ['2026-01-08','2026-02-11','2026-03-04','2025-12-03','2025-12-15','2026-01-14','2026-01-28','2026-02-25','2026-03-16','2026-03-25'] },
    { desc: 'LV + 3 snow + flu week Jan', extra: ['2026-01-06','2026-02-10','2026-03-03','2026-01-12','2026-01-13','2026-01-14','2026-01-15','2026-01-16'] },
    { desc: 'LV + every Tue Oct', extra: ['2025-10-07','2025-10-14','2025-10-21','2025-10-28'] },
    { desc: 'LV + every Wed Mar', extra: ['2026-03-04','2026-03-11','2026-03-18','2026-03-25'] },
    { desc: 'LV + every Mon 6wk spring', extra: ['2026-04-13','2026-04-20','2026-04-27','2026-05-04','2026-05-11','2026-05-18'] },
    { desc: 'LV + every other Fri Oct-Dec', extra: ['2025-10-03','2025-10-17','2025-10-31','2025-11-14','2025-12-05','2025-12-19'] },
    { desc: 'LV + sick extending long weekends', extra: ['2025-09-22','2025-10-01','2025-11-26','2026-01-20','2026-05-26'] },
    { desc: 'LV + sick first/last day + random', extra: ['2025-09-02','2026-06-26','2025-11-19','2026-02-25','2026-04-22'] },
    { desc: 'LV + jury duty 5 days Mar', extra: ['2026-03-09','2026-03-10','2026-03-11','2026-03-12','2026-03-13'] },
    { desc: 'LV + jury duty spread Apr', extra: ['2026-04-13','2026-04-15','2026-04-17','2026-04-20','2026-04-22'] },
    { desc: 'LV + max absences: 10 sick + 3 snow + jury', extra: ['2025-09-15','2025-10-08','2025-11-19','2025-12-10','2026-01-14','2026-02-25','2026-03-25','2026-04-22','2026-05-13','2026-06-10','2026-01-07','2026-02-11','2026-03-04','2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17'] },
    { desc: 'LV + terrible fall', extra: ['2025-09-15','2025-09-16','2025-09-17','2025-09-18','2025-09-19','2025-10-06','2025-10-27','2025-11-03','2025-11-10','2025-11-17','2025-11-24'] },
    { desc: 'LV + terrible spring', extra: ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-09','2026-03-10','2026-03-11','2026-03-12','2026-03-13','2026-01-08','2026-02-11','2026-04-22','2026-05-06'] },
    { desc: 'LV + only 3 school days some weeks', extra: ['2025-09-22','2025-09-25','2025-10-01','2025-10-03','2025-11-24','2025-11-26','2026-01-20','2026-01-23'] },
    // --- Additional permutations for statistical coverage ---
    { desc: 'LV + clean (no extra absences)', extra: [] },
    { desc: 'LV + 3 sick scattered', extra: ['2025-10-15','2026-01-22','2026-04-28'] },
    { desc: 'LV + 5 sick early year', extra: ['2025-09-08','2025-09-18','2025-10-06','2025-10-16','2025-10-23'] },
    { desc: 'LV + 5 sick late year', extra: ['2026-04-20','2026-04-28','2026-05-06','2026-05-14','2026-06-03'] },
    { desc: 'LV + 8 random A', extra: ['2025-09-10','2025-10-14','2025-11-06','2025-12-09','2026-01-22','2026-03-05','2026-04-23','2026-05-20'] },
    { desc: 'LV + 8 random B', extra: ['2025-09-25','2025-10-21','2025-11-13','2025-12-16','2026-02-04','2026-03-17','2026-04-29','2026-06-04'] },
    { desc: 'LV + 12 random A', extra: ['2025-09-05','2025-09-19','2025-10-10','2025-10-28','2025-11-18','2025-12-04','2026-01-13','2026-02-05','2026-03-04','2026-04-15','2026-05-07','2026-06-02'] },
    { desc: 'LV + 12 random B', extra: ['2025-09-11','2025-09-30','2025-10-17','2025-11-07','2025-12-02','2025-12-18','2026-01-27','2026-02-12','2026-03-19','2026-04-21','2026-05-19','2026-06-11'] },
    { desc: 'LV + 15 heavy absences', extra: ['2025-09-04','2025-09-16','2025-10-03','2025-10-22','2025-11-05','2025-11-20','2025-12-05','2025-12-17','2026-01-09','2026-01-27','2026-02-12','2026-03-09','2026-04-17','2026-05-08','2026-06-05'] },
    { desc: 'LV + sick week Sep', extra: ['2025-09-08','2025-09-09','2025-09-10','2025-09-11','2025-09-12'] },
    { desc: 'LV + sick week Nov', extra: ['2025-11-03','2025-11-05','2025-11-06','2025-11-07'] },
    { desc: 'LV + sick week Dec', extra: ['2025-12-15','2025-12-16','2025-12-17','2025-12-18','2025-12-19'] },
    { desc: 'LV + sick week Jan', extra: ['2026-01-12','2026-01-13','2026-01-14','2026-01-15','2026-01-16'] },
    { desc: 'LV + sick week Apr', extra: ['2026-04-20','2026-04-21','2026-04-22','2026-04-23','2026-04-24'] },
    { desc: 'LV + sick week Jun', extra: ['2026-06-08','2026-06-09','2026-06-10','2026-06-11','2026-06-12'] },
    { desc: 'LV + 2 days Sep start', extra: ['2025-09-03','2025-09-04'] },
    { desc: 'LV + 2 days mid Oct', extra: ['2025-10-15','2025-10-16'] },
    { desc: 'LV + 2 days mid Jan', extra: ['2026-01-14','2026-01-15'] },
    { desc: 'LV + 2 days end May', extra: ['2026-05-28','2026-05-29'] },
    { desc: 'LV + 4 days Feb', extra: ['2026-02-09','2026-02-10','2026-02-11','2026-02-12'] },
    { desc: 'LV + every Thu Nov', extra: ['2025-11-06','2025-11-13','2025-11-20'] },
    { desc: 'LV + every Wed Jan', extra: ['2026-01-07','2026-01-14','2026-01-21','2026-01-28'] },
    { desc: 'LV + 2 snow + 5 sick A', extra: ['2026-01-15','2026-02-26','2025-10-09','2025-11-19','2025-12-11','2026-03-17','2026-05-12'] },
    { desc: 'LV + 2 snow + 5 sick B', extra: ['2026-02-04','2026-03-06','2025-09-18','2025-10-23','2025-12-04','2026-04-22','2026-05-21'] },
    { desc: 'LV + 3 snow + 3 sick', extra: ['2026-01-08','2026-02-11','2026-03-04','2025-10-29','2025-12-10','2026-05-13'] },
];

let pass = 0, fail = 0;

function getSpread(schedule) {
    const counts = new Map();
    for (const d of schedule) for (const l of d.lessons) {
        if (l.group !== SCHEDULE_CONFIG.MU_TOKEN) counts.set(l.group, (counts.get(l.group) || 0) + 1);
    }
    const vals = [...counts.values()];
    return vals.length > 0 ? Math.max(...vals) - Math.min(...vals) : 0;
}

function runTest(desc, start, cycle, daysOff, weeks) {
    const builder = new ScheduleBuilder(start, cycle, daysOff, weeks);
    const schedule = builder.buildSchedule();
    const issues = runChecks(schedule, builder);
    const spread = getSpread(schedule);
    const status = issues.length === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') fail++;
    else pass++;
    console.log(`${status} ${desc} c${cycle} (spread=${spread})${issues.length > 0 ? ': ' + issues.join(', ') : ''}`);
}

for (const t of tortureTests) {
    for (const cycle of [1, 2]) {
        runTest(t.desc, t.start, cycle, t.daysOff, t.weeks);
    }
}

console.log('\n--- Levittown realistic scenarios ---');
for (const t of realisticTests) {
    for (const cycle of [1, 2]) {
        runTest(t.desc, '2025-09-02', cycle, [...levittownBase, ...t.extra], 43);
    }
}

// --- Chunked scheduling: simulate building in 8-week chunks with history import ---
console.log('\n--- Chunked scheduling (8-week chunks, 4-week history) ---');

function runChunkedTest(desc, startCycle, daysOff) {
    const allGroups = [...SCHEDULE_CONFIG.DEFAULT_GROUP_NAMES];
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    let combined = [];
    let chunkStart = '2025-09-02';
    let chunkCycle = startCycle;
    // Track cumulative lesson counts across all chunks for accurate balance
    const cumulativeCounts = {};
    allGroups.forEach(g => cumulativeCounts[g] = 0);

    while (true) {
        const startDate = new Date(chunkStart + 'T00:00:00');
        const origEnd = new Date('2025-09-02T00:00:00');
        origEnd.setDate(origEnd.getDate() + 43 * 7);
        const weeksLeft = Math.ceil((origEnd - startDate) / (7 * SCHEDULE_CONFIG.ONE_DAY_MS));
        const thisChunkWeeks = Math.min(8, weeksLeft);
        if (thisChunkWeeks <= 0) break;

        let history = null;
        let counts = null;
        if (combined.length > 0) {
            const cutoff = new Date(startDate);
            cutoff.setDate(cutoff.getDate() - 4 * 7);
            history = [];
            for (const d of combined.filter(d => d.date >= cutoff)) {
                for (const l of d.lessons) {
                    history.push({ group: l.group, period: l.period, date: fmt(d.date) });
                }
            }
            counts = { ...cumulativeCounts };
        }

        const builder = new ScheduleBuilder(chunkStart, chunkCycle, daysOff, thisChunkWeeks, history, counts);
        const schedule = builder.buildSchedule();

        for (const d of schedule) {
            if (!combined.some(e => e.date.toDateString() === d.date.toDateString())) {
                combined.push(d);
                for (const l of d.lessons) {
                    if (l.group !== SCHEDULE_CONFIG.MU_TOKEN) cumulativeCounts[l.group]++;
                }
            }
        }

        const nextStart = new Date(startDate);
        nextStart.setDate(nextStart.getDate() + thisChunkWeeks * 7);
        chunkStart = fmt(nextStart);
        chunkCycle = (1 + schedule.length) % 2 === 0 ? 2 : 1;
    }

    combined.sort((a, b) => a.date - b.date);

    // Validate combined schedule
    const issues = [];
    // 28-day calendar spacing rule
    const lastSeen = {};
    for (const d of combined) {
        for (const l of d.lessons) {
            if (l.group === SCHEDULE_CONFIG.MU_TOKEN) continue;
            if (!lastSeen[l.group]) lastSeen[l.group] = {};
            const last = lastSeen[l.group][l.period];
            if (last && Math.round((d.date - last) / SCHEDULE_CONFIG.ONE_DAY_MS) < SCHEDULE_CONFIG.CALENDAR_SPACING_FLOOR) issues.push(`28DAY:${l.group} ${l.period}`);
            lastSeen[l.group][l.period] = d.date;
        }
    }

    // Weekly uniqueness
    const weeks = new Map();
    for (const d of combined) {
        const day = d.date.getDay();
        const off = day === 0 ? 6 : day - 1;
        const mon = new Date(d.date);
        mon.setDate(d.date.getDate() - off);
        const wk = mon.toDateString();
        if (!weeks.has(wk)) weeks.set(wk, new Set());
        for (const l of d.lessons) {
            if (l.group === SCHEDULE_CONFIG.MU_TOKEN) continue;
            if (weeks.get(wk).has(l.group)) issues.push(`WEEKLY:${l.group}`);
            weeks.get(wk).add(l.group);
        }
    }

    // Balance
    const counts = {};
    allGroups.forEach(g => counts[g] = 0);
    for (const d of combined) for (const l of d.lessons) if (l.group !== SCHEDULE_CONFIG.MU_TOKEN) counts[l.group]++;
    const vals = Object.values(counts);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread > SCHEDULE_CONFIG.RUNNING_BALANCE_THRESHOLD) issues.push(`BALANCE:${spread}`);

    const status = issues.length === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') fail++;
    else pass++;
    console.log(`${status} ${desc} c${startCycle} (chunked, spread=${spread})${issues.length > 0 ? ': ' + issues.join(', ') : ''}`);
}

// Test chunked mode with base calendar and a few realistic scenarios
const chunkedTests = [
    { desc: 'LV chunked clean', extra: [] },
    { desc: 'LV chunked + 10 sick', extra: ['2025-09-15','2025-10-08','2025-10-29','2025-11-19','2025-12-10','2026-01-14','2026-02-25','2026-03-11','2026-04-22','2026-05-13'] },
    { desc: 'LV chunked + terrible fall', extra: ['2025-09-15','2025-09-16','2025-09-17','2025-09-18','2025-09-19','2025-10-06','2025-10-27','2025-11-03','2025-11-10','2025-11-17','2025-11-24'] },
    { desc: 'LV chunked + max absences', extra: ['2025-09-15','2025-10-08','2025-11-19','2025-12-10','2026-01-14','2026-02-25','2026-03-25','2026-04-22','2026-05-13','2026-06-10','2026-01-07','2026-02-11','2026-03-04','2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17'] },
];

for (const t of chunkedTests) {
    for (const cycle of [1, 2]) {
        runChunkedTest(t.desc, cycle, [...levittownBase, ...t.extra]);
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
