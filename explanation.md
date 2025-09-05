# Explanation of the Music Lesson Scheduling Algorithm

---

## How the Music Lesson Scheduling Algorithm Works

The primary goal of the algorithm is to generate a fair, balanced, and conflict-free schedule for 22 music lesson groups over a specified number of weeks. It does this by enforcing a strict set of rules and using a sophisticated group rotation system.

---

### The Core Scheduling Rules

The entire algorithm is built to satisfy three non-negotiable constraints, which are verified by the unit tests (`scheduler.spec.js`):

1. **The 28-Day Rule:** A specific group (e.g., "Flutes") cannot be scheduled for the same period (e.g., "Pd 1") if it has already had a lesson in that same period within the last 28 days.
2. **The Weekly Rule:** A group can be scheduled at most **once** per calendar week (Monday to Friday). This ensures a wide distribution of all 22 groups each week.
3. **The Make-Up (MU) Rules:** "MU" slots represent open periods. The final schedule must adhere to two rules regarding them:
    * There can be no more than one "MU" scheduled on any single day.
    * Two "MU" slots can never be scheduled in consecutive periods on the same day.

*Note: The algorithm doesn't actively check for MU clustering as it builds the schedule. Instead, its robust group-selection logic is designed to avoid placing MUs wherever possible, and the `assertNoMUClustering` test verifies this outcome.*

---

### Step-by-Step Algorithm Process

The process is managed by the `ScheduleBuilder` class. Here is a breakdown of how it works from start to finish.

#### **Step 1: Initialization**

When the `ScheduleBuilder` is created, it sets up the entire scheduling environment.

* **Basic Inputs:** It stores the `startDate`, starting `dayCycle` (1 or 2), a list of `daysOff`, and the number of `weeks` to schedule.
* **Determine Lesson Groups:** It identifies the 22 lesson groups.
    * If `scheduleHistory` is provided, it extracts the 22 unique group names from the history, ensuring continuity. If the history doesn't contain exactly 22 unique non-MU groups, it throws an error.
    * If no history is provided, it defaults to using 'A' through 'V' as the group names.
* **Process History:** If `scheduleHistory` exists, the builder creates a memory of past lessons called `periodAssignments`. This object maps each group and period to the **most recent date** it was scheduled. This memory is essential for enforcing the 28-Day Rule from day one of the new schedule.
* **Establish Group Rotation:** To ensure fairness, the 22 groups are divided into five rotating sets: two sets of 5, and three sets of 4.
    * `groupSets = [ [A,B,C,D,E], [F,G,H,I,J], [K,L,M,N], [O,P,Q,R], [S,T,U,V] ]`
    * This structure is the foundation of the scheduling rotation.

#### **Step 2: The Day-by-Day Scheduling Loop**

The `buildSchedule` method iterates one day at a time from the `startDate` to the end date.

* **Weekly Reset:** On every Monday, it clears a `usedGroupsThisWeek` set, resetting the weekly scheduling memory.
* **Check for Valid School Day:** It checks if the current date is a weekday (Mon-Fri) and is not in the `daysOff` list. Weekends and days off are skipped entirely, and the day cycle counter does not advance.
* **Determine Daily Periods:** Based on the current day cycle, it selects the periods for the day.
    * **Day 1:** Periods 1, 4, 7, 8 (4 lessons)
    * **Day 2:** Periods 1, 2, 3, 7, 8 (5 lessons)

#### **Step 3: The Group Selection "Waterfall" Logic**

This is the core decision-making part of the algorithm. For each available period on a valid day, it follows a cascading series of three attempts to find a valid group.

**Attempt 1: Find the Ideal Candidate**
1.  It starts with the current pool of available groups from the rotating `groupSets`.
2.  It filters this list to exclude any groups that have already been scheduled this week or earlier today.
3.  It searches this filtered list for the first group that **satisfies the 28-Day Rule** for the current period.
4.  If a perfect match is found, the group is assigned, and the search for this period ends.

**Attempt 2: Broaden the Search**
1.  If Attempt 1 fails, it means no group in the current rotation is valid.
2.  The algorithm now takes the **entire list of 22 groups** and applies the same filter (excluding groups used this week/today).
3.  It again searches for a group that satisfies the 28-Day Rule.
4.  If a match is found, it is assigned.

**Attempt 3: The "Mercy" Search**
1.  If Attempts 1 and 2 fail, it means no group can be scheduled without breaking a rule.
2.  To avoid placing an "MU", the algorithm performs a "mercy search." It scans the list of available groups (those not used this week/today) and, **ignoring the 28-Day Rule for a moment**, identifies the group that has gone the longest since its last assignment in this period. This is the "least bad" option.

**Final Decision: Assignment or MU**
After the "mercy search" finds the "least bad" candidate, a final check occurs:
* If that candidate *still* violates the 28-Day Rule (i.e., its last lesson in this period was less than 28 days ago), the algorithm gives up. The slot is assigned **"MU"**.
* If the candidate from any of the three attempts is valid, it's assigned to the period. The algorithm's memory is then updated:
    * The group is added to `usedGroupsThisWeek`.
    * `periodAssignments` is updated with today's date for that group/period.
    * The group is removed from the current rotation pool.

#### **Step 4: The Dual Rotation System**

When the current pool of rotating groups becomes empty, the `setupNextGroupCycle` function is called. It performs a dual rotation to ensure the schedule is not repetitive:

1.  **Set Rotation:** It moves the first set of groups (e.g., `[A,B,C,D,E]`) to the end of the line.
2.  **Internal Rotation:** It then rotates the elements *within* each of the five sets (e.g., `A,B,C,D,E` becomes `B,C,D,E,A`).

This dual system guarantees that all groups get a chance to be scheduled in different periods and on different days of the week over time.
