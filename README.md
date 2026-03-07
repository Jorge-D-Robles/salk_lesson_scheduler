# Scheduling Algorithm Explanation

## Running Tests

**Jasmine tests (browser):**
```bash
python -m http.server 8000
# Open http://localhost:8000/SpecRunner.html in your browser
```

**CLI torture tests:**
```bash
node testing/run_torture_tests.mjs
```

**Bias analysis (generates an HTML report with charts):**
```bash
node testing/analyze_bias.mjs
# Open testing/bias_report.html in your browser
```

## Introduction: The Scheduling Problem

The instrumental music program at Jonas E. Salk Middle School requires a complex scheduling solution for student pull-out lessons. The core challenge is to create a fair and consistent schedule that accommodates the school's unique structure while minimizing disruption to students' academic classes.

The problem is defined by a specific set of real-world constraints:

  * **Two-Day Cycle:** The school operates on a two-day rotating cycle, with a different number of available lesson periods on Day 1 versus Day 2.
  * **Weekly Lesson Frequency:** Each of the 22 student lesson groups must be scheduled for exactly one lesson per week.
  * **Academic Class Protection:** To prevent students from repeatedly missing the same academic class, a student group cannot be pulled from the same class period more than once per month. This is a critical constraint.
  * **The "MU" (Make-Up) Slot:** The two-day cycle results in an uneven number of available lesson slots from one week to the next. To resolve this and ensure all 22 groups are scheduled weekly, a special "MU" (Make-Up) slot was introduced. This acts as a flexible filler period for extra help or missed lessons.
  * **Make-Up Slot Rules:** To maintain schedule consistency, MU slots are limited to a maximum of one per day.

This algorithm is designed to navigate these constraints and produce an optimal, conflict-free schedule for the entire school year.

## Technical Overview

This document provides a complete technical explanation of the scheduling algorithm implemented in `scheduler.js`. The algorithm is a backtracking solver designed to address a complex **Constraint Satisfaction Problem (CSP)**. Its primary goal is to assign lesson groups to a predefined set of available time slots over several weeks, adhering to a strict set of scheduling rules. It is optimized with heuristics and a two-pass strategy to efficiently find a high-quality, valid schedule.

## Algorithm Architecture

The system is architected around two main classes: `ScheduleEntry` for data storage and `ScheduleBuilder` for the core logic. The process can be broken down into three phases: initialization, slot generation, and the recursive solving process.

-----

### Phase 1: Initialization and State Setup

The process begins in the `ScheduleBuilder` constructor, which sets up the entire problem space and its initial state.

  * **Problem Parameters:** It configures the start date, the number of weeks to schedule, and a list of non-school days (`daysOff`).
  * **Domain of Variables:** It establishes the set of possible values for each time slot, which are the 22 lesson groups and a special 'MU' (makeup) group.
  * **Historical Context:** A key feature is its ability to process a `scheduleHistory`. This allows the new schedule to be a logical continuation of a previous one. The `_populateAssignmentsFromHistory` method is called to parse this history and record the last date each group was assigned to a specific period.

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
    // ...
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
        // ...
        if (isWeekday && !isDayOff) {
            // Determines periods based on the school's day cycle
            const periods =
                currentDayCycle % 2 !== 0 ? [1, 4, 7, 8] : [1, 2, 3, 7, 8];
            periods.forEach((p) => {
                slots.push({ /* ... */ });
            });
            currentDayCycle++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return slots;
}
```

-----

### Phase 3: The Constructive Cycle-Based Solver (`_constructSchedule`)

This is the core of the algorithm. It is a **constructive, day-by-day greedy solver** that guarantees a fair ordering while maintaining all scheduling rules. Unlike traditional global constraint solvers, it does not backtrack across multiple days. Instead, it proceeds linearly, day after day, ensuring rapid execution.

#### The Daily Construction Logic

1.  **Candidate Selection:** For a given day, the solver identifies the lesson groups that have not yet had a lesson in the current cycle or week.
    *   It prefers groups that are currently "pending" in the current cycle, maintaining the order in which groups were seen.
    *   If no groups from the current cycle fit, it pulls from the next cycle.
2.  **Intra-Day Backtracking (`_solveDayAssignment`):** To assign specific groups to specific periods *within that day*, the algorithm uses a rigorous backtracking solver equipped with the **Minimum Remaining Values (MRV)** heuristic. It evaluates:
    *   **The Period Constraint:** Ensuring a group hasn't been in that specific period recently (enforcing the `dayRule`, e.g., 28 days).
    *   **The MRV Heuristic:** It always tries to fill the period slot that has the *fewest* valid candidate groups available first, drastically reducing the search space.
3.  **Within-Day Sorting:** After a visually valid combination is found, the lessons are sorted within the day so that the global sequence of lessons consistently mirrors the expected cycle, ensuring the most balanced long-term rotation.

-----

### The Orchestrator (`buildSchedule`)

This is the public-facing method that controls the solving process. Because the greedy solver is blazingly fast but might occasionally fail on impossible bottlenecks, this orchestrator uses a two-pass strategy.

1.  **"Perfect" Attempt:** It first attempts to construct the complete schedule linearly using a strict `dayRule` of **28 days** separating same-period occurrences.
2.  **"High-Quality" Fallback:** If the calendar constraints (such as excessive random holidays) cause a day to be impossible under the 28-day rule, the orchestrator resets completely. It re-attempts building the entire schedule using a relaxed `dayRule` of **21 days**.

<!-- end list -->

```javascript
buildSchedule() {
    const slots = this.generateAllSlots();
    // ... group slots by day ...

    console.log(`Attempting to find a perfect schedule with a 28-day constraint...`);
    let schedule = this._constructSchedule(days, 28);
    if (schedule) {
        return schedule; // Success!
    }

    console.log(`No 28-day solution. Attempting high-quality schedule with a 21-day constraint...`);
    schedule = this._constructSchedule(days, 21);
    if (schedule) {
        return schedule; // Success on the second try
    }

    return []; // No solution found
}
```
