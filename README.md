# Scheduling Algorithm Explanation

## Introduction

This document provides a complete technical explanation of the scheduling algorithm implemented in `scheduler.js`.

The algorithm is a backtracking solver designed to address a complex **Constraint Satisfaction Problem (CSP)**. Its primary goal is to assign lesson groups to a predefined set of available time slots over several weeks, adhering to a strict set of scheduling rules. It is optimized with heuristics and a two-pass strategy to efficiently find a high-quality, valid schedule.

## Algorithm Architecture

The system is architected around two main classes: `ScheduleEntry` for data storage and `ScheduleBuilder` for the core logic. The process can be broken down into three phases: initialization, slot generation, and the recursive solving process.

-----

### Phase 1: Initialization and State Setup

The process begins in the `ScheduleBuilder` constructor, which sets up the entire problem space and its initial state.

  * **Problem Parameters:** It configures the start date, the number of weeks to schedule, and a list of non-school days (`daysOff`).
  * **Domain of Variables:** It establishes the set of possible values for each time slot, which are the 22 lesson groups ('A' through 'V') and a special 'MU' (makeup) group.
  * **Historical Context:** A key feature is its ability to process a `scheduleHistory`. This allows the new schedule to be a logical continuation of a previous one. The `_populateAssignmentsFromHistory` method is called to parse this history and record the last date each group was assigned to a specific period. This prevents, for example, Group 'C' from having a lesson in Period 1 on the last day of the old schedule and again in Period 1 on the first day of the new schedule.

<!-- end list -->

```javascript
// Example of the constructor and history processing
class ScheduleBuilder {
    constructor(startDate, dayCycle, daysOff, weeks, scheduleHistory = null) {
        // ... date and daysOff setup ...
        this.weeks = weeks

        // Use history to determine groups or default to A-V
        if (scheduleHistory && /*...*/) {
            // ... logic to derive groups from history ...
        } else {
            this.LESSON_GROUPS = Array.from({ length: 22 }, (_, i) =>
                String.fromCharCode("A".charCodeAt(0) + i)
            );
        }

        // Initialize a data structure for historical assignments
        this.initialPeriodAssignments = {};
        this.LESSON_GROUPS.forEach(
            (g) => (this.initialPeriodAssignments[g] = {})
        );
        if (scheduleHistory)
            this._populateAssignmentsFromHistory(scheduleHistory);
    }

    _populateAssignmentsFromHistory(history) {
        history.forEach((lesson) => {
            // ... logic to find the most recent assignment date
            // for each group in each period ...
        });
    }
}
```

-----

### Phase 2: Generation of All Possible Slots

Before attempting to solve the schedule, the `generateAllSlots` method creates a simple, linear array of every possible time slot where a lesson could occur. A "slot" is an object containing a `date` and a `period`.

This method iterates from the `startDate` for the specified number of `weeks`, skipping weekends and any dates listed in `daysOff`. This flat list of slots represents the complete set of variables that the solver needs to assign values to.

```javascript
// Simplified logic for slot generation
generateAllSlots() {
    const slots = [];
    let currentDate = new Date(this.startDate.getTime());
    // ... setup endDate ...

    while (currentDate < endDate) {
        const isWeekday = /*...*/;
        const isDayOff = /*...*/;

        if (isWeekday && !isDayOff) {
            // Determines periods based on the school's day cycle
            const periods =
                currentDayCycle % 2 !== 0 ? [1, 4, 7, 8] : [1, 2, 3, 7, 8];
            periods.forEach((p) => {
                slots.push({
                    date: new Date(currentDate.getTime()),
                    period: p,
                    group: null, // To be filled by the solver
                    dayCycle: currentDayCycle,
                });
            });
            currentDayCycle++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return slots;
}
```

-----

### Phase 3: The Backtracking Solver (`solve`)

This recursive method is the core of the algorithm. It systematically tries to place a group in each slot, and if it reaches a dead end, it backtracks to the previous decision and tries a different path.

#### The Recursive Logic

