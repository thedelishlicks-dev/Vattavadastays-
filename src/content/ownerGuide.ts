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
const shot = (file: string, alt: string, caption: string): GuideBlock => ({
  type: "image",
  src: `/help/${file}`,
  alt,
  caption,
  width: 720,
  height: 1232,
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
      shot("09-quote-rooms-addons.webp", "New quote form showing the room list and the add-ons list", "**1** Tap a room to include it and set its guests. **2** Pick the dates first, then choose add-ons here."),
      shot("10-quote-discount-send.webp", "New quote form showing discount, validity date and the Send on WhatsApp button", "**1** Discount. **2** Quote valid until. **3** Send on WhatsApp."),
      { type: "p", text: "When the guest says yes, find the quote under **Quotes** and tap **Convert to booking**. Their details carry over. A converted quote shows **Booked ✓** with a **View in Bookings** button. Ask for the advance, then follow \"The guest says they paid\" below." },
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
          "Open **Rooms & Pricing** and tap a room.",
          "Tap its **price block**, find **Seasonal rates** and tap **Add seasonal rate**.",
          "Name it **Christmas / New Year**.",
          "Pick the **first night 24 Dec** and the **last night 1 Jan**. The last night is **included**.",
          "Choose **% change on base price** and type **30**.",
          "Tick **Apply to all rooms** and save.",
          "Check it: a ₹3,000 room becomes **₹3,900** on weekdays and **₹4,875** on Fridays and Saturdays (the weekend multiplier still applies).",
          "Open your own booking page and try those dates to see what guests see.",
        ],
      },
      shot("05-seasonal-rates.webp", "Room editor showing a saved seasonal rate and the Add seasonal rate button", "**1** A saved rate shows its dates, number of nights and price. **2** Tap **Add seasonal rate** to create another."),
      { type: "p", text: "**Prefer an exact price?** Choose **Fixed ₹ per night** instead, and set the price for one room." },
      { type: "note", label: "Watch out", text: "Under **Property → Add-ons** there is also a thing called **Seasons**. That only prices meals and extras. It does **not** change room prices." },
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
          "Open **Calendar**. It starts on **All rooms**, showing every room together.",
          "Tap a room name above the calendar to see **one room only**.",
          "Read each day: **green** is open, **blue Full** means no room is free that day, and **orange** text means a request is waiting (pending). The small text under the date counts rooms that are free, booked or pending.",
          "Use the arrows beside the month name to move to another month.",
        ],
      },
      shot("06-calendar.webp", "Calendar showing room filters, full days and a day with a pending request", "**1** Block dates. **2** Choose All rooms or one room. **3** Blue: no room is free. **4** Orange text: a request is waiting."),
      { type: "note", label: "Good to know", text: "On a small phone the words inside each day are shortened. If you are unsure about a day, open **Bookings** and check the dates." },
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
          "Tap **Block dates**, on **Home** under Quick actions or on the **Calendar**.",
          "Pick the room.",
          "Tap the **first day**, then the **last day**.",
          "Write a note, such as **Roof repair**.",
          "Save.",
        ],
      },
      { type: "p", text: "The dates show **Blocked** and guests cannot book them. If the work finishes early, tap a **Blocked** date on the Calendar and choose to **reopen** it." },
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
          "Open the booking and tap **Edit Stay** (next to Confirm and Edit Guest).",
          "Change the **check-out to 26 Dec**. The app works out the price again: Thursday ₹4,500 + Friday ₹5,625 + extra guest ₹1,000 = **₹11,125**.",
          "Save. The app shows **Refund due ₹875**, because they paid ₹12,000.",
          "Send the ₹875 back yourself, outside the app. It is **not** sent automatically.",
        ],
      },
      { type: "p", text: "If they had paid less than the new total, **Balance due** shows instead. Collect it, then record it. To change room, use **Edit Stay** and pick the new room; check it is free first." },
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
          "After you pay the agent, tap **Mark paid**. The date is saved.",
          "**Export CSV** downloads the list for your accounts.",
        ],
      },
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
          "On the **Charges** tab, add anything extra the guest used: meals, campfire, laundry, trek guide. The **balance** updates.",
          "Collect the balance. Then open **Money → Payments**, tap **View … in ledger** for the month, find the booking and tap **Mark fully paid**. Or record the amount on the booking.",
          "Check the booking shows **Fully paid**.",
          "If **Refund due** appears in red, the guest has overpaid. Return the difference yourself.",
          "Open the **Invoice** tab if the guest wants a printed copy.",
        ],
      },
      shot("11-money-payments-summary.webp", "Money page showing the Payments tab and the monthly summary chart", "**1** Money has two tabs: Payments and Agents & Commissions. **2** Each month shows what you collected (dark) and what is still outstanding (red). **3** Tap **View … in ledger** to see each booking and its balance."),
      { type: "note", label: "Mistake in an amount?", text: "On the **Payments** page tap **Correct collected amount** and enter the right figure." },
    ],
  },
];

