# Owner Help (`/help`)

*Written 8 Nov 2026. Covers the owner Help page, its content file, the screenshots and how to keep them true.*

## 1. What it is

A public, lightweight guide for property owners, written for a basic Android phone on weak signal. It has three groups:

1. **What to do when…**: ten situations (a guest asks for a price, a request arrives, a guest says they paid, higher prices for Christmas, reading the calendar, blocking dates, a phone booking, leaving early, an agent's guest, check-out day).
2. **Set up your property**: Settings, rooms, room rates, add-ons / packages / seasons, amenities / meals / policies, payment setup, go-live checklist.
3. **Something looks wrong**: price, vanished request, double booking, cancelled by mistake, money, setup problems. Plus a glossary.

It needs no login, so the link can be sent to a new owner on WhatsApp. The page is `noindex` but **anyone with the link can read it**: put nothing private in it.

## 2. Where things live

| What | File |
|---|---|
| The page (renders the data) | `src/routes/help.tsx` |
| All text (data, no markdown library) | `src/content/ownerGuide.ts` |
| Screenshots | `public/help/NN-name.webp` |
| Dashboard link (sidebar + mobile More menu) | `src/admin/AdminLayout.tsx` |
| "?" link by **Pending booking hold** | `src/routes/admin.settings.tsx` → `/help#setup-settings` |
| (none) the old "?" link by Seasonal rates was removed with the old form | — |

How it opens: the dashboard links use `target="_blank"`. `/help` is outside the `/admin` manifest scope on purpose, so on a home-screen app it should open in an in-app browser sheet over the app instead of replacing the screen. **Not yet tested on a real Android and iPhone home-screen app** (HANDOVER §10 item 47). The page has a **Close** button (tries `window.close()`, then goes back, then to `/admin/dashboard`).

## 3. Content format (`ownerGuide.ts`)

Blocks, in order, inside a section:

| Block | Use |
|---|---|
| `{ type: "p", text }` | A paragraph |
| `{ type: "steps", items }` | Numbered steps |
| `{ type: "list", items }` | Bullets |
| `{ type: "note", label, text }` | Amber "Watch out" / "Good to know" box |
| `{ type: "table", head, rows }` | Small table (scrolls sideways if wide) |
| `shot(file, alt, caption)` | A screenshot (720 × 1232) with a caption |

`**double asterisks**` make text bold. Sections are `{ id, title, summary, blocks }`; the `id` is the deep-link anchor (`/help#seasonal-rates` opens and scrolls to that section). Groups are `SITUATIONS`, `SETUP`, `PROBLEMS`; `GLOSSARY` and `SUPPORT_CONTACT` sit at the bottom.

**`SUPPORT_CONTACT` is empty**, so the "Still stuck?" box is hidden. Set it to a number or email you are happy to publish.

### Section ids
Situations: `guest-asks-price`, `guest-request`, `guest-says-paid`, `raise-prices`, `read-calendar`, `block-dates`, `phone-booking`, `change-or-leave-early`, `agent-guest`, `check-out-day`.
Setup: `setup-settings`, `setup-rooms`, `seasonal-rates`, `setup-addons`, `setup-policies`, `setup-payments`, `setup-golive`.
Problems: `problem-price`, `problem-vanished`, `problem-double-booking`, `problem-cancelled-by-mistake`, `problem-money`, `problem-setup`.

## 4. Screenshots

All are 720 px wide WebP (about 30–50 KB), phone screenshots of the **demo property** with the Android status bar cropped off and red numbered boxes marking what to tap. The caption explains the numbers.

| File | Shows | Used in |
|---|---|---|
| `01-home-needs-attention` | Home, a pending request | `guest-request` |
| `02-booking-record-payment` | Booking: Confirm, Amount received | `guest-request`, `guest-says-paid` |
| `03-room-photos-and-guests` | Room editor: photos, guests | `setup-rooms` |
| `04-room-pricing` | Base, extra guest, weekend, preview | `seasonal-rates` |
| `05-seasonal-rates` | **RETIRED 10 Nov** (old room-editor form; removed from the guide). Replace with a Seasons screenshot, see below | — |
| `07-add-booking` | Add booking form | `phone-booking` |
| `08`, `09`, `10` quote: guest + stay, rooms + add-ons, discount + send | New quote | `guest-asks-price` |
| `11-money-payments-summary` | Money → Payments monthly chart | `check-out-day` |
| `12-agents-commissions` | Agents & Commissions | `agent-guest` |
| `13-payments-overview` | Collected / Outstanding / Total billed | `problem-money` |
| `14-edit-stay` | Edit Stay Details | `change-or-leave-early` |
| `15-calendar-all-rooms`, `16-calendar-day-panel` | Calendar, All rooms, day panel | `read-calendar` |
| `17-seasonal-rate-form` | **RETIRED 10 Nov** (old form; removed from the guide) | — |
| `18-addon-form`, `19-package-form` | Add-ons page | `setup-addons` |
| `20-addon-seasons`, `23-addon-season-form` | **RETIRED 10 Nov** (old Seasons box; removed from the guide) | — |
| `21-quote-convert-booking`, `22-quotes-list` | Quotes list, convert | `guest-asks-price` |
| `24-policies` | Policies | `setup-policies` |
| `25-payment-setup` (UPI ID blurred) | Payment setup | `setup-payments` |
| `26-charges-tab`, `28-checkout-summary`, `27-correct-collected` | Charges, a completed booking, correct amount | `check-out-day` |
| `29-block-dates` | Block dates | `block-dates` |
| `30-booking-confirmed-prompt` | "Booking confirmed" prompt | `guest-request` |
| `31-calendar-single-room` | Single-room calendar bars | `read-calendar` |
| `32-seasons-card` | Rooms & Pricing → Seasons, a season card (Room prices, Add-ons & packages) | `seasonal-rates` |
| `33-add-season-form` | Add season form | `raise-prices` |
| `34-agent-opened` | An agent opened, with the **Paid** button | `agent-guest` |

`06-calendar` was retired (old text-in-cell calendar) and is no longer in the repo. `public/help/Help images` is an empty placeholder file made when the folder was created; it can be deleted.

### Rules
- **Names:** lowercase, hyphens, start with a two-digit number, `.webp`. The guide refers to files by exact name; renaming one means editing `ownerGuide.ts`.
- **Privacy:** no real guest names, phone numbers, UPI IDs, booking links or tokens. The page is public. Blur them first (the Payment setup UPI ID and a WhatsApp chat were blurred or left out). A WhatsApp confirmation screenshot was **not** used.
- **Recipe:** take the phone screenshot (1080 × 1920) → crop the top 72 px (status bar) → draw red numbered boxes → resize to 720 px wide → save as WebP (quality ~80). Keep each image under ~60 KB.
- **To replace a screenshot:** upload a file with the same name (browsers may cache the old one for a while) or give it a new name and change that name in `ownerGuide.ts`.

## 5. Keeping the guide true

> **11 Nov 2026: every screenshot is now out of date.** The owner side got a new look (soft flat cards, round buttons, one dialog style, avatar list on Payments, flat Calendar, pill navigation; see HANDOVER §10 item 50). Names and steps in the text are still right (the one wording change: Payments now says **View … in the list →**), but retake all screenshots in one session on the demo property so the guide looks consistent. Order of value: Home, Booking, Payments, Calendar, Block dates, Rooms editor, Settings.

> **13 Nov 2026 (batch 3): 9 more screenshots retaken, 5 still old.** Retaken: `03`, `07`, `08`, `14`, `24`, `30`, plus three stitched from two phone shots each because the page scrolls: `09` (rooms + add-ons, 720 x 1679), `10` (discount + Send on WhatsApp, 720 x 1423), `19` (package form top + Includes, 720 x 1335). `shot()` now takes an optional height (default 1232) for these taller images. Guest names and phone numbers in `07`, `08`, `30` are pixelated. The `30` caption changed: **Send confirmation** at the top of the booking is now in the text, not a numbered box.
> **Still the old look (5):** `01` (needs a pending request on Home), `02` (needs a pending booking showing Confirm and Record advance payment), `04` (room pricing section), `21` (the pre-filled convert form), `26` (Charges tab with **Add from your catalog**, Option, People and **Add to extras** visible; the batch-3 shot only showed the custom-charge form and an added item, so it did not match the caption).

> **13 Nov 2026: 12 screenshots retaken in the new look, 3 new ones added, 14 still old.**
> Retaken (720 × 1232, status bar cropped, numbered red boxes, UPI ID pixelated): `11`, `12`, `13`, `15`, `16`, `18`, `22`, `25`, `27`, `28`, `29`, `31`. New: `32-seasons-card` and `33-add-season-form` (in `seasonal-rates` and `raise-prices`), `34-agent-opened` (in `agent-guest`). Wording fixes made with them: the agent booking button is **Paid** (not "Mark paid"); the Block dates button reads **Block nights**, then **Block 1 night**; **Set room prices** becomes **Add or change a room price** once a season has a room price.
> **Still the old look, retake on the demo property:**
> - `01-home-needs-attention`: needs a **pending request** under Needs your attention (the new Home shows a check-in item).
> - `02-booking-record-payment`: needs a **pending** booking so **Confirm** and **Record advance payment** both show.
> - `30-booking-confirmed-prompt`: the prompt right after tapping Confirm.
> - `07-add-booking`: top of the form (guest name, phone, how it came in, room list).
> - `14-edit-stay`: Edit Stay Details with the calendar and dates.
> - `08`, `09`, `10` quote screens: guest and stay; rooms and add-ons; the bottom with **Send on WhatsApp**.
> - `21-quote-convert-booking`: the pre-filled convert form.
> - `03-room-photos-and-guests`, `04-room-pricing`: the room editor.
> - `19-package-form`: the package form.
> - `24-policies`: Policies.
> - `26-charges-tab`: Charges tab with an item chosen so Option, People and **Add to extras** show.
> A WhatsApp screenshot (the guest confirmation message) was offered and **not used**: it shows a live tracking link and a phone number.

> **12 Nov 2026: the page and the wording are updated, the screenshots are not.** `src/routes/help.tsx` now uses the 11 Nov owner-side look (soft `rounded-3xl` cards, round buttons and chips, no shadows, no uppercase labels, no serif headings). In `ownerGuide.ts`: the Settings jump buttons are named as they appear (**Payments, Photos, Branding, Basic info, Owner, Location**); **Correct collected amount** is the **pencil** button on a Payments row; "View … in the list →" replaces "in ledger" in the screenshot caption; the confirmation prompt button reads **Not now — I'll send it later**; Seasons say **Starts** / **Ends (last night included)**; added the **Record part payment** / **New payment (₹)** wording and the **Mark fully paid** → **Open booking** banner. Screenshots still show the old look and must be retaken (see above).

The guide quotes button and field names exactly (for example **Edit Stay**, **Add to extras**, **Block 1 night**). When you change one of these, or a rule an owner follows (the 25 % advance gate, the hold hours, rate maths):

1. Search `ownerGuide.ts` for the old wording and update it.
2. Retake the matching screenshot (use the table above).
3. Open `/help` on the Dev preview and check the section.

Statements in the guide worth re-checking when code changes: the 25 % rule confirms a pending booking; a pending request is cancelled silently when its hold ends; the weekend multiplier applies on top of a season price; the last night of a season is included; overlapping seasons: higher priority, then shorter; a one-room price beats "All rooms" inside a season; a season with no Room prices never changes room prices.

**Seasons screenshots:** the Seasons card (`32`) and the Add season form (`33`) are done. Still to take: a room editor showing **Season prices** (add it to `seasonal-rates`).

Not screenshot-verified in the guide: that the booking shows **Refund due** after saving a shorter stay (the warning before saving is verified in code); the single-room "red bar" reopen tap; that "arriving" counts multi-room bookings correctly.

## 6. Testing checklist (after any change)

1. `npm run build`, `npm run typecheck`, `npm test`.
2. On a phone: `/help` loads, all images appear, a section opens and closes, `/help#seasonal-rates` jumps and opens.
3. The dashboard **Help** item and both "?" links open `/help` in a new tab or sheet; **Close** works.
4. Repeat from a **home-screen app** on Android and iPhone.

## 7. Backlog

- Fill `SUPPORT_CONTACT`.
- Screenshots: Settings (location pair and pending hold field), the "Send WhatsApp reminder" picker (the guide has **no section on reminders yet**; add "Remind a guest"), an agent opened showing **Mark paid**, the Edit Stay overpaid warning on a fully paid booking, the seasonal rate form's price section (after the label fix), the Invoice tab.
- Malayalam copy: the text is plain and short; the data file can be duplicated with a language switch. Screenshots stay English.
- If the **seasons are unified** (`docs/SEASONS_UNIFICATION_PLAN.md`), rewrite `seasonal-rates`, `setup-addons` and `raise-prices` and retake `05`, `17`, `20`, `23`.