1.  **Base Case:** The recursion stops when a valid group has been placed in every single slot (`index >= slots.length`). This means a complete, valid schedule has been found, and the function returns `true`.

2.  **Recursive Step:** For the current slot at `slots[index]`:

    a. **Candidate Selection:** It gets the list of all possible groups (`...this.LESSON_GROUPS, "MU"`).

    b. **Heuristic Optimization:** The candidates are sorted. This is a critical optimization. Groups that have gone the longest without an assignment in the current `period` are tried first. This heuristic helps the solver find a valid path more quickly by addressing the most constrained assignments first.

    c. **Constraint Checking:** It iterates through each candidate group and checks if placing it in the current slot violates any rules:
    \* **Weekly Rule:** A group cannot have more than one lesson in the same week.
    ` javascript // weeklyAssignments is a Map<weekId, Set<group>> if (groupsThisWeek.has(group)) isValid = false;  `
    \* **Period Separation Rule:** A group cannot be assigned to the same period if its last assignment in that period was less than `dayRule` days ago.
    ` javascript // periodAssignments is an Object { group: { period: date } } const lastDate = periodAssignments[group]?.[period]; if ( lastDate && (date - lastDate) / (1000 * 60 * 60 * 24) < dayRule ) { isValid = false; }  `
    \* **Makeup ('MU') Rule:** The 'MU' group can only appear once on any given day.
    ` javascript // muDays is a Set of date strings if (muPlacedToday) isValid = false;  `

    d. **Make a Move:** If the placement is valid, the algorithm commits the choice temporarily:
    \* The lesson is added to the `schedule` object.
    \* The state trackers (`weeklyAssignments`, `periodAssignments`, `muDays`) are updated.

    e. **Recurse:** It calls itself to solve for the next slot: `this.solve(slots, index + 1, ...)`
    \* If this recursive call returns `true`, it means a full solution was found down the line, so this `true` is passed all the way up the call stack.

    f. **Backtrack:** If the recursive call returns `false` (indicating a dead end), the algorithm undoes the choice it just made. This is the "backtracking" step. It reverts the `schedule` and all state trackers to their previous state, effectively pretending the last choice never happened.

    ````
    ```javascript
    // BACKTRACK - restore state
    dayEntry.lessons.pop();
    if (dayEntry.lessons.length === 0) {
        schedule.pop();
    }

    if (group === "MU") {
        muDays.delete(dateStr);
    } else {
        if (addedToWeek) {
            groupsThisWeek.delete(group);
        }
        // Revert the period assignment to its previous date or remove it
        if (previousDate !== null) {
            periodAssignments[group][period] = previousDate;
        } else {
            delete periodAssignments[group][period];
        }
    }
    ```
    ````

    g. **Failure:** If the loop finishes without any candidate leading to a solution, the function returns `false`, triggering a backtrack in the previous call.

-----

### The Orchestrator (`buildSchedule`)

This is the public-facing method that controls the solving process. It employs a two-pass strategy to ensure the highest quality schedule.

1.  **"Perfect" Attempt:** It first calls `solve` with a strict `dayRule` of **28**. This attempts to find an ideal schedule where period repetitions are spaced out as much as possible.
2.  **"High-Quality" Fallback:** If the 28-day constraint proves impossible and the solver returns `false`, the method resets the state and tries again with a more relaxed `dayRule` of **21**. This increases the likelihood of finding a valid solution, even if it's not theoretically perfect.

<!-- end list -->

```javascript
buildSchedule() {
    const slots = this.generateAllSlots();
    // ... state initialization ...

    console.log("Attempting to find a perfect schedule with a 28-day constraint...");
    let schedule = [];
    if (this.solve(/*...,*/ 28)) {
        return schedule; // Success!
    }

    // Reset state for the second attempt
    schedule = [];
    // ... logic to reset weeklyAssignments, muDays, and periodAssignments ...

    console.log("No 28-day solution found. Attempting a high-quality schedule with a 21-day constraint...");
    if (this.solve(/*...,*/ 21)) {
        return schedule; // Success on the second try
    }

    return []; // No solution found
}
```
