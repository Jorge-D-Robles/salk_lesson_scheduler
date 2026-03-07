#!/usr/bin/env node
/**
 * Root cause: WHY do certain groups always get the extra lesson?
 * Traces the last incomplete cycle to find which groups fill it.
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

const allGroups = Array.from({ length: 22 }, (_, i) => String.fromCharCode(65 + i));

// Run the base Levittown schedule
const builder = new ScheduleBuilder('2025-09-02', 1, levittownBase, 43);
const schedule = builder.buildSchedule();

// Count lessons per group
const counts = {};
allGroups.forEach(g => counts[g] = 0);
for (const day of schedule) {
    for (const l of day.lessons) {
        if (l.group !== 'MU') counts[l.group]++;
    }
}

const totalNonMU = Object.values(counts).reduce((s, v) => s + v, 0);
const maxC = Math.max(...Object.values(counts));
const minC = Math.min(...Object.values(counts));
const ceilGroups = allGroups.filter(g => counts[g] === maxC);
const floorGroups = allGroups.filter(g => counts[g] === minC);

console.log(`Total non-MU: ${totalNonMU}, mod 22 = ${totalNonMU % 22}`);
console.log(`Max: ${maxC} (${ceilGroups.length} groups: [${ceilGroups.join(', ')}])`);
console.log(`Min: ${minC} (${floorGroups.length} groups: [${floorGroups.join(', ')}])`);
console.log(`Spread: ${maxC - minC}\n`);

// Find the shuffled order
console.log(`Shuffled LESSON_GROUPS order for 2025-09-02:`);
console.log(`  [${builder.LESSON_GROUPS.join(', ')}]\n`);

// Track cycle boundaries
const seq = [];
for (const day of schedule) {
    for (const l of day.lessons) {
        if (l.group !== 'MU') {
            seq.push({ group: l.group, date: day.date });
        }
    }
}

// Find where each full cycle of 22 unique groups completes
const seen = new Set();
let cycleStarts = [0];
for (let i = 0; i < seq.length; i++) {
    seen.add(seq[i].group);
    if (seen.size === 22) {
        if (i + 1 < seq.length) cycleStarts.push(i + 1);
        seen.clear();
    }
}

const lastCycleStart = cycleStarts[cycleStarts.length - 1];
const lastCycleGroups = seq.slice(lastCycleStart).map(e => e.group);
const uniqueInLastCycle = [...new Set(lastCycleGroups)];

console.log(`Complete cycles: ${cycleStarts.length - 1}`);
console.log(`Last incomplete cycle starts at lesson #${lastCycleStart}`);
console.log(`Last cycle has ${lastCycleGroups.length} lessons, ${uniqueInLastCycle.length} unique groups`);
console.log(`Groups in last cycle: [${uniqueInLastCycle.join(', ')}]`);
console.log(`Groups NOT in last cycle (these get fewer lessons): [${allGroups.filter(g => !uniqueInLastCycle.includes(g)).join(', ')}]\n`);

// The groups NOT in the last cycle are the ones with fewer lessons
const notInLast = allGroups.filter(g => !uniqueInLastCycle.includes(g));
console.log('Verification - are floor groups = groups not in last cycle?');
console.log(`  Floor groups:        [${floorGroups.sort().join(', ')}]`);
console.log(`  Not in last cycle:   [${notInLast.sort().join(', ')}]`);
console.log(`  Match: ${JSON.stringify(floorGroups.sort()) === JSON.stringify(notInLast.sort())}\n`);

// Now the key question: what determines the last cycle order?
// It's lastGlobalPos from the previous cycle
console.log('Position in shuffled order vs lesson count:');
const orderMap = {};
builder.LESSON_GROUPS.forEach((g, i) => orderMap[g] = i);
const sorted = allGroups.slice().sort((a, b) => orderMap[a] - orderMap[b]);
for (const g of sorted) {
    const pos = orderMap[g];
    const inLast = uniqueInLastCycle.includes(g) ? 'YES' : 'NO ';
    console.log(`  ${g}: shufflePos=${String(pos).padStart(2)}, lessons=${counts[g]}, inLastCycle=${inLast}`);
}

console.log('\n--- FIX ANALYSIS ---');
console.log('The groups at the START of the shuffled order fill the last cycle first.');
console.log('Groups at the END never make it into the last cycle → fewer lessons.');
console.log('\nPotential fix: track lesson counts during scheduling.');
console.log('When starting the last ~2 cycles, prioritize under-scheduled groups.');
console.log('Or: post-process by swapping max/min groups on the last few days.');
