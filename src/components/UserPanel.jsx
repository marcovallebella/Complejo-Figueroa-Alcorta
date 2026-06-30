import { useEffect, useState, useCallback } from 'react'
import { supabase, calcularEstado, mesActual, nombreMes } from '../lib/supabase'
import PaymentStatusCard from './PaymentStatusCard'
import PaymentTable from './PaymentTable'
import InformarTransferenciaModal from './InformarTransferenciaModal'
import EgresosPanel from './EgresosPanel'
import BalancePanel from './BalancePanel'
import ReclamosPanel from './ReclamosPanel'
import { generarRecibo } from '../lib/recibo'

export default function UserPanel({ departamento }) {
  const [mesInfo, setMesInfo] = useState(null)
  const [pagoActual, setPagoActual] = useState(null)
  const [historial, setHistorial] = useState([])
  const [deudaAcumulada, setDeudaAcumulada] = useState(0)
  const [mesesAdeudados, setMesesAdeudados] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [modalTransferenciaAbierto, setModalTransferenciaAbierto] = useState(false)

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

    // Deuda acumulada: suma de meses anteriores sin pago registrado
    const { data: todosMeses } = await supabase
      .from('meses')
      .select('*')
      .order('anio')
      .order('mes')

    let deuda = 0
    let pendientes = 0
    for (const m of todosMeses || []) {
      const esActual = m.anio === anio && m.mes === mes
      const pago = pagosDepto?.find((p) => p.mes_id === m.id)
      const estado = calcularEstado({ tienePago: Boolean(pago), anio: m.anio, mes: m.mes })
      if (!esActual && estado !== 'pagado' && (estado === 'vencido' || m.anio < anio || (m.anio === anio && m.mes < mes))) {
        deuda += Number(m.monto_expensa || 0)
        pendientes += 1
      }
    }
    setDeudaAcumulada(deuda)
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

  return (
    <div className="space-y-8">
      <PaymentStatusCard
        mesActualInfo={mesInfo}
        estadoActual={estadoActual}
        montoActual={mesInfo.monto_expensa}
        mesesAdeudados={mesesAdeudados}
        onInformarTransferencia={() => setModalTransferenciaAbierto(true)}
      />

      <section>
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Estado general del complejo</h3>
        <PaymentTable />
      </section>

      <EgresosPanel />

      <BalancePanel />

      <ReclamosPanel departamento={departamento} creadoPor="residente" />


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

      {modalTransferenciaAbierto && (
        <InformarTransferenciaModal
          depto={departamento}
          mesInfo={mesInfo}
          monto={mesInfo.monto_expensa}
          onClose={() => setModalTransferenciaAbierto(false)}
          onEnviado={cargarDatos}
        />
      )}
    </div>
  )
}
