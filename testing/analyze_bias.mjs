#!/usr/bin/env node
/**
 * Statistical bias analysis across many realistic Salk schedule permutations.
 * Generates an HTML report with charts showing per-group deviation.
 *
 * Usage: node testing/analyze_bias.mjs
 *        → outputs testing/bias_report.html
 */
import { loadScheduler, weekdaysInRange } from './helpers.mjs';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { ScheduleBuilder, SCHEDULE_CONFIG } = loadScheduler();

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

const allGroups = [...SCHEDULE_CONFIG.DEFAULT_GROUP_NAMES];

// --- Generate all school days for picking random absences ---
function getSchoolDays() {
    const start = new Date(2025, 8, 2); // Sep 2
    const end = new Date(2026, 5, 26);  // Jun 26
    const offSet = new Set(levittownBase.map(d => {
        const p = d.split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]).toDateString();
    }));
    const days = [];
    const cur = new Date(start);
    while (cur <= end) {
        const dow = cur.getDay();
        if (dow >= 1 && dow <= 5 && !offSet.has(cur.toDateString())) {
            days.push(
                `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
            );
        }
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}

// Seeded PRNG for reproducible random day selection
function seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}

function pickRandom(arr, n, seed) {
    const rng = seededRandom(seed);
    const copy = [...arr];
    const result = [];
    for (let i = 0; i < n && copy.length > 0; i++) {
        const idx = Math.floor(rng() * copy.length);
        result.push(copy.splice(idx, 1)[0]);
    }
    return result.sort();
}

// Pick n random days from a specific month range
function pickFromRange(schoolDays, startMonth, endMonth, n, seed) {
    const filtered = schoolDays.filter(d => {
        const m = parseInt(d.split('-')[1], 10);
        return m >= startMonth && m <= endMonth;
    });
    return pickRandom(filtered, Math.min(n, filtered.length), seed);
}

const schoolDays = getSchoolDays();

// --- Build comprehensive realistic test scenarios ---
const realisticTests = [
    // Original 30 scenarios
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

    // --- Additional permutations: random absences with different seeds ---
    // 5 random sick days × 10 seeds
    ...Array.from({ length: 10 }, (_, i) => ({
        desc: `5 random sick days seed${i}`,
        extra: pickRandom(schoolDays, 5, 100 + i),
    })),
    // 8 random sick days × 10 seeds
    ...Array.from({ length: 10 }, (_, i) => ({
        desc: `8 random sick days seed${i}`,
        extra: pickRandom(schoolDays, 8, 200 + i),
    })),
    // 12 random sick days × 10 seeds
    ...Array.from({ length: 10 }, (_, i) => ({
        desc: `12 random sick days seed${i}`,
        extra: pickRandom(schoolDays, 12, 300 + i),
    })),
    // 15 random sick days × 5 seeds
    ...Array.from({ length: 5 }, (_, i) => ({
        desc: `15 random sick days seed${i}`,
        extra: pickRandom(schoolDays, 15, 400 + i),
    })),
    // 3 random sick days × 5 seeds
    ...Array.from({ length: 5 }, (_, i) => ({
        desc: `3 random sick days seed${i}`,
        extra: pickRandom(schoolDays, 3, 500 + i),
    })),

    // --- Season-specific absences ---
    // Fall only (Sep-Nov) × 5
    ...Array.from({ length: 5 }, (_, i) => ({
        desc: `7 sick fall-only seed${i}`,
        extra: pickFromRange(schoolDays, 9, 11, 7, 600 + i),
    })),
    // Winter only (Dec-Feb) × 5
    ...Array.from({ length: 5 }, (_, i) => ({
        desc: `7 sick winter-only seed${i}`,
        extra: pickFromRange(schoolDays, 12, 2, 7, 700 + i),
    })),
    // Spring only (Mar-Jun) × 5
    ...Array.from({ length: 5 }, (_, i) => ({
        desc: `7 sick spring-only seed${i}`,
        extra: pickFromRange(schoolDays, 3, 6, 7, 800 + i),
    })),

    // --- Snow day combos × 5 ---
    ...Array.from({ length: 5 }, (_, i) => ({
        desc: `2 snow + 5 sick seed${i}`,
        extra: [
            ...pickFromRange(schoolDays, 12, 3, 2, 900 + i),  // snow
            ...pickRandom(schoolDays, 5, 950 + i),             // sick
        ],
    })),

    // --- Week-long absences at different times ---
    { desc: 'sick week Sep', extra: weekdaysInRange('2025-09-08', '2025-09-12') },
    { desc: 'sick week Nov', extra: weekdaysInRange('2025-11-03', '2025-11-07') },
    { desc: 'sick week Dec', extra: weekdaysInRange('2025-12-15', '2025-12-19') },
    { desc: 'sick week Jan', extra: weekdaysInRange('2026-01-12', '2026-01-16') },
    { desc: 'sick week Feb', extra: weekdaysInRange('2026-02-09', '2026-02-13') },
    { desc: 'sick week Apr', extra: weekdaysInRange('2026-04-20', '2026-04-24') },
    { desc: 'sick week Jun', extra: weekdaysInRange('2026-06-08', '2026-06-12') },

    // --- Consecutive day patterns ---
    { desc: '2 days Sep start', extra: ['2025-09-03', '2025-09-04'] },
    { desc: '2 days mid Oct', extra: ['2025-10-15', '2025-10-16'] },
    { desc: '2 days mid Jan', extra: ['2026-01-14', '2026-01-15'] },
    { desc: '2 days end May', extra: ['2026-05-28', '2026-05-29'] },
    { desc: '3 days Nov', extra: ['2025-11-12', '2025-11-13', '2025-11-14'] },
    { desc: '3 days Apr', extra: ['2026-04-22', '2026-04-23', '2026-04-24'] },
    { desc: '4 days Feb', extra: ['2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12'] },

    // --- No extra absences (clean calendar) ---
    { desc: 'clean (no extra absences)', extra: [] },
];

// ========================================================================
// Run all scenarios
// ========================================================================
console.log(`Running ${realisticTests.length} scenarios × 2 cycles = ${realisticTests.length * 2} schedules...`);

const results = []; // { desc, cycle, counts: {A: n, B: n, ...}, spread, totalNonMU }
const groupTotals = {};
allGroups.forEach(g => groupTotals[g] = 0);
let totalSchedules = 0;
const spreads = [];

for (const t of realisticTests) {
    for (const cycle of [1, 2]) {
        const daysOff = [...levittownBase, ...t.extra];
        const builder = new ScheduleBuilder('2025-09-02', cycle, daysOff, 43);
        const schedule = builder.buildSchedule();

        const counts = {};
        allGroups.forEach(g => counts[g] = 0);
        for (const day of schedule) {
            for (const l of day.lessons) {
                if (l.group !== SCHEDULE_CONFIG.MU_TOKEN && counts[l.group] !== undefined) {
                    counts[l.group]++;
                    groupTotals[l.group]++;
                }
            }
        }

        const vals = Object.values(counts);
        const spread = Math.max(...vals) - Math.min(...vals);
        const totalNonMU = vals.reduce((s, v) => s + v, 0);
        spreads.push(spread);
        totalSchedules++;

        results.push({
            desc: t.desc,
            cycle,
            counts,
            spread,
            totalNonMU,
        });
    }
}

console.log(`Done. ${totalSchedules} schedules generated.`);

// ========================================================================
// Compute statistics
// ========================================================================
const grandTotal = Object.values(groupTotals).reduce((s, v) => s + v, 0);
const grandMean = grandTotal / allGroups.length;

// Per-group stats
const groupStats = allGroups.map(g => {
    const total = groupTotals[g];
    const perSchedule = total / totalSchedules;
    const devFromMean = total - grandMean;
    const pctDev = ((devFromMean / grandMean) * 100);

    // How often at min/max per schedule
    let atMin = 0, atMax = 0;
    for (const r of results) {
        const vals = Object.values(r.counts);
        const max = Math.max(...vals);
        const min = Math.min(...vals);
        if (r.counts[g] === max) atMax++;
        if (r.counts[g] === min) atMin++;
    }

    return { group: g, total, perSchedule, devFromMean, pctDev, atMin, atMax };
});

groupStats.sort((a, b) => b.total - a.total);

// Print console summary
console.log(`\n${'='.repeat(70)}`);
console.log(`STATISTICAL BIAS ANALYSIS — ${totalSchedules} schedules`);
console.log(`${'='.repeat(70)}`);
console.log(`Grand total lessons: ${grandTotal}`);
console.log(`Mean per group: ${grandMean.toFixed(1)}`);
console.log(`Per-schedule spread distribution: ${JSON.stringify(
    spreads.reduce((m, s) => { m[s] = (m[s]||0)+1; return m; }, {})
)}`);

const maxTotal = Math.max(...groupStats.map(g => g.total));
const minTotal = Math.min(...groupStats.map(g => g.total));
const totalRange = maxTotal - minTotal;
const stdDev = Math.sqrt(groupStats.reduce((s, g) => s + g.devFromMean ** 2, 0) / allGroups.length);

console.log(`\nAggregate range: ${minTotal}–${maxTotal} (diff: ${totalRange})`);
console.log(`Std deviation: ${stdDev.toFixed(2)} lessons (${(stdDev / grandMean * 100).toFixed(3)}%)`);
console.log(`Per-schedule range: ${(totalRange / totalSchedules).toFixed(3)} lessons\n`);

console.log('Group  Total   /Sched   Dev    %Dev   AtMin  AtMax');
for (const g of groupStats) {
    console.log(
        `  ${g.group}:  ${String(g.total).padStart(5)}   ${g.perSchedule.toFixed(2)}   ${(g.devFromMean >= 0 ? '+' : '') + g.devFromMean.toFixed(1).padStart(5)}   ${(g.pctDev >= 0 ? '+' : '') + g.pctDev.toFixed(3).padStart(6)}%   ${String(g.atMin).padStart(4)}   ${String(g.atMax).padStart(4)}`
    );
}

// ========================================================================
// Generate HTML report with charts
// ========================================================================
const html = generateHTML(groupStats, results, totalSchedules, grandMean, stdDev, spreads, totalRange);
const outPath = join(__dirname, 'bias_report.html');
writeFileSync(outPath, html);
console.log(`\nReport written to: ${outPath}`);

function generateHTML(groupStats, results, totalSchedules, grandMean, stdDev, spreads, totalRange) {
    const sorted = [...groupStats].sort((a, b) => b.total - a.total);
    const maxDev = Math.max(...sorted.map(g => Math.abs(g.devFromMean)));

    // Spread distribution
    const spreadDist = spreads.reduce((m, s) => { m[s] = (m[s]||0)+1; return m; }, {});

    // Per-group: how many times at each lesson count
    const countDistPerGroup = {};
    allGroups.forEach(g => countDistPerGroup[g] = {});
    for (const r of results) {
        for (const g of allGroups) {
            const c = r.counts[g];
            countDistPerGroup[g][c] = (countDistPerGroup[g][c] || 0) + 1;
        }
    }

    // For the box-plot-like view: per-group min/max/mean/median
    const perGroupPerSchedule = {};
    allGroups.forEach(g => perGroupPerSchedule[g] = []);
    for (const r of results) {
        for (const g of allGroups) {
            perGroupPerSchedule[g].push(r.counts[g]);
        }
    }
    const boxData = allGroups.map(g => {
        const vals = perGroupPerSchedule[g].sort((a, b) => a - b);
        const n = vals.length;
        return {
            group: g,
            min: vals[0],
            max: vals[n - 1],
            mean: vals.reduce((s, v) => s + v, 0) / n,
            median: n % 2 === 0 ? (vals[n/2-1] + vals[n/2]) / 2 : vals[Math.floor(n/2)],
            q1: vals[Math.floor(n * 0.25)],
            q3: vals[Math.floor(n * 0.75)],
            total: groupTotals[g],
        };
    }).sort((a, b) => b.total - a.total);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Scheduler Bias Analysis — ${totalSchedules} Schedules</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 24px; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 18px; margin: 32px 0 12px; border-bottom: 2px solid #ddd; padding-bottom: 6px; }
  .summary { background: #fff; padding: 16px 20px; border-radius: 8px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .summary p { margin: 4px 0; font-size: 14px; }
  .stat { font-weight: 600; color: #1a73e8; }
  .chart-container { background: #fff; padding: 20px; border-radius: 8px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow-x: auto; }
  svg text { font-family: inherit; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; }
  th { background: #fafafa; font-weight: 600; position: sticky; top: 0; }
  td:first-child, th:first-child { text-align: left; font-weight: 600; }
  tr:hover td { background: #f0f7ff; }
  .pos { color: #0d7c3d; }
  .neg { color: #c5221f; }
</style>
</head>
<body>
<h1>Scheduler Group Bias Analysis</h1>
<div class="summary">
  <p><span class="stat">${totalSchedules}</span> schedules analyzed (${totalSchedules/2} scenarios × 2 day cycles)</p>
  <p>Grand mean per group: <span class="stat">${grandMean.toFixed(1)}</span> lessons</p>
  <p>Standard deviation: <span class="stat">${stdDev.toFixed(2)}</span> lessons (<span class="stat">${(stdDev/grandMean*100).toFixed(3)}%</span>)</p>
  <p>Aggregate range: <span class="stat">${totalRange}</span> lessons (${(totalRange/totalSchedules).toFixed(3)} per schedule)</p>
  <p>Per-schedule spread: ${Object.entries(spreadDist).sort((a,b)=>+a[0]-+b[0]).map(([s,c])=>`${s}: ${c}`).join(', ')}</p>
</div>

<h2>1. Total Lessons Per Group (deviation from mean)</h2>
<div class="chart-container">
${renderDeviationChart(sorted, maxDev, grandMean)}
</div>

<h2>2. Per-Schedule Distribution (box plot)</h2>
<div class="chart-container">
${renderBoxPlot(boxData)}
</div>

<h2>3. Bias at Min/Max (how often each group lands at floor vs ceil)</h2>
<div class="chart-container">
${renderMinMaxChart(sorted, totalSchedules)}
</div>

<h2>4. Detailed Statistics</h2>
<div class="chart-container" style="max-height: 600px; overflow-y: auto;">
<table>
<tr><th>Group</th><th>Total</th><th>Per Sched</th><th>Dev</th><th>%Dev</th><th>At Min</th><th>At Max</th><th>Min</th><th>Med</th><th>Max</th></tr>
${sorted.map(g => {
    const bd = boxData.find(b => b.group === g.group);
    return `<tr>
  <td>${g.group}</td><td>${g.total}</td><td>${g.perSchedule.toFixed(2)}</td>
  <td class="${g.devFromMean >= 0 ? 'pos' : 'neg'}">${g.devFromMean >= 0 ? '+' : ''}${g.devFromMean.toFixed(1)}</td>
  <td class="${g.pctDev >= 0 ? 'pos' : 'neg'}">${g.pctDev >= 0 ? '+' : ''}${g.pctDev.toFixed(3)}%</td>
  <td>${g.atMin}</td><td>${g.atMax}</td>
  <td>${bd.min}</td><td>${bd.median}</td><td>${bd.max}</td>
</tr>`;
}).join('\n')}
</table>
</div>

</body>
</html>`;
}

function renderDeviationChart(sorted, maxDev, grandMean) {
    const W = 700, barH = 22, gap = 4, labelW = 30, midX = 350, scale = maxDev > 0 ? 280 / maxDev : 1;
    const H = (barH + gap) * sorted.length + 40;

    let bars = '';
    sorted.forEach((g, i) => {
        const y = i * (barH + gap) + 30;
        const bw = Math.abs(g.devFromMean) * scale;
        const x = g.devFromMean >= 0 ? midX : midX - bw;
        const color = g.devFromMean >= 0 ? '#0d7c3d' : '#c5221f';
        bars += `<text x="${labelW}" y="${y + barH/2 + 4}" font-size="13" font-weight="600">${g.group}</text>`;
        bars += `<rect x="${x}" y="${y}" width="${Math.max(bw, 1)}" height="${barH}" fill="${color}" rx="3"/>`;
        bars += `<text x="${g.devFromMean >= 0 ? midX + bw + 4 : midX - bw - 4}" y="${y + barH/2 + 4}" font-size="11" text-anchor="${g.devFromMean >= 0 ? 'start' : 'end'}" fill="${color}">${g.devFromMean >= 0 ? '+' : ''}${g.devFromMean.toFixed(1)}</text>`;
    });

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <line x1="${midX}" y1="20" x2="${midX}" y2="${H-10}" stroke="#999" stroke-dasharray="4"/>
  <text x="${midX}" y="16" text-anchor="middle" font-size="11" fill="#666">mean (${grandMean.toFixed(1)})</text>
  ${bars}
</svg>`;
}

function renderBoxPlot(boxData) {
    const W = 700, rowH = 22, gap = 4, labelW = 30;
    const H = (rowH + gap) * boxData.length + 40;
    const allVals = boxData.flatMap(b => [b.min, b.max]);
    const gMin = Math.min(...allVals);
    const gMax = Math.max(...allVals);
    const range = gMax - gMin || 1;
    const plotL = 60, plotR = 660, plotW = plotR - plotL;
    const scale = (v) => plotL + ((v - gMin) / range) * plotW;

    let els = '';
    // Axis ticks
    for (let v = gMin; v <= gMax; v++) {
        const x = scale(v);
        els += `<line x1="${x}" y1="20" x2="${x}" y2="${H - 10}" stroke="#eee"/>`;
        els += `<text x="${x}" y="16" text-anchor="middle" font-size="10" fill="#999">${v}</text>`;
    }

    boxData.forEach((b, i) => {
        const y = i * (rowH + gap) + 30;
        const mid = y + rowH / 2;
        els += `<text x="${labelW}" y="${mid + 4}" font-size="13" font-weight="600">${b.group}</text>`;
        // Whiskers
        els += `<line x1="${scale(b.min)}" y1="${mid}" x2="${scale(b.q1)}" y2="${mid}" stroke="#666" stroke-width="1.5"/>`;
        els += `<line x1="${scale(b.q3)}" y1="${mid}" x2="${scale(b.max)}" y2="${mid}" stroke="#666" stroke-width="1.5"/>`;
        // Min/max caps
        els += `<line x1="${scale(b.min)}" y1="${mid-5}" x2="${scale(b.min)}" y2="${mid+5}" stroke="#666" stroke-width="1.5"/>`;
        els += `<line x1="${scale(b.max)}" y1="${mid-5}" x2="${scale(b.max)}" y2="${mid+5}" stroke="#666" stroke-width="1.5"/>`;
        // IQR box
        const boxX = scale(b.q1), boxW = scale(b.q3) - scale(b.q1);
        els += `<rect x="${boxX}" y="${y + 2}" width="${Math.max(boxW, 2)}" height="${rowH - 4}" fill="#c8e0f4" stroke="#4a90d9" rx="2"/>`;
        // Median line
        els += `<line x1="${scale(b.median)}" y1="${y + 1}" x2="${scale(b.median)}" y2="${y + rowH - 1}" stroke="#1a73e8" stroke-width="2"/>`;
        // Mean dot
        els += `<circle cx="${scale(b.mean)}" cy="${mid}" r="3" fill="#e8710a"/>`;
    });

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${els}
  <text x="${plotR + 5}" y="16" font-size="9" fill="#1a73e8">■ median</text>
  <text x="${plotR + 5}" y="28" font-size="9" fill="#e8710a">● mean</text>
</svg>`;
}

function renderMinMaxChart(sorted, totalSchedules) {
    const W = 700, barH = 22, gap = 4, labelW = 30;
    const H = (barH + gap) * sorted.length + 40;
    const maxVal = Math.max(...sorted.map(g => Math.max(g.atMin, g.atMax)));
    const scale = maxVal > 0 ? 280 / maxVal : 1;
    const midX = 350;

    let bars = '';
    sorted.forEach((g, i) => {
        const y = i * (barH + gap) + 30;
        bars += `<text x="${labelW}" y="${y + barH/2 + 4}" font-size="13" font-weight="600">${g.group}</text>`;
        // atMax (right, green)
        const maxW = g.atMax * scale;
        bars += `<rect x="${midX}" y="${y}" width="${Math.max(maxW, 1)}" height="${barH/2}" fill="#0d7c3d" rx="2"/>`;
        bars += `<text x="${midX + maxW + 3}" y="${y + barH/4 + 3}" font-size="10" fill="#0d7c3d">${g.atMax}</text>`;
        // atMin (left, red)
        const minW = g.atMin * scale;
        bars += `<rect x="${midX - minW}" y="${y + barH/2}" width="${Math.max(minW, 1)}" height="${barH/2}" fill="#c5221f" rx="2"/>`;
        bars += `<text x="${midX - minW - 3}" y="${y + barH*3/4 + 3}" font-size="10" fill="#c5221f" text-anchor="end">${g.atMin}</text>`;
    });

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <line x1="${midX}" y1="10" x2="${midX}" y2="${H-10}" stroke="#999" stroke-dasharray="4"/>
  <text x="${midX + 5}" y="16" font-size="11" fill="#0d7c3d">← At Max (ceil)</text>
  <text x="${midX - 5}" y="16" font-size="11" fill="#c5221f" text-anchor="end">At Min (floor) →</text>
  ${bars}
</svg>`;
}
