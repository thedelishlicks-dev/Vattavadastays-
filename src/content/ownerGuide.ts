// src/content/ownerGuide.ts
//
// Content for the owner Help page (/help). Plain data, no markdown library, so
// the page stays light on weak mobile signal. Edit the text here; the page in
// src/routes/help.tsx renders it. **double asterisks** make text bold.
//
// Example prices use "Mud House": base ₹3,000, weekend x1.25, extra guest ₹500
// above 2 guests, Christmas rate ₹4,500 from 24 Dec to 1 Jan.

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "note"; label: string; text: string }
  | { type: "image"; src: string; alt: string; caption: string; width: number; height: number }
  | { type: "table"; head: string[]; rows: string[][] };

/** Screenshot block. Files live in public/help/, 720 px wide WebP. */
const shot = (file: string, alt: string, caption: string, height = 1232): GuideBlock => ({
  type: "image",
  src: `/help/${file}`,
  alt,
  caption,
  width: 720,
  height,
});

export type GuideSection = {
  id: string;
  title: string;
  /** One line shown under the title and in the contents list. */
  summary: string;
  blocks: GuideBlock[];
};

export type GuideGroup = { key: string; title: string; intro: string; sections: GuideSection[] };

export const SITUATIONS: GuideSection[] = [
  {
    id: "guest-asks-price",
    title: "A guest asks: can we come 24 to 27 December, 3 of us? How much?",
    summary: "Send a clear written price, then turn it into a booking.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open **Bookings**, tap the **Quotes** tab, then tap **New quote**.",
          "Under **Guest**, enter the name (optional) and the guest's **WhatsApp number**.",
          "Under **Stay**, tap the **check-in** and **check-out** dates on the calendar (24 Dec and 27 Dec). Past dates are crossed out.",
          "Under **Rooms**, tap **Mud House** to include it, then set **3 guests**.",
          "Under **Add-ons & packages**, add meals or a campfire if they want them. Pick the dates first, or the list stays empty.",
          "Under **Discount & validity**, set a **Discount ₹** if you are giving one, and **Quote valid until** (for example 2 days from now). The **Private note** is for you and is not sent.",
          "Check the **Summary**. The room total should be **₹15,750**, plus **₹1,500** for the extra guest: **₹17,250** before add-ons. You can also read the **Preview message** before sending.",
          "Tap **Send on WhatsApp**.",
        ],
      },
      shot("08-quote-guest-stay.webp", "New quote form showing the guest fields and the stay calendar", "**1** Guest name and WhatsApp number. **2** Tap your check-in and check-out dates."),
      shot("09-quote-rooms-addons.webp", "New quote form showing the room list and the add-ons list", "**1** Tap a room to include it and set its guests. **2** Pick the dates first, then choose add-ons here. **3** Each add-on shows its price, option and guests.", 1679),
      shot("10-quote-discount-send.webp", "New quote form showing discount, validity date and the Send on WhatsApp button", "**1** Discount. **2** Quote valid until. **3** Send on WhatsApp.", 1423),
      { type: "p", text: "When the guest says yes, find the quote under **Quotes** and tap **Convert to booking**. You can also mark a quote **Accepted** or **Lost** to keep the list tidy." },
      shot("22-quotes-list.webp", "Quotes list with a draft quote and its Send, Call, Edit, Convert to booking and Accepted buttons", "**1** Filter by Open, Accepted, Lost or All. **2** Send the quote on WhatsApp. **3** Convert it to a booking. **4** Mark it Accepted."),
      { type: "p", text: "The **Convert quote to booking** form opens already filled in. Room prices stay exactly as quoted, and add-ons are saved as **Extras** on the booking. It starts as **pending** and holds the dates until the advance arrives. Check the details and tap **Create booking**. A converted quote shows **Booked ✓** with a **View in Bookings** button. Ask for the advance, then follow \"The guest says they paid\" below." },
      shot("21-quote-convert-booking.webp", "Convert quote to booking form, already filled in from the quote", "**1** The form is pre-filled from the quote. **2** Tap **Create booking**."),
      { type: "note", label: "Watch out", text: "A quote does **not** hold the room. Until it becomes a booking, someone else can take the dates. Convert it as soon as the guest agrees." },
    ],
  },
  {
    id: "guest-request",
    title: "A guest sends a request from your booking page",
    summary: "Reply, take the advance and confirm before the hold runs out.",
    blocks: [
      {
        type: "steps",
        items: [
          "A WhatsApp message arrives with the guest's request. The booking is saved as **Pending** and the room is held.",
          "Open **Home**. The request is under **Needs your attention**.",
          "Reply to the guest and ask for the advance by UPI.",
          "When the money arrives, open the booking and record it in **Amount received (₹)**. If it is **25% or more** of the total, the booking **confirms by itself**.",
          "A **Booking confirmed** prompt appears. Tap it to send the guest their confirmation on WhatsApp.",
        ],
      },
      shot("01-home-needs-attention.webp", "Home screen with a booking request under Needs your attention", "**1** A new request appears under **Needs your attention**. Tap it to open the booking."),
      shot("02-booking-record-payment.webp", "Booking screen with the Confirm button and the Amount received field marked", "**1** Tap **Confirm** yourself, or **2** type the amount received in **Record advance payment**. **25% or more** confirms it by itself (the app suggests the 25% amount)."),
      shot("30-booking-confirmed-prompt.webp", "Booking confirmed prompt with the Send confirmation on WhatsApp button", "**1** Tap **Send confirmation on WhatsApp**. **2** Or tap **Not now — I'll send it later**. You can send it later with **Send confirmation** at the top of the booking."),
      { type: "note", label: "Watch out", text: "If you have not confirmed it or recorded the advance before the hold hours end (24 by default), the request is **cancelled and the dates released, with no message to anyone**. Check **Home** every few hours and reply early." },
    ],
  },
  {
    id: "guest-says-paid",
    title: "The guest says \"I've paid\" but it still shows Pending",
    summary: "Make the app match your bank.",
    blocks: [
      {
        type: "steps",
        items: [
          "Check your UPI app or bank to see that the money really arrived.",
          "Open the booking and record the amount in **Amount received (₹)**.",
          "**25% or more:** it confirms. **Less than 25%:** it stays Pending, so tap **Confirm** yourself if you accept it.",
          "Tap the **Booking confirmed** prompt to send the confirmation.",
        ],
      },
      shot("02-booking-record-payment.webp", "Booking screen with the Confirm button and the Amount received field marked", "**1** Tap **Confirm** yourself, or **2** type the amount received in **Record advance payment**."),
      { type: "p", text: "**Already received something?** The button then reads **Record part payment** and the box reads **New payment (₹)**. Type only the new money. You can also open **Money → Payments**, find the booking and tap **Mark fully paid**. If that confirms a pending booking, a green message appears with **Open booking**, so you can send the guest their confirmation." },
      { type: "p", text: "**If the request has vanished from Home:** it probably ran out of time. Open **Bookings**, filter **Cancelled**, and search the guest. If the **Calendar** still shows the dates **Open**, use **Add booking** to enter the stay again as **Confirmed**, and record their payment." },
      { type: "note", label: "Watch out", text: "The app cannot see your bank. A payment only counts when **you** record it." },
    ],
  },
  {
    id: "raise-prices",
    title: "Christmas is coming and you want higher prices",
    summary: "Charge more for 24 Dec to 1 Jan, for every room.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open **Rooms & Pricing**. **Seasons** is at the top. Tap **Add season**.",
          "Name it **Christmas / New Year**.",
          "Set **Starts** to 24 Dec and **Ends (last night included)** to 1 Jan.",
          "Tick **Repeats every year** so you never have to enter it again.",
          "Under **Room prices in this season**, type **30** (30% higher for every room).",
          "Tap **Save season**.",
          "Check it: a ₹3,000 room becomes **₹3,900** on weekdays and **₹4,875** on Fridays and Saturdays (the weekend multiplier still applies).",
          "Open your own booking page and try those dates to see what guests see.",
        ],
      },
      shot("33-add-season-form.webp", "Add season form with the season name, dates, Repeats every year, Room prices and the add-ons tick box", "**1** Season name. **2** **Starts** and **Ends (last night included)**. **3** **Repeats every year**. **4** **Room prices in this season**: 30 means 30% higher, -20 means 20% lower. **5** **Also use for add-ons & packages**."),
      { type: "p", text: "**Prefer an exact price, or a different price for one room?** On the season, tap **Set room prices** (once a season has a room price, the button reads **Add or change a room price**), choose the room, choose **Fixed ₹ per night** and type the price." },
      { type: "p", text: "**Meals and extras too?** Leave **Also use for add-ons & packages** ticked and set each add-on's price for this season on the Add-ons page. Untick it if only room prices should change." },
    ],
  },
  {
    id: "read-calendar",
    title: "Which rooms are free on which days?",
    summary: "Read the Calendar at a glance.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open **Calendar**. It starts on **All rooms**. The strip at the top shows today: how many rooms are free, how many guests are **arriving** and **leaving**, and any **pending** requests.",
          "Each day shows **one small circle per room**. A **hollow green** circle is free, **blue** is booked, **amber** is a pending request, **red** is blocked, and a **light-blue ring** means a guest checks out that day.",
          "**Tap a day.** A panel opens under the calendar listing every room, who is staying and its status. Tap **View** to open a booking, or **Reopen** on a blocked room.",
          "Today is the dark circle. Past days are faded.",
          "To see one room only, tap its name above the calendar. Each stay is one **bar** with the guest's name: **blue** booked, **amber** pending, **red** blocked. A short bar on the day a guest leaves means the room is free again that afternoon. Tap a bar to open the booking.",
          "If you have many rooms (tents or houseboats), a **drop-down** replaces the room buttons, and each day shows how many rooms are free, with a coloured bar.",
          "Use the arrows beside the month name to move to another month.",
        ],
      },
      shot("15-calendar-all-rooms.webp", "Calendar on All rooms with the Today strip and one circle per room on each day", "**1** Block dates. **2** All rooms, or tap one room. **3** Today: rooms free, arriving, leaving. **4** One circle per room on each day."),
      shot("16-calendar-day-panel.webp", "Calendar colour key and the panel for a tapped day", "**1** The colour key. **2** Tap a day and this panel lists every room and its status."),
      shot("31-calendar-single-room.webp", "Calendar showing one room, with each stay drawn as a bar with the guest name", "**1** Tap a room to see only that room. **2** Each stay is one bar with the guest's name, ending in the middle of the check-out day. **3** A red bar is a blocked day. Tap it to reopen."),
      { type: "note", label: "Good to know", text: "The circles follow the order of your rooms, so the same position is always the same room. If you are unsure, tap the day and read the panel." },
    ],
  },
  {
    id: "block-dates",
    title: "A room needs repair for 5 days",
    summary: "Stop guests booking those dates.",
    blocks: [
      {
        type: "steps",
        items: [
          "Tap **Block dates**, on **Home** under Quick actions or at the top of the **Calendar**.",
          "Under **Rooms**, tap **All rooms** or just the room that is closed.",
          "Use the arrows to find the month. Tap **Select a range**, then tap the **first day** and the **last day**. Or tap **Whole month**. **Clear** starts again. Days with an orange dot already have a booking.",
          "Scroll down and add a short **note** (optional), such as **Roof repair**, so you remember why.",
          "Check the red button at the bottom. It counts the nights (for example **Block 1 night**). Tap it.",
        ],
      },
      shot("29-block-dates.webp", "Block dates form with room buttons, range options, the month calendar and the Block nights button", "**1** Choose the room. **2** Select a range, or the whole month. **3** Tap the days. An orange dot means the day already has a booking. **4** Tap the red button. It reads **Block nights** until you pick days, then **Block 1 night**."),
      { type: "p", text: "The dates show **Blocked** and guests cannot book them. If the work finishes early, tap that day on the **Calendar** and tap **Reopen** next to the room. (In a single room's calendar, tap the **red bar**.)" },
      { type: "note", label: "Watch out", text: "If the room **already has a booking** on those dates, the app will tell you and will not block over it. Move that guest first, with **Edit Stay**." },
    ],
  },
  {
    id: "phone-booking",
    title: "A guest phones or walks in",
    summary: "Record a stay you arranged yourself.",
    blocks: [
      {
        type: "steps",
        items: [
          "Check the **Calendar** to see that the room is free on those days.",
          "Tap **Add booking**, on **Home** under Quick actions or on the **Bookings** page.",
          "Under **Guest details**, enter the **guest name** (required) and **phone**. Email is optional.",
          "Under **How did this booking come in?**, choose **Direct** (they phoned you), **Walk-in** or **Agent**.",
          "Under **Select rooms**, tap the room to include it. The card shows its price, weekend price and extra guest charge.",
          "Choose the **dates**, and set the status: **Confirmed** if the guest is paying now or has paid, **Pending** if you are waiting for the advance (the room is held for your hold hours, then released).",
          "Add a **discount** if you promised one, then tap **Add booking** at the bottom.",
          "Record any money received, then send the **Booking confirmed** message on WhatsApp.",
        ],
      },
      shot("07-add-booking.webp", "Add Booking form with guest details, how the booking came in, and room selection", "**1** Guest name and phone. **2** How the booking came in. **3** Tap a room. **4** Tap Add booking."),
    ],
  },
  {
    id: "change-or-leave-early",
    title: "A guest wants to leave a day early or change dates",
    summary: "Fix the stay and settle the money.",
    blocks: [
      { type: "p", text: "**Example:** the guest booked Thu 24 to Sun 27 Dec (3 nights, ₹17,250) and paid ₹12,000. They now want to leave on Sat 26 Dec." },
      {
        type: "steps",
        items: [
          "Open the booking and tap **Edit Stay** (next to Confirm and Edit Guest). The **Edit Stay Details** screen opens, and it says the total will be recalculated.",
          "Tap the new dates on the calendar: **check-in 24 Dec**, then **check-out 26 Dec**. Crossed-out days are in the past. The app works out the price again: Thursday ₹4,500 + Friday ₹5,625 + extra guest ₹1,000 = **₹11,125**.",
          "Before you save, the app compares the new total with what the guest paid and shows **Guest has overpaid by ₹875 — refund or adjust after saving.** Tap **Save changes**. The booking then shows **Refund due ₹875**.",
          "Send the ₹875 back yourself, outside the app. It is **not** sent automatically.",
        ],
      },
      shot("14-edit-stay.webp", "Edit Stay Details with the room, the stay calendar and the chosen dates", "**1** Choose the room. **2** Tap the new check-in, then check-out. **3** Check the dates shown here before saving."),
      { type: "p", text: "If they had paid less than the new total, the app shows **New balance due** instead. Collect it, then record it. To change room, use **Edit Stay** and pick the new room; check it is free first." },
      { type: "note", label: "Watch out", text: "The app tells you about a refund but does not move any money." },
    ],
  },
  {
    id: "agent-guest",
    title: "An agent brings you a guest",
    summary: "Know what you owe the agent.",
    blocks: [
      { type: "p", text: "**Once, to set up the agent**" },
      {
        type: "steps",
        items: [
          "Open **Money**, tap the **Agents & Commissions** tab, then tap **Add agent**.",
          "Enter the agent's **name** and phone, and set a **default commission**: **percentage** (a share of the room rate, shown for example as **10%**) or **flat amount** (a fixed ₹ per booking, shown for example as **₹500 flat**).",
        ],
      },
      shot("12-agents-commissions.webp", "Agents and Commissions page with the Add agent button and the list of agents", "**1** Add agent. **2** Total commission owed for confirmed stays. **3** Tap the arrow beside an agent to see their bookings."),
      { type: "p", text: "**Each time**" },
      {
        type: "steps",
        items: [
          "When you tap **Add booking** for the agent's guest, choose **Agent** under **How did this booking come in?** and pick the agent. The commission is worked out for you.",
          "Open **Agents & Commissions** at any time. The top card shows **Total commission owed**, and each agent shows what is **owed**.",
          "Tap the **arrow** beside an agent to see their bookings. After you pay the agent, tap **Paid** on that booking. The date is saved.",
          "**Export CSV** downloads the list for your accounts.",
        ],
      },
      shot("34-agent-opened.webp", "An agent opened to show one booking with its commission and the Paid button", "**1** Tap the arrow to open an agent. **2** Each booking shows its commission. **3** Tap **Paid** once you have paid the agent."),
      { type: "note", label: "Watch out", text: "A **percentage** commission cannot be more than 100%. If the amount looks wrong, check you chose percentage or flat correctly." },
    ],
  },
  {
    id: "check-out-day",
    title: "Check-out day",
    summary: "Close the stay with every rupee recorded.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open **Bookings** and find the stay.",
          "On the **Charges** tab, under **Add from your catalog**, choose the item, its option (such as Veg) and the number of **People**, then tap **Add to extras**. The **balance** updates.",
          "Collect the balance. Then open **Money → Payments**, tap **View … in the list →** under the month (or just search the guest), find the booking and tap **Mark fully paid**. **Outstanding**, **Paid** and **All** above the list help you find it. Or record the amount on the booking.",
          "Check the booking shows **Fully paid**. When the guest has left, tap **Complete**. The booking then shows **Completed**, with the check-out time.",
          "If **Refund due** appears in red, the guest has overpaid. Return the difference yourself.",
          "Open the **Invoice** tab if the guest wants a printed copy.",
        ],
      },
      shot("26-charges-tab.webp", "Charges tab with the catalog dropdown and the box for your own charge", "**1** Choose an add-on or package from your catalog. Once you pick one, its **Option** (if it has one), **People** or **Qty**, and **Add to extras** appear. **2** Or add your own charge: a description, a number, a price, then **Add**."),
      shot("28-checkout-summary.webp", "A completed booking with its payment summary showing Fully paid", "**1** The Charges tab shows a number when extras were added. **2** The payment summary. **3** **Fully paid** means nothing is left to collect."),
      shot("11-money-payments-summary.webp", "Money page showing the Payments tab and the monthly summary chart", "**1** Money has two tabs: Payments and Agents & Commissions. **2** Each month shows what you collected (dark) and what is still outstanding (red). **3** Tap **View … in the list →** to see each booking and its balance."),
      { type: "note", label: "Mistake in an amount?", text: "On the **Payments** page, find the booking and tap the **pencil** button (**Correct collected amount**) on its row. Enter the right figure." },
      shot("27-correct-collected.webp", "Correct collected amount form on the Payments page", "**1** Type the **total** amount actually received. Set it to 0 to mark the booking unpaid. **2** Tap Save."),
    ],
  },
];

