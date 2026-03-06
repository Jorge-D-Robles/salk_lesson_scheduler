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
    { desc: 'Mon no off c1', start: '2025-09-01', cycle: 1, daysOff: [], weeks: 16 },
    { desc: 'Mon no off c2', start: '2025-09-01', cycle: 2, daysOff: [], weeks: 16 },
    { desc: 'Wed scattered c1', start: '2025-09-03', cycle: 1, daysOff: ['2025-09-10', '2025-09-15'], weeks: 16 },
    { desc: 'Wed scattered c2', start: '2025-09-03', cycle: 2, daysOff: ['2025-09-10', '2025-09-15'], weeks: 16 },
    { desc: 'Thanksgiving c1', start: '2025-11-24', cycle: 1, daysOff: ['2025-11-27', '2025-11-28'], weeks: 16 },
    { desc: 'Thanksgiving c2', start: '2025-11-24', cycle: 2, daysOff: ['2025-11-27', '2025-11-28'], weeks: 16 },
    { desc: 'Winter break c1', start: '2025-12-15', cycle: 1, daysOff: weekdaysInRange('2025-12-22', '2026-01-02'), weeks: 16 },
    { desc: 'Winter break c2', start: '2025-12-15', cycle: 2, daysOff: weekdaysInRange('2025-12-22', '2026-01-02'), weeks: 16 },
    { desc: 'Swiss cheese c1', start: '2025-09-22', cycle: 1, daysOff: ['2025-09-22', '2025-09-24', '2025-09-26'], weeks: 16 },
    { desc: 'Swiss cheese c2', start: '2025-09-22', cycle: 2, daysOff: ['2025-09-22', '2025-09-24', '2025-09-26'], weeks: 16 },
    { desc: 'Full week off c1', start: '2025-10-06', cycle: 1, daysOff: weekdaysInRange('2025-10-13', '2025-10-17'), weeks: 16 },
    { desc: 'Full week off c2', start: '2025-10-06', cycle: 2, daysOff: weekdaysInRange('2025-10-13', '2025-10-17'), weeks: 16 },
    { desc: '40wk holidays c1', start: '2025-09-01', cycle: 1, daysOff: ['2025-10-13', '2025-11-11', '2025-11-27', '2025-11-28', ...weekdaysInRange('2025-12-22', '2026-01-02'), '2026-01-19', '2026-02-16', ...weekdaysInRange('2026-02-16', '2026-02-20'), ...weekdaysInRange('2026-04-06', '2026-04-10'), '2026-05-25'], weeks: 40 },
    { desc: 'Every Mon off c1', start: '2025-09-01', cycle: 1, daysOff: allMondaysInRange('2025-09-01', '2025-12-19'), weeks: 16 },
    { desc: 'Every Fri off c1', start: '2025-09-01', cycle: 1, daysOff: allFridaysInRange('2025-09-01', '2025-12-19'), weeks: 16 },
    { desc: 'Mon+Fri off c1', start: '2025-09-01', cycle: 1, daysOff: [...allMondaysInRange('2025-09-01', '2025-11-21'), ...allFridaysInRange('2025-09-01', '2025-11-21')], weeks: 16 },
    { desc: '4x 3-day wks c1', start: '2025-09-01', cycle: 1, daysOff: ['2025-09-08', '2025-09-12', '2025-09-15', '2025-09-19', '2025-09-22', '2025-09-26', '2025-09-29', '2025-10-03'], weeks: 16 },
    { desc: 'Start Thu Fri off', start: '2025-09-04', cycle: 1, daysOff: ['2025-09-05'], weeks: 16 },
    { desc: 'Realistic semester', start: '2025-09-02', cycle: 1, daysOff: ['2025-10-13', '2025-11-04', '2025-11-11', '2025-11-26', '2025-11-27', '2025-11-28', ...weekdaysInRange('2025-12-22', '2026-01-02'), '2026-01-19'], weeks: 22 },
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
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
