import { useEffect, useState, useCallback } from 'react'
import { supabase, calcularEstado, nombreMes, mesActual, fechaCorta } from '../lib/supabase'
import EstadoBadge from './EstadoBadge'

// Tabla general: Depto 1..18 x últimos 3 meses + mes actual.
// Visible para todos los roles, solo lectura, actualización en vivo vía
// Supabase Realtime sobre la tabla `pagos`.
export default function PaymentTable({ mostrarMontos = false }) {
  const [departamentos, setDepartamentos] = useState([])
  const [meses, setMeses] = useState([])
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargarDatos = useCallback(async () => {
    const { anio, mes } = mesActual()

    // Generar los últimos 4 períodos (actual + 3 anteriores)
    const periodos = []
    let a = anio
    let m = mes
    for (let i = 0; i < 4; i++) {
      periodos.unshift({ anio: a, mes: m })
      m -= 1
      if (m === 0) {
        m = 12
        a -= 1
      }
    }

    const [{ data: deptos }, { data: mesesData }] = await Promise.all([
      supabase.from('departamentos').select('*').order('id'),
      supabase.from('meses').select('*'),
    ])

    const mesesFiltrados = periodos.map((p) => {
      const encontrado = mesesData?.find((mm) => mm.anio === p.anio && mm.mes === p.mes)
      return encontrado || { id: null, anio: p.anio, mes: p.mes, monto_expensa: null }
    })

    const idsValidos = mesesFiltrados.filter((m) => m.id).map((m) => m.id)
    let pagosData = []
    if (idsValidos.length) {
      const { data } = await supabase.from('pagos').select('*').in('mes_id', idsValidos)
      pagosData = data || []
    }

    setDepartamentos(deptos || [])
    setMeses(mesesFiltrados)
    setPagos(pagosData)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargarDatos()

    const canal = supabase
      .channel('pagos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => {
        cargarDatos()
      })
      .subscribe()

    return () => supabase.removeChannel(canal)
  }, [cargarDatos])

  if (cargando) {
    return <div className="py-10 text-center text-slate-400 text-sm">Cargando tabla general...</div>
  }

  function buscarPago(deptoId, mesId) {
    if (!mesId) return null
    return pagos.find((p) => p.depto_id === deptoId && p.mes_id === mesId) || null
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-left">
            <th className="px-4 py-3 font-medium sticky left-0 bg-slate-50">Depto</th>
            {meses.map((m) => (
              <th key={`${m.anio}-${m.mes}`} className="px-4 py-3 font-medium whitespace-nowrap">
                {nombreMes(m.mes, m.anio)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {departamentos.map((depto) => (
            <tr key={depto.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-medium text-slate-700 sticky left-0 bg-white">
                {depto.nombre}
              </td>
              {meses.map((m) => {
                const pago = buscarPago(depto.id, m.id)
                const estado = calcularEstado({
                  tienePago: Boolean(pago),
                  anio: m.anio,
                  mes: m.mes,
                })
                return (
                  <td key={`${depto.id}-${m.anio}-${m.mes}`} className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <EstadoBadge estado={estado} />
                      {mostrarMontos && pago && (
                        <span className="text-xs text-slate-400">
                          ${Number(pago.monto).toLocaleString('es-AR')} ·{' '}
                          {fechaCorta(pago.fecha_pago)}
                        </span>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
