export function buildUPILink({
  upiId,
  payeeName,
  amount,
  note,
}: {
  upiId: string
  payeeName: string
  amount?: number
  note: string
}): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    tn: note,
    cu: 'INR',
  })
  if (amount && amount > 0) params.set('am', amount.toFixed(2))
  return `upi://pay?${params.toString()}`
}

export function extractUPIId(sharedAmenities: string[] | null): string | null {
  if (!sharedAmenities) return null
  const entry = sharedAmenities.find(a => a.startsWith('__upi:'))
  if (!entry) return null
  return decodeURIComponent(entry.replace('__upi:', ''))
}

export function buildWhatsAppPaymentMessage({
  guestName,
  propertyName,
  amount,
  upiId,
  ownerPhone,
  checkIn,
}: {
  guestName: string
  propertyName: string
  amount: number
  upiId: string
  ownerPhone: string
  checkIn: string
}): string {
  return (
    `Hi ${guestName}, this is a reminder for your booking at ${propertyName} (Check-in: ${checkIn}).\n\n` +
    `Please pay ₹${amount.toLocaleString('en-IN')} to confirm your booking.\n\n` +
    `UPI ID: ${upiId}\n` +
    `Amount: ₹${amount.toLocaleString('en-IN')}\n\n` +
    `Open GPay / PhonePe / Paytm → Send money → paste the UPI ID above.\n\n` +
    `Call us if you need help: ${ownerPhone}`
  )
}
