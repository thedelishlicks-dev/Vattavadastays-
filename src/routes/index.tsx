import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSubdomain } from '../lib/property'

export const Route = createFileRoute('/')({
  component: GuestPage,
})

function GuestPage() {
  const slug = getSubdomain()
  const [property, setProperty] = useState<any>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({ room: '', checkin: '', checkout: '', guests: 1, name: '', phone: '' })

  useEffect(() => {
    async function fetchProperty() {
      const { data: prop } = await supabase.from('properties').select('*').eq('slug', slug).single()
      const { data: roomData } = await supabase.from('rooms').select('*').eq('property_id', prop?.id).eq('is_active', true)
      setProperty(prop)
      setRooms(roomData || [])
      setLoading(false)
    }
    fetchProperty()
  }, [slug])

  const handleWhatsAppBooking = () => {
    if (!formData.room || !formData.checkin || !formData.checkout) return alert('Please select room & dates')
    const text = `Hi, I'd like to book ${formData.room} at ${property.name}
Check-in: ${formData.checkin}  Check-out: ${formData.checkout}  Guests: ${formData.guests}
My name: ${formData.name}  Phone: ${formData.phone}`
    const encoded = encodeURIComponent(text)
    window.open(`https://wa.me/${property.owner_whatsapp}?text=${encoded}`, '_blank')
  }

  if (loading) return <div className="p-8 text-center font-sans">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <header className="max-w-2xl mx-auto mb-6">
        <h1 className="text-2xl font-bold">{property?.name}</h1>
        <p className="text-gray-600">{property?.description}</p>
      </header>

      <main className="max-w-2xl mx-auto bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Available Rooms</h2>
        <div className="grid gap-3">
          {rooms.map(r => (
            <label key={r.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input type="radio" name="room" value={r.name} onChange={e => setFormData({...formData, room: e.target.value})} className="radio" />
              <div><p className="font-medium">{r.name}</p><p className="text-sm text-gray-500">₹{r.price}/night</p></div>
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          <input type="date" value={formData.checkin} onChange={e => setFormData({...formData, checkin: e.target.value})} className="input input-bordered" placeholder="Check-in" required />
          <input type="date" value={formData.checkout} onChange={e => setFormData({...formData, checkout: e.target.value})} className="input input-bordered" placeholder="Check-out" required />
          <input type="number" min="1" value={formData.guests} onChange={e => setFormData({...formData, guests: Number(e.target.value)})} className="input input-bordered" placeholder="Guests" />
          <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input input-bordered" placeholder="Your Name" required />
          <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="input input-bordered" placeholder="Phone" required />
        </div>

        {/* Static Map & Directions */}
        {property?.static_map_image_url && (
          <div className="mt-4">
            <img src={property.static_map_image_url} alt="Property Location" className="w-full h-48 object-cover rounded-lg" loading="lazy" />
            <div className="flex gap-2 mt-2">
              <a href={`https://maps.google.com/?q=${property.location_lat},${property.location_lng}`} target="_blank" rel="noopener" className="btn btn-sm btn-outline">🗺️ Google Maps</a>
              <a href={`https://maps.apple.com/?ll=${property.location_lat},${property.location_lng}`} target="_blank" rel="noopener" className="btn btn-sm btn-outline">🍎 Apple Maps</a>
            </div>
          </div>
        )}

        <button onClick={handleWhatsAppBooking} className="btn btn-primary w-full mt-4">📱 Book via WhatsApp</button>
      </main>

      {/* SEO Meta (Client-side fallback, prerender handles server) */}
      <meta name="description" content={property?.description} />
      <meta property="og:title" content={property?.name} />
      <meta property="og:image" content={property?.hero_image} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "LodgingBusiness", "name": property?.name, "address": { "@type": "PostalAddress", "addressLocality": "Vattavada", "addressRegion": "Kerala" }, "geo": { "@type": "GeoCoordinates", "latitude": property?.location_lat, "longitude": property?.location_lng } }) }} />
    </div>
  )
}
