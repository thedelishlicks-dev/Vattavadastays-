import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const search = useSearch({ from: '/login' })
  const [email, setEmail] = useState(search?.email || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Invalid credentials')
    } else {
      router.navigate({ to: '/admin' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <form onSubmit={handleLogin} className="bg-white p-6 rounded-xl shadow-md w-full max-w-md">
        <h1 className="text-xl font-bold mb-4">Owner Login</h1>
        {error && <p className="text-red-500 mb-3 text-sm">{error}</p>}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input input-bordered w-full mb-3" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input input-bordered w-full mb-4" required />
        <button type="submit" className="btn btn-primary w-full">Sign In</button>
      </form>
    </div>
  )
}
