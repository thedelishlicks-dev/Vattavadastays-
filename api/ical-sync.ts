/**
 * POST /api/ical-sync — Vercel Edge Function
 *
 * Pulls the iCal links an owner saved (room_ical_feeds) and keeps the room's
 * `availability` rows in step with them, so nights sold on Booking.com /
 * Airbnb / Agoda stop being bookable on the guest site.
 *
 * Two ways to call it:
 *  1. Owner (browser):  Authorization: Bearer <the owner's Supabase access token>
 *     body {"room_id": "..."} | {"feed_id": "..."} | {"property_id": "..."}
 *     Runs AS the owner, so row-level security limits it to their own feeds.
 *  2. Scheduler (pg_cron → pg_net): Authorization: Bearer <ICAL_CRON_SECRET>
 *     body {"all": true}. Needs env SUPABASE_SERVICE_ROLE_KEY. Optional.
 *
 * Safety rules (see HANDOVER / docs/POLISH_FIVE.md):
 *  - Only rows carrying THIS feed's note ('ical:<feed id>:…') are ever deleted.
 *    Bookings and manual blocks are never touched or overwritten.
 *  - A failed or non-iCal response is an ERROR, never "calendar is empty":
 *    existing blocks are kept so a flaky link can't suddenly free every night.
 *  - Nights that overlap one of the owner's OWN bookings are reported
 *    (last_conflicts) — that is a real double-booking to resolve by hand.
 *  - URLs are checked (https only, no IPs/localhost), redirects are followed
 *    manually with the same check, size and time are capped.
 */
import { parseIcsNights, looksLikeIcs, normalizeFeedUrl, addDays } from './_lib/ical'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.ICAL_CRON_SECRET

const MAX_BYTES = 2_000_000
const FETCH_TIMEOUT_MS = 8000
const MAX_REDIRECTS = 3
const MAX_FEEDS_PER_CALL = 60

interface Feed { id: string; property_id: string; room_id: string; name: string; url: string }
interface Creds { apikey: string; bearer: string }
interface Result { feed_id: string; room_id: string; ok: boolean; message: string; nights?: number; conflicts?: number; added?: number; removed?: number }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const rest = (c: Creds, extra: Record<string, string> = {}) => ({
  apikey: c.apikey, Authorization: `Bearer ${c.bearer}`, 'Content-Type': 'application/json', ...extra,
})

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/** Fetch a feed with the safety rules above. Throws Error with a human message. */
async function fetchFeedText(rawUrl: string): Promise<string> {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = normalizeFeedUrl(current)
    if (!check.ok) throw new Error(check.error)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(check.url, { redirect: 'manual', signal: ctrl.signal, headers: { Accept: 'text/calendar, */*', 'User-Agent': 'stayidom-ical-sync/1.0' } })
    } catch {
      throw new Error('Could not reach that calendar link (timed out or blocked).')
    } finally {
      clearTimeout(timer)
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('The calendar link redirected without a destination.')
      current = new URL(loc, check.url).toString()
      continue
    }
    if (!res.ok) throw new Error(`The other site answered with an error (${res.status}). Check the link is still valid.`)
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_BYTES) throw new Error('That calendar file is too large.')
    const body = await res.text()
    if (body.length > MAX_BYTES) throw new Error('That calendar file is too large.')
    return body
  }
  throw new Error('The calendar link redirected too many times.')
}

