import { waDigits } from './phone'
/**
 * Pure logic for the superadmin Properties screen: renewal state, setup
 * checklist, "needs attention" reasons and filters. No React / Supabase here
 * so it can be unit-tested (onboarding.test.ts).
 */

export type SubStatus = 'trial' | 'pending_setup' | 'active' | 'suspended'

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Renewal ────────────────────────────────────────────────────────────────

export type RenewalState =
  | { kind: 'none' }
  | { kind: 'ok'; days: number }
  | { kind: 'soon'; days: number }
  | { kind: 'overdue'; days: number } // days = how many days late (positive)

/** Days left on the subscription. Negative = overdue. */
export function daysUntil(endIso: string, now: Date): number {
  return Math.ceil((new Date(endIso).getTime() - now.getTime()) / DAY_MS)
}

/**
 * Renewal status for the Renewal column. Only active subscriptions have a
 * renewal; trial/pending/suspended show nothing.
 */
export function renewalState(status: string, endIso: string | null, now: Date): RenewalState {
  if (status !== 'active' || !endIso) return { kind: 'none' }
  const days = daysUntil(endIso, now)
  if (days < 0) return { kind: 'overdue', days: -days }
  if (days < 7) return { kind: 'soon', days }
  return { kind: 'ok', days }
}

/**
 * New end date when the owner renews: +30 days from whichever is LATER of
 * today and the current end date. (Renewing early must not shorten the
 * period they already paid for; renewing late starts from today.)
 */
export function nextRenewalDate(currentEndIso: string | null, now: Date, days = 30): Date {
  const base = currentEndIso && new Date(currentEndIso).getTime() > now.getTime()
    ? new Date(currentEndIso)
    : new Date(now)
  base.setDate(base.getDate() + days)
  return base
}

// ─── Setup checklist ────────────────────────────────────────────────────────

export interface OnboardingProperty {
  owner_id: string | null
  subscription_status: string
  setup_fee_paid: boolean
  shared_amenities?: string[] | null
  hero_image?: string | null
  subscription_end_date?: string | null
}

export interface PropertyActivity {
  /** active rooms */
  rooms: number
  /** active rooms with a price above 0 */
  pricedRooms: number
  bookings: number
  /** ISO timestamp of the newest booking, if any */
  lastBookingAt: string | null
}

export const EMPTY_ACTIVITY: PropertyActivity = { rooms: 0, pricedRooms: 0, bookings: 0, lastBookingAt: null }

/** Reads a "__prefix:value" config entry out of properties.shared_amenities. */
export function readSentinel(list: string[] | null | undefined, prefix: string): string {
  const entry = (list ?? []).find((a) => a.startsWith(prefix))
  if (!entry) return ''
  const raw = entry.slice(prefix.length)
  try { return decodeURIComponent(raw).trim() } catch { return raw.trim() }
}

export interface ChecklistItem {
  key: 'owner' | 'rooms' | 'pricing' | 'upi' | 'policies' | 'photo' | 'fee' | 'live' | 'booking'
  label: string
  done: boolean
  /** What to do when it is not done. */
  hint: string
}

export function setupChecklist(p: OnboardingProperty, a: PropertyActivity = EMPTY_ACTIVITY): ChecklistItem[] {
  const hasPolicy = !!(readSentinel(p.shared_amenities, '__cancel:') || readSentinel(p.shared_amenities, '__rules:'))
  return [
    { key: 'owner', label: 'Owner login linked', done: !!p.owner_id, hint: 'Press "Invite owner" on this row.' },
    { key: 'rooms', label: 'Rooms added', done: a.rooms > 0, hint: 'Manage → Rooms: add at least one room.' },
    { key: 'pricing', label: 'Room prices set', done: a.rooms > 0 && a.pricedRooms === a.rooms, hint: 'Manage → Rooms: every room needs a base price.' },
    { key: 'upi', label: 'UPI ID added', done: !!readSentinel(p.shared_amenities, '__upi:'), hint: 'Manage → Settings → Payment setup.' },
    { key: 'policies', label: 'Policies written', done: hasPolicy, hint: 'Manage → Settings → Policies (cancellation or house rules).' },
    { key: 'photo', label: 'Hero photo added', done: !!(p.hero_image && p.hero_image.trim()), hint: 'Manage → Settings → Hero image.' },
    { key: 'fee', label: 'Setup fee paid', done: p.setup_fee_paid, hint: 'Collect the fee, then press Activate.' },
    { key: 'live', label: 'Activated', done: p.subscription_status === 'active', hint: 'Press Activate once the fee is paid.' },
    { key: 'booking', label: 'First booking received', done: a.bookings > 0, hint: 'Share the guest booking link with the owner.' },
  ]
}

export function setupProgress(items: ChecklistItem[]): { done: number; total: number; pct: number } {
  const done = items.filter((i) => i.done).length
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 }
}

// ─── Attention & filters ────────────────────────────────────────────────────

