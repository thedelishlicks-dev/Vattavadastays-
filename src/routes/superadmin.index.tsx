import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAllProperties, useCreateProperty, useUpdateSubscription } from '@/hooks/useSuperAdmin'
import { Loader2, Plus, X, ExternalLink, Copy, Check, MessageCircle, ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/superadmin/')({
  component: SuperAdminIndex,
})

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'

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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending_setup: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-600',
  }
  const labels: Record<string, string> = {
    pending_setup: 'pending',
  }
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

function AddPropertyModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<NewPropertyForm>(emptyForm())
  const [createdEmail, setCreatedEmail] = useState<string | null>(null)
  const [createdSubdomain, setCreatedSubdomain] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { mutateAsync: createProperty, isPending } = useCreateProperty()

  const set = (k: keyof NewPropertyForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubdomain = (val: string) =>
    set('subdomain', val.toLowerCase().replace(/[^a-z0-9]/g, ''))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Property name is required'); return }
    if (!form.subdomain.trim()) { setError('Subdomain is required'); return }
    if (!form.owner_email.trim()) { setError('Owner email is required'); return }
    setError('')
    try {
      await createProperty({
        name: form.name,
        subdomain: form.subdomain,
        owner_email: form.owner_email,
        owner_name: form.owner_name || undefined,
        owner_phone: form.owner_phone || undefined,
        area: form.area || undefined,
      })
      setCreatedEmail(form.owner_email)
      setCreatedSubdomain(form.subdomain)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create property')
    }
  }

  // Supabase dashboard deep link to the Authentication > Users page
  const supabaseUsersUrl = 'https://supabase.com/dashboard/project/vzzfqgqxnodlrvnaxpbw/auth/users'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!createdEmail ? onClose : undefined} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-xl flex flex-col max-h-[95vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">
            {createdEmail ? 'Property Created' : 'Add New Property'}
          </h2>
          {!createdEmail && (
            <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {createdEmail ? (
            /* ── SUCCESS — show next steps instead of invite link ── */
            <div className="space-y-4">
              {/* Property live */}
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-800">
                <div className="font-semibold mb-1">✅ Property created</div>
                <a
                  href={`https://${createdSubdomain}.stayidom.in`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline text-green-700"
                >
                  {createdSubdomain}.stayidom.in
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Next steps */}
              <div className="rounded-xl border border-border p-4 space-y-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Next steps to activate the owner
                </div>

                {/* Step 1 */}
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">1</div>
                  <div className="space-y-2 flex-1">
                    <p className="text-sm font-medium">Send the owner a Supabase invite</p>
                    <p className="text-xs text-muted-foreground">
                      Go to Supabase → Authentication → Users, click <strong>Invite user</strong> and enter:
                    </p>
                    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                      <code className="text-sm font-mono text-primary flex-1">{createdEmail}</code>
                      <CopyButton text={createdEmail} />
                    </div>
                    <a
                      href={supabaseUsersUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                    >
                      Open Supabase Auth dashboard
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">2</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Set up the property</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add rooms, availability, pricing, UPI ID, and policies in the admin dashboard while the owner sets their password.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">3</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Activate once setup fee is paid</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Come back to this dashboard and click <strong>Activate</strong> on the property row.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── FORM ── */
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Property name *</label>
                <input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Green Valley Homestay"
                />
              </div>

              <div>
                <label className={labelCls}>Subdomain *</label>
                <div className="flex items-center gap-0">
                  <input
                    value={form.subdomain}
                    onChange={(e) => handleSubdomain(e.target.value)}
                    className="flex-1 rounded-l-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder="greenvalley"
                  />
                  <span className="rounded-r-lg border border-l-0 border-border bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    .stayidom.in
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Lowercase letters and numbers only</p>
              </div>

              <div>
                <label className={labelCls}>Owner email *</label>
                <input
                  type="email"
                  value={form.owner_email}
                  onChange={(e) => set('owner_email', e.target.value)}
                  className={inputCls}
                  placeholder="owner@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Owner name</label>
                  <input
                    value={form.owner_name}
                    onChange={(e) => set('owner_name', e.target.value)}
                    className={inputCls}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className={labelCls}>Owner phone</label>
                  <input
                    type="tel"
                    value={form.owner_phone}
                    onChange={(e) => set('owner_phone', e.target.value)}
                    className={inputCls}
                    placeholder="98765 43210"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Area / Location</label>
                <input
                  value={form.area}
                  onChange={(e) => set('area', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Upper Vattavada"
                />
              </div>
            </div>
          )}
        </div>

        {!createdEmail && (
          <div className="px-5 py-4 border-t border-border space-y-2">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
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

function SuperAdminIndex() {
  const { data: properties = [], isLoading } = useAllProperties()
  const { mutate: updateSubscription } = useUpdateSubscription()
  const [showAddModal, setShowAddModal] = useState(false)

  const stats = {
    total: properties.length,
    active: properties.filter((p) => p.subscription_status === 'active').length,
    pending: properties.filter((p) => p.subscription_status === 'pending_setup').length,
    mrr: properties
      .filter((p) => p.subscription_status === 'active')
      .reduce((sum, p) => sum + (p.monthly_fee || 0), 0),
  }

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Properties</h1>
          <p className="text-sm text-muted-foreground">All properties on the platform</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add property
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total.toString() },
          { label: 'Active', value: stats.active.toString() },
          { label: 'Pending Setup', value: stats.pending.toString() },
          { label: 'MRR', value: `₹${stats.mrr.toLocaleString('en-IN')}` },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Properties table */}
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
              {properties.map((p) => {
                const daysRemaining = p.subscription_end_date
                  ? Math.ceil((new Date(p.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  : null

                const handleActivate = () => {
                  if (!window.confirm(`Activate ${p.name}? This will mark setup fee as paid and set renewal to 30 days from now.`)) return
                  const thirtyDaysLater = new Date()
                  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)
                  updateSubscription({
                    propertyId: p.id,
                    subscription_status: 'active',
                    setup_fee_paid: true,
                    subscription_end_date: thirtyDaysLater.toISOString(),
                  })
                }

                const handleRenew = () => {
                  const thirtyDaysLater = new Date()
                  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)
                  updateSubscription({
                    propertyId: p.id,
                    subscription_end_date: thirtyDaysLater.toISOString(),
                  })
                }

                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      {p.area && <div className="text-xs text-muted-foreground">{p.area}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://${p.subdomain}.stayidom.in`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      >
                        {p.subdomain}.stayidom.in
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <div>{p.owner_name ?? '—'}</div>
                      {p.owner_phone && (
                        <a
                          href={`https://wa.me/91${p.owner_phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary"
                        >
                          {p.owner_phone}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border font-semibold ${
                        p.subscription_tier === 'large'
                          ? 'border-amber-200/50 bg-amber-50 text-amber-700'
                          : 'border-[#166534]/20 bg-[#dcfce7] text-[#166534]'
                      }`}>
                        {p.subscription_tier ?? 'small'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.setup_fee_paid ? (
                        <span className="text-green-600 flex items-center gap-1 text-xs font-medium">
                          Paid <Check className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className="text-amber-600 text-xs font-medium">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.subscription_status} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.subscription_status === 'active' && daysRemaining !== null ? (
                        <span className={daysRemaining < 7 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                          in {daysRemaining} days
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link to="/admin" search={{ property: p.subdomain }} className="text-xs px-2.5 py-1 rounded-full bg-muted border border-border hover:bg-accent font-medium">Manage</Link>
                        {p.owner_whatsapp && (
                          <a
                            href={`https://wa.me/91${p.owner_whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-border hover:bg-muted text-[#25D366]"
                            title="WhatsApp Owner"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {p.subscription_status === 'pending_setup' && (
                          <button
                            onClick={handleActivate}
                            className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200"
                          >
                            Activate
                          </button>
                        )}
                        {p.subscription_status === 'active' && (
                          <>
                            <button
                              onClick={handleRenew}
                              className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                              Mark Renewed
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Suspend ${p.name}?`)) {
                                  updateSubscription({ propertyId: p.id, subscription_status: 'suspended' })
                                }
                              }}
                              className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200"
                            >
                              Suspend
                            </button>
                          </>
                        )}
                        {p.subscription_status === 'suspended' && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Re-activate ${p.name}?`)) {
                                updateSubscription({ propertyId: p.id, subscription_status: 'active' })
                              }
                            }}
                            className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200"
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {properties.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No properties yet. Add your first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddPropertyModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  )
}