export const SETUP: GuideSection[] = [
  {
    id: "setup-settings",
    title: "1. Property Settings",
    summary: "Fill these first. Guests see them on your booking page.",
    blocks: [
      { type: "p", text: "Open **Property → Settings**." },
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
    summary: "Base price, weekend price, extra guests and seasonal rates.",
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
      shot("04-room-pricing.webp", "Room pricing fields with the price preview", "**1** Base price (Sunday to Thursday). **2** Extra guest charge. **3** Weekend multiplier. **4** Price preview."),
      { type: "p", text: "**Seasonal rates** change the price for set dates, such as Christmas or April–May. Tap **Add seasonal rate**, pick the first and last night (the last night is included), then choose **Fixed ₹ per night** or **% change on base price** (30 for 30% higher, −20 for 20% lower). Tick **Apply to all rooms** if the same rule fits every room." },
      {
        type: "list",
        items: [
          "Nights outside the season use the normal base price.",
          "The weekend multiplier **still applies on top** of a seasonal rate.",
          "If two seasonal rates overlap, a rate for **one room** beats an \"all rooms\" rate. If both are the same kind, the one that **starts later** wins.",
          "New rates apply to **new** bookings only. Existing bookings keep their price.",
        ],
      },
      shot("05-seasonal-rates.webp", "Room editor showing a saved seasonal rate and the Add seasonal rate button", "**1** A saved seasonal rate. **2** Tap **Add seasonal rate** to create another."),
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
      { type: "note", label: "Do not confuse these", text: "**Seasonal rates** (in the room editor) change **room prices**. **Seasons** (under Property → Add-ons) only set prices for **add-ons and packages**." },
    ],
  },
  {
    id: "setup-policies",
    title: "4. Amenities, meals and policies",
    summary: "What guests see before they pay.",
    blocks: [
      {
        type: "list",
        items: [
          "**Property → Amenities:** tick what you offer, such as hot water, parking or a bonfire.",
          "**Property → Meals:** describe your meal options.",
          "**Property → Policies:** set check-in and check-out times, cancellation policy and house rules. Guests see these on the booking form, confirmation, status page and invoice.",
        ],
      },
    ],
  },
  {
    id: "setup-payments",
    title: "5. Payment setup",
    summary: "Guests pay you directly.",
    blocks: [
      { type: "p", text: "Open **Property → Settings → Payment setup**. Add your **UPI ID** and choose the payment methods you accept. Guests pay **you directly**. stayidom.in never touches your money and takes no commission." },
    ],
  },
  {
    id: "setup-golive",
    title: "6. Ready to go live?",
    summary: "A last check before you share your page.",
    blocks: [
      {
        type: "list",
        items: [
          "Your WhatsApp number is correct",
          "Both location coordinates are filled in",
          "Every room has a photo, a price and the right guest limits",
          "Seasonal rates are added for coming busy dates",
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
          "**Seasonal rate dates:** the last night is included.",
          "**Overlapping seasons:** a rate for one room beats an \"all rooms\" rate; if equal, the one that starts later wins.",
          "**Guests included in the price:** each guest above it pays the extra guest charge, every night.",
          "**Seasons under Add-ons** do not change room prices. Only Seasonal rates on the room do.",
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
      {
        type: "list",
        items: [
          "**I recorded the wrong amount:** on the **Payments** page tap **Correct collected amount**.",
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
  { term: "Seasonal rate", meaning: "A different room price for set dates" },
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
