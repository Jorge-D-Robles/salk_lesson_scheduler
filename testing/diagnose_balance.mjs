#!/usr/bin/env node
/**
 * Deep analysis of lesson count balance across groups.
 *
 * Questions answered:
 * 1. What's the per-schedule balance (max-min)?
 * 2. Which groups consistently get fewer lessons?
 * 3. Is it the shuffle, the period constraints, MU placement, or something else?
 * 4. What happens with a larger sample size (more start dates)?
 */
import { loadScheduler } from './helpers.mjs';

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

const allGroups = Array.from({ length: 22 }, (_, i) => String.fromCharCode(65 + i));

// ========================================================================
// PART 1: Per-schedule balance distribution
// ========================================================================
console.log('=== PART 1: Per-schedule balance (max-min lesson count) ===\n');

const perScheduleBalances = [];
const perScheduleDetails = [];

for (const t of realisticTests) {
    for (const cycle of [1, 2]) {
        const daysOff = [...levittownBase, ...t.extra];
        const builder = new ScheduleBuilder('2025-09-02', cycle, daysOff, 43);
        const schedule = builder.buildSchedule();

        const counts = {};
        let muCount = 0;
        let totalSlots = 0;
        allGroups.forEach(g => counts[g] = 0);

        for (const day of schedule) {
            totalSlots += day.lessons.length;
            for (const lesson of day.lessons) {
                if (lesson.group === 'MU') muCount++;
                else if (counts[lesson.group] !== undefined) counts[lesson.group]++;
            }
        }

        const vals = Object.values(counts);
        const maxC = Math.max(...vals);
        const minC = Math.min(...vals);
        const spread = maxC - minC;

        const minGroups = allGroups.filter(g => counts[g] === minC);
        const maxGroups = allGroups.filter(g => counts[g] === maxC);

        perScheduleBalances.push(spread);
        perScheduleDetails.push({
            desc: `${t.desc} c${cycle}`,
            spread,
            minC, maxC,
            minGroups, maxGroups,
            totalNonMU: vals.reduce((s, v) => s + v, 0),
            muCount,
            totalSlots,
            counts: { ...counts },
        });
    }
}