export type AttentionReason = 'unlinked' | 'overdue' | 'due_soon' | 'ready_to_activate'

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  unlinked: 'Owner not linked',
  overdue: 'Renewal overdue',
  due_soon: 'Renewal due soon',
  ready_to_activate: 'Ready to activate',
}

export function attentionReasons(p: OnboardingProperty, a: PropertyActivity, now: Date): AttentionReason[] {
  const out: AttentionReason[] = []
  const r = renewalState(p.subscription_status, p.subscription_end_date ?? null, now)
  if (r.kind === 'overdue') out.push('overdue')
  if (r.kind === 'soon') out.push('due_soon')
  if (!p.owner_id && p.subscription_status !== 'suspended') out.push('unlinked')

  const waiting = p.subscription_status === 'trial' || p.subscription_status === 'pending_setup'
  if (waiting && p.owner_id) {
    const items = setupChecklist(p, a)
    const ready = ['rooms', 'pricing', 'upi'].every((k) => items.find((i) => i.key === k)?.done)
    if (ready) out.push('ready_to_activate')
  }
  return out
}

export type PropertyFilter = 'all' | 'attention' | 'trial' | 'active' | 'overdue' | 'suspended'

export function matchesFilter(filter: PropertyFilter, p: OnboardingProperty, a: PropertyActivity, now: Date): boolean {
  switch (filter) {
    case 'all': return true
    case 'attention': return attentionReasons(p, a, now).length > 0
    case 'trial': return p.subscription_status === 'trial' || p.subscription_status === 'pending_setup'
    case 'active': return p.subscription_status === 'active'
    case 'suspended': return p.subscription_status === 'suspended'
    case 'overdue': return renewalState(p.subscription_status, p.subscription_end_date ?? null, now).kind === 'overdue'
  }
}

/** Case-insensitive match on property name, subdomain, area, owner name/phone. */
export function matchesQuery(
  q: string,
  p: { name: string; subdomain: string; area?: string | null; owner_name?: string | null; owner_phone?: string | null },
): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [p.name, p.subdomain, p.area, p.owner_name, p.owner_phone]
    .some((v) => (v ?? '').toLowerCase().includes(needle))
}

// ─── Add-property validation ────────────────────────────────────────────────

export const RESERVED_SUBDOMAINS = [
  'www', 'admin', 'api', 'app', 'mail', 'smtp', 'ftp', 'staging', 'dev', 'test',
  'support', 'help', 'status', 'blog', 'docs', 'superadmin', 'login', 'static', 'cdn',
]

/** Returns an error message, or '' if the subdomain is fine. */
export function validateSubdomain(sub: string, existing: string[]): string {
  const s = sub.trim().toLowerCase()
  if (!s) return 'Subdomain is required'
  if (s.length < 3) return 'Subdomain must be at least 3 characters'
  if (s.length > 30) return 'Subdomain must be 30 characters or fewer'
  if (!/^[a-z0-9]+$/.test(s)) return 'Use lowercase letters and numbers only'
  if (RESERVED_SUBDOMAINS.includes(s)) return `"${s}" is reserved — choose another`
  if (existing.map((e) => e.toLowerCase()).includes(s)) return `"${s}.stayidom.in" is already used by another property`
  return ''
}

const SUPERADMIN_EMAIL = 'thedelishlicks@gmail.com'

/** Returns an error message, or '' if the owner email is fine. */
export function validateOwnerEmail(email: string): string {
  const e = email.trim().toLowerCase()
  if (!e) return 'Owner email is required'
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Enter a valid email address'
  if (e === SUPERADMIN_EMAIL) return 'That is the platform admin login. Use a separate email for the owner.'
  return ''
}

// ─── WhatsApp helpers ───────────────────────────────────────────────────────

/**
 * Digits for a wa.me link, Indian numbers. Handles "9497558860", "+91 94975 58860"
 * and "919497558860" — the old code always prepended 91, so "+91 …" numbers
 * became 91919…, a broken link.
 */
export function waNumber(phone: string): string {
  return waDigits(phone)   // one set of rules for every wa.me link: lib/phone.ts
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`
}

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'there'

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function dashboardReadyMessage(o: { ownerName?: string | null; propertyName: string; subdomain: string }): string {
  return `Hi ${firstName(o.ownerName)}, your stayidom.in dashboard for ${o.propertyName} is ready.\n\n` +
    `Sign in: https://stayidom.in/login\n` +
    `Your guest booking page: https://${o.subdomain}.stayidom.in\n\n` +
    `If you haven't set your password yet, use the link in the invite email we sent you. Reply here if you need any help.`
}

export function renewalReminderMessage(o: { ownerName?: string | null; propertyName: string; endDate: string; overdue: boolean }): string {
  const when = shortDate(o.endDate)
  return o.overdue
    ? `Hi ${firstName(o.ownerName)}, the stayidom.in subscription for ${o.propertyName} was due on ${when}. Please send the renewal payment so your booking page stays live. Thank you!`
    : `Hi ${firstName(o.ownerName)}, a quick reminder that the stayidom.in subscription for ${o.propertyName} renews on ${when}. Thank you!`
}