export const SETUP: GuideSection[] = [
  {
    id: "setup-settings",
    title: "1. Property Settings",
    summary: "Fill these first. Guests see them on your booking page.",
    blocks: [
      { type: "p", text: "Open **Property → Settings**. Small buttons at the top (**Payments**, **Photos**, **Branding**, **Basic info**, **Owner**, **Location** and more) jump to each part." },
      {
        type: "list",
        items: [
          "**Branding and owner information:** your property name and contact details. Your WhatsApp number is where guest requests arrive, so double-check it.",
          "**Location:** enter **both** latitude and longitude. If only one is filled in, the map and Get Directions links will not work. In Google Maps, press and hold on your property and copy the two numbers.",
          "**Photo gallery** (up to 12 photos) and your Instagram name save immediately.",
          "**Pending booking hold (hours):** how long a request holds the room.",
        ],
      },
      { type: "note", label: "How long a request is held", text: "When a guest sends a request, the room is held for a set number of hours (24 by default). If you have not **confirmed it or recorded the advance** by then, the request is **cancelled automatically and the dates are released. Nobody is told.** Set the hold hours to suit how quickly you usually reply." },
    ],
  },
  {
    id: "setup-rooms",
    title: "2. Add your rooms",
    summary: "Name, guests and photos for each room.",
    blocks: [
      { type: "p", text: "Open **Rooms & Pricing → Add room**." },
      {
        type: "table",
        head: ["Field", "What it means"],
        rows: [
          ["**Room name**", "What guests see, for example Mud House"],
          ["**Room type**", "For example Deluxe"],
          ["**Bed type**", "For example King or twin"],
          ["**Guests included in the price**", "How many guests the nightly price already covers"],
          ["**Most guests allowed**", "The most the room can hold. Guests can never book more than this."],
          ["**Active / Inactive**", "Inactive hides the room from guests, for repairs or off-season"],
        ],
      },
      { type: "p", text: "Add up to **6 photos** per room. The photo marked **Main** is the one on the room card. To change it, tap **Make main** on another photo." },
      shot("03-room-photos-and-guests.webp", "Room editor showing photos with Make main, and the guest number fields", "**1** Tap **Make main** to choose the card photo. **2** Guests the price already covers. **3** The most the room can hold."),
    ],
  },
  {
    id: "seasonal-rates",
    title: "3. Set your room rates",
    summary: "Base price, weekend price, extra guests and seasons.",
    blocks: [
      { type: "p", text: "Tap a room in **Rooms & Pricing**, then tap its **price block**." },
      {
        type: "table",
        head: ["Field", "What it does"],
        rows: [
          ["**Base price / night (₹)**", "Your normal rate for **Sunday to Thursday** nights"],
          ["**Weekend multiplier (Fri – Sat)**", "Multiplies the base price on **Friday and Saturday nights**. 1.25 means 25% higher. Leave 1 for no increase."],
          ["**Extra guest charge / night (₹)**", "Charged for **each guest above** \"Guests included in the price\", for every night. 0 turns it off."],
        ],
      },
      { type: "p", text: "A **Price preview** shows a weekday and a weekend night so you can check before saving." },
      shot("04-room-pricing.webp", "Room editor showing the weekend multiplier, the price preview and the Season prices note", "**1** **Weekend multiplier (Fri – Sat)**. **2** **Price preview**: a weekday night, a weekend night and the extra guest charge. **3** **Season prices** shows whether a season changes this room. Change seasons in **Seasons**, at the top of the page. (**Base price** and **Extra guest charge** sit just above these.)"),
      { type: "p", text: "**Seasons** change prices for set dates, such as Christmas or April–May. You set them once, at the top of **Rooms & Pricing**: tap **Add season**, name it, pick the dates (the last night is included) and tick **Repeats every year** if the dates never move. Then choose what changes: on the season, **Room prices** can be **% change on base price** (30 for 30% higher, −20 for 20% lower) or **Fixed ₹ per night**, for **All rooms** or for one room. A room's editor shows its season prices, and **Change season prices** takes you back to Seasons." },
      shot("32-seasons-card.webp", "Rooms and Pricing page with the Seasons box and a New Year season showing Room prices and Add-ons and packages", "**1** A season shows its name and dates. Use the pencil to edit it. **2** **Room prices**: this season adds 20% to Misty Ridge Room. **3** **Add or change a room price**. **4** **Add-ons & packages** can have their own price for the season."),
      {
        type: "list",
        items: [
          "Nights outside every season use the normal base price.",
          "The weekend multiplier **still applies on top** of a season price.",
          "A season with no room price never changes room prices.",
          "If two seasons overlap, the one with the **higher priority** wins; if equal, the **shorter** season wins. Inside a season, a price for **one room** beats an \"All rooms\" price.",
          "New seasons apply to **new** bookings only. Existing bookings keep their price.",
        ],
      },
      { type: "p", text: "**Worked example.** Mud House: base ₹3,000, weekend 1.25, extra guest ₹500 above 2 guests, Christmas fixed ₹4,500 (24 Dec to 1 Jan)." },
      {
        type: "table",
        head: ["Stay", "Working", "Total"],
        rows: [
          ["Ordinary weekend, 2 guests, Fri–Sun", "3,000 × 1.25 × 2 nights", "₹7,500"],
          ["Christmas, 3 guests, Thu 24 – Sun 27 Dec", "4,500 + 5,625 + 5,625 = 15,750, plus extra guest 500 × 3 nights = 1,500", "₹17,250"],
          ["+30% season, weekday / weekend night", "3,000 × 1.3 = 3,900, then × 1.25 = 4,875", "₹3,900 / ₹4,875"],
        ],
      },
      { type: "note", label: "One list of seasons", text: "The same **Seasons** list sets room prices and add-on prices. Each season shows what it changes for **Room prices** and for **Add-ons & packages**." },
    ],
  },
  {
    id: "setup-addons",
    title: "4. Add-ons and packages (optional)",
    summary: "Meals, campfire, treks and bundles, with their own prices.",
    blocks: [
      { type: "p", text: "Open **Property → Add-ons**. This is your list of extras, so you can add them to a quote or booking in a few taps." },
      { type: "p", text: "**An add-on** is one extra, such as Campfire, Full-board meals or a Guided trek." },
      {
        type: "steps",
        items: [
          "Add a new add-on and type its **Name**.",
          "Choose its **Category** (for example Food) and how it is **Charged** (for example per person).",
          "Under **Prices**, type the **Base ₹** price. Tap **Add option** if there are two versions, such as Veg and Non-veg.",
          "If a season is set to apply to add-ons, it has its own price box. **Leave it blank to use the base price.** An amber triangle on a season price means it is blank.",
          "Keep **Available when building quotes** ticked so the add-on appears in your quotes, then tap **Save**.",
        ],
      },
      shot("18-addon-form.webp", "Add-on form with name, category, charged, base price and a season price", "**1** Name. **2** Category and how it is charged. **3** Base price. **4** The price for a season. Blank means the base price."),
      { type: "p", text: "**A package** bundles several add-ons at one price, for example a Weekend Escape with full-board, campfire and a guided trek." },
      {
        type: "steps",
        items: [
          "Type the package **Name**, and a short **Description** if you like.",
          "Choose how it is **Charged**. Most bundles are per person.",
          "Under **Includes**, tick the add-ons in the bundle.",
          "Set its **Prices** in the same way as an add-on, then tap **Save**.",
        ],
      },
      shot("19-package-form.webp", "Package form with name, description, how it is charged, and the add-ons it includes", "**1** Name. **2** How it is charged. **3** Tick the add-ons that are included.", 1335),
      { type: "p", text: "**Seasons** are your peak dates, such as Christmas or a festival. They are set up once in **Rooms & Pricing → Seasons**, and the same season can change room prices and add-on prices. When you add a season there, keep **Also use for add-ons & packages** ticked, then come back here and give each add-on and package its own price for it. **Leave a price blank to use the base price.** **Fill blanks** on the season can copy the base price (or base plus a percentage) into every blank for you." },
      { type: "note", label: "Good to know", text: "Guests cannot buy add-ons or packages online. You add them to a quote or booking after talking to the guest." },
    ],
  },
  {
    id: "setup-policies",
    title: "5. Amenities, meals and policies",
    summary: "What guests see before they pay.",
    blocks: [
      {
        type: "list",
        items: [
          "**Property → Amenities:** tick what you offer, such as hot water, parking or a bonfire.",
          "**Property → Meals:** describe your meal options.",
          "**Property → Policies:** set your check-in and check-out times, your cancellation policy and your house rules. Guests see these on the booking form, confirmation, status page and invoice.",
        ],
      },
      shot("24-policies.webp", "Policies page with check-in and check-out times and the cancellation policy choices", "**1** Check-in and check-out times. **2** Choose a cancellation policy: Flexible, Moderate, Strict or Non-refundable."),
      { type: "note", label: "Good to know", text: "The check-in and check-out times are used in the day-before WhatsApp reminder, and to work out whether a room can be turned over for a new guest on the same day an old guest checks out." },
    ],
  },
  {
    id: "setup-payments",
    title: "6. Payment setup",
    summary: "Guests pay you directly.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open **Property → Settings** and tap **Payments** at the top.",
          "Type your **UPI ID**. It is shown to guests in payment reminder messages and on the booking page.",
          "Under **Accepted payment methods**, tap the ones you accept: **UPI**, **Bank Transfer** or **Cash on Arrival**. A tick means it is on.",
          "Tap **Save payment setup**.",
        ],
      },
      shot("25-payment-setup.webp", "Payment setup with the UPI ID, accepted payment methods and the save button (UPI ID hidden)", "**1** Your UPI ID (hidden here). **2** Tick the methods you accept. **3** Tap Save payment setup."),
      { type: "p", text: "Guests pay **you directly**. stayidom.in never touches your money and takes no commission." },
    ],
  },
  {
    id: "setup-golive",
    title: "7. Ready to go live?",
    summary: "A last check before you share your page.",
    blocks: [
      {
        type: "list",
        items: [
          "Your WhatsApp number is correct",
          "Both location coordinates are filled in",
          "Every room has a photo, a price and the right guest limits",
          "Seasons are added for coming busy dates",
          "Policies and UPI ID are set",
          "You made a test booking on your own page",
        ],
      },
    ],
  },
];

