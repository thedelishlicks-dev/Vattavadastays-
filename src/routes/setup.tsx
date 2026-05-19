import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/setup')({
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Call your Edge Function or direct Supabase Auth signup
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (authError) throw authError

      setSuccess(true)
      // Redirect to login after 2s with email pre-filled
      setTimeout(() => {
        router.navigate({ to: '/login', search: { email: encodeURIComponent(email) } })
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <div className="bg-white p-6 rounded-xl shadow-md w-full max-w-md text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-semibold mb-2">Account Created!</h2>
          <p className="text-gray-600 mb-4">Please log in with your new password.</p>
          <p className="text-sm text-gray-500">Redirecting to login...</p>
          <Link to="/login" search={{ email }} className="btn btn-primary mt-4 inline-block">
            Go to Login Now
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-md w-full max-w-md">
        <h1 className="text-xl font-bold mb-4">Set Up Your Property</h1>
        {error && <p className="text-red-500 mb-3 text-sm">{error}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Owner email"
          className="input input-bordered w-full mb-3"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Set password"
          className="input input-bordered w-full mb-4"
          required
        />
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Creating...' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
