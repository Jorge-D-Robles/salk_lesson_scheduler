/**
 * @file Central configuration for all schedule-structure constants.
 * Single source of truth — change values here and they propagate everywhere.
 */

const _DAY1 = Object.freeze([1, 4, 7, 8])
const _DAY2 = Object.freeze([1, 2, 3, 7, 8])
const _GROUP_COUNT = 22
const _MAX_PERIODS = Math.max(_DAY1.length, _DAY2.length)
const _ALL_PERIODS = Object.freeze([...new Set([..._DAY1, ..._DAY2])].sort((a, b) => a - b))

const SCHEDULE_CONFIG = Object.freeze({
    DAY1_PERIODS: _DAY1,
    DAY2_PERIODS: _DAY2,
    REQUIRED_UNIQUE_GROUPS: _GROUP_COUNT,
    DEFAULT_GROUP_NAMES: Object.freeze(
        Array.from({ length: _GROUP_COUNT }, (_, i) => String.fromCharCode(65 + i))
    ),
    CALENDAR_SPACING_FLOOR: 28,
    REDUCED_SPACING_FLOOR: 21,
    MU_LIMIT_PER_DAY: 1,
    MU_TOKEN: "MU",
    RUNNING_BALANCE_THRESHOLD: 1,
    END_BALANCE_THRESHOLD: 1,
    PERIOD_PREFIX: "Pd ",
    ONE_DAY_MS: 86400000,
    HISTORY_WEEKS: 4,
    // Instrument family mappings for print color coding
    INSTRUMENT_FAMILIES: Object.freeze({
        'Violins1': 'strings', 'Violins2': 'strings', 'Violas': 'strings',
        'Cellos': 'strings', 'Basses': 'strings', 'StringBass': 'strings',
        'Flutes': 'woodwinds', 'Clarinets': 'woodwinds', 'Oboes': 'woodwinds',
        'Bassoons': 'woodwinds', 'Saxophones': 'woodwinds', 'AltoSax': 'woodwinds',
        'TenorSax': 'woodwinds', 'BariSax': 'woodwinds',
        'Trumpets': 'brass', 'Trombones': 'brass', 'FrenchHorns': 'brass',
        'Tubas': 'brass', 'Horns': 'brass',
        'Percussion': 'percussion', 'Drums': 'percussion',
        'Piano': 'keyboard', 'Guitar': 'keyboard', 'Keyboards': 'keyboard',
    }),
    FAMILY_PRINT_COLORS: Object.freeze({
        strings:    Object.freeze({ bg: '#dbeafe', border: '#2563eb' }),
        woodwinds:  Object.freeze({ bg: '#dcfce7', border: '#16a34a' }),
        brass:      Object.freeze({ bg: '#fef9c3', border: '#ca8a04' }),
        percussion: Object.freeze({ bg: '#fce7f3', border: '#db2777' }),
        keyboard:   Object.freeze({ bg: '#f3e8ff', border: '#9333ea' }),
        other:      Object.freeze({ bg: '#ffedd5', border: '#ea580c' }),
    }),
    // Derived (DO NOT edit — computed from above)
    ALL_PERIODS: _ALL_PERIODS,
    MAX_PERIODS_PER_DAY: _MAX_PERIODS,
    TABLE_COLUMNS: 3 + _ALL_PERIODS.length,
    TOTAL_TRIALS: _GROUP_COUNT * 2,
})
