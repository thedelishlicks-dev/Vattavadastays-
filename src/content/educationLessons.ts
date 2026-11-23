// src/content/educationLessons.ts
//
// Content for Education (/admin/education). Plain typed data, no markdown library and no CMS, so it
// stays light on weak mobile signal and a lesson can later move to a database table unchanged.
// **double asterisks** make text bold (same convention as ownerGuide.ts).
//
// Help vs Education
//   Help      = "How do I use Stayidom?"   (/help, src/content/ownerGuide.ts, button-by-button steps)
//   Education = "How do I improve my property business?"  (this file: what to look at, why, what to try)
// A lesson never repeats Help's tap-by-tap steps. Where Help has them, `relatedHelp` links to that
// Help section (education.test.ts checks the id exists).
//
// Every lesson answers the five questions:
//   1 What should I understand?   → `body`
//   2 Why does it matter to me?   → `whyItMatters`
//   3 What should I do?           → `actionSteps`
//   4 Where in Stayidom?          → `destination` + `actionLabel` (a real screen, or none)
//   5 How will I know it helped?  → `measure`
//
// Definitions are the ones the app already uses (src/lib/moneySummary.ts, businessMetrics.ts,
// monthlyReport.ts). Do not rephrase them into something different.

import type { GuideBlock } from "./ownerGuide";
import type { EducationDestinationKey } from "../lib/educationDestinations";

export type EducationCategoryId = "start" | "bookings" | "per-booking" | "professional" | "numbers";

export interface EducationCategory {
  id: EducationCategoryId;
  title: string;
  /** One line under the title on the Education page. */
  blurb: string;
  order: number;
}

/** Education content uses these block types only (no images or tables: light on weak signal). */
export type LessonBlock = Extract<GuideBlock, { type: "p" | "list" | "steps" | "note" }>;

export interface EducationLesson {
  id: string;
  /** URL part: /admin/education/<slug>. Lowercase letters, digits and hyphens. */
  slug: string;
  title: string;
  category: EducationCategoryId;
  /** The short intro shown on the card and at the top of the lesson. */
  description: string;
  minutes: number;
  /** "After this lesson you can…" (2 to 3 short items). */
  objectives: string[];
  /** What should I understand? */
  body: LessonBlock[];
  /** Why does it matter to my property? */
  whyItMatters: string;
  /** What should I do? Short, concrete steps. */
  actionSteps: string[];
  /** Label of the action button. Used only when `destination` is set. */
  actionLabel: string;
  /** The Stayidom screen where the owner does it. Omitted when no real screen fits. */
  destination?: EducationDestinationKey;
  /** How can I measure whether it helped? */
  measure: string;
  /** Soft hint ("Best after …"), never a lock. A lesson id. */
  prerequisite?: string;
  /** A Help section id (src/content/ownerGuide.ts) with the tap-by-tap steps. */
  relatedHelp?: string;
  published: boolean;
  /** Position in the suggested path (unique). */
  order: number;
}

export const EDUCATION_CATEGORIES: EducationCategory[] = [
  {
    id: "start",
    title: "Start your stay business",
    blurb: "Get ready before you chase bookings.",
    order: 1,
  },
  {
    id: "bookings",
    title: "Get more bookings",
    blurb: "Turn enquiries into confirmed stays.",
    order: 2,
  },
  {
    id: "per-booking",
    title: "Make more per booking",
    blurb: "Price well and keep dates from going empty.",
    order: 3,
  },
  {
    id: "professional",
    title: "Run professionally",
    blurb: "Payments and costs, handled as a habit.",
    order: 4,
  },
  {
    id: "numbers",
    title: "Understand your numbers",
    blurb: "Read what Stayidom tells you.",
    order: 5,
  },
];

