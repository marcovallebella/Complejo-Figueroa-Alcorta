import { useEffect, useState, useCallback } from 'react'
import { supabase, calcularEstado, mesActual } from '../lib/supabase'

// Cuadro de estado de pagos de todo el complejo. Una fila por depto con:
// estado del mes actual, morosidad (meses adeudados) y total de deuda.
// La fila se pinta de rojo si tiene deuda y de verde si está al día.
export default function TablaDeudaComplejo() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const { anio, mes } = mesActual()

    const [{ data: deptos }, { data: todosMeses }, { data: todosPagos }] = await Promise.all([
      supabase.from('departamentos').select('*').order('id'),
      supabase.from('meses').select('*').order('anio').order('mes'),
      supabase.from('pagos').select('*'),
    ])

    const mesActualRow = (todosMeses || []).find((m) => m.anio === anio && m.mes === mes)

    const resultado = (deptos || []).map((depto) => {
      let deuda = 0
      let mesesAdeudados = 0
      for (const m of todosMeses || []) {
        const esFuturo = m.anio > anio || (m.anio === anio && m.mes > mes)
        if (esFuturo) continue
        const pago = (todosPagos || []).find((p) => p.depto_id === depto.id && p.mes_id === m.id)
        const estado = calcularEstado({ tienePago: Boolean(pago), anio: m.anio, mes: m.mes })
        if (estado !== 'pagado') {
          mesesAdeudados += 1
          deuda += Number(m.monto_expensa || 0)
        }
      }
      const pagoActual = mesActualRow
        ? Boolean((todosPagos || []).find((p) => p.depto_id === depto.id && p.mes_id === mesActualRow.id))
        : false
      return { depto, alDia: pagoActual, mesesAdeudados, deuda }
    })

    setFilas(resultado)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('deuda-complejo-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => cargar())
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar])

  if (cargando) {
    return <div className="py-10 text-center text-slate-400 text-sm">Cargando estado del complejo...</div>
  }

  const totalComplejo = filas.reduce((a, f) => a + f.deuda, 0)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-left">
            <th className="px-4 py-3 font-medium">Depto</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Morosidad</th>
            <th className="px-4 py-3 font-medium text-right">Total deuda</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((f) => {
            const enDeuda = f.deuda > 0
            return (
              <tr key={f.depto.id} className={enDeuda ? 'bg-red-50' : 'bg-green-50'}>
                <td className="px-4 py-3 font-medium text-slate-700">{f.depto.nombre}</td>
                <td className="px-4 py-3">
                  {f.alDia ? (
                    <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                      Al día
                    </span>
                  ) : (
                    <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {f.mesesAdeudados > 0 ? (
                    <span className="text-red-600 font-medium">
                      {f.mesesAdeudados} {f.mesesAdeudados === 1 ? 'mes' : 'meses'}
                    </span>
                  ) : (
                    <span className="text-green-600">Sin deuda</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                  {enDeuda ? (
                    <span className="text-red-600">${f.deuda.toLocaleString('es-AR')}</span>
                  ) : (
                    <span className="text-green-600">$0</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold text-tinta border-t-2 border-slate-200">
            <td className="px-4 py-3" colSpan={3}>Total adeudado del complejo</td>
            <td className="px-4 py-3 text-right whitespace-nowrap text-red-600">
              ${totalComplejo.toLocaleString('es-AR')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