async function syncOne(feed: Feed, c: Creds): Promise<Result> {
  const base = { feed_id: feed.id, room_id: feed.room_id }
  const marker = `ical:${feed.id}`
  const noteValue = `${marker}:${feed.name.replace(/[\r\n]/g, ' ').slice(0, 60)}`
  const today = new Date().toISOString().slice(0, 10)
  const horizon = addDays(today, 730)

  const patch = (body: Record<string, unknown>) =>
    fetch(`${SUPABASE_URL}/rest/v1/room_ical_feeds?id=eq.${feed.id}`, { method: 'PATCH', headers: rest(c, { Prefer: 'return=minimal' }), body: JSON.stringify(body) }).catch(() => null)

  try {
    // 1. Fetch + parse. Any failure here changes NOTHING in availability.
    const body = await fetchFeedText(feed.url)
    if (!looksLikeIcs(body)) throw new Error("That link didn't return a calendar (it may need you to be logged in, or the link is wrong).")
    const parsed = parseIcsNights(body, today, horizon)
    const desired = new Set(parsed.nights)

    // 2. What this feed already owns, and what else is blocked on those nights.
    const sel = (qs: string) => fetch(`${SUPABASE_URL}/rest/v1/${qs}`, { headers: rest(c) })
    const [ownRes, blockedRes, bookRes] = await Promise.all([
      sel(`availability?room_id=eq.${feed.room_id}&note=like.${encodeURIComponent(marker + '*')}&select=date,is_available&limit=5000`),
      sel(`availability?room_id=eq.${feed.room_id}&is_available=eq.false&date=gte.${today}&select=date,note&limit=5000`),
      sel(`bookings?room_id=eq.${feed.room_id}&status=neq.cancelled&check_out=gt.${today}&select=check_in,check_out&limit=2000`),
    ])
    if (!ownRes.ok || !blockedRes.ok) throw new Error('Could not read this room\'s calendar from the database.')
    // Rows carrying this feed's note. A row can still carry the note while being
    // OPEN: the database's free_nights_on_cancel trigger flips is_available back
    // to true when one of OUR bookings on that night is cancelled, without
    // touching the note. Such a row is not blocking anything, so it must be
    // re-blocked if the channel still holds the night — hence two sets.
    const ownRows = (await ownRes.json()) as { date: string; is_available: boolean | null }[]
    const own = new Set<string>(ownRows.map((r) => String(r.date).slice(0, 10)))            // every row with our note (for removal)
    const ownBlocked = new Set<string>(ownRows.filter((r) => r.is_available === false).map((r) => String(r.date).slice(0, 10)))
    const otherBlocked = new Set<string>(
      ((await blockedRes.json()) as { date: string; note: string | null }[])
        .filter((r) => !(r.note ?? '').startsWith(marker))
        .map((r) => String(r.date).slice(0, 10)),
    )

    // Our own bookings' nights (check-in inclusive, check-out exclusive).
    const ownBookingNights = new Set<string>()
    if (bookRes.ok) {
      for (const b of (await bookRes.json()) as { check_in: string; check_out: string }[]) {
        for (let d = String(b.check_in).slice(0, 10); d < String(b.check_out).slice(0, 10); d = addDays(d, 1)) ownBookingNights.add(d)
      }
    }
    const conflicts = [...desired].filter((d) => ownBookingNights.has(d)).length

    // 3. Reconcile.
    const toRemove = [...own].filter((d) => !desired.has(d))
    const toAdd = [...desired].filter((d) => !ownBlocked.has(d) && !otherBlocked.has(d))

    for (const part of chunk(toRemove, 80)) {
      const del = await fetch(
        `${SUPABASE_URL}/rest/v1/availability?room_id=eq.${feed.room_id}&note=like.${encodeURIComponent(marker + '*')}&date=in.(${part.join(',')})`,
        { method: 'DELETE', headers: rest(c, { Prefer: 'return=minimal' }) },
      )
      if (!del.ok) throw new Error('Could not free nights that were cancelled on the other site.')
    }
    for (const part of chunk(toAdd, 400)) {
      const up = await fetch(`${SUPABASE_URL}/rest/v1/availability?on_conflict=room_id,date`, {
        method: 'POST',
        headers: rest(c, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(part.map((date) => ({ room_id: feed.room_id, date, is_available: false, note: noteValue }))),
      })
      if (!up.ok) throw new Error('Could not block the nights booked on the other site.')
    }

    const bits = [`${desired.size} night${desired.size === 1 ? '' : 's'} blocked`]
    if (parsed.truncated) bits.push('feed was very large — only the first nights were read')
    if (parsed.recurringIgnored > 0) bits.push(`${parsed.recurringIgnored} repeating event(s) skipped`)
    if (conflicts > 0) bits.push(`${conflicts} night${conflicts === 1 ? '' : 's'} overlap your own bookings — check them`)
    const message = bits.join(' · ')
    await patch({ last_synced_at: new Date().toISOString(), last_status: 'ok', last_message: message, last_nights: desired.size, last_conflicts: conflicts })
    return { ...base, ok: true, message, nights: desired.size, conflicts, added: toAdd.length, removed: toRemove.length }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed.'
    await patch({ last_synced_at: new Date().toISOString(), last_status: 'error', last_message: message })
    return { ...base, ok: false, message }
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json({ error: 'Sign in again and retry.' }, 401)

  let body: { feed_id?: string; room_id?: string; property_id?: string; all?: boolean } = {}
  try { body = await req.json() } catch { /* empty body is fine for all:true */ }

  // Scheduler path vs owner path.
  const isCron = !!CRON_SECRET && !!SERVICE_KEY && timingSafeEqual(token, CRON_SECRET)
  const creds: Creds = isCron ? { apikey: SERVICE_KEY!, bearer: SERVICE_KEY! } : { apikey: SUPABASE_ANON_KEY, bearer: token }
  if (body.all && !isCron) return json({ error: 'Not allowed.' }, 403)

  const uuid = /^[0-9a-f-]{36}$/i
  const filters: string[] = []
  if (body.feed_id) { if (!uuid.test(body.feed_id)) return json({ error: 'Bad feed id.' }, 400); filters.push(`id=eq.${body.feed_id}`) }
  if (body.room_id) { if (!uuid.test(body.room_id)) return json({ error: 'Bad room id.' }, 400); filters.push(`room_id=eq.${body.room_id}`) }
  if (body.property_id) { if (!uuid.test(body.property_id)) return json({ error: 'Bad property id.' }, 400); filters.push(`property_id=eq.${body.property_id}`) }
  if (filters.length === 0 && !body.all) return json({ error: 'Say which room or feed to sync.' }, 400)

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/room_ical_feeds?${filters.join('&')}&select=id,property_id,room_id,name,url&order=created_at.asc&limit=${MAX_FEEDS_PER_CALL}`,
      { headers: rest(creds) },
    )
    if (res.status === 401 || res.status === 403) return json({ error: 'Sign in again and retry.' }, 401)
    if (!res.ok) return json({ error: 'Could not load your calendar links.' }, 502)
    const feeds = (await res.json()) as Feed[]

    // Sequential: keeps memory/time bounded on the Edge runtime and is gentle on the other sites.
    const results: Result[] = []
    for (const f of feeds) results.push(await syncOne(f, creds))
    return json({ results })
  } catch {
    return json({ error: 'Sync failed. Try again in a moment.' }, 502)
  }
}
