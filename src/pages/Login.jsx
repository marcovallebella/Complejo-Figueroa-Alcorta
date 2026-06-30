import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase, DEMO_MODE, demoLogin } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const { session, cargando } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (!cargando && session) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setEnviando(false)
    if (error) {
      toast.error('Email o contraseña incorrectos')
      return
    }
    toast.success('¡Bienvenido!')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-crema px-4">
      <div className="w-full max-w-sm bg-white shadow-sm rounded-2xl p-8 border border-tinta/10">
        <Logo variant="full" className="mb-8" />

        {DEMO_MODE && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-700 font-medium text-center mb-3">
              🔍 Modo demo — datos de ejemplo, sin conexión real
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => demoLogin('admin')}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg transition"
              >
                Entrar como Administrador
              </button>
              <button
                type="button"
                onClick={() => demoLogin('tenant')}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-lg transition"
              >
                Entrar como Residente (Depto 12)
              </button>
              <button
                type="button"
                onClick={() => demoLogin('propietario')}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-lg transition"
              >
                Entrar como Propietario (Depto 12)
              </button>
            </div>
            <p className="text-[11px] text-amber-600/80 text-center mt-3">
              Completá el archivo .env con tus credenciales de Supabase para usar la app real.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="depto1@complejofigueroa.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition"
          >
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
