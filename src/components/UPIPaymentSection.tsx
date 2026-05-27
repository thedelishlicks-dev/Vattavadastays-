import { useState, useEffect } from 'react'
import { Smartphone, Copy, Check, MessageCircle, IndianRupee } from 'lucide-react'
import { buildUPILink } from '@/utils/upi'

interface UPIPaymentSectionProps {
  upiId: string
  payeeName: string
  totalAmount: number
  advancePaid: number       // booking.advance_amount from DB
  bookingNote: string       // e.g. "Booking – Bleaf Mud House – 2025-06-10"
  ownerWhatsapp: string
  guestName: string
  propertyName: string
  checkIn: string
}

export function UPIPaymentSection({
  upiId,
  payeeName,
  totalAmount,
  advancePaid,
  bookingNote,
  ownerWhatsapp,
  guestName,
  propertyName,
  checkIn,
}: UPIPaymentSectionProps) {
  const isFirstPayment = advancePaid === 0
  const remaining = totalAmount - advancePaid
  const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad/i.test(navigator.userAgent)

  const [selectedAmount, setSelectedAmount] = useState(
    isFirstPayment ? Math.round(totalAmount * 0.25) : remaining
  )
  const [showWhatsAppPrompt, setShowWhatsAppPrompt] = useState(!isMobile)
  const [copied, setCopied] = useState(false)

  const upiLink = buildUPILink({
    upiId,
    payeeName,
    amount: selectedAmount,
    note: bookingNote,
  })

  const whatsappMessage = `Hi, I just paid ₹${selectedAmount} via UPI for my booking at ${propertyName} (Check-in: ${checkIn}). Please find my payment screenshot attached. - ${guestName}`
  const whatsappLink = `https://wa.me/${ownerWhatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`

  const handleCopyUPI = () => {
    navigator.clipboard.writeText(upiId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleUPIClick = () => {
    setShowWhatsAppPrompt(true)
    window.location.href = upiLink
  }

  const chips = [
    { label: '25%', amount: Math.round(totalAmount * 0.25) },
    { label: '50%', amount: Math.round(totalAmount * 0.5) },
    { label: 'Full', amount: totalAmount },
  ]

  if (remaining <= 0) return null

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
        <IndianRupee className="h-3.5 w-3.5" />
        UPI Payment
      </div>

      {isFirstPayment ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Select advance amount to pay via UPI:</p>
          <div className="flex gap-2">
            {chips.map((chip) => (
              <button
                key={chip.label}
                onClick={() => setSelectedAmount(chip.amount)}
                className={[
                  "flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors",
                  selectedAmount === chip.amount
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-accent",
                ].join(" ")}
              >
                <div className="text-[10px] uppercase opacity-70 leading-none mb-1">{chip.label}</div>
                <div>₹{chip.amount.toLocaleString('en-IN')}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Balance due</div>
          <div className="text-2xl font-semibold">₹{remaining.toLocaleString('en-IN')}</div>
        </div>
      )}

      {isMobile ? (
        <button
          onClick={handleUPIClick}
          className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-medium hover:opacity-90 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
        >
          <Smartphone className="h-4 w-4" />
          {isFirstPayment ? "Pay via GPay / Paytm / PhonePe" : `Pay ₹${remaining.toLocaleString('en-IN')} balance via UPI`}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-muted/50 rounded-xl border border-border flex items-center justify-between gap-3">
            <code className="text-sm font-mono text-primary font-medium">{upiId}</code>
            <button
              onClick={handleCopyUPI}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-accent transition-colors text-xs font-medium"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Scan with any UPI app to pay ₹{selectedAmount.toLocaleString('en-IN')}
          </p>
        </div>
      )}

      {showWhatsAppPrompt && (
        <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 p-4 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed text-center">
              "After paying, send your payment screenshot to the owner on WhatsApp so they can confirm your booking."
            </p>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-full bg-[#25D366] text-white py-2.5 text-sm font-medium hover:opacity-90 transition-opacity shadow-md shadow-[#25D366]/20"
            >
              <MessageCircle className="h-4 w-4" />
              Send Screenshot on WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
