# Owner calendar: how it works now

> **11 Nov 2026 look update:** the page chrome is now the flat owner style (28px bold title, big month name with round arrow buttons, soft room chips, white month card with a lightly tinted weekday row, soft day panel, shared `Modal` for the booking card and Reopen). The drawing rules below (dots, bars, half bars, turnover) are unchanged.

*Written 8 Nov 2026. File: `src/routes/admin.calendar.tsx`. The logic in `src/lib/calendarState.ts` (`buildCalendarIndex`, `stateOf`, `summarizeDate`, `bookingForCell`) is unchanged; only the drawing changed.*

## 1. Why it changed

On a 360 px phone each day is about 47 px wide, too narrow for words like "Open · all free" or a guest name. The calendar now shows a **signal** in the cell and puts the words one tap away, or draws stays as bars.

## 2. All rooms view (default with 2+ rooms)

- **Cell:** the date (today = filled circle, past days faded) and, for up to **6 rooms** (`DOT_MAX`), **one dot per room** in room order: a hollow green ring is free; solid blue booked; solid amber pending; sky ring check-out day; solid red blocked. Hollow-vs-solid keeps it readable for colour-blind owners.
- **7 or more rooms (tents, houseboats):** the cell shows `N free` and a thin stacked bar (booked, pending, check-out, blocked, free). On `sm` and wider screens the older text label is shown too.
- **Room picker:** buttons for up to 5 rooms; a **drop-down** above that.
- **Tap a day:** it is highlighted and a **panel under the grid** lists each room with its status and guest, plus **View** (opens the booking peek) and **Reopen** (blocked rooms). The panel scrolls into view after a tap (`block: 'nearest'`). `activeDay` = the tapped day if it is in the viewed month, otherwise today if the month contains it, otherwise none.
- **More than 8 rooms:** the panel lists only rooms that need attention (order: pending, booked, check-out, blocked) and folds the free rooms into an expandable "Free rooms (N)" line.
- **Today strip** (above the month, only in All rooms and only for the month containing today): `N of M free · arriving · leaving`, plus `pending` when there are any. "Arriving" counts bookings whose `check_in` is today and whose status is not `cancelled`; how a multi-room booking counts is unchecked.
- **Legend** sits under the grid.

## 3. Single-room view

Each stay is **one bar** with the guest's name written once, so a name is not repeated and cut off in every cell.

How it is drawn (`singleDays`, computed per day for the chosen room):

- Each day gets a `key`: the booking id for booked and pending nights, or `blocked:<note>` for blocked ones. Consecutive days with the same key are one stay or one block.
- A bar is drawn in the cell where a run **starts**, and again at each **Sunday** if the run continues into a new week row. `barSpan` is the number of cells until the run ends or the row ends. `contLeft` / `contRight` flatten the corners where a bar continues across a week.
- **A stay ends in the middle of the check-out day** (afternoon check-in to morning check-out). The bar is extended by `50% − 1px` into the check-out cell when that cell is in the same week and has a booking leaving. This gives every stay half a cell more for the name (a one-night stay is otherwise about 40 px).
- A **half bar** is drawn in the check-out cell only when no bar can reach it: check-out on a Sunday (the bar is in the previous row) or on the 1st.
- **Same-day handover:** the new stay's bar starts at `50% + 1px` of its first cell.
- A one-cell bar shows the guest's first name only; longer bars show the full label.
- Bars are `pointer-events-none`, so a tap lands on the day underneath: booked, pending and check-out cells open that booking's peek; **blocked** cells are buttons that open the reopen dialog **for that date**.

Two implementation notes: cell dimming is applied to children, not the cell (an `opacity` on the cell would create a stacking context and let neighbouring cells paint over a long bar); there is no hover brightness filter on cells for the same reason.

## 4. Constants and helpers

`DOT_MAX = 6`; `DOT`, `LEGEND_LABEL`, `BAR` (colour maps); components `Dot`, `RoomDots`, `OccupancyBar`, `DayNum`, `RoomRow`, `DayPanel`; `STATE_ORDER` for the many-rooms panel.

## 5. Known limits

- A one-night **blocked** day shows "Bl…" (narrow bar). Tap it to reopen.
- A one-night stay that starts on a **Saturday** on the same day another guest leaves gets a short bar (it cannot cross into the next row).
- The Today strip hides when the viewed month does not contain today.
- No automated UI test exists for the calendar.

## 6. How it was tested

`npm run build`, `npm run typecheck`, `npm test` (207 passed). Visual checks used a temporary page that ran the real calendar in headless Chromium at phone width (412 px) with the data hooks stubbed: two rooms with stays, a same-day handover, a stay crossing a week, a blocked run and a 1st-of-month case; and 18 tents. The test harness is not in the repo. It can be recreated by aliasing `@/hooks/useOwnerProperty`, `@/hooks/useBookings`, `@/lib/supabase` and the router to small stubs.

## 7. Manual checks for any calendar change

1. All rooms with 2 rooms and with 7+ rooms (or a copy of the demo with extra rooms).
2. Tap a day: panel appears and is scrolled into view; **View** and **Reopen** work.
3. Single room: a one-night stay, a stay crossing a week, a Sunday check-out, a same-day handover, a blocked run (tap a date: the reopen dialog names that date).
4. Today strip numbers against Bookings.
5. Desktop width: dots plus text labels, no overlap.
