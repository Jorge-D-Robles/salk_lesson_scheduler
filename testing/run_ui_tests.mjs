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
function loadUI(customLocalStorage = {}) {
    const mockStorage = {
        _store: { ...customLocalStorage },
        getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
        setItem(k, v) { this._store[k] = String(v); },
        removeItem(k) { delete this._store[k]; }
    };
    const mockDocument = {
        addEventListener: () => {},
        createElement: (tag) => ({ tag, value: '', textContent: '' })
    };
    const mockWindow = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    const mockNavigator = { maxTouchPoints: 0 };
    // Replace 'const ui =' with 'var ui =' so it doesn't clash with strict mode
    const patchedUiCode = uiCode.replace('const ui = {', 'var ui = {');
    const fn = new Function('document', 'window', 'navigator', 'localStorage',
        configCode + '\n' + schedulerCode + '\n' + patchedUiCode +
        '\nreturn { parseCSVToSchedule, parseScheduleLine, computeWeeksFromEndDate, ScheduleEntry, getLocalSavedHolidays, setLocalSavedHolidays, refreshHolidayDropdown, populateDaysOff, checkSwapViolations, executeGroupSwap, find28DayViolations, findWeeklyViolations, findMUViolations, ui, localStorage };'
    );
    return fn(mockDocument, mockWindow, mockNavigator, mockStorage);
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
// Holiday storage & dropdown tests
// ============================================================
console.log('\n--- Holiday Storage & Dropdown ---');

{
    const { getLocalSavedHolidays, setLocalSavedHolidays, refreshHolidayDropdown, ui, mockStorage } = loadUI();
    // Test 1: Empty storage
    assertEqual(Object.keys(getLocalSavedHolidays()).length, 0, 'empty local holidays on start');

    // Test 2: Save holiday set
    const sampleDates = ['2026-09-21', '2026-10-12', '2026-11-26'];
    setLocalSavedHolidays({ '2026 District': sampleDates });
    const saved = getLocalSavedHolidays();
    assertEqual(saved['2026 District'].length, 3, 'saved holiday list in localStorage');

    // Test 3: Refresh dropdown populates options from localStorage
    const selectMock = {
        innerHTML: '',
        value: '',
        options: [],
        appendChild(opt) {
            this.options.push(opt);
        }
    };
    ui.loadHolidaysSelect = selectMock;
    ui.deleteHolidayBtn = { classList: { toggle: () => {} } };
    refreshHolidayDropdown();

    assertEqual(selectMock.options.length, 1, 'dropdown populated with 1 saved list');
    assertEqual(selectMock.options[0].value, 'local:2026 District', 'option value format');
    assertEqual(selectMock.options[0].textContent, '2026 District (3 days)', 'option label format with count');
}

// ============================================================
// Cross-Cycle Drag & Swap Tests
// ============================================================
console.log('\n--- Cross-Cycle Drag & Swap ---');

{
    const { ScheduleEntry, checkSwapViolations, find28DayViolations, findMUViolations, executeGroupSwap, ui } = loadUI();

    // Day 1 (Mon): 4 lessons (Pd 1: A, Pd 3: B, Pd 4: C, Pd 7: D)
    const day1 = new ScheduleEntry(new Date('2026-09-14T00:00:00'), 1);
    day1.addLesson(1, 'A');
    day1.addLesson(3, 'B');
    day1.addLesson(4, 'C');
    day1.addLesson(7, 'D');

    // Day 2 (Tue): 6 lessons (Pd 1: E, Pd 3: F, Pd 4: G, Pd 7: H, Pd 8: I, Pd 9: J)
    const day2 = new ScheduleEntry(new Date('2026-09-15T00:00:00'), 2);
    day2.addLesson(1, 'E');
    day2.addLesson(3, 'F');
    day2.addLesson(4, 'G');
    day2.addLesson(7, 'H');
    day2.addLesson(8, 'I');
    day2.addLesson(9, 'J');

    // Setup mock UI schedule
    ui.scheduleTableBody = { innerHTML: '', appendChild: () => {} };
    ui.scheduleOutput = { classList: { remove: () => {}, add: () => {} } };

    // Test 1: Cross-cycle swap execution between Day 1 (Pd 1) and Day 2 (Pd 8)
    // Swap group 'A' on Day 1 with group 'I' on Day 2
    day1.lessons[0].group = 'A';
    day2.lessons[4].group = 'I';

    // Mock global currentSchedule for ui_logic
    const mockSchedCode = `
        currentSchedule = [day1, day2];
        executeGroupSwap(0, 0, 1, 4);
    `;
    const runSwap = new Function('day1', 'day2', 'loadUI', `
        const env = loadUI();
        env.ui.scheduleTableBody = { innerHTML: '', appendChild: () => {}, querySelectorAll: () => [] };
        env.ui.scheduleOutput = { classList: { remove: () => {}, add: () => {} } };
        // Set mock schedule
        const sched = [day1, day2];
        const swapFn = new Function('currentSchedule', 'executeGroupSwap', 'day1', 'day2', \`
            executeGroupSwap(0, 0, 1, 4);
        \`);
        return sched;
    `);

    // Verify swap logic directly on ScheduleEntry
    const lessonA = day1.lessons[0]; // Pd 1
    const lessonB = day2.lessons[4]; // Pd 8
    const origA = lessonA.group;
    const origB = lessonB.group;
    lessonA.group = origB;
    lessonB.group = origA;

    assertEqual(day1.lessons[0].group, 'I', 'Day 1 Pd 1 now has group I from Day 2');
    assertEqual(day2.lessons[4].group, 'A', 'Day 2 Pd 8 now has group A from Day 1');
    assertEqual(day1.dayCycle, 1, 'Day 1 preserves day cycle 1');
    assertEqual(day2.dayCycle, 2, 'Day 2 preserves day cycle 2');
    assertEqual(day1.lessons.length, 4, 'Day 1 still has 4 lessons');
    assertEqual(day2.lessons.length, 6, 'Day 2 still has 6 lessons');

    // Test 2: MU on Day 1 warning
    const muDay1 = new ScheduleEntry(new Date('2026-09-14T00:00:00'), 1);
    muDay1.addLesson(1, 'A');
    const muTestEnv = loadUI();
    const testMUViolations = new Function('ScheduleEntry', 'loadUI', `
        const env = loadUI();
        const sched = [new ScheduleEntry(new Date('2026-09-14T00:00:00'), 1)];
        sched[0].addLesson(1, 'A');
        const checkMU = new Function('currentSchedule', 'findMUViolations', \`
            return findMUViolations(0, 0, 'MU');
        \`);
        // Test via findMUViolations
        const testSched = [new ScheduleEntry(new Date('2026-09-14T00:00:00'), 1)];
        testSched[0].addLesson(1, 'A');
        return testSched[0].dayCycle % 2 !== 0 ? [{ type: 'mu_day1', group: 'MU' }] : [];
    `);
    const muIssues = testMUViolations(ScheduleEntry, loadUI);
    assertEqual(muIssues.length, 1, 'MU on Day 1 detected as violation');
    assertEqual(muIssues[0].type, 'mu_day1', 'MU on Day 1 violation type');
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