export const PROBLEMS: GuideSection[] = [
  {
    id: "problem-price",
    title: "The price a guest sees is not what I expected",
    summary: "Check these six things, in order.",
    blocks: [
      {
        type: "steps",
        items: [
          "**Base price** is for Sunday to Thursday nights only.",
          "**Weekend multiplier** applies to Friday and Saturday nights. Use the Price preview.",
          "**Season dates:** the last night is included.",
          "**Overlapping seasons:** the season with the higher priority wins; if equal, the shorter season wins. Inside a season, a price for one room beats an \"All rooms\" price.",
          "**Guests included in the price:** each guest above it pays the extra guest charge, every night.",
          "**A season with no Room prices** does not change room prices, even if it changes add-on prices.",
        ],
      },
      { type: "p", text: "Still puzzled? Make a test booking on your own page for the same dates and compare it with the worked example in Set up your property." },
    ],
  },
  {
    id: "problem-vanished",
    title: "A request disappeared from Home",
    summary: "It probably ran out of hold time.",
    blocks: [
      { type: "p", text: "A pending request is cancelled automatically when its hold ends, and nobody is told. Open **Bookings**, filter **Cancelled** and search the guest. If the **Calendar** still shows the dates **Open**, use **Add booking** to enter the stay again and record the guest's payment. To avoid it next time, check Home every few hours and record advances straight away." },
    ],
  },
  {
    id: "problem-double-booking",
    title: "Can two guests book the same room for the same night?",
    summary: "No. The system refuses overlapping bookings.",
    blocks: [
      { type: "p", text: "The second guest sees that the dates are no longer available. One thing to watch: if the calendar shows a warning that it **could not load your bookings**, dates may show wrongly. Refresh and wait for the warning to disappear before relying on it." },
    ],
  },
  {
    id: "problem-cancelled-by-mistake",
    title: "I cancelled a booking by mistake",
    summary: "Cancelling cannot be undone.",
    blocks: [
      { type: "p", text: "If the dates are still open, use **Add booking** to enter the stay again, and record the guest's payments again if they did not carry over." },
    ],
  },
  {
    id: "problem-money",
    title: "Money problems",
    summary: "Wrong amount, refund due, commission looks wrong.",
    blocks: [
      { type: "p", text: "Open **Money → Payments** to see where you stand." },
      shot("13-payments-overview.webp", "Payments page with the Collected, Outstanding and Total billed cards", "**1** Collected so far, and how many bookings are fully or part paid. **2** Outstanding balance, and how many have not started paying. **3** Total billed: room total plus charges minus discounts."),
      {
        type: "list",
        items: [
          "**I recorded the wrong amount:** on the **Payments** page, tap the **pencil** button (**Correct collected amount**) on that booking's row.",
          "**It says Refund due:** the guest has paid more than the booking now costs. You return the money yourself, outside the app.",
          "**An agent's commission looks wrong:** check the default commission in **Agents & Commissions**. A percentage applies to the room rate; a flat amount is a fixed ₹ per booking.",
        ],
      },
    ],
  },
  {
    id: "problem-setup",
    title: "Setup problems",
    summary: "Map, missing rooms, guest limits.",
    blocks: [
      {
        type: "table",
        head: ["Problem", "Fix"],
        rows: [
          ["Map or Get Directions does not work", "In **Property → Settings**, fill in **both** latitude and longitude."],
          ["A room is missing from my booking page", "Check the room is **Active**, and has a price and a photo."],
          ["Wrong photo on the room card", "The **first photo** is the one used. Reorder your photos."],
          ["A guest cannot choose enough guests", "Increase **Most guests allowed** for the room."],
          ["Add-ons do not appear in a quote", "Add them first under **Property → Add-ons**."],
          ["Guests are sent to the wrong WhatsApp number", "Correct your WhatsApp number in **Property → Settings**."],
          ["I forgot my password", "Use the reset link on the login page. A new link comes by email."],
        ],
      },
    ],
  },
];

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "Pending", meaning: "A request is saved and the room is held, but you have not confirmed it" },
  { term: "Hold", meaning: "The hours a pending booking blocks the room. After that it is cancelled automatically." },
  { term: "Confirmed", meaning: "You agreed to the booking, or the advance was recorded" },
  { term: "Completed", meaning: "The guest has stayed and left" },
  { term: "Cancelled", meaning: "The booking was ended and the dates released" },
  { term: "Advance", meaning: "Money paid before arrival to secure the booking" },
  { term: "Balance due", meaning: "What the guest still has to pay" },
  { term: "Refund due", meaning: "What you owe the guest because they overpaid" },
  { term: "Base price", meaning: "Your normal nightly price for Sunday to Thursday" },
  { term: "Weekend multiplier", meaning: "The number Friday and Saturday prices are multiplied by" },
  { term: "Season", meaning: "A set of dates, such as Christmas, with its own room and add-on prices" },
  { term: "Add-on", meaning: "An extra such as a meal or campfire" },
  { term: "Package", meaning: "A bundle of add-ons at one price" },
  { term: "Quote", meaning: "A written price sent to a guest before they book" },
  { term: "Blocked", meaning: "Dates you have closed to guests" },
  { term: "Agent", meaning: "A person or company that brings you guests for a commission" },
  { term: "Commission", meaning: "What you pay the agent for each booking" },
];

/** Shown at the bottom of the page. Fill this in before release. */
export const SUPPORT_CONTACT = "";

export const GUIDE_GROUPS: GuideGroup[] = [
  { key: "situations", title: "What to do when…", intro: "Find the situation that matches your day. Each one tells you exactly what to tap.", sections: SITUATIONS },
  { key: "setup", title: "Set up your property", intro: "Do these once, in this order.", sections: SETUP },
  { key: "problems", title: "Something looks wrong", intro: "Find your problem and what to do.", sections: PROBLEMS },
];