export const EDUCATION_LESSONS: EducationLesson[] = [
  {
    id: "focus-first",
    slug: "what-to-focus-on-first",
    title: "Your property business: what to focus on first",
    category: "start",
    description: "Income comes down to three questions. Find the one holding you back.",
    minutes: 4,
    objectives: [
      "Name the three questions that decide your income",
      "Use your Property Score to pick what to fix first",
    ],
    body: [
      {
        type: "p",
        text: "Whether you let a villa, homestay rooms or a holiday home, income comes down to three questions: can guests **find and trust** you, is your **price per night** right, and are your **dates filling**? Start with the first one you have not finished.",
      },
      {
        type: "p",
        text: "Your **Property Score** on **Home** gives you a number out of 100 for how ready your property is and how well it is set up to earn. It looks at **Listing, Rooms, Pricing, Booking readiness, Operations** and **Growth**, and lists the three things worth the most points.",
      },
      {
        type: "note",
        label: "What the score is not",
        text: "It measures your set-up. It does not measure how much guests enjoyed their stay, and it does not predict demand.",
      },
    ],
    whyItMatters:
      "It is easy to work on the loudest problem, such as an empty weekend, while a quieter gap is the real one: a missing photo, an unset price, no payment details. The score lists what is unfinished, so you can see it.",
    actionSteps: [
      "Open **Home** and find **Property Score**.",
      "Read the three recommended actions. Pick the one you can finish today.",
      "Finish it, then come back to this section for the next lesson.",
    ],
    actionLabel: "Open Property Score",
    destination: "home",
    measure:
      "Your Property Score rises as items are completed. After a month, look at your Monthly report to see whether bookings and revenue moved. A higher score can help but is no promise of more bookings, so judge by the report.",
    relatedHelp: "setup-golive",
    published: true,
    order: 10,
  },
  {
    id: "booking-ready",
    slug: "get-your-property-booking-ready",
    title: "Get your property booking-ready",
    category: "start",
    description: "A guest decides in a minute. Check what they see before they ask you anything.",
    minutes: 4,
    objectives: [
      "See your booking page the way a guest does",
      "Answer the questions your own guests actually ask",
    ],
    body: [
      {
        type: "p",
        text: "Before a guest messages you, they have looked at your photos, rooms and price. A detail they cannot find is a question they have to ask, and some may move on instead.",
      },
      {
        type: "list",
        items: [
          "**Photos** of the property and of each room.",
          "**Rooms and amenities**: what is included, how many guests fit, what the room really has.",
          "**Policies**: check-in and check-out times, your cancellation rule and your house rules.",
          "**Payment details**: your UPI ID and accepted methods (Settings, **Payments**).",
          "**How to reach you**: a map pin, and any tricky last stretch of road or parking.",
        ],
      },
      {
        type: "note",
        label: "Guests ask different things",
        text: "A homestay guest may ask about meals and the host; a whole-villa guest may ask about the kitchen, parking or how many can stay. Your own enquiries tell you more than any checklist.",
      },
    ],
    whyItMatters:
      "Every detail a guest has to ask about is a small chance for them to choose another stay. Answering it once on your page saves you answering it every time.",
    actionSteps: [
      "Open your own booking page on your phone, as a stranger would.",
      "Look back at your last five enquiries and write down what people asked before booking.",
      "Put the top three answers into Settings, Amenities or Policies.",
    ],
    actionLabel: "Review property settings",
    destination: "settings",
    measure:
      "The Property Score categories **Listing**, **Rooms** and **Booking readiness** fill up. Over the next few weeks you may notice fewer basic questions in your enquiries.",
    prerequisite: "focus-first",
    relatedHelp: "setup-settings",
    published: true,
    order: 20,
  },
  {
    id: "weekend-pricing",
    slug: "price-weekends-differently",
    title: "Price weekends differently",
    category: "per-booking",
    description: "Friday and Saturday nights can carry a higher price. Check if yours should.",
    minutes: 4,
    objectives: [
      "Explain base price and the weekend multiplier",
      "Decide from your own calendar whether to raise weekend prices",
    ],
    body: [
      {
        type: "p",
        text: "Your **Base price / night** is your normal price for Sunday to Thursday. The **Weekend multiplier (Fri – Sat)** multiplies it for Friday and Saturday nights: 1.25 means 25% higher, 1 means no increase.",
      },
      {
        type: "p",
        text: "Do not copy another owner's number. In **your** calendar for the last two months, which nights filled first, and which stayed empty? If Fridays and Saturdays go first, a higher weekend price charges for demand you already have. If weekends do not fill, a higher price will not help: look at your photos, price and booking sources first.",
      },
    ],
    whyItMatters:
      "If your weekends already fill at the weekday price, you may be leaving money on each one. If they do not fill, the multiplier is the wrong tool. Deciding from your own calendar beats guessing.",
    actionSteps: [
      "Open **Calendar** and compare which weekday and weekend nights were booked recently.",
      "Open **Rooms & Pricing**, tap a room's price block and check the **Weekend multiplier (Fri – Sat)** and the **Price preview**.",
      "Change it only if your calendar supports it, and change one room first.",
    ],
    actionLabel: "Review weekend pricing",
    destination: "rooms",
    measure:
      "After four to six weekends, open the Monthly report and look at **ADR** and **Occupancy**. ADR up with Occupancy holding is a good sign; one large group or a festival week can also explain it, so compare a few weekends. If Occupancy drops sharply, the price may be too high. Home may also flag weekend pricing set on some rooms but not others.",
    relatedHelp: "seasonal-rates",
    published: true,
    order: 30,
  },
  {
    id: "seasonal-pricing",
    slug: "use-seasonal-pricing",
    title: "Use seasonal pricing",
    category: "per-booking",
    description: "Set a different price for the dates you already know are busy.",
    minutes: 4,
    objectives: [
      "Tell when a season is worth adding",
      "Judge a season by Occupancy as well as ADR",
    ],
    body: [
      {
        type: "p",
        text: "A **Season** is a set of dates with its own room prices. It can repeat every year, so you set it once.",
      },
      {
        type: "p",
        text: "Add one for dates your **own bookings** show are busy. Dates worth checking against your history: Onam, Christmas to New Year, Vishu, the April–May school holidays. A season can also lower prices for a slow stretch, such as the monsoon, if your bookings show one. Weigh that carefully before cutting.",
      },
      {
        type: "p",
        text: "Start with one or two seasons; many small ones are hard to track. Weekend pricing still applies on top, so a Friday in a season costs more than a weekday in it.",
      },
    ],
    whyItMatters:
      "Busy dates may be the nights you are most likely to under-price. A season lets you change them without touching the rest of the year.",
    actionSteps: [
      "List your two busiest periods last year, from your own bookings.",
      "Open **Rooms & Pricing**. **Seasons** is at the top. Add one season for the busiest period.",
      "Check a date inside it on your booking page.",
    ],
    actionLabel: "Review your Seasons",
    destination: "rooms",
    measure:
      "Open the Monthly report for a month that contains the season. It compares with the previous month, so look at **ADR** and **Occupancy** together: higher ADR with Occupancy holding is a good sign. Busy months differ anyway, so judge it over a few seasons.",
    prerequisite: "weekend-pricing",
    relatedHelp: "raise-prices",
    published: true,
    order: 40,
  },
  {
    id: "empty-dates",
    slug: "reduce-empty-dates",
    title: "Reduce empty dates",
    category: "per-booking",
    description: "A night that goes unsold earns nothing. Look at the next 30 days now.",
    minutes: 4,
    objectives: [
      "Find the empty nights that are worth acting on",
      "Pick one small thing to try, other than a discount",
    ],
    body: [
      {
        type: "p",
        text: "Stayidom counts room-nights in the **next 30 days** with no booking, no hold and no block, and may show them under **Opportunities** on **Home**.",
      },
      {
        type: "p",
        text: "Not every empty night is a problem. Dates you are not selling, such as repairs or family use, should be **Blocked** so they are not counted.",
      },
      { type: "p", text: "Ideas worth testing, one at a time:" },
      {
        type: "list",
        items: [
          "Message guests who stayed before (find them in **Bookings**). They already know your property.",
          "Send a **Quote** to someone who asked earlier and did not book.",
          "Check whether your price for those dates is out of line with your nearby busy dates.",
          "Try an **add-on or package**, such as a meal or a campfire, before cutting your base price.",
        ],
      },
      {
        type: "note",
        label: "A discount is one option, not the only one",
        text: "A discount can fill dates, but it lowers what every guest pays and is hard to reverse. Compare the result before repeating it.",
      },
    ],
    whyItMatters:
      "Some empty nights are normal. Empty nights you could have filled with one message are not.",
    actionSteps: [
      "Open **Calendar** and look at the next 30 days.",
      "Block any dates you are not selling.",
      "For the rest, pick one idea from the list and try it this week.",
    ],
    actionLabel: "Open Calendar",
    destination: "calendar",
    measure:
      "Next month's **Occupancy** in the Monthly report. On Home, the empty-dates opportunity should show fewer nights. Try one idea at a time so you know which helped.",
    prerequisite: "weekend-pricing",
    published: true,
    order: 50,
  },
  {
    id: "whatsapp-enquiries",
    slug: "turn-whatsapp-enquiries-into-bookings",
    title: "Turn WhatsApp enquiries into bookings",
    category: "bookings",
    description: "Send a clear written price instead of typing one, and follow it to a booking.",
    minutes: 4,
    objectives: [
      "Send a quote instead of an informal price",
      "Follow an enquiry through to a booking or a clear No",
    ],
    body: [
      {
        type: "p",
        text: 'A guest who messages you on WhatsApp may be asking other stays too. A clear written price, with dates, rooms and total, is easier to say yes to than "around three thousand".',
      },
      {
        type: "p",
        text: "In Stayidom, a **Quote** is that written price: you build it from the dates and rooms and send it on WhatsApp.",
      },
      {
        type: "note",
        label: "A quote does not hold the room",
        text: "Until it becomes a booking, someone else can take the dates. When the guest agrees, tap **Convert to booking** and ask for the advance.",
      },
      {
        type: "p",
        text: "Mark quotes **Accepted** or **Lost** so the list shows what is still open.",
      },
    ],
    whyItMatters:
      "A guest who has already messaged you is a warm lead. A clear, quick answer gives you a better chance of keeping them than a vague one.",
    actionSteps: [
      "For your next enquiry, send a **Quote** instead of typing a price.",
      "When the guest agrees, use **Convert to booking** the same day.",
      "Every week, mark old quotes **Accepted** or **Lost**.",
    ],
    actionLabel: "Open Quotes",
    destination: "quotes",
    measure:
      "On **Quotes**, compare how many are **Accepted** with how many are **Lost** over a month. In the Monthly report, **Revenue by source** shows how much came from WhatsApp, once each booking says how the guest found you.",
    prerequisite: "booking-ready",
    relatedHelp: "guest-asks-price",
    published: true,
    order: 60,
  },
  {
    id: "booking-sources",
    slug: "understand-your-booking-sources",
    title: "Understand your booking sources",
    category: "bookings",
    description: "Find out where your guests really come from, then spend your effort there.",
    minutes: 4,
    objectives: [
      "Tell a booking's source from how the guest found you",
      "Read Revenue by source without being misled",
    ],
    body: [
      {
        type: "p",
        text: "Every booking has two layers. The **source** is direct, agent or walk-in, and it decides agents and commissions. **How did this guest find you?** is the finer detail: WhatsApp, Instagram, Google, Website, Phone call, Walk-in, Repeat guest, Airbnb, Booking.com, MakeMyTrip, Agoda or Other.",
      },
      {
        type: "p",
        text: "**Revenue by source** adds up your Revenue by that detail. A booking with no answer shows as **Unknown**, not guessed. The biggest source is not always the best: compare what it brings with what it costs you, for example agent commission.",
      },
      {
        type: "note",
        label: "Repeat guest here is only a label",
        text: "Choosing **Repeat guest** is your own note. The **Guests** section of the Monthly report finds repeat guests itself, from phone numbers.",
      },
    ],
    whyItMatters:
      "If you do not know where guests come from, you cannot tell which effort is paying off. You may keep posting where nobody books, or neglect the place that fills your rooms.",
    actionSteps: [
      "From now on, ask every new guest how they found you and record it with the booking.",
      "For recent stays you missed, open **Bookings**, pick the stay and tap **Change source**.",
      "Do this for your last few stays.",
    ],
    actionLabel: "Review booking sources",
    destination: "bookings",
    measure:
      "**Revenue by source** in the Monthly report and on **Money → Overview**. Over a few months you should see how much of your Revenue comes from each source, and fewer stays shown as Unknown.",
    prerequisite: "whatsapp-enquiries",
    published: true,
    order: 70,
  },
  {
    id: "revenue-vs-collected",
    slug: "revenue-vs-collected",
    title: "Know the difference between Revenue and Collected",
    category: "numbers",
    description: "Revenue is what stays are worth. Collected is what you have recorded as paid.",
    minutes: 4,
    objectives: [
      "Explain Revenue, Collected and Outstanding in one sentence each",
      "Read the gap between Revenue and Collected correctly",
    ],
    body: [
      {
        type: "list",
        items: [
          "**Revenue** is the value of **confirmed and completed** stays (room plus extras, minus discount), counted by the nights that fall in the period. Pending and cancelled stays never count. It is not payments.",
          "**Collected** is the money you have recorded as received on those same stays.",
          "**Outstanding** is the unpaid balance on those stays.",
        ],
      },
      {
        type: "note",
        label: "Collected is not cash this month",
        text: "Stayidom keeps a running total per booking and no payment dates. So Collected means money recorded on this period's stays, not cash that arrived during the period.",
      },
      {
        type: "p",
        text: "In a simple case, Revenue of ₹1,00,000 and Collected of ₹60,000 leaves about ₹40,000 Outstanding. A stay that crosses two months is split by nights between them.",
      },
    ],
    whyItMatters:
      "A month can look excellent on Revenue while money is still with guests. Mixing the two up leads to spending money you have not received.",
    actionSteps: [
      "Open **Money → Overview** for last month.",
      "Compare **Revenue**, **Collected** and **Outstanding**.",
      "If the gap is large, look at the largest balance under **Outstanding payments** and find out why it is unpaid.",
    ],
    actionLabel: "Open Money overview",
    destination: "money",
    measure:
      "Next month, the gap between Revenue and Collected for stays that have finished should be smaller than it is now.",
    relatedHelp: "problem-money",
    published: true,
    order: 80,
  },
  {
    id: "outstanding-payments",
    slug: "track-outstanding-payments",
    title: "Track Outstanding payments",
    category: "professional",
    description:
      "Record every payment the day it arrives and chase balances before the guest leaves.",
    minutes: 4,
    objectives: [
      "Tell upcoming Outstanding from Outstanding on stays that have started",
      "Build a weekly habit of recording payments",
    ],
    body: [
      {
        type: "p",
        text: "**Outstanding payments** on **Money** are split into stays that have **not started yet** and stays that **have** (check-in on or before today). The second kind needs you today: the guest is, or was, already at your property.",
      },
      {
        type: "p",
        text: "Stayidom can only show what you have recorded. When a guest pays, **record it** on the booking; if they pay the whole balance, **Mark fully paid** on **Payments** does it. A guest who pays more than the bill appears as **Refund due**, and it is never subtracted from Outstanding.",
      },
      {
        type: "note",
        label: "Agree the balance before arrival",
        text: "Stayidom's payment messages ask for a **25% advance** to confirm and the **balance on arrival**. Decide how you collect it, and tell guests, so nobody is surprised at check-out.",
      },
    ],
    whyItMatters:
      "The longer a balance goes unrecorded, the harder it is to remember and to ask for. Balances on stays that have already started are usually the most urgent.",
    actionSteps: [
      "Open **Payments** and look at stays that have started and still owe money.",
      "Contact the guests who owe, politely and with the amount.",
      "Record every payment on the day it arrives.",
    ],
    actionLabel: "Open Payments",
    destination: "payments",
    measure:
      "**Outstanding** for stays that have started goes down on the Money overview, and the outstanding-payment card on Home disappears.",
    prerequisite: "revenue-vs-collected",
    relatedHelp: "guest-says-paid",
    published: true,
    order: 90,
  },
  {
    id: "expenses-profit",
    slug: "track-expenses-and-operating-profit",
    title: "Track Expenses and operating profit",
    category: "professional",
    description: "Revenue is not what you keep. Record what you spend to see what is left.",
    minutes: 4,
    objectives: [
      "Define Estimated operating profit",
      "Know why it is wrong when expenses are missing",
    ],
    body: [
      {
        type: "p",
        text: "**Estimated operating profit** is **Revenue minus the expenses you recorded**. Revenue is the value of stays, not the money received. It is an estimate, not accounting profit: it leaves out anything you did not record, such as loan repayments.",
      },
      {
        type: "note",
        label: "No expenses means no real profit",
        text: "If you record nothing, profit simply equals Revenue and looks far better than it is. Stayidom says so on the screen, and Home may remind you if there is revenue this month and no expense.",
      },
      {
        type: "p",
        text: "You do not need every receipt. Record the regular and large costs. The form offers **Electricity, Cleaning, Staff, Maintenance, Supplies, Food, OTA commission, Property tax, Internet, Marketing, Transport** and **Other**.",
      },
    ],
    whyItMatters:
      "A property can have a good revenue month and still make little. You only see that when costs are on the same screen as income.",
    actionSteps: [
      "Open **Expenses** and add this month's main costs.",
      "Set aside ten minutes each week to add new ones.",
      "Check **Estimated operating profit** on the Money overview.",
    ],
    actionLabel: "Open Expenses",
    destination: "expenses",
    measure:
      "**Estimated operating profit** on **Money → Overview**, and the **Expenses** section of the Monthly report, which groups costs by category. Compare months only once you have recorded expenses in both.",
    prerequisite: "revenue-vs-collected",
    published: true,
    order: 100,
  },
  {
    id: "occupancy-adr-revpar",
    slug: "understand-occupancy-adr-and-revpar",
    title: "Understand Occupancy, ADR and RevPAR",
    category: "numbers",
    description:
      "Three numbers that tell you whether you need more guests, a higher price, or both.",
    minutes: 5,
    objectives: ["Define Occupancy, ADR and RevPAR", "Read them together to find what to work on"],
    body: [
      {
        type: "list",
        items: [
          "**Occupancy** = occupied room nights ÷ available room nights.",
          "**ADR** (average daily rate) = accommodation revenue ÷ occupied room nights.",
          "**RevPAR** = accommodation revenue ÷ available room nights. It is ADR × Occupancy.",
        ],
      },
      {
        type: "p",
        text: "Example: 2 rooms over a 30-night month is **60** available room nights. If **24** were occupied, Occupancy is **40%**. With ₹72,000 of accommodation revenue, ADR is **₹3,000** and RevPAR is **₹1,200**.",
      },
      {
        type: "list",
        items: [
          "**Low Occupancy with a healthy ADR** may mean the price is fine but too few guests are finding you.",
          "**High Occupancy with a low ADR** (compared with your own earlier months) may mean you can charge more.",
          "**Both low:** start with how ready your property is and where guests come from.",
        ],
      },
      {
        type: "note",
        label: "Read them with care",
        text: "ADR and RevPAR use room revenue after discount, without extras, and the rooms active today (Stayidom keeps no room history). With few rooms, one booking moves them a lot, so compare several months.",
      },
    ],
    whyItMatters:
      "Revenue alone cannot tell you whether a good month came from more guests or a better price. These three can.",
    actionSteps: [
      "Open last month's **Monthly report** and find **How the rooms performed**.",
      "Read the change against last month (the report shows it) and note which moved: Occupancy or ADR.",
      "Open the matching lesson: the pricing lessons for ADR, empty dates or booking sources for Occupancy.",
    ],
    actionLabel: "Open Monthly report",
    destination: "report",
    measure:
      "Compare the same three numbers next month. RevPAR combines Occupancy and ADR, so it is the quickest single number to compare; check which of the two moved it.",
    prerequisite: "revenue-vs-collected",
    published: true,
    order: 110,
  },
  {
    id: "monthly-report",
    slug: "read-your-monthly-business-report",
    title: "Read your Monthly Business Report",
    category: "numbers",
    description: "One page that shows how last month went and suggests what to do next.",
    minutes: 5,
    objectives: [
      "Find each section of the report and know what it answers",
      "Pick one action from the report and measure it next month",
    ],
    body: [
      {
        type: "p",
        text: "The report opens on the **last completed month**. From the top it shows your money figures, then **How the rooms performed**, **Revenue by source**, **Expenses**, **Guests**, **What changed** and **What to do next**.",
      },
      {
        type: "note",
        label: "Two parts are about today",
        text: "**Current Property Score** and **Current opportunities** describe how things stand now, not how the month went. The report labels them that way.",
      },
      {
        type: "p",
        text: 'In **Guests**, a **repeat guest** stayed in the month and has more than one confirmed or completed stay with you up to the end of it, matched by phone number. Stays without a usable number are "not identified".',
      },
      {
        type: "p",
        text: "If expenses were not recorded, or the property was set up part-way through the month, the report says so rather than show a misleading change.",
      },
    ],
    whyItMatters:
      "This is where learning meets measuring. Every lesson here ends in a number, and this report is where that number shows up.",
    actionSteps: [
      "Open the report for last month and read **What changed**.",
      "Pick one item from **What to do next** and write down the figure it should move.",
      "Do it this month, then open the report next month and compare that figure.",
    ],
    actionLabel: "Open Monthly report",
    destination: "report",
    measure:
      "The figure you wrote down, next month. If it moved, you know what to repeat; if not, try a different change rather than the same one.",
    prerequisite: "occupancy-adr-revpar",
    published: true,
    order: 120,
  },
];
