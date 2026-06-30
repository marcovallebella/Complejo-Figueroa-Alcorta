import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase, nombreMes } from '../lib/supabase'
import RegisterPaymentModal from './RegisterPaymentModal'

export default function TransferenciasPanel({ departamentos }) {
  const [transferencias, setTransferencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [verProcesadas, setVerProcesadas] = useState(false)
  const [procesando, setProcesando] = useState(null)

  const cargar = useCallback(async () => {
    let query = supabase
      .from('transferencias')
      .select('*, departamentos(*), meses(*)')
      .order('created_at', { ascending: false })
    if (!verProcesadas) query = query.eq('estado', 'pendiente')
    const { data } = await query
    setTransferencias(data || [])
    setCargando(false)
  }, [verProcesadas])

  useEffect(() => {
    setCargando(true)
    cargar()
    const canal = supabase
      .channel('transferencias-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias' }, () => cargar())
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar])

  async function marcarProcesada(id) {
    const { error } = await supabase.from('transferencias').update({ estado: 'procesada' }).eq('id', id)
    if (error) toast.error('No se pudo archivar el aviso')
    else cargar()
  }

  const pendientes = transferencias.filter((t) => t.estado === 'pendiente').length

  return (
    <section>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="font-serif text-2xl text-tinta">Transferencias informadas</h2>
        {pendientes > 0 && (
          <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Avisos enviados por residentes. Registrá el pago para confirmar cada transferencia.
      </p>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setVerProcesadas(!verProcesadas)}
          className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 transition"
        >
          {verProcesadas ? 'Ver solo pendientes' : 'Ver procesadas también'}
        </button>
      </div>

      {cargando ? (
        <div className="py-10 text-center text-slate-400 text-sm">Cargando...</div>
      ) : transferencias.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm bg-white border border-tinta/10 rounded-2xl">
          {verProcesadas ? 'No hay transferencias registradas.' : 'No hay avisos de transferencia pendientes.'}
        </div>
      ) : (
        <div className="space-y-3">
          {transferencias.map((t) => (
            <div
              key={t.id}
              className={`bg-white border rounded-2xl p-4 sm:p-5 transition ${
                t.estado === 'procesada' ? 'border-slate-100 opacity-60' : 'border-tinta/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-slate-700">
                    {t.departamentos?.nombre || '—'}
                    <span className="text-slate-400 font-normal"> · </span>
                    <span className="text-slate-500 font-normal text-sm">
                      {t.meses ? nombreMes(t.meses.mes, t.meses.anio) : '—'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(t.created_at).toLocaleDateString('es-AR')}{' '}
                    {new Date(t.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {t.notas && (
                    <p className="text-sm text-slate-600 mt-2 italic">"{t.notas}"</p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${
                  t.estado === 'pendiente'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {t.estado === 'pendiente' ? 'Pendiente' : 'Procesada'}
                </span>
              </div>

              {t.estado === 'pendiente' && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  <button
                    onClick={() => setProcesando(t)}
                    className="bg-tinta hover:opacity-90 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
                  >
                    Registrar pago
                  </button>
                  <button
                    onClick={() => marcarProcesada(t.id)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium px-4 py-2 rounded-lg transition"
                  >
                    Archivar sin registrar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {procesando && (
        <RegisterPaymentModal
          departamentos={departamentos}
          deptoIdInicial={procesando.departamentos?.id}
          onClose={() => setProcesando(null)}
          onRegistrado={() => {
            marcarProcesada(procesando.id)
            setProcesando(null)
          }}
        />
      )}
    </section>
  )
}
