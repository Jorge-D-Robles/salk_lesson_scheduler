#!/usr/bin/env node
/**
 * CLI test runner for skipDay and recalculateFromDay functions.
 * Validates edit operations preserve constraints.
 *
 * Usage: node testing/run_edit_tests.mjs
 */
import { loadScheduler, runChecks, weekdaysInRange } from './helpers.mjs';

const { ScheduleBuilder, skipDay, recalculateFromDay } = loadScheduler();

let pass = 0, fail = 0;

function test(desc, fn) {
    try {
        fn();
        pass++;
        console.log(`PASS ${desc}`);
    } catch (e) {
        fail++;
        console.log(`FAIL ${desc}: ${e.message}`);
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

function generate(start, cycle, daysOff, weeks) {
    const builder = new ScheduleBuilder(start, cycle, daysOff, weeks);
    const schedule = builder.buildSchedule();
    return { schedule, builder };
}

function makeParams(startDate, weeks, daysOff = []) {
    const parts = startDate.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    d.setDate(d.getDate() + weeks * 7);
    return { originalEndDate: d, daysOff };
}

// --- skipDay tests ---

test('skipDay - middle day', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);
    const originalLen = schedule.length;
    const result = skipDay(schedule, 10);
    assertEqual(result.length, originalLen - 1, 'Length should decrease by 1');
    assert(result[9] === schedule[9], 'Entry before skip unchanged');
    assert(result[10] === schedule[11], 'Entry after skip shifted');
});

test('skipDay - first day', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);
    const result = skipDay(schedule, 0);
    assertEqual(result.length, schedule.length - 1);
    assert(result[0] === schedule[1], 'First entry is now second original');
});

test('skipDay - last day', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);
    const result = skipDay(schedule, schedule.length - 1);
    assertEqual(result.length, schedule.length - 1);
    assert(result[result.length - 1] === schedule[schedule.length - 2], 'Last entry is now second-to-last original');
});

test('skipDay - preserves data', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);
    const beforeLessons = schedule[5].lessons.map(l => `${l.period}:${l.group}`).join(',');
    skipDay(schedule, 10);
    const afterLessons = schedule[5].lessons.map(l => `${l.period}:${l.group}`).join(',');
    assertEqual(afterLessons, beforeLessons, 'Lesson data should not be mutated');
});

test('skipDay - multiple skips', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);
    const originalLen = schedule.length;
    let result = skipDay(schedule, 5);
    result = skipDay(result, 10);
    result = skipDay(result, 15);
    assertEqual(result.length, originalLen - 3, 'Length should decrease by 3');
});

// --- recalculateFromDay tests ---

test('recalculateFromDay - middle', () => {
    const { schedule, builder } = generate('2025-09-01', 1, [], 16);
    const params = makeParams('2025-09-01', 16);
    const dayIndex = 10;
    const result = recalculateFromDay(schedule, dayIndex, params);

    // Prior entries are same objects
    for (let i = 0; i < dayIndex; i++) {
        assert(result.schedule[i] === schedule[i], `Prior entry ${i} is same object`);
    }

    // Combined schedule passes constraint checks
    const issues = runChecks(result.schedule, builder);
    assert(issues.length === 0, `Constraint issues: ${issues.join(', ')}`);
});

test('recalculateFromDay - first day', () => {
    const { schedule, builder } = generate('2025-09-01', 1, [], 16);
    const params = makeParams('2025-09-01', 16);
    const result = recalculateFromDay(schedule, 0, params);

    // No prior entries
    assert(result.schedule.length > 0, 'Should produce a schedule');

    const issues = runChecks(result.schedule, builder);
    assert(issues.length === 0, `Constraint issues: ${issues.join(', ')}`);
});

test('recalculateFromDay - near end', () => {
    const { schedule, builder } = generate('2025-09-01', 1, [], 16);
    const params = makeParams('2025-09-01', 16);
    const dayIndex = schedule.length - 3;
    const result = recalculateFromDay(schedule, dayIndex, params);

    for (let i = 0; i < dayIndex; i++) {
        assert(result.schedule[i] === schedule[i], `Prior entry ${i} unchanged`);
    }
    assert(result.schedule.length >= dayIndex, 'Should have at least prior entries');
});

test('recalculateFromDay - with days off', () => {
    const daysOff = ['2025-10-13', '2025-10-14', '2025-11-11'];
    const { schedule, builder } = generate('2025-09-01', 1, daysOff, 16);
    const params = makeParams('2025-09-01', 16, daysOff);
    const dayIndex = 15;
    const result = recalculateFromDay(schedule, dayIndex, params);

    // New portion should respect days off
    const daysOffSet = new Set(daysOff.map(d => new Date(d + 'T00:00:00').toDateString()));
    for (let i = dayIndex; i < result.schedule.length; i++) {
        assert(!daysOffSet.has(result.schedule[i].date.toDateString()),
            `Entry ${i} should not fall on a day off`);
    }

    const issues = runChecks(result.schedule, builder);
    assert(issues.length === 0, `Constraint issues: ${issues.join(', ')}`);
});

