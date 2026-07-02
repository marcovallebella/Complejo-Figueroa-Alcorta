import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase, nombreMes, mesActual } from '../lib/supabase'

export default function InformarTransferenciaModal({ depto, onClose, onEnviado }) {
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [meses, setMeses] = useState([]) // solo los que adeuda / tiene pendientes
  const [seleccionados, setSeleccionados] = useState([])
  const [otro, setOtro] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { anio, mes } = mesActual()
      const [{ data: todosMeses }, { data: pagos }] = await Promise.all([
        supabase.from('meses').select('*').order('anio', { ascending: false }).order('mes', { ascending: false }),
        supabase.from('pagos').select('mes_id').eq('depto_id', depto.id),
      ])
      const pagados = new Set((pagos || []).map((p) => p.mes_id))
      // Solo meses hasta el actual, que NO estén pagados (adeudados o pendientes)
      const impagos = (todosMeses || []).filter(
        (m) =>
          (m.anio < anio || (m.anio === anio && m.mes <= mes)) && !pagados.has(m.id),
      )
      setMeses(impagos)
      setCargando(false)
    }
    cargar()
  }, [depto.id])

  function toggleMes(id) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (seleccionados.length === 0 && !otro) {
      toast.error('Elegí al menos un mes u "Otro"')
      return
    }
    setEnviando(true)
    const filas = seleccionados.map((mes_id) => ({
      depto_id: depto.id,
      mes_id,
      notas: notas.trim() || null,
      estado: 'pendiente',
    }))
    // "Otro": aviso sin mes específico (el admin lo resuelve con la nota)
    if (otro) {
      filas.push({
        depto_id: depto.id,
        mes_id: null,
        notas: notas.trim() || null,
        estado: 'pendiente',
      })
    }
    const { error } = await supabase.from('transferencias').insert(filas)
    setEnviando(false)
    if (error) {
      toast.error('No se pudo enviar el aviso')
      return
    }
    toast.success(
      filas.length === 1
        ? 'Aviso enviado. El administrador registrará el pago.'
        : `Aviso enviado por ${filas.length} conceptos. El administrador los registrará.`,
    )
    onEnviado?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold text-slate-800 mb-1">Informar transferencia</h3>
        <p className="text-sm text-slate-500 mb-4">
          Elegí qué estás pagando. El administrador recibirá el aviso y registrará el pago.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              Meses que adeudás o tenés pendientes
            </label>
            {cargando ? (
              <p className="text-sm text-slate-400">Cargando...</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {meses.length === 0 && (
                  <p className="text-sm text-green-600 w-full">
                    ¡Estás al día! No tenés meses pendientes. Podés usar "Otro" si querés avisar de otro pago.
                  </p>
                )}
                {meses.map((m) => {
                  const activo = seleccionados.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMes(m.id)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                        activo
                          ? 'bg-tinta text-white border-tinta'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-tinta/40'
                      }`}
                    >
                      {nombreMes(m.mes, m.anio)}
                    </button>
                  )
                })}
                {/* Opción "Otro" */}
                <button
                  type="button"
                  onClick={() => setOtro((v) => !v)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                    otro
                      ? 'bg-tinta text-white border-tinta'
                      : 'bg-white text-slate-600 border-dashed border-slate-300 hover:border-tinta/40'
                  }`}
                >
                  Otro
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Nota adicional {otro ? '(detallá el pago)' : '(opcional)'}
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder={otro ? 'Ej: Pago parcial / seña / otro concepto' : 'Ej: Transferí el 30/06 a las 10hs'}
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