// Distribution of per-schedule spread
const spreadDist = {};
perScheduleBalances.forEach(s => spreadDist[s] = (spreadDist[s] || 0) + 1);
console.log('Spread distribution across 60 schedules:');
for (const [spread, count] of Object.entries(spreadDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  max-min=${spread}: ${count} schedules ${'█'.repeat(count)}`);
}

// ========================================================================
// PART 2: Which groups are min/max within each schedule?
// ========================================================================
console.log('\n=== PART 2: How often is each group at min vs max count? ===\n');

const atMin = {};
const atMax = {};
allGroups.forEach(g => { atMin[g] = 0; atMax[g] = 0; });

for (const d of perScheduleDetails) {
    for (const g of d.minGroups) atMin[g]++;
    for (const g of d.maxGroups) atMax[g]++;
}

console.log('Group  AtMin  AtMax  Net(max-min)');
const netEntries = allGroups.map(g => ({ g, atMin: atMin[g], atMax: atMax[g], net: atMax[g] - atMin[g] }));
netEntries.sort((a, b) => b.net - a.net);
for (const e of netEntries) {
    const bar = e.net > 0 ? '+'.repeat(e.net) : '-'.repeat(-e.net);
    console.log(`  ${e.g}:   ${String(e.atMin).padStart(3)}    ${String(e.atMax).padStart(3)}    ${String(e.net).padStart(4)} ${bar}`);
}

// ========================================================================
// PART 3: Where does the imbalance come from?
// ========================================================================
console.log('\n=== PART 3: Root cause analysis ===\n');

// For schedules with spread > 0, examine what happened
const imbalanced = perScheduleDetails.filter(d => d.spread > 0);
console.log(`${imbalanced.length}/${perScheduleDetails.length} schedules have spread > 0\n`);

// Look at a specific imbalanced schedule in detail
if (imbalanced.length > 0) {
    // Pick the one with the most spread
    const worst = imbalanced.sort((a, b) => b.spread - a.spread)[0];
    console.log(`Worst case: "${worst.desc}" spread=${worst.spread}`);
    console.log(`  Total slots: ${worst.totalSlots}, MU: ${worst.muCount}, Non-MU: ${worst.totalNonMU}`);
    console.log(`  ${worst.totalNonMU} non-MU lessons / 22 groups = ${(worst.totalNonMU / 22).toFixed(2)} per group`);
    console.log(`  Floor: ${Math.floor(worst.totalNonMU / 22)}, Ceil: ${Math.ceil(worst.totalNonMU / 22)}`);
    console.log(`  Remainder: ${worst.totalNonMU % 22} groups get ceil, ${22 - worst.totalNonMU % 22} get floor`);
    console.log(`  Min groups (${worst.minC}): [${worst.minGroups.join(', ')}]`);
    console.log(`  Max groups (${worst.maxC}): [${worst.maxGroups.join(', ')}]`);

    // Show the full count distribution
    const countDist = {};
    for (const c of Object.values(worst.counts)) {
        countDist[c] = (countDist[c] || 0) + 1;
    }
    console.log(`  Count distribution: ${Object.entries(countDist).sort((a,b) => Number(a[0]) - Number(b[0])).map(([c, n]) => `${c}×${n}`).join(', ')}`);
}

// ========================================================================
// PART 4: Mathematical analysis - is spread > 0 avoidable?
// ========================================================================
console.log('\n=== PART 4: Is perfect balance (spread=0) mathematically possible? ===\n');

for (const d of perScheduleDetails.slice(0, 10)) {
    const remainder = d.totalNonMU % 22;
    const theoreticalMinSpread = remainder === 0 ? 0 : 1;
    console.log(
        `  ${d.desc.padEnd(40)} ` +
        `nonMU=${d.totalNonMU} mod22=${remainder} ` +
        `theoretical_min_spread=${theoreticalMinSpread} ` +
        `actual=${d.spread} ` +
        `${d.spread > theoreticalMinSpread ? 'EXCESS' : 'OPTIMAL'}`
    );
}

// Count how many schedules achieve theoretical minimum vs excess
let optimal = 0, excess = 0;
for (const d of perScheduleDetails) {
    const remainder = d.totalNonMU % 22;
    const theoreticalMin = remainder === 0 ? 0 : 1;
    if (d.spread <= theoreticalMin) optimal++;
    else excess++;
}
console.log(`\n  Optimal (spread = theoretical min): ${optimal}/${perScheduleDetails.length}`);
console.log(`  Excess (spread > theoretical min):   ${excess}/${perScheduleDetails.length}`);

// ========================================================================
// PART 5: Bigger sample - run with 20 different start dates
// ========================================================================
console.log('\n=== PART 5: Larger sample - 20 start dates × base Levittown calendar ===\n');

const startDates = [];
// Generate 20 different September start dates across years
for (let year = 2020; year < 2030; year++) {
    for (let day = 2; day <= 3; day++) {
        startDates.push(`${year}-09-0${day}`);
    }
}

const bigSampleCounts = {};
allGroups.forEach(g => bigSampleCounts[g] = 0);
let bigSampleSchedules = 0;
const bigSampleSpreads = [];

for (const sd of startDates) {
    for (const cycle of [1, 2]) {
        bigSampleSchedules++;
        const builder = new ScheduleBuilder(sd, cycle, levittownBase, 43);
        const schedule = builder.buildSchedule();

        const counts = {};
        allGroups.forEach(g => counts[g] = 0);
        for (const day of schedule) {
            for (const lesson of day.lessons) {
                if (lesson.group !== 'MU' && counts[lesson.group] !== undefined) {
                    counts[lesson.group]++;
                    bigSampleCounts[lesson.group]++;
                }
            }
        }
        const vals = Object.values(counts);
        bigSampleSpreads.push(Math.max(...vals) - Math.min(...vals));
    }
}

console.log(`Ran ${bigSampleSchedules} schedules (${startDates.length} dates × 2 cycles)`);
console.log(`\nPer-schedule spread: avg=${(bigSampleSpreads.reduce((s,v)=>s+v,0)/bigSampleSpreads.length).toFixed(2)}`);
const bsDist = {};
bigSampleSpreads.forEach(s => bsDist[s] = (bsDist[s] || 0) + 1);
for (const [spread, count] of Object.entries(bsDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  spread=${spread}: ${count} schedules`);
}

console.log(`\nAggregate lessons across ${bigSampleSchedules} schedules:`);
const bigEntries = Object.entries(bigSampleCounts).sort((a, b) => b[1] - a[1]);
const bigMax = bigEntries[0][1];
const bigMin = bigEntries[bigEntries.length - 1][1];
for (const [g, count] of bigEntries) {
    const bar = '█'.repeat(Math.round((count - bigMin) / (bigMax - bigMin) * 40) || 0);
    console.log(`  ${g}: ${count} ${bar}`);
}
console.log(`\n  Range: ${bigMin}–${bigMax} (diff: ${bigMax - bigMin})`);
console.log(`  Per-schedule avg: ${(bigMax / bigSampleSchedules).toFixed(1)}–${(bigMin / bigSampleSchedules).toFixed(1)}`);
console.log(`  Diff per schedule: ${((bigMax - bigMin) / bigSampleSchedules).toFixed(2)} lessons`);
