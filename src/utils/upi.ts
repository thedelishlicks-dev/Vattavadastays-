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
