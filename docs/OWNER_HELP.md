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
| "Help" link by **Seasonal rates** (old form only; the unified Seasons panel has none yet) | `src/components/RoomRatesEditor.tsx` → `/help#seasonal-rates` |

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

`06-calendar` was retired (old text-in-cell calendar) and is no longer in the repo. `public/help/Help images` is an empty placeholder file made when the folder was created; it can be deleted.

### Rules
- **Names:** lowercase, hyphens, start with a two-digit number, `.webp`. The guide refers to files by exact name; renaming one means editing `ownerGuide.ts`.
- **Privacy:** no real guest names, phone numbers, UPI IDs, booking links or tokens. The page is public. Blur them first (the Payment setup UPI ID and a WhatsApp chat were blurred or left out). A WhatsApp confirmation screenshot was **not** used.
- **Recipe:** take the phone screenshot (1080 × 1920) → crop the top 72 px (status bar) → draw red numbered boxes → resize to 720 px wide → save as WebP (quality ~80). Keep each image under ~60 KB.
- **To replace a screenshot:** upload a file with the same name (browsers may cache the old one for a while) or give it a new name and change that name in `ownerGuide.ts`.

## 5. Keeping the guide true

The guide quotes button and field names exactly (for example **Edit Stay**, **Add to extras**, **Block 1 night**). When you change one of these, or a rule an owner follows (the 25 % advance gate, the hold hours, rate maths):

1. Search `ownerGuide.ts` for the old wording and update it.
2. Retake the matching screenshot (use the table above).
3. Open `/help` on the Dev preview and check the section.

Statements in the guide worth re-checking when code changes: the 25 % rule confirms a pending booking; a pending request is cancelled silently when its hold ends; the weekend multiplier applies on top of a season price; the last night of a season is included; overlapping seasons: higher priority, then shorter; a one-room price beats "All rooms" inside a season; a season with no Room prices never changes room prices.

**Screenshots to retake after rollout (new Seasons screen, on the demo property):** (1) Rooms & Pricing with the Seasons section and one season card showing Room prices and Add-ons & packages; (2) the Add season form with the Room prices box; (3) a room editor showing Season prices. Add them to `raise-prices` and `seasonal-rates`. Until a property is switched, the guide carries a "Not seeing Seasons?" note in `raise-prices`, `seasonal-rates`... remove those notes (`setup-addons` has one too) once every property is on unified seasons.

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
