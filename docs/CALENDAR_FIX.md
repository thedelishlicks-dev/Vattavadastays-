# Calendar fix + Block modal scroll

## What you reported
1. Dates booked (from the guest website *or* the owner dashboard) show as **Closed** on the calendar.
2. When all rooms are full the calendar also shows **Closed**.
3. The **Block dates** window can't be scrolled to reach **Save**.

## What was wrong
**3 — Block modal (confirmed, exact cause).** The window had no height limit and its body wasn't
scrollable. On an iPad or phone it grew taller than the screen and the Save button was pushed
below the fold with no way to scroll to it. *(The Payments "Mark fully paid" dialog I added in
Phase 1 had the same weakness — fixed too.)*

**1 & 2 — Calendar labels.** Every booking writes "unavailable" rows into the `availability`
table, and so does a manual block. The old calendar could only tell them apart by checking
whether a booking covered the night — and anything unavailable that it couldn't match to a booking
was labelled **Closed**. It also had no word for "check-out day", "pending", or "all rooms taken".
I can't see your live data, so these are the cases that produce a wrong "Closed", and the new
calendar handles each explicitly:

| Case | Old label | New label |
|---|---|---|
| Night covered by a confirmed booking | Booked (when matched) | **Booked** |
| Guest request not yet confirmed | Booked / Closed | **Pending** (amber) |
| Booking's own **check-out day** flagged unavailable | **Closed** ✗ | **Check-out** |
| Owner-blocked date, no booking | Closed | **Blocked** (matches the legend & button) |
| Bookings failed to load (network, or Superadmin viewing a property it doesn't own) | every booked date **Closed** ✗ | warning banner explaining it |
| Last day of the month | row never fetched (India time-zone bug) | fetched correctly |
| All rooms booked on a date | n/a | **All rooms** view shows **Full** |
| All rooms blocked by owner | n/a | **All rooms** view shows **Blocked** |

## UPDATE (round 2) — "I blocked a date but the calendar doesn't show it blocked"
In the **All rooms** view, blocking ONE of two rooms only changed that date to "1 free / 1/2 taken". It never
said a room was *blocked*, and on an iPad there are no hover tooltips to find out. Now:
- Each All-rooms cell says what is taken, in colour: **`1 free`** + red **`1 blocked`** / blue `1 booked`.
- **Tap any date** in All rooms → a small panel lists every room for that day (Open / Booked / Pending / Check-out / Blocked, with the guest's name) and a **Reopen** button on any blocked room.
- Only `calendarState.ts` and `admin.calendar.tsx` changed. **If you already pasted round 1, paste these two again.**

## What changed (round 1)
- **All rooms** overview is now the default when you have 2+ rooms: each date shows `Open`, `N free`, **Full**, or **Blocked** (hover for the per-room detail). Per-room tabs still work.
- Per-room view: Booked · Pending · Check-out · Blocked · Open, with the guest's first name.
- **Reopen a blocked date (new).** The app could block dates but had **no way to unblock** them, so a mistaken block — or a leftover from a cancelled pending booking — stayed closed forever. In a room's view, tap any **Blocked** date → *Reopen this date?* → **Reopen date**. Only dates with no booking behind them can be reopened, so a real booking can't be freed by accident. (My earlier test list told you to "unblock" a date — that wasn't possible until now.)
- Month window no longer uses `toISOString()` (it dropped the month's last day in India).
- The logic lives in `src/lib/calendarState.ts` and is checked by `scripts/calendarState.check.ts` (22 checks: bookings from either side, full property, manual block, check-out day, pending, cancelled, month/leap boundaries, three time zones).

## Files (6 in the download folder — place as shown)
| # | File | Where it goes | Action |
|---|---|---|---|
| 1 | `calendarState.ts` | `src/lib/` | **New** — add this first (updated in round 2) |
| 2 | `admin.calendar.tsx` | `src/routes/` | Replace (updated in round 2) |
| 3 | `BlockDatesModal.tsx` | `src/components/` | Replace |
| 4 | `admin.payments.tsx` | `src/routes/` | Replace (already contains your Phase 1 + 2 versions, plus the scroll fix) |
| 5 | `calendarState.check.ts` | `scripts/` | New, optional (logic checks) |
| 6 | `CALENDAR_FIX.md` | `docs/` | New, optional (this file) |

Files 1–4 are the actual fix. 5 and 6 are optional documentation.

No database change.

## If a date STILL shows "Blocked" but you didn't block it
That means a date is marked unavailable and no booking explains it. The usual cause: a **pending**
booking was cancelled (or its hold expired). The database only frees dates when a *confirmed*
booking is cancelled, so the pending one leaves its dates marked unavailable.

List them (Supabase → SQL Editor — this only reads):

```sql
select r.name as room, a.date, a.note
from availability a
join rooms r on r.id = a.room_id
where a.is_available = false
  and a.date >= current_date
  and not exists (
    select 1 from bookings b
    where b.room_id = a.room_id
      and b.status <> 'cancelled'
      and a.date >= b.check_in
      and a.date <= b.check_out
  )
order by r.name, a.date;
```
Every row is either a block you made on purpose or a leftover. The `note` column shows the reason you
typed when blocking. To free one, open that room's calendar, tap the **Blocked** date and choose
**Reopen date**. A proper fix (free the dates on *every* cancellation or hold-expiry, not only when a
confirmed booking is cancelled) is on the backlog in the handover.

## Test checklist (iPad Safari)
- [ ] Block dates → on a small screen the middle scrolls, header and **Cancel / Block** stay visible; Save works
- [ ] Block dates with the on-screen keyboard open (tap the Note field) → Save still reachable
- [ ] Payments → Mark fully paid → Confirm button reachable with the keyboard open
- [ ] Calendar opens on **All rooms** (if 2+ rooms); a date where every room is booked says **Full**
- [ ] Block ONE room's date → All rooms cell shows `1 free` and red `1 blocked`; tap it → the panel names the blocked room; **Reopen** works
- [ ] Block ALL rooms for a date → that cell says **Blocked** (red)
- [ ] Book a room from the guest site, refresh the owner Calendar → nights say **Booked** (or **Pending** until you confirm), departure day says **Check-out**
- [ ] Book from the owner dashboard → same
- [ ] Block one date → shows **Blocked**; in that room's view tap it → **Reopen date** → it turns **Open**; All rooms view shows `N free`
- [ ] Tapping a **Booked** / **Pending** / **Check-out** date does nothing (only Blocked dates reopen)
- [ ] Last day of the month shows its real state (browse to a month-end)
- [ ] Per-room tab shows guest first names; legend matches the colours
