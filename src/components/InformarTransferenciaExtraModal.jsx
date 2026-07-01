import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// El propietario informa una transferencia de una expensa extraordinaria.
// Genera un aviso (tipo 'extraordinaria') que el admin ve en su módulo de
// Transferencias, donde registra el pago.
export default function InformarTransferenciaExtraModal({ depto, extra, onClose, onEnviado }) {
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setEnviando(true)
    const { error } = await supabase.from('transferencias').insert({
      depto_id: depto.id,
      extraordinaria_id: extra.id,
      tipo: 'extraordinaria',
      notas: notas.trim() || null,
      estado: 'pendiente',
    })
    setEnviando(false)
    if (error) {
      toast.error('No se pudo enviar el aviso')
      return
    }
    toast.success('Aviso enviado. El administrador registrará el pago.')
    onEnviado?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold text-slate-800 mb-1">Informar transferencia</h3>
        <p className="text-sm text-slate-500 mb-4">
          Expensa extraordinaria: <span className="font-medium text-slate-700">{extra.razon}</span>.
          El administrador recibirá el aviso y registrará el pago.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Nota adicional (opcional)
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Ej: Transferí el 30/06 a las 10hs"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg"
            >
              {enviando ? 'Enviando...' : 'Enviar aviso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
