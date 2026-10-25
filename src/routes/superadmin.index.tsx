import { saveFailMessage } from '@/lib/bookingActions'
import { createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAllProperties, useCreateProperty, useUpdateSubscription, usePropertyActivity, useInviteOwner } from '@/hooks/useSuperAdmin'
import type { PropertyRow } from '@/hooks/useSuperAdmin'
import {
  ATTENTION_LABEL, EMPTY_ACTIVITY, attentionReasons, dashboardReadyMessage, matchesFilter, matchesQuery,
  nextRenewalDate, renewalReminderMessage, renewalState, setupChecklist, setupProgress, shortDate,
  validateOwnerEmail, validateSubdomain, waLink, waNumber,
} from '@/lib/onboarding'
import type { PropertyActivity, PropertyFilter } from '@/lib/onboarding'
import { useLeads } from '../hooks/useLeads'
import { useClientErrors, useClearClientErrors, groupErrors } from '../hooks/useClientErrors'
import { Loader2, Plus, X, ExternalLink, Copy, Check, MessageCircle, ArrowRight, Link2, ChevronDown, ChevronUp, Search, Circle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/superadmin/')({
  component: SuperAdminIndex,
})

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'

type Tab = 'properties' | 'leads' | 'errors'

type NewPropertyForm = {
  name: string
  subdomain: string
  owner_email: string
  owner_name: string
  owner_phone: string
  area: string
}

const emptyForm = (): NewPropertyForm => ({
  name: '',
  subdomain: '',
  owner_email: '',
  owner_name: '',
  owner_phone: '',
  area: '',
})

