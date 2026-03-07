#!/usr/bin/env node
/**
 * Diagnostic tool: shows exactly which cycle violations occur and why.
 * For each violation, prints the group, the two consecutive appearances,
 * which groups were missing between them, and the dates involved.
 *
 * Usage:
 *   node testing/diagnose_cycle.mjs                    # analyze all 60 realistic scenarios
 *   node testing/diagnose_cycle.mjs "2 snow days Jan"  # analyze a specific scenario by name
 */
import { loadScheduler, analyzeCycleViolations } from './helpers.mjs';

const { ScheduleBuilder } = loadScheduler();

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

// Same definitions as run_torture_tests.mjs
const realisticTests = [
    { desc: '10 random sick days', extra: ['2025-09-15','2025-10-08','2025-10-29','2025-11-19','2025-12-10','2026-01-14','2026-02-25','2026-03-11','2026-04-22','2026-05-13'] },
    { desc: '10 sick days fall', extra: ['2025-09-08','2025-09-12','2025-09-17','2025-10-06','2025-10-09','2025-10-15','2025-10-22','2025-10-28','2025-11-05','2025-11-13'] },
    { desc: '10 sick days winter', extra: ['2026-01-07','2026-01-12','2026-01-21','2026-01-28','2026-02-09','2026-02-23','2026-03-02','2026-03-09','2026-03-16','2026-03-25'] },
    { desc: '10 sick Mondays', extra: ['2025-09-08','2025-09-29','2025-10-27','2025-11-17','2025-12-08','2026-01-12','2026-02-09','2026-03-09','2026-04-27','2026-05-18'] },
    { desc: '10 sick Fridays', extra: ['2025-09-12','2025-10-03','2025-10-24','2025-11-14','2025-12-05','2026-01-09','2026-02-13','2026-03-13','2026-04-24','2026-05-15'] },
    { desc: 'sick week Oct', extra: ['2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-10-10'] },
    { desc: 'sick week after winter break', extra: ['2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09'] },
    { desc: 'sick days before spring break', extra: ['2026-03-30','2026-03-31','2026-04-01'] },
    { desc: 'sick week May', extra: ['2026-05-04','2026-05-05','2026-05-06','2026-05-07','2026-05-08'] },
    { desc: '2wk illness Nov/Thanksgiving', extra: ['2025-11-17','2025-11-18','2025-11-19','2025-11-20','2025-11-21','2025-11-24','2025-11-25','2025-11-26'] },
    { desc: '2wk illness Mar', extra: ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-09','2026-03-10','2026-03-11','2026-03-12','2026-03-13'] },
    { desc: '1 snow day Feb', extra: ['2026-02-11'] },
    { desc: '2 snow days Jan', extra: ['2026-01-07','2026-01-08'] },
    { desc: '3 snow days in 1 week Mar', extra: ['2026-03-03','2026-03-04','2026-03-05'] },
    { desc: 'snow extending winter break', extra: ['2025-12-23'] },
    { desc: 'snow extending Feb recess', extra: ['2026-02-23'] },
    { desc: '3 snow + 7 sick winter', extra: ['2026-01-08','2026-02-11','2026-03-04','2025-12-03','2025-12-15','2026-01-14','2026-01-28','2026-02-25','2026-03-16','2026-03-25'] },
    { desc: '3 snow + flu week Jan', extra: ['2026-01-06','2026-02-10','2026-03-03','2026-01-12','2026-01-13','2026-01-14','2026-01-15','2026-01-16'] },
    { desc: 'every Tue Oct', extra: ['2025-10-07','2025-10-14','2025-10-21','2025-10-28'] },
    { desc: 'every Wed Mar', extra: ['2026-03-04','2026-03-11','2026-03-18','2026-03-25'] },
    { desc: 'every Mon 6wk spring', extra: ['2026-04-13','2026-04-20','2026-04-27','2026-05-04','2026-05-11','2026-05-18'] },
    { desc: 'every other Fri Oct-Dec', extra: ['2025-10-03','2025-10-17','2025-10-31','2025-11-14','2025-12-05','2025-12-19'] },
    { desc: 'sick extending long weekends', extra: ['2025-09-22','2025-10-01','2025-11-26','2026-01-20','2026-05-26'] },
    { desc: 'sick first/last day + random', extra: ['2025-09-02','2026-06-26','2025-11-19','2026-02-25','2026-04-22'] },
    { desc: 'jury duty 5 days Mar', extra: ['2026-03-09','2026-03-10','2026-03-11','2026-03-12','2026-03-13'] },
    { desc: 'jury duty spread Apr', extra: ['2026-04-13','2026-04-15','2026-04-17','2026-04-20','2026-04-22'] },
    { desc: 'max absences: 10 sick + 3 snow + jury', extra: ['2025-09-15','2025-10-08','2025-11-19','2025-12-10','2026-01-14','2026-02-25','2026-03-25','2026-04-22','2026-05-13','2026-06-10','2026-01-07','2026-02-11','2026-03-04','2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17'] },
    { desc: 'terrible fall', extra: ['2025-09-15','2025-09-16','2025-09-17','2025-09-18','2025-09-19','2025-10-06','2025-10-27','2025-11-03','2025-11-10','2025-11-17','2025-11-24'] },
    { desc: 'terrible spring', extra: ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-09','2026-03-10','2026-03-11','2026-03-12','2026-03-13','2026-01-08','2026-02-11','2026-04-22','2026-05-06'] },
    { desc: 'only 3 school days some weeks', extra: ['2025-09-22','2025-09-25','2025-10-01','2025-10-03','2025-11-24','2025-11-26','2026-01-20','2026-01-23'] },
];

const filter = process.argv[2]?.toLowerCase();

function analyzeScenario(desc, cycle, daysOff) {
    const builder = new ScheduleBuilder('2025-09-02', cycle, daysOff, 43);
    const schedule = builder.buildSchedule();
    const allGroups = builder.LESSON_GROUPS;
    const cycleInfo = analyzeCycleViolations(schedule, builder);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`${desc} c${cycle}: ${cycleInfo.summary}`);
    console.log('='.repeat(80));

    if (cycleInfo.violations === 0) {
        console.log('  No violations!');
        return;
    }

    // Build flat sequence with date info for detailed output
    const seq = [];
    for (const day of schedule) {
        for (const lesson of day.lessons) {
            if (lesson.group !== 'MU') {
                seq.push({ group: lesson.group, period: lesson.period, date: day.date });
            }
        }
    }

    // Rebuild violation details with dates
    const gi = new Map();
    allGroups.forEach(g => gi.set(g, []));
    seq.forEach((entry, i) => { if (gi.has(entry.group)) gi.get(entry.group).push(i); });

    const violations = [];
    for (const [group, indices] of gi.entries()) {
        for (let i = 0; i < indices.length - 1; i++) {
            const idx1 = indices[i];
            const idx2 = indices[i + 1];
            const between = new Set(seq.slice(idx1 + 1, idx2).map(e => e.group));
            const missing = allGroups.filter(g => g !== group && !between.has(g));
            if (missing.length > 0) {
                violations.push({
                    group, idx1, idx2,
                    date1: seq[idx1].date.toISOString().slice(0, 10),
                    date2: seq[idx2].date.toISOString().slice(0, 10),
                    daysBetween: Math.round((seq[idx2].date - seq[idx1].date) / 86400000),
                    gap: idx2 - idx1 - 1,
                    missing,
                });
            }
        }
    }

    // Group violations by group
    const byGroup = new Map();
    for (const v of violations) {
        if (!byGroup.has(v.group)) byGroup.set(v.group, []);
        byGroup.get(v.group).push(v);
    }

    console.log(`\nGroups with violations (${byGroup.size}/${allGroups.length}):`);
    for (const [g, vs] of [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length)) {
        console.log(`  ${g}: ${vs.length} violations`);
        for (const v of vs) {
            console.log(
                `    ${v.date1} → ${v.date2} (${v.daysBetween}d, ${v.gap} lessons between) ` +
                `missing: [${v.missing.join(',')}]`
            );
        }
    }

    // Most commonly skipped groups
    const skipCounts = {};
    for (const v of violations) {
        for (const m of v.missing) {
            skipCounts[m] = (skipCounts[m] || 0) + 1;
        }
    }
    console.log(`\nMost commonly skipped:`);
    for (const [g, count] of Object.entries(skipCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        console.log(`  ${g}: skipped ${count} times`);
    }
}

// Run analysis
let analyzed = 0;
for (const t of realisticTests) {
    if (filter && !t.desc.toLowerCase().includes(filter)) continue;
    for (const cycle of [1, 2]) {
        analyzeScenario(`LV + ${t.desc}`, cycle, [...levittownBase, ...t.extra]);
        analyzed++;
    }
}

if (analyzed === 0) {
    console.log(`No scenarios matching "${filter}". Available:`);
    for (const t of realisticTests) console.log(`  "${t.desc}"`);
}
