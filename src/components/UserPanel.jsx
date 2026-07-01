import { useEffect, useState, useCallback } from 'react'
import { supabase, calcularEstado, mesActual, nombreMes } from '../lib/supabase'
import PaymentStatusCard from './PaymentStatusCard'
import TablaDeudaComplejo from './TablaDeudaComplejo'
import InformarTransferenciaModal from './InformarTransferenciaModal'
import EgresosPanel from './EgresosPanel'
import BalancePanel from './BalancePanel'
import ReclamosPanel from './ReclamosPanel'
import { generarRecibo } from '../lib/recibo'

export default function UserPanel({ departamento }) {
  const [mesInfo, setMesInfo] = useState(null)
  const [pagoActual, setPagoActual] = useState(null)
  const [historial, setHistorial] = useState([])
  const [mesesAdeudados, setMesesAdeudados] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [modalTransferenciaAbierto, setModalTransferenciaAbierto] = useState(false)
  const [modulo, setModulo] = useState('expensas') // 'expensas' | 'gastos' | 'balance' | 'reclamos'

  const cargarDatos = useCallback(async () => {
    const { anio, mes } = mesActual()

    const { data: mesData } = await supabase
      .from('meses')
      .select('*')
      .eq('anio', anio)
      .eq('mes', mes)
      .maybeSingle()

    setMesInfo({ ...(mesData || { anio, mes, id: null, monto_expensa: null }), depto_id: departamento.id })

    const { data: pagosDepto } = await supabase
      .from('pagos')
      .select('*, meses(*)')
      .eq('depto_id', departamento.id)
      .order('fecha_pago', { ascending: false })

    setHistorial(pagosDepto || [])

    const pagoMesActual = mesData
      ? pagosDepto?.find((p) => p.mes_id === mesData.id) || null
      : null
    setPagoActual(pagoMesActual)

    // Deuda acumulada del propio depto (meses anteriores sin pago)
    const { data: todosMeses } = await supabase
      .from('meses')
      .select('*')
      .order('anio')
      .order('mes')

    let pendientes = 0
    for (const m of todosMeses || []) {
      const esActual = m.anio === anio && m.mes === mes
      const pago = pagosDepto?.find((p) => p.mes_id === m.id)
      const estado = calcularEstado({ tienePago: Boolean(pago), anio: m.anio, mes: m.mes })
      if (!esActual && estado !== 'pagado' && (estado === 'vencido' || m.anio < anio || (m.anio === anio && m.mes < mes))) {
        pendientes += 1
      }
    }
    setMesesAdeudados(pendientes)

    setCargando(false)
  }, [departamento.id])

  useEffect(() => {
    cargarDatos()
    const canal = supabase
      .channel(`pagos-depto-${departamento.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos', filter: `depto_id=eq.${departamento.id}` }, () => {
        cargarDatos()
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargarDatos, departamento.id])

  if (cargando) {
    return <div className="py-20 text-center text-slate-400 text-sm">Cargando tu estado de pago...</div>
  }

  const estadoActual = calcularEstado({
    tienePago: Boolean(pagoActual),
    anio: mesInfo.anio,
    mes: mesInfo.mes,
  })

  const botones = [
    {
      id: 'expensas',
      label: 'Expensas',
      icono: (
        <>
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="9" y1="16" x2="13" y2="16" />
        </>
      ),
    },
    {
      id: 'gastos',
      label: 'Gastos del complejo',
      icono: (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
          <circle cx="16.5" cy="14.5" r="1.3" />
        </>
      ),
    },
    {
      id: 'balance',
      label: 'Balance',
      icono: (
        <>
          <line x1="6" y1="20" x2="6" y2="13" />
          <line x1="12" y1="20" x2="12" y2="8" />
          <line x1="18" y1="20" x2="18" y2="11" />
        </>
      ),
    },
    {
      id: 'reclamos',
      label: 'Reclamos y proyectos',
      icono: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    },
  ]

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-56 shrink-0">
        <nav className="bg-white border border-tinta/10 rounded-2xl p-2 flex lg:flex-col gap-1">
          {botones.map((b) => (
            <button
              key={b.id}
              onClick={() => setModulo(b.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition ${
                modulo === b.id ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {b.icono}
              </svg>
              {b.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {modulo === 'expensas' && (
          <div className="space-y-8">
            <PaymentStatusCard
              mesActualInfo={mesInfo}
              estadoActual={estadoActual}
              mesesAdeudados={mesesAdeudados}
              onInformarTransferencia={() => setModalTransferenciaAbierto(true)}
            />

            <section>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Estado general del complejo</h3>
              <TablaDeudaComplejo />
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Mi historial de pagos</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-left">
                      <th className="px-4 py-3 font-medium">Mes</th>
                      <th className="px-4 py-3 font-medium">Fecha de pago</th>
                      <th className="px-4 py-3 font-medium">Método</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Recibo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historial.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                          Todavía no registraste pagos
                        </td>
                      </tr>
                    )}
                    {historial.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3">{p.meses ? nombreMes(p.meses.mes, p.meses.anio) : '-'}</td>
                        <td className="px-4 py-3">{new Date(p.fecha_pago).toLocaleDateString('es-AR')}</td>
                        <td className="px-4 py-3 capitalize">{p.metodo_pago}</td>
                        <td className="px-4 py-3 capitalize">{p.estado}</td>
                        <td className="px-4 py-3">
                          {p.estado === 'pagado' ? (
                            <button
                              onClick={() => generarRecibo({ pago: p, depto: departamento, mes: p.meses })}
                              className="text-tinta underline underline-offset-2 hover:opacity-70 text-xs font-medium"
                            >
                              Ver recibo
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {modulo === 'gastos' && <EgresosPanel />}

        {modulo === 'balance' && <BalancePanel />}

        {modulo === 'reclamos' && <ReclamosPanel departamento={departamento} creadoPor="residente" />}
      </div>

      {modalTransferenciaAbierto && (
        <InformarTransferenciaModal
          depto={departamento}
          mesInfo={mesInfo}
          onClose={() => setModalTransferenciaAbierto(false)}
          onEnviado={cargarDatos}
        />
      )}
    </div>
  )
}
