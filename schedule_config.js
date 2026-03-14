/**
 * @file Central configuration for all schedule-structure constants.
 * Single source of truth — change values here and they propagate everywhere.
 */

const _DAY1 = Object.freeze([1, 4, 7, 8])
const _DAY2 = Object.freeze([1, 2, 3, 7, 8])
const _GROUP_COUNT = 22
const _MAX_PERIODS = Math.max(_DAY1.length, _DAY2.length)

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
    // Derived (DO NOT edit — computed from above)
    MAX_PERIODS_PER_DAY: _MAX_PERIODS,
    TABLE_COLUMNS: 3 + _MAX_PERIODS * 2,
    TOTAL_TRIALS: _GROUP_COUNT * 2,
})
