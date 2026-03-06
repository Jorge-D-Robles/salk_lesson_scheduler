#!/usr/bin/env node
/**
 * CLI torture test runner with extreme edge cases.
 * Tests heavy days-off patterns, minimal availability, long schedules,
 * and 28-day boundary stress cases across both day cycles.
 *
 * Usage: node testing/run_torture_tests.mjs
 */
import { loadScheduler, runChecks, weekdaysInRange, allMondaysInRange, allFridaysInRange } from './helpers.mjs';

const { ScheduleBuilder } = loadScheduler();

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
];

let pass = 0, fail = 0;
for (const t of tortureTests) {
    for (const cycle of [1, 2]) {
        const builder = new ScheduleBuilder(t.start, cycle, t.daysOff, t.weeks);
        const schedule = builder.buildSchedule();
        const issues = runChecks(schedule, builder);
        const status = issues.length === 0 ? 'PASS' : 'FAIL';
        if (status === 'FAIL') fail++;
        else pass++;
        console.log(`${status} ${t.desc} c${cycle}${issues.length > 0 ? ': ' + issues.join(', ') : ''}`);
    }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