test('recalculateFromDay - day cycle continuity', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);
    const params = makeParams('2025-09-01', 16);

    // Test with Day 1 deleted
    const day1Index = schedule.findIndex(e => e.dayCycle === 1);
    assert(day1Index >= 0, 'Should find a Day 1 entry');
    const result1 = recalculateFromDay(schedule, day1Index, params);
    if (result1.schedule.length > day1Index) {
        assertEqual(result1.schedule[day1Index].dayCycle, 2,
            'After deleting Day 1, next should be Day 2');
    }

    // Test with Day 2 deleted
    const day2Index = schedule.findIndex(e => e.dayCycle === 2);
    assert(day2Index >= 0, 'Should find a Day 2 entry');
    const result2 = recalculateFromDay(schedule, day2Index, params);
    if (result2.schedule.length > day2Index) {
        assertEqual(result2.schedule[day2Index].dayCycle, 1,
            'After deleting Day 2, next should be Day 1');
    }
});

test('recalculateFromDay - constraint validation on new portion', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);
    const params = makeParams('2025-09-01', 16);
    const dayIndex = 10;
    const result = recalculateFromDay(schedule, dayIndex, params);

    // Check the new portion alone using the returned builder
    const newPortion = result.schedule.slice(dayIndex);
    if (newPortion.length > 0) {
        const issues = runChecks(newPortion, result.builder);
        assert(issues.length === 0, `New portion issues: ${issues.join(', ')}`);
    }
});

test('recalculateFromDay - multiple edits (skip then recalculate)', () => {
    const { schedule, builder } = generate('2025-09-01', 1, [], 16);
    const params = makeParams('2025-09-01', 16);

    // Skip a day first
    let edited = skipDay(schedule, 5);
    // Then recalculate from a later day
    const result = recalculateFromDay(edited, 15, params);

    assert(result.schedule.length > 0, 'Should produce a schedule');
    const issues = runChecks(result.schedule, builder);
    assert(issues.length === 0, `Constraint issues: ${issues.join(', ')}`);
});

test('recalculateFromDay - across winter break', () => {
    const daysOff = weekdaysInRange('2025-12-22', '2026-01-02');
    const { schedule, builder } = generate('2025-12-01', 1, daysOff, 16);
    const params = makeParams('2025-12-01', 16, daysOff);

    // Find a day just before the break
    const breakStart = new Date('2025-12-22T00:00:00');
    let preBreakIndex = -1;
    for (let i = 0; i < schedule.length; i++) {
        if (schedule[i].date < breakStart) preBreakIndex = i;
    }
    assert(preBreakIndex >= 0, 'Should have entries before break');

    const result = recalculateFromDay(schedule, preBreakIndex, params);
    assert(result.schedule.length > 0, 'Should produce a schedule');
    const issues = runChecks(result.schedule, builder);
    assert(issues.length === 0, `Constraint issues: ${issues.join(', ')}`);
});

test('recalculateFromDay - realistic school calendar', () => {
    const daysOff = [
        '2025-10-13', '2025-11-04', '2025-11-11',
        '2025-11-26', '2025-11-27', '2025-11-28',
        ...weekdaysInRange('2025-12-22', '2026-01-02'),
        '2026-01-19',
    ];
    const { schedule, builder } = generate('2025-09-02', 1, daysOff, 22);
    const params = makeParams('2025-09-02', 22, daysOff);
    const dayIndex = 20;
    const result = recalculateFromDay(schedule, dayIndex, params);

    for (let i = 0; i < dayIndex; i++) {
        assert(result.schedule[i] === schedule[i], `Prior entry ${i} unchanged`);
    }
    const issues = runChecks(result.schedule, builder);
    assert(issues.length === 0, `Constraint issues: ${issues.join(', ')}`);
});

test('skipDay - all days in a week', () => {
    const { schedule } = generate('2025-09-01', 1, [], 16);

    // Find 5 consecutive days in the same week
    let weekStart = -1;
    for (let i = 0; i <= schedule.length - 5; i++) {
        const mon = schedule[i].date.getDay();
        if (mon === 1) { weekStart = i; break; }
    }
    assert(weekStart >= 0, 'Should find a Monday');

    // Skip 5 days from that week (adjust indices as we go)
    let result = schedule;
    for (let k = 0; k < 5; k++) {
        result = skipDay(result, weekStart);
    }
    assertEqual(result.length, schedule.length - 5, 'Should remove 5 days');
});

test('recalculateFromDay - only 1 day remains after', () => {
    const { schedule, builder } = generate('2025-09-01', 1, [], 16);
    const params = makeParams('2025-09-01', 16);
    const dayIndex = schedule.length - 2;
    const result = recalculateFromDay(schedule, dayIndex, params);

    // Prior should be intact
    for (let i = 0; i < dayIndex; i++) {
        assert(result.schedule[i] === schedule[i], `Prior entry ${i} unchanged`);
    }
});

test('recalculateFromDay - cycle 2 start', () => {
    const { schedule, builder } = generate('2025-09-01', 2, [], 16);
    const params = makeParams('2025-09-01', 16);
    const result = recalculateFromDay(schedule, 10, params);

    const issues = runChecks(result.schedule, builder);
    assert(issues.length === 0, `Constraint issues: ${issues.join(', ')}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
