import { createFileRoute } from '@tanstack/react-router'
import { getSubdomain } from '../lib/subdomain'
import LandingPage from '../components/LandingPage'

// TODO: replace this placeholder with your real guest booking
// component import once confirmed working:
// import GuestBookingPage from '../components/GuestBookingPage'

export const Route = createFileRoute('/')({
  component: RootIndex,
})

function RootIndex() {
  const sub = getSubdomain()

  // Root domain (stayidom.in, www, or local dev with no subdomain)
  // → show marketing landing page
  if (!sub || sub === 'stayidom' || sub === 'www') {
    return <LandingPage />
  }

  // Property subdomain (bleafmudhouse.stayidom.in etc.)
  // → show guest booking page
  // Replace the div below with <GuestBookingPage /> once confirmed
  return <div>Guest booking page — subdomain: {sub}</div>
}
