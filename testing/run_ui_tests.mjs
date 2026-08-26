#!/usr/bin/env node
/**
 * CLI test runner for ui_logic.js functions (parseCSVToSchedule, computeWeeksFromEndDate).
 * Loads scheduler.js and ui_logic.js in a sandboxed context with minimal DOM mocks.
 *
 * Usage: node testing/run_ui_tests.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configCode = readFileSync(join(__dirname, '..', 'schedule_config.js'), 'utf8');
const schedulerCode = readFileSync(join(__dirname, '..', 'scheduler.js'), 'utf8');
const uiCode = readFileSync(join(__dirname, '..', 'ui_logic.js'), 'utf8');

/**
 * Load parseCSVToSchedule and computeWeeksFromEndDate into a sandboxed context.
 * We mock `document` and `ui` just enough to avoid errors on load.
 */
function loadUI() {
    const mockDocument = { addEventListener: () => {} };
    const mockWindow = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    const mockNavigator = { maxTouchPoints: 0 };
    // Replace 'const ui =' with 'var ui =' so it doesn't clash with strict mode
    const patchedUiCode = uiCode.replace('const ui = {', 'var ui = {');
    const fn = new Function('document', 'window', 'navigator',
        configCode + '\n' + schedulerCode + '\n' + patchedUiCode +
        '\nreturn { parseCSVToSchedule, parseScheduleLine, computeWeeksFromEndDate, ScheduleEntry, ui };'
    );
    return fn(mockDocument, mockWindow, mockNavigator);
}

const loaded = loadUI();
const { parseCSVToSchedule, parseScheduleLine, ScheduleEntry } = loaded;

let pass = 0, fail = 0;

function assert(condition, desc) {
    if (condition) {
        pass++;
        console.log(`PASS ${desc}`);
    } else {
        fail++;
        console.log(`FAIL ${desc}`);
    }
}