// ─── helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trial: 'bg-blue-100 text-blue-700',
    pending_setup: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-600',
  }
  const labels: Record<string, string> = { pending_setup: 'pending' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted" title="Copy">
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

const TIER_LABEL: Record<string, string> = {
  starter: 'Starter · 1–5 rooms',
  growth:  'Growth · 6–10 rooms',
  pro:     'Pro · 10+ rooms',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function whatsappLink(phone: string, name: string) {
  const cleaned = phone.replace(/\D/g, '')
  const number  = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
  const msg     = encodeURIComponent(
    `Hi ${name}, thank you for your interest in stayidom.in! I'd love to show you a demo of how the platform works for your homestay. When would be a good time to connect?`
  )
  return `https://wa.me/${number}?text=${msg}`
}

// ─── Link Owner Modal ─────────────────────────────────────────────────────────

type LinkTarget = { id: string; name: string; email: string; alreadyLinked: boolean }

function LinkOwnerModal({ target, onClose, onLinked }: { target: LinkTarget; onClose: () => void; onLinked: () => void }) {
  const [email, setEmail] = useState(target.email)
  const [busy, setBusy] = useState<'invite' | 'link' | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const { mutateAsync: inviteOwner } = useInviteOwner()

  const finish = (message: string) => {
    setDone(message)
    setTimeout(() => { onLinked(); onClose() }, 2600)
  }

  const check = () => {
    const msg = validateOwnerEmail(email)
    if (msg) { setError(msg); return false }
    if (target.alreadyLinked && !confirmReplace) { setError('Tick the box to confirm you want to replace the current owner.'); return false }
    return true
  }

  // New owner: email them a set-password link AND link the account, in one step.
  const handleInvite = async () => {
    if (!check()) return
    setBusy('invite')
    setError('')
    try {
      const res = await inviteOwner({ propertyId: target.id, email: email.trim().toLowerCase(), replace: target.alreadyLinked })
      finish(res.outcome === 'invited'
        ? `Invite sent to ${email.trim()}. They will get an email with a link to set their password, and this property is already linked to them.`
        : 'That email already had a login, so it is now linked to this property. No email was sent.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to invite owner')
    } finally {
      setBusy(null)
    }
  }

  // Owner who already has a login (e.g. invited from the Supabase dashboard).
  const handleLink = async () => {
    if (!check()) return
    setBusy('link')
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('link_property_owner', { p_property_id: target.id, p_email: email.trim().toLowerCase() })
      if (rpcError) throw rpcError
      finish('Owner linked successfully.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to link owner'
      if (msg.includes('No user found')) {
        setError(`No login exists for "${email}" yet. Use "Send invite & link" to create one.`)
      } else {
        setError(msg)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-2xl shadow-xl flex flex-col max-h-[95dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display text-base font-semibold">{target.alreadyLinked ? 'Change owner' : 'Invite owner'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{target.name}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {done ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-800 text-center font-medium">✅ {done}</div>
          ) : (
            <>
              <div className="rounded-xl bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How this works</p>
                <p><strong>Send invite &amp; link</strong> emails the owner a link to set their own password and links their login to this property straight away. If that email already has a login, it is just linked.</p>
                <p><strong>Link existing account</strong> is for an owner who already has a login (for example one you invited from Supabase).</p>
              </div>

              <div>
                <label className={labelCls}>Owner's email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="owner@example.com" autoFocus />
                <p className="text-[11px] text-muted-foreground mt-1">Use the owner's own email, not the platform admin address.</p>
              </div>

              {target.alreadyLinked && (
                <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 cursor-pointer">
                  <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="mt-0.5" />
                  <span>This property already has an owner. The new login will become the owner and the old one will lose access to it.</span>
                </label>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}
        </div>

        {!done && (
          <div className="px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border space-y-2">
            <button onClick={handleInvite} disabled={busy !== null} className="w-full rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy === 'invite' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send invite &amp; link
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={handleLink} disabled={busy !== null} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50 flex items-center justify-center gap-2">
                {busy === 'link' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Link existing account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Property Modal ───────────────────────────────────────────────────────

function AddPropertyModal({ onClose, onInviteNow }: { onClose: () => void; onInviteNow: (t: { id: string; name: string; email: string }) => void }) {
  const [form, setForm] = useState<NewPropertyForm>(emptyForm())
  const [created, setCreated] = useState<{ id: string; name: string; email: string; subdomain: string } | null>(null)
  const [error, setError] = useState('')
  const { mutateAsync: createProperty, isPending } = useCreateProperty()
  const { data: existing = [] } = useAllProperties()

  const set = (k: keyof NewPropertyForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubdomain = (val: string) =>
    set('subdomain', val.toLowerCase().replace(/[^a-z0-9]/g, ''))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Property name is required'); return }
    const subError = validateSubdomain(form.subdomain, existing.map((p) => p.subdomain))
    if (subError) { setError(subError); return }
    const emailError = validateOwnerEmail(form.owner_email)
    if (emailError) { setError(emailError); return }
    setError('')
    try {
      const res = await createProperty({
        name: form.name.trim(),
        subdomain: form.subdomain,
        owner_email: form.owner_email.trim().toLowerCase(),
        owner_name: form.owner_name.trim() || undefined,
        owner_phone: form.owner_phone.trim() || undefined,
        area: form.area.trim() || undefined,
      })
      setCreated({ id: res.property_id, name: form.name.trim(), email: form.owner_email.trim().toLowerCase(), subdomain: form.subdomain })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create property')
    }
  }

  const supabaseUsersUrl = 'https://supabase.com/dashboard/project/vzzfqgqxnodlrvnaxpbw/auth/users'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!created ? onClose : undefined} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-xl flex flex-col max-h-[95dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">
            {created ? 'Property Created' : 'Add New Property'}
          </h2>
          {!created && (
            <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {created ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-800">
                <div className="font-semibold mb-1">✅ Property created</div>
                <a href={`https://${created.subdomain}.stayidom.in`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline text-green-700">
                  {created.subdomain}.stayidom.in
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="rounded-xl border border-border p-4 space-y-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Next steps</div>

                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">1</div>
                  <div className="space-y-2 flex-1">
                    <p className="text-sm font-medium">Invite the owner</p>
                    <p className="text-xs text-muted-foreground">Emails <strong>{created.email}</strong> a link to set their password and links their login to this property in one step.</p>
                    <button onClick={() => { onInviteNow({ id: created.id, name: created.name, email: created.email }); onClose() }} className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 py-1.5 text-xs font-medium hover:opacity-90">
                      Invite owner now
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">2</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Set up the property</p>
                    <p className="text-xs text-muted-foreground mt-1">Press <strong>Manage</strong> on the property row to add rooms, prices, UPI ID, policies and a hero photo. The row shows a setup checklist so you can see what is left.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">3</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Activate once the setup fee is paid</p>
                    <p className="text-xs text-muted-foreground mt-1">Press <strong>Activate</strong> on the property row.</p>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
                  Prefer to invite from Supabase instead? Invite the owner there, then press <strong>Re-link</strong> / <strong>Invite owner</strong> on the row and choose <strong>Link existing account</strong>.{' '}
                  <a href={supabaseUsersUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">Open Supabase Auth</a>
                </p>
              </div>

              <button onClick={onClose} className="w-full rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Done — I'll invite later</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Property name *</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="e.g. Green Valley Homestay" />
              </div>

              <div>
                <label className={labelCls}>Subdomain *</label>
                <div className="flex items-center gap-0">
                  <input value={form.subdomain} onChange={(e) => handleSubdomain(e.target.value)} className="flex-1 rounded-l-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="greenvalley" />
                  <span className="rounded-r-lg border border-l-0 border-border bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">.stayidom.in</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">3–30 lowercase letters and numbers. Checked against existing properties.</p>
              </div>

              <div>
                <label className={labelCls}>Owner email *</label>
                <input type="email" value={form.owner_email} onChange={(e) => set('owner_email', e.target.value)} className={inputCls} placeholder="owner@example.com" />
                <p className="text-xs text-muted-foreground mt-1">The owner's own email — not the platform admin address.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Owner name</label>
                  <input value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} className={inputCls} placeholder="Full name" />
                </div>
                <div>
                  <label className={labelCls}>Owner phone</label>
                  <input type="tel" value={form.owner_phone} onChange={(e) => set('owner_phone', e.target.value)} className={inputCls} placeholder="98765 43210" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Area / Location</label>
                <input value={form.area} onChange={(e) => set('area', e.target.value)} className={inputCls} placeholder="e.g. Upper Vattavada" />
              </div>
            </div>
          )}
        </div>

        {!created && (
          <div className="px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border space-y-2">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={handleSave} disabled={isPending} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create property
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Leads Tab ────────────────────────────────────────────────────────────────

function LeadsTab() {
  const { data: leads = [], isLoading, isError, refetch } = useLeads()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
        Failed to load leads.{' '}
        <button onClick={() => refetch()} className="text-primary underline">Retry</button>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-border p-10 text-center text-muted-foreground">
        <div className="text-3xl mb-3">🌿</div>
        <p className="font-medium">No demo requests yet</p>
        <p className="text-sm mt-1">Share the landing page to start collecting leads.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leads.length} request{leads.length !== 1 ? 's' : ''} · Newest first
        </p>
        <button onClick={() => refetch()} className="text-xs px-3 py-1.5 rounded-full bg-muted border border-border hover:bg-accent font-medium">↻ Refresh</button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Property</th>
              <th className="px-4 py-2.5 font-medium">Plan interest</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Received</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => (
              <tr key={lead.id} className={`border-t border-border ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                <td className="px-4 py-3 font-medium">{lead.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{lead.property_name || '—'}</td>
                <td className="px-4 py-3">
                  {lead.tier ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">{TIER_LABEL[lead.tier] ?? lead.tier}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3">
                  <a href={whatsappLink(lead.phone, lead.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#25D366] font-medium hover:underline">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {lead.phone}
                  </a>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(lead.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {leads.map((lead) => (
          <div key={lead.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.property_name || 'No property name'}</p>
              </div>
              {lead.tier && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">{TIER_LABEL[lead.tier] ?? lead.tier}</span>
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">{formatDate(lead.created_at)}</p>
              <a href={whatsappLink(lead.phone, lead.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#25D366] text-white px-3 py-1.5 rounded-full">
                <MessageCircle className="h-3 w-3" />
                {lead.phone}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Properties Tab ───────────────────────────────────────────────────────────

const FILTERS: { key: PropertyFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs action' },
  { key: 'trial', label: 'Trial' },
  { key: 'active', label: 'Active' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'suspended', label: 'Suspended' },
]

const OWNER_LOGIN_URL = 'https://stayidom.in/login'

function CopyRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xs font-mono truncate">{text}</div>
      </div>
      <CopyButton text={text} />
    </div>
  )
}

/** Expanded panel under a property row: setup checklist, activity, links and billing. */
function PropertyDetails({ p, activity, now }: { p: PropertyRow; activity: PropertyActivity; now: Date }) {
  const { mutate: updateSubscription, isPending } = useUpdateSubscription()
  const items = setupChecklist(p, activity)
  const prog = setupProgress(items)
  const renewal = renewalState(p.subscription_status, p.subscription_end_date, now)
  const ownerPhone = p.owner_whatsapp || p.owner_phone

  const [tier, setTier] = useState<'small' | 'large'>(p.subscription_tier ?? 'small')
  const [monthlyFee, setMonthlyFee] = useState(String(p.monthly_fee ?? 0))
  const [setupFee, setSetupFee] = useState(String(p.setup_fee_amount ?? 0))
  const [notes, setNotes] = useState(p.billing_notes ?? '')
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState('')

  const saveBilling = () => {
    const mf = Number(monthlyFee)
    const sf = Number(setupFee)
    if (!Number.isFinite(mf) || mf < 0 || !Number.isFinite(sf) || sf < 0) { setFormError('Fees must be zero or more.'); return }
    setFormError('')
    updateSubscription(
      { propertyId: p.id, subscription_tier: tier, monthly_fee: mf, setup_fee_amount: sf, billing_notes: notes.trim() ? notes.trim() : null },
      {
        onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) },
        onError: (e) => setFormError(e instanceof Error ? e.message : 'Could not save'),
      },
    )
  }

  const open = (url: string) => window.open(url, '_blank', 'noopener')

  return (
    <div className="grid gap-5 md:grid-cols-3 p-4 bg-muted/20">
      {/* Setup progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Setup progress</div>
          <div className="text-xs font-medium">{prog.done}/{prog.total}</div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3"><div className="h-full bg-primary" style={{ width: `${prog.pct}%` }} /></div>
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-xs">
              {i.done
                ? <Check className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                : <Circle className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />}
              <div>
                <span className={i.done ? 'text-muted-foreground' : 'font-medium'}>{i.label}</span>
                {!i.done && <div className="text-[11px] text-muted-foreground">{i.hint}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Activity + links */}
      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Activity</div>
        <div className="text-xs space-y-1">
          <div>Rooms: <strong>{activity.rooms}</strong> <span className="text-muted-foreground">({activity.pricedRooms} priced)</span></div>
          <div>Bookings: <strong>{activity.bookings}</strong></div>
          <div>Last booking: <strong>{activity.lastBookingAt ? shortDate(activity.lastBookingAt) : 'none yet'}</strong></div>
          <div>Created: <strong>{shortDate(p.created_at)}</strong></div>
        </div>
        <CopyRow label="Guest booking page" text={`https://${p.subdomain}.stayidom.in`} />
        <CopyRow label="Owner sign-in page" text={OWNER_LOGIN_URL} />
        {ownerPhone && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => open(waLink(ownerPhone, dashboardReadyMessage({ ownerName: p.owner_name, propertyName: p.name, subdomain: p.subdomain })))} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted">
              <MessageCircle className="h-3.5 w-3.5" /> Dashboard-ready message
            </button>
            {p.subscription_end_date && (renewal.kind === 'overdue' || renewal.kind === 'soon') && (
              <button onClick={() => open(waLink(ownerPhone, renewalReminderMessage({ ownerName: p.owner_name, propertyName: p.name, endDate: p.subscription_end_date!, overdue: renewal.kind === 'overdue' })))} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted">
                <MessageCircle className="h-3.5 w-3.5" /> Renewal reminder
              </button>
            )}
          </div>
        )}
      </div>

      {/* Plan & billing */}
      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Plan &amp; billing</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Tier</label>
            <select value={tier} onChange={(e) => setTier(e.target.value as 'small' | 'large')} className={inputCls}>
              <option value="small">Small</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Monthly ₹</label>
            <input type="number" min={0} value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Setup fee ₹</label>
            <input type="number" min={0} value={setupFee} onChange={(e) => setSetupFee(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes (only you see this)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} placeholder="Payment promises, special terms, follow-ups…" />
        </div>
        {formError && <p className="text-xs text-destructive">{formError}</p>}
        <button onClick={saveBilling} disabled={isPending} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {saved ? 'Saved ✓' : 'Save plan & notes'}
        </button>
      </div>
    </div>
  )
}

function PropertiesTab({ onLinkOwner }: { onLinkOwner: (t: LinkTarget) => void }) {
  const { data: properties = [], isLoading } = useAllProperties()
  const { data: activity } = usePropertyActivity(properties.map((p) => p.id))
  const { mutateAsync: updateSubscriptionAsync } = useUpdateSubscription()
  // One action at a time; the row it is working on shows a spinner label, and a failure is shown on that row
  // (it used to do nothing visible on a weak connection, so a failed Activate/Suspend looked like it had worked).
  const [acting, setActing] = useState<{ id: string; label: string } | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  type SubscriptionUpdate = Omit<Parameters<typeof updateSubscriptionAsync>[0], 'propertyId'>
  const runSubscription = async (propertyId: string, label: string, updates: SubscriptionUpdate) => {
    setRowError(null)
    setActing({ id: propertyId, label })
    try {
      await updateSubscriptionAsync({ propertyId, ...updates })
    } catch (e) {
      setRowError({ id: propertyId, message: saveFailMessage(e, `Couldn't ${label}.`) })
    } finally {
      setActing(null)
    }
  }
  const working = (id: string, label: string, idle: string, busy: string) => (acting?.id === id && acting.label === label ? busy : idle)
  const [filter, setFilter] = useState<PropertyFilter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const now = new Date()
  const actOf = (id: string): PropertyActivity => activity?.[id] ?? EMPTY_ACTIVITY

  const activeProps = properties.filter((p) => p.subscription_status === 'active')
  const overdueProps = activeProps.filter((p) => renewalState(p.subscription_status, p.subscription_end_date, now).kind === 'overdue')
  const stats = {
    total: properties.length,
    active: activeProps.length,
    trial: properties.filter((p) => p.subscription_status === 'trial' || p.subscription_status === 'pending_setup').length,
    mrr: activeProps.reduce((sum, p) => sum + (p.monthly_fee || 0), 0),
    overdueAmount: overdueProps.reduce((sum, p) => sum + (p.monthly_fee || 0), 0),
    attention: properties.filter((p) => attentionReasons(p, actOf(p.id), now).length > 0).length,
  }

  const counts: Record<PropertyFilter, number> = {
    all: 0, attention: 0, trial: 0, active: 0, overdue: 0, suspended: 0,
  }
  for (const f of FILTERS) counts[f.key] = properties.filter((p) => matchesFilter(f.key, p, actOf(p.id), now)).length

  const visible = properties.filter((p) => matchesFilter(filter, p, actOf(p.id), now) && matchesQuery(query, p))

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total.toString(), note: '' },
          { label: 'Active', value: stats.active.toString(), note: '' },
          { label: 'On trial', value: stats.trial.toString(), note: '' },
          { label: 'MRR', value: `₹${stats.mrr.toLocaleString('en-IN')}`, note: stats.overdueAmount > 0 ? `₹${stats.overdueAmount.toLocaleString('en-IN')} overdue` : '' },
          { label: 'Needs action', value: stats.attention.toString(), note: '' },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{s.value}</div>
            {s.note && <div className="text-[11px] text-destructive font-medium mt-0.5">{s.note}</div>}
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputCls} pl-9`} placeholder="Search by property, subdomain, area, owner or phone" />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
              {f.label} <span className={filter === f.key ? 'opacity-80' : 'text-muted-foreground'}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Property</th>
                <th className="px-4 py-2.5 font-medium">Subdomain</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Tier</th>
                <th className="px-4 py-2.5 font-medium">Setup Fee</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Renewal</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const act = actOf(p.id)
                const prog = setupProgress(setupChecklist(p, act))
                const reasons = attentionReasons(p, act, now)
                const renewal = renewalState(p.subscription_status, p.subscription_end_date, now)
                const isOpen = expanded === p.id
                const waPhone = p.owner_whatsapp || p.owner_phone
                const waiting = p.subscription_status === 'trial' || p.subscription_status === 'pending_setup'

                const handleActivate = () => {
                  if (!window.confirm(`Activate ${p.name}? This marks the setup fee as paid and sets renewal to one month from now.`)) return
                  const end = nextRenewalDate(null, new Date())
                  void runSubscription(p.id, 'activate', { subscription_status: 'active', setup_fee_paid: true, subscription_end_date: end.toISOString() })
                }

                const handleRenew = () => {
                  const end = nextRenewalDate(p.subscription_end_date, new Date())
                  if (!window.confirm(`Renew ${p.name} until ${shortDate(end.toISOString())}?`)) return
                  void runSubscription(p.id, 'renew', { subscription_end_date: end.toISOString() })
                }

                return (
                  <Fragment key={p.id}>
                    <tr className="border-t border-border align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.name}</div>
                        {p.area && <div className="text-xs text-muted-foreground">{p.area}</div>}
                        <button onClick={() => setExpanded(isOpen ? null : p.id)} aria-expanded={isOpen} className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                          <span className="inline-block h-1.5 w-14 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${activity ? prog.pct : 0}%` }} /></span>
                          {activity ? `Setup ${prog.done}/${prog.total}` : 'Setup …'}
                          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {reasons.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {reasons.slice(0, 2).map((r) => (
                              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">{ATTENTION_LABEL[r]}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a href={`https://${p.subdomain}.stayidom.in`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                          {p.subdomain}.stayidom.in
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div>
                            <div>{p.owner_name ?? '—'}</div>
                            {p.owner_phone && (
                              <a href={`https://wa.me/${waNumber(p.owner_phone)}`} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary">
                                {p.owner_phone}
                              </a>
                            )}
                          </div>
                          {p.owner_id ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">linked</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">unlinked</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border font-semibold ${p.subscription_tier === 'large' ? 'border-amber-200/50 bg-amber-50 text-amber-700' : 'border-[#166534]/20 bg-[#dcfce7] text-[#166534]'}`}>
                          {p.subscription_tier ?? 'small'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.setup_fee_paid ? (
                          <span className="text-green-600 flex items-center gap-1 text-xs font-medium">Paid <Check className="h-3 w-3" /></span>
                        ) : (
                          <span className="text-amber-600 text-xs font-medium">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.subscription_status} /></td>
                      <td className="px-4 py-3 text-xs">
                        {renewal.kind === 'none' ? '—' : (
                          <div>
                            <div className={renewal.kind === 'overdue' ? 'text-destructive font-semibold' : renewal.kind === 'soon' ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                              {renewal.kind === 'overdue' ? `Overdue by ${renewal.days} day${renewal.days === 1 ? '' : 's'}` : `in ${renewal.days} day${renewal.days === 1 ? '' : 's'}`}
                            </div>
                            {p.subscription_end_date && <div className="text-[11px] text-muted-foreground">{shortDate(p.subscription_end_date)}</div>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <button onClick={() => { window.location.href = `/admin/dashboard?property=${p.subdomain}` }} className="text-xs px-2.5 py-1 rounded-full bg-muted border border-border hover:bg-accent font-medium">Manage</button>
                          <button onClick={() => onLinkOwner({ id: p.id, name: p.name, email: p.owner_email ?? '', alreadyLinked: !!p.owner_id })} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted font-medium">
                            <Link2 className="h-3 w-3" />
                            {p.owner_id ? 'Re-link' : 'Invite owner'}
                          </button>
                          {waPhone && (
                            <a href={`https://wa.me/${waNumber(waPhone)}`} target="_blank" rel="noreferrer" title="WhatsApp the owner" className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-border hover:bg-muted">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {waiting && (
                            <button onClick={handleActivate} disabled={!!acting} className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">{working(p.id, 'activate', 'Activate', 'Activating…')}</button>
                          )}
                          {p.subscription_status === 'active' && (
                            <>
                              <button onClick={handleRenew} disabled={!!acting} className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50">{working(p.id, 'renew', 'Mark Renewed', 'Renewing…')}</button>
                              <button onClick={() => { if (window.confirm(`Suspend ${p.name}? Guests will no longer be able to open its booking page.`)) void runSubscription(p.id, 'suspend', { subscription_status: 'suspended' }) }} disabled={!!acting} className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50">{working(p.id, 'suspend', 'Suspend', 'Suspending…')}</button>
                            </>
                          )}
                          {p.subscription_status === 'suspended' && (
                            <button onClick={() => { if (window.confirm(`Re-activate ${p.name}?`)) void runSubscription(p.id, 're-activate', { subscription_status: 'active' }) }} disabled={!!acting} className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">{working(p.id, 're-activate', 'Re-activate', 'Re-activating…')}</button>
                          )}
                        </div>
                        {rowError?.id === p.id && <p role="alert" className="mt-1 text-[11px] text-destructive text-right">{rowError.message}</p>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-border">
                        <td colSpan={8} className="p-0"><PropertyDetails p={p} activity={act} now={now} /></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {properties.length === 0 ? 'No properties yet. Add your first one.' : 'No properties match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Errors Tab ───────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs} h ago`
  return `${Math.round(hrs / 24)} d ago`
}

function ErrorsTab() {
  const [days, setDays] = useState(7)
  const [hideNetwork, setHideNetwork] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const { data: rows = [], isLoading, isError, refetch, isFetching } = useClientErrors(days)
  const clear = useClearClientErrors()

  const hiddenNetwork = rows.filter((r) => r.category === 'network').length
  const groups = useMemo(
    () => groupErrors(hideNetwork ? rows.filter((r) => r.category !== 'network') : rows),
    [rows, hideNetwork],
  )

  if (isLoading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
        Failed to load the error log. If you haven&apos;t run the error-log SQL migration yet, run it in Supabase first.{' '}
        <button onClick={() => refetch()} className="text-primary underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <label className="inline-flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" checked={hideNetwork} onChange={(e) => setHideNetwork(e.target.checked)} />
          Hide network errors{hiddenNetwork ? ` (${hiddenNetwork})` : ''}
        </label>
        <button onClick={() => refetch()} disabled={isFetching} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
        {rows.length > 0 && (
          <button
            onClick={() => { if (window.confirm('Delete ALL logged errors? This cannot be undone.')) clear.mutate() }}
            disabled={clear.isPending}
            className="ml-auto rounded-full border border-destructive/40 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10 disabled:opacity-50"
          >
            {clear.isPending ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border p-10 text-center text-muted-foreground">
          No errors in this period. 🎉
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => {
            const isOpen = open === g.key
            return (
              <li key={g.key} className="rounded-xl border border-border bg-card">
                <button onClick={() => setOpen(isOpen ? null : g.key)} className="w-full text-left p-4 flex items-start gap-3">
                  <span className="mt-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold px-2 py-0.5 shrink-0">×{g.count}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium break-words">{g.message}</span>
                    <span className="block text-xs text-muted-foreground mt-1">
                      {g.source}{g.category === 'network' ? ' · network' : ''} · last {timeAgo(g.lastSeen)}
                      {g.hosts.length ? ` · ${g.hosts.slice(0, 3).join(', ')}${g.hosts.length > 3 ? '…' : ''}` : ''}
                      {g.versions.length ? ` · v${g.versions.join(', v')}` : ''}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3 space-y-2 text-xs text-muted-foreground">
                    <p><span className="font-medium text-foreground">First seen:</span> {formatDate(g.firstSeen)} · <span className="font-medium text-foreground">Page:</span> {g.sample.url ?? '—'}</p>
                    {g.sample.context && <p className="break-all"><span className="font-medium text-foreground">Context:</span> {JSON.stringify(g.sample.context)}</p>}
                    {g.sample.user_agent && <p className="break-words"><span className="font-medium text-foreground">Device:</span> {g.sample.user_agent}</p>}
                    {g.sample.stack && <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-[11px] leading-relaxed max-h-64 overflow-auto">{g.sample.stack}</pre>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────────

function SuperAdminIndex() {
  const [tab, setTab] = useState<Tab>('properties')
  const [showAddModal, setShowAddModal] = useState(false)
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null)
  const queryClient = useQueryClient()
  const { data: leads = [] } = useLeads()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">
            {tab === 'properties' ? 'Properties' : tab === 'leads' ? 'Demo Requests' : 'Error Log'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'properties' ? 'All properties on the platform' : tab === 'leads' ? 'Leads from the marketing page' : 'Crashes and failures reported by guests and owners'}
          </p>
        </div>
        {tab === 'properties' && (
          <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
            <Plus className="h-4 w-4" /> Add property
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'properties', label: 'Properties' },
          { key: 'leads', label: `Demo Requests${leads.length ? ` (${leads.length})` : ''}` },
          { key: 'errors', label: 'Errors' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'properties' ? <PropertiesTab onLinkOwner={setLinkTarget} /> : tab === 'leads' ? <LeadsTab /> : <ErrorsTab />}

      {showAddModal && <AddPropertyModal onClose={() => setShowAddModal(false)} onInviteNow={(t) => setLinkTarget({ ...t, alreadyLinked: false })} />}
      {linkTarget && (
        <LinkOwnerModal
          target={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={() => queryClient.invalidateQueries({ queryKey: ['superadmin', 'properties'] })}
        />
      )}
    </div>
  )
}
