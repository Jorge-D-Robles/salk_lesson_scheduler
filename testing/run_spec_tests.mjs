#!/usr/bin/env node
/**
 * CLI test runner that mirrors the Jasmine spec test cases from scheduler.spec.js.
 * Validates all scheduling constraints without needing a browser.
 *
 * Usage: node testing/run_spec_tests.mjs
 */
import { loadScheduler, runChecks, weekdaysInRange, allMondaysInRange, allFridaysInRange } from './helpers.mjs';

const { ScheduleBuilder } = loadScheduler();

const tests = [
    { desc: 'Mon no off c1', start: '2026-09-14', cycle: 1, daysOff: [], weeks: 16 },
    { desc: 'Mon no off c2', start: '2026-09-14', cycle: 2, daysOff: [], weeks: 16 },
    { desc: 'Wed scattered c1', start: '2026-09-09', cycle: 1, daysOff: ['2026-09-16', '2026-09-21'], weeks: 16 },
    { desc: 'Wed scattered c2', start: '2026-09-09', cycle: 2, daysOff: ['2026-09-16', '2026-09-21'], weeks: 16 },
    { desc: 'Thanksgiving c1', start: '2026-11-23', cycle: 1, daysOff: ['2026-11-26', '2026-11-27'], weeks: 16 },
    { desc: 'Thanksgiving c2', start: '2026-11-23', cycle: 2, daysOff: ['2026-11-26', '2026-11-27'], weeks: 16 },
    { desc: 'Winter break c1', start: '2026-12-14', cycle: 1, daysOff: weekdaysInRange('2026-12-24', '2027-01-01'), weeks: 16 },
    { desc: 'Winter break c2', start: '2026-12-14', cycle: 2, daysOff: weekdaysInRange('2026-12-24', '2027-01-01'), weeks: 16 },
    { desc: 'Swiss cheese c1', start: '2026-09-21', cycle: 1, daysOff: ['2026-09-21', '2026-09-23', '2026-09-25'], weeks: 16 },
    { desc: 'Swiss cheese c2', start: '2026-09-21', cycle: 2, daysOff: ['2026-09-21', '2026-09-23', '2026-09-25'], weeks: 16 },
    { desc: 'Full week off c1', start: '2026-10-05', cycle: 1, daysOff: weekdaysInRange('2026-10-12', '2026-10-16'), weeks: 16 },
    { desc: 'Full week off c2', start: '2026-10-05', cycle: 2, daysOff: weekdaysInRange('2026-10-12', '2026-10-16'), weeks: 16 },
    { desc: '40wk holidays c2', start: '2026-09-08', cycle: 2, daysOff: ['2026-09-21', '2026-10-12', '2026-11-03', '2026-11-11', '2026-11-26', '2026-11-27', ...weekdaysInRange('2026-12-24', '2027-01-01'), '2027-01-18', ...weekdaysInRange('2027-02-15', '2027-02-19'), ...weekdaysInRange('2027-03-29', '2027-04-02'), '2027-05-31', '2027-06-18'], weeks: 40 },
    { desc: 'Every Mon off c1', start: '2026-09-14', cycle: 1, daysOff: allMondaysInRange('2026-09-14', '2026-12-25'), weeks: 16 },
    { desc: 'Every Fri off c1', start: '2026-09-14', cycle: 1, daysOff: allFridaysInRange('2026-09-14', '2026-12-25'), weeks: 16 },
    { desc: 'Mon+Fri off c1', start: '2026-09-14', cycle: 1, daysOff: [...allMondaysInRange('2026-09-14', '2026-11-20'), ...allFridaysInRange('2026-09-14', '2026-11-20')], weeks: 16 },
    { desc: '4x 3-day wks c1', start: '2026-09-14', cycle: 1, daysOff: ['2026-09-14', '2026-09-18', '2026-09-21', '2026-09-25', '2026-09-28', '2026-10-02', '2026-10-05', '2026-10-09'], weeks: 16 },
    { desc: 'Start Thu Fri off', start: '2026-09-03', cycle: 1, daysOff: ['2026-09-04'], weeks: 16 },
    { desc: 'Realistic semester', start: '2026-09-08', cycle: 1, daysOff: ['2026-09-21', '2026-10-12', '2026-11-03', '2026-11-11', '2026-11-26', '2026-11-27', ...weekdaysInRange('2026-12-24', '2027-01-01'), '2027-01-18'], weeks: 22 },
];

let pass = 0, fail = 0;
for (const t of tests) {
    const builder = new ScheduleBuilder(t.start, t.cycle, t.daysOff, t.weeks);
    const schedule = builder.buildSchedule();
    const issues = runChecks(schedule, builder);
    const status = issues.length === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') fail++;
    else pass++;
    console.log(`${status} ${t.desc}${issues.length > 0 ? ': ' + issues.join(', ') : ''}`);
}

// Dedicated MU distribution check
const muBuilder = new ScheduleBuilder("2026-09-08", 2, [], 16);
const muSchedule = muBuilder.buildSchedule();
const muPeriods = new Set();
muSchedule.forEach(d => d.lessons.forEach(l => {
    if (l.group === 'MU') muPeriods.add(parseInt(l.period.replace('Pd ', ''), 10));
}));
if (muPeriods.size >= 4) {
    pass++;
    console.log(`PASS MU spread across periods (${muPeriods.size} distinct periods)`);
} else {
    fail++;
    console.log(`FAIL MU spread across periods (only ${muPeriods.size} distinct periods)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