function assertEqual(actual, expected, desc) {
    const ok = actual === expected;
    if (!ok) {
        fail++;
        console.log(`FAIL ${desc}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    } else {
        pass++;
        console.log(`PASS ${desc}`);
    }
}

// ============================================================
// parseCSVToSchedule tests
// ============================================================
console.log('\n--- parseCSVToSchedule ---');

// Test 1: Basic CSV with header
{
    const csv = [
        '"Date","Day Cycle","Period","Group","Period","Group","Period","Group","Period","Group","Period","Group","Period","Group"',
        '"Mon, Sep 8, 2026","1","Pd 1","Flutes","Pd 3","Clarinets","Pd 4","Trumpets","Pd 7","Trombones","","","",""',
        '"Tue, Sep 9, 2026","2","Pd 1","Saxophones","Pd 3","Percussion","Pd 4","Violins","Pd 7","Cellos","Pd 8","Basses","Pd 9","Piano"',
    ].join('\n');
    const result = parseCSVToSchedule(csv);
    assertEqual(result.length, 2, 'basic CSV: 2 entries parsed');
    assertEqual(result[0].dayCycle, 1, 'basic CSV: day 1 cycle=1');
    assertEqual(result[0].lessons.length, 4, 'basic CSV: day 1 has 4 lessons');
    assertEqual(result[0].lessons[0].period, 'Pd 1', 'basic CSV: day 1 first period');
    assertEqual(result[0].lessons[0].group, 'Flutes', 'basic CSV: day 1 first group');
    assertEqual(result[1].dayCycle, 2, 'basic CSV: day 2 cycle=2');
    assertEqual(result[1].lessons.length, 6, 'basic CSV: day 2 has 6 lessons');
}

// Test 2: CSV without header
{
    const csv = '"Mon, Sep 8, 2026","1","Pd 1","Flutes","Pd 3","Clarinets","Pd 4","Trumpets","Pd 7","Trombones"';
    const result = parseCSVToSchedule(csv);
    assertEqual(result.length, 1, 'no header: 1 entry parsed');
    assertEqual(result[0].lessons.length, 4, 'no header: 4 lessons');
}

// Test 3: Empty CSV
{
    const result = parseCSVToSchedule('');
    assertEqual(result.length, 0, 'empty CSV: returns empty array');
}

// Test 4: Header-only CSV
{
    const csv = '"Date","Day Cycle","Period","Group"';
    const result = parseCSVToSchedule(csv);
    assertEqual(result.length, 0, 'header-only CSV: returns empty array');
}

// Test 5: CSV with blank lines (cycle spacers from export)
{
    const csv = [
        '"Date","Day Cycle","Period","Group","Period","Group","Period","Group","Period","Group","Period","Group","Period","Group"',
        '"Mon, Sep 8, 2026","1","Pd 1","Flutes","Pd 3","Clarinets","Pd 4","Trumpets","Pd 7","Trombones"',
        '',
        '"Tue, Sep 30, 2026","2","Pd 1","Saxophones","Pd 3","Percussion","Pd 4","Violins","Pd 7","Cellos","Pd 8","Basses","Pd 9","Piano"',
    ].join('\n');
    const result = parseCSVToSchedule(csv);
    assertEqual(result.length, 2, 'blank lines: skipped, 2 entries parsed');
}

// Test 6: Malformed date row is skipped
{
    const csv = [
        '"Date","Day Cycle","Period","Group"',
        '"NOT-A-DATE","1","Pd 1","Flutes"',
        '"Mon, Sep 8, 2026","1","Pd 4","Clarinets"',
    ].join('\n');
    const result = parseCSVToSchedule(csv);
    assertEqual(result.length, 1, 'malformed date: skipped, 1 entry parsed');
    assertEqual(result[0].lessons[0].group, 'Clarinets', 'malformed date: correct entry kept');
}

// Test 7: Row with no period columns is skipped
{
    const csv = [
        '"Mon, Sep 8, 2026","1","no-periods-here"',
    ].join('\n');
    const result = parseCSVToSchedule(csv);
    assertEqual(result.length, 0, 'no period columns: row skipped');
}

// Test 8: Tab-separated (spreadsheet paste) format
{
    const csv = "Mon, Sep 8, 2026\t1\tPd 1\tFlutes\tPd 3\tClarinets";
    const result = parseCSVToSchedule(csv);
    assertEqual(result.length, 1, 'TSV format: 1 entry parsed');
    assertEqual(result[0].lessons.length, 2, 'TSV format: 2 lessons');
    assertEqual(result[0].lessons[1].group, 'Clarinets', 'TSV format: correct group');
}

// Test 9: Round-trip — generate schedule, simulate CSV export, re-import
{
    // Build a small schedule
    const { ScheduleBuilder } = new Function(
        configCode + '\n' + schedulerCode + '\nreturn { ScheduleBuilder };'
    )();
    const builder = new ScheduleBuilder('2026-09-08', 1, [], 4);
    const schedule = builder.buildSchedule();

    // Simulate exportTableToCSV logic: build CSV string from schedule entries
    const header = '"Date","Day Cycle","Period","Group","Period","Group","Period","Group","Period","Group","Period","Group","Period","Group"';
    const rows = schedule.map(entry => {
        const dateStr = entry.date.toLocaleDateString(undefined, {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
        });
        let row = `"${dateStr}","${entry.dayCycle}"`;
        for (let i = 0; i < 6; i++) {
            if (entry.lessons[i]) {
                row += `,"${entry.lessons[i].period}","${entry.lessons[i].group}"`;
            } else {
                row += ',"",""';
            }
        }
        return row;
    });
    const csvText = [header, ...rows].join('\n');

    // Re-import
    const reimported = parseCSVToSchedule(csvText);
    assertEqual(reimported.length, schedule.length, 'round-trip: same number of entries');

    // Verify each entry matches
    let allMatch = true;
    for (let i = 0; i < schedule.length; i++) {
        const orig = schedule[i];
        const imp = reimported[i];
        if (orig.dayCycle !== imp.dayCycle) { allMatch = false; break; }
        if (orig.lessons.length !== imp.lessons.length) { allMatch = false; break; }
        for (let j = 0; j < orig.lessons.length; j++) {
            if (orig.lessons[j].period !== imp.lessons[j].period) { allMatch = false; break; }
            if (orig.lessons[j].group !== imp.lessons[j].group) { allMatch = false; break; }
        }
    }
    assert(allMatch, 'round-trip: all lessons match after reimport');
}

// ============================================================
// computeWeeksFromEndDate tests
// ============================================================
console.log('\n--- computeWeeksFromEndDate ---');

// We need a fresh mock ui for each test since computeWeeksFromEndDate mutates ui.weeksInput.value
function testComputeWeeks(startVal, endVal, expectedWeeks, desc) {
    const { computeWeeksFromEndDate, ui } = loadUI();
    ui.startDateInput = { value: startVal };
    ui.endDateInput = { value: endVal };
    ui.weeksInput = { value: '' };
    computeWeeksFromEndDate();
    assertEqual(ui.weeksInput.value, expectedWeeks, desc);
}

testComputeWeeks('2026-09-08', '2026-09-15', 1, 'exactly 1 week');
testComputeWeeks('2026-09-08', '2026-09-22', 2, 'exactly 2 weeks');
testComputeWeeks('2026-09-08', '2026-09-17', 2, '9 days = ceil to 2 weeks');
// Sep 8 to Dec 8 = 91 days = 13 weeks exactly, but DST fall-back adds an hour → ceil = 14
testComputeWeeks('2026-09-08', '2026-12-08', 14, '91 days + DST = ceil to 14 weeks');
testComputeWeeks('2026-09-08', '2026-09-08', '', 'same date: no weeks computed');
testComputeWeeks('2026-09-17', '2026-09-08', '', 'end before start: no weeks computed');
testComputeWeeks('', '2026-09-17', '', 'missing start: no weeks computed');
testComputeWeeks('2026-09-08', '', '', 'missing end: no weeks computed');
testComputeWeeks('2026-01-01', '2027-06-01', 52, 'clamped to 52 weeks max');

// ============================================================
// Summary
// ============================================================
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
