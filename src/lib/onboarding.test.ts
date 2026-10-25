/**
 * Run: npx tsx --test src/lib/onboarding.test.ts   (or: npm test)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renewalState, nextRenewalDate, addCalendarMonths, setupChecklist, setupProgress, attentionReasons,
  matchesFilter, matchesQuery, readSentinel, validateSubdomain, validateOwnerEmail,
  type OnboardingProperty, type PropertyActivity,
} from './onboarding'

const NOW = new Date('2026-10-11T10:00:00Z')
const iso = (d: string) => new Date(d).toISOString()

const base: OnboardingProperty = {
  owner_id: 'u1', subscription_status: 'trial', setup_fee_paid: false,
  shared_amenities: [], hero_image: null, subscription_end_date: null,
}
const act = (o: Partial<PropertyActivity> = {}): PropertyActivity => ({ rooms: 0, pricedRooms: 0, bookings: 0, lastBookingAt: null, ...o })

// ── renewal ─────────────────────────────────────────────────────────────────
test('overdue renewal reports positive days late (screen used to show "in -109 days")', () => {
  const r = renewalState('active', iso('2026-06-24T10:00:00Z'), NOW)
  assert.equal(r.kind, 'overdue')
  assert.equal((r as { days: number }).days, 109)
})
test('renewal within 7 days is "soon", later is "ok"', () => {
  assert.equal(renewalState('active', iso('2026-10-14T10:00:00Z'), NOW).kind, 'soon')
  assert.equal(renewalState('active', iso('2026-11-20T10:00:00Z'), NOW).kind, 'ok')
})
test('only active subscriptions have a renewal', () => {
  for (const s of ['trial', 'pending_setup', 'suspended']) assert.equal(renewalState(s, iso('2026-06-01T00:00:00Z'), NOW).kind, 'none')
  assert.equal(renewalState('active', null, NOW).kind, 'none')
})
test('renewing early adds ONE MONTH to the existing end date; renewing late starts from today', () => {
  const early = nextRenewalDate(iso('2026-10-21T10:00:00Z'), NOW)
  assert.equal(early.toISOString().slice(0, 10), '2026-11-21')
  const late = nextRenewalDate(iso('2026-06-24T10:00:00Z'), NOW)
  assert.equal(late.toISOString().slice(0, 10), '2026-11-11')
  assert.equal(nextRenewalDate(null, NOW).toISOString().slice(0, 10), '2026-11-11')
})
test('a month is a calendar month: month ends clamp, years roll, and twelve renewals land exactly a year on (no drift)', () => {
  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12)
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  assert.equal(ymd(addCalendarMonths(d(2027, 1, 31), 1)), '2027-02-28')   // 31 Jan -> 28 Feb
  assert.equal(ymd(addCalendarMonths(d(2028, 1, 31), 1)), '2028-02-29')   // leap year
  assert.equal(ymd(addCalendarMonths(d(2026, 12, 15), 1)), '2027-01-15')  // year rolls over
  assert.equal(ymd(addCalendarMonths(d(2026, 10, 5), 12)), '2027-10-05')
  let end = d(2026, 10, 5)
  for (let i = 0; i < 12; i++) end = addCalendarMonths(end, 1)
  assert.equal(ymd(end), '2027-10-05')                                    // 12 x "+30 days" would be 5 days early
})

// ── checklist ───────────────────────────────────────────────────────────────
test('readSentinel decodes and trims, and tolerates bad encoding', () => {
  assert.equal(readSentinel(['wifi', '__upi:abc%40okhdfc'], '__upi:'), 'abc@okhdfc')
  assert.equal(readSentinel(['__upi:%E0%A4%A'], '__upi:'), '%E0%A4%A')
  assert.equal(readSentinel(null, '__upi:'), '')
})
test('a brand-new property is 1/9 at most (owner linked)', () => {
  const p = setupProgress(setupChecklist(base, act()))
  assert.deepEqual({ done: p.done, total: p.total }, { done: 1, total: 9 })
})
test('pricing needs EVERY room priced', () => {
  const half = setupChecklist(base, act({ rooms: 3, pricedRooms: 2 }))
  assert.equal(half.find((i) => i.key === 'pricing')!.done, false)
  const all = setupChecklist(base, act({ rooms: 3, pricedRooms: 3 }))
  assert.equal(all.find((i) => i.key === 'pricing')!.done, true)
})
test('policies done with either cancellation or house rules', () => {
  const c = setupChecklist({ ...base, shared_amenities: ['__cancel:Free%20till%203%20days'] })
  assert.equal(c.find((i) => i.key === 'policies')!.done, true)
  const none = setupChecklist({ ...base, shared_amenities: ['__upi:x%40y'] })
  assert.equal(none.find((i) => i.key === 'policies')!.done, false)
})
test('fully set up property is 9/9', () => {
  const p: OnboardingProperty = { owner_id: 'u', subscription_status: 'active', setup_fee_paid: true, hero_image: 'x.webp',
    shared_amenities: ['__upi:a%40b', '__rules:No%20smoking'] }
  const prog = setupProgress(setupChecklist(p, act({ rooms: 2, pricedRooms: 2, bookings: 5 })))
  assert.equal(prog.pct, 100)
})

// ── attention ───────────────────────────────────────────────────────────────
test('unlinked owner needs attention; suspended unlinked does not', () => {
  assert.deepEqual(attentionReasons({ ...base, owner_id: null }, act(), NOW), ['unlinked'])
  assert.deepEqual(attentionReasons({ ...base, owner_id: null, subscription_status: 'suspended' }, act(), NOW), [])
})
test('trial with owner, rooms, prices and UPI is ready to activate', () => {
  const p = { ...base, shared_amenities: ['__upi:a%40b'] }
  assert.deepEqual(attentionReasons(p, act({ rooms: 2, pricedRooms: 2 }), NOW), ['ready_to_activate'])
  assert.deepEqual(attentionReasons(p, act({ rooms: 2, pricedRooms: 1 }), NOW), [])
})
test('overdue active property is flagged and matches the Overdue filter', () => {
  const p: OnboardingProperty = { ...base, subscription_status: 'active', subscription_end_date: iso('2026-06-24T10:00:00Z') }
  assert.deepEqual(attentionReasons(p, act(), NOW), ['overdue'])
  assert.equal(matchesFilter('overdue', p, act(), NOW), true)
  assert.equal(matchesFilter('trial', p, act(), NOW), false)
  assert.equal(matchesFilter('active', p, act(), NOW), true)
})
test('trial filter covers legacy pending_setup too', () => {
  assert.equal(matchesFilter('trial', { ...base, subscription_status: 'pending_setup' }, act(), NOW), true)
})

// ── search ──────────────────────────────────────────────────────────────────
test('search matches name, subdomain, owner and phone, ignoring case', () => {
  const p = { name: 'Misty Colina', subdomain: 'mistycolina', area: 'Kottakamboor', owner_name: 'Thamizh', owner_phone: '8078586122' }
  for (const q of ['misty', 'COLINA', 'kotta', 'thamizh', '80785', '']) assert.equal(matchesQuery(q, p), true, q)
  assert.equal(matchesQuery('zzz', p), false)
})

// ── add-property validation ────────────────────────────────────────────────
test('subdomain: format, length, reserved and duplicate', () => {
  assert.equal(validateSubdomain('greenvalley', ['demo']), '')
  assert.match(validateSubdomain('', []), /required/)
  assert.match(validateSubdomain('ab', []), /at least 3/)
  assert.match(validateSubdomain('a'.repeat(31), []), /30/)
  assert.match(validateSubdomain('Green-Valley', []), /lowercase letters and numbers/)
  assert.match(validateSubdomain('admin', []), /reserved/)
  assert.match(validateSubdomain('DEMO', ['demo']), /already used/)
})
test('owner email: format and the platform admin address is rejected', () => {
  assert.equal(validateOwnerEmail('owner@example.com'), '')
  assert.match(validateOwnerEmail(''), /required/)
  assert.match(validateOwnerEmail('not-an-email'), /valid email/)
  assert.match(validateOwnerEmail(' TheDelishLicks@Gmail.com '), /platform admin/)
})

// ── WhatsApp helpers ────────────────────────────────────────────────────────
import { waNumber, waLink, dashboardReadyMessage, renewalReminderMessage } from './onboarding'

test('waNumber handles plain, +91 and 91-prefixed numbers (old code produced 91919…)', () => {
  assert.equal(waNumber('9497558860'), '919497558860')
  assert.equal(waNumber('+91 9497558860'), '919497558860')
  assert.equal(waNumber('91 94975 58860'), '919497558860')
  assert.equal(waNumber('09497558860'), '919497558860')
})
test('waLink encodes the message', () => {
  assert.equal(waLink('9497558860', 'a b\nc'), 'https://wa.me/919497558860?text=a%20b%0Ac')
})
test('messages use the owner first name and fall back to "there"', () => {
  assert.match(dashboardReadyMessage({ ownerName: 'Dipak A Gopinathan', propertyName: 'Bleaf Mud House', subdomain: 'bleafmudhouse' }), /^Hi Dipak,/)
  assert.match(dashboardReadyMessage({ ownerName: null, propertyName: 'X', subdomain: 'x' }), /^Hi there,/)
  assert.match(dashboardReadyMessage({ ownerName: 'A', propertyName: 'X', subdomain: 'xyz' }), /xyz\.stayidom\.in/)
})
test('renewal message differs for overdue vs upcoming', () => {
  const o = { ownerName: 'A', propertyName: 'X', endDate: '2026-06-24T10:00:00Z' }
  assert.match(renewalReminderMessage({ ...o, overdue: true }), /was due on/)
  assert.match(renewalReminderMessage({ ...o, overdue: false }), /renews on/)
})
