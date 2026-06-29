import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase, calcularEstado, mesActual, nombreMes } from '../lib/supabase'
import EstadoBadge from './EstadoBadge'
import RegisterPaymentModal from './RegisterPaymentModal'
import PersonasPanel from './PersonasPanel'
import EgresosPanel from './EgresosPanel'
import BalancePanel from './BalancePanel'
import ExtraordinariasPanel from './ExtraordinariasPanel'
import { generarRecibo } from '../lib/recibo'
import { descargarCSV } from '../lib/csv'

export default function AdminPanel() {
  const [departamentos, setDepartamentos] = useState([])
  const [mesInfo, setMesInfo] = useState(null)
  const [pagosMes, setPagosMes] = useState([])
  const [montoMes, setMontoMes] = useState('')
  const [guardandoMonto, setGuardandoMonto] = useState(false)
  const [morosos, setMorosos] = useState([])
  const [historial, setHistorial] = useState([])
  const [filtroDepto, setFiltroDepto] = useState('')
  const [filtroAnio, setFiltroAnio] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [modulo, setModulo] = useState('pagos') // 'pagos' | 'residentes'
  const [deudaPorDepto, setDeudaPorDepto] = useState({})

  const { anio, mes } = mesActual()

  const cargarResumen = useCallback(async () => {
    const { data: deptos } = await supabase.from('departamentos').select('*').order('id')
    setDepartamentos(deptos || [])

    const { data: mesData } = await supabase
      .from('meses')
      .select('*')
      .eq('anio', anio)
      .eq('mes', mes)
      .maybeSingle()
    setMesInfo(mesData)
    setMontoMes(mesData?.monto_expensa || '')

    let pagos = []
    if (mesData) {
      const { data } = await supabase.from('pagos').select('*').eq('mes_id', mesData.id)
      pagos = data || []
    }
    setPagosMes(pagos)

    // Morosidad: deptos con 2+ meses impagos en total
    const { data: todosMeses } = await supabase.from('meses').select('*').order('anio').order('mes')
    const { data: todosPagos } = await supabase.from('pagos').select('*')

    const conteo = {}
    const deuda = {}
    for (const d of deptos || []) {
      conteo[d.id] = 0
      deuda[d.id] = 0
    }
    for (const m of todosMeses || []) {
      const esFuturo = m.anio > anio || (m.anio === anio && m.mes > mes)
      if (esFuturo) continue
      for (const d of deptos || []) {
        const pago = todosPagos?.find((p) => p.depto_id === d.id && p.mes_id === m.id)
        const estado = calcularEstado({ tienePago: Boolean(pago), anio: m.anio, mes: m.mes })
        if (estado !== 'pagado') {
          conteo[d.id] = (conteo[d.id] || 0) + 1
          deuda[d.id] = (deuda[d.id] || 0) + Number(m.monto_expensa || 0)
        }
      }
    }
    setMorosos(Object.entries(conteo).filter(([, c]) => c >= 2).map(([id]) => Number(id)))
    setDeudaPorDepto(deuda)

    setCargando(false)
  }, [anio, mes])

  const cargarHistorial = useCallback(async () => {
    let query = supabase.from('pagos').select('*, departamentos(*), meses(*)').order('fecha_pago', { ascending: false })
    if (filtroDepto) query = query.eq('depto_id', filtroDepto)
    const { data } = await query
    let filtrado = data || []
    if (filtroAnio) filtrado = filtrado.filter((p) => p.meses?.anio === Number(filtroAnio))
    if (filtroMes) filtrado = filtrado.filter((p) => p.meses?.mes === Number(filtroMes))
    setHistorial(filtrado)
  }, [filtroDepto, filtroAnio, filtroMes])

  useEffect(() => {
    cargarResumen()
    const canal = supabase
      .channel('admin-pagos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => {
        cargarResumen()
        cargarHistorial()
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargarResumen, cargarHistorial])

  useEffect(() => {
    cargarHistorial()
  }, [cargarHistorial])

  async function eliminarPago(pago, deptoNombre) {
    const ok = window.confirm(
      `¿Eliminar el pago de ${deptoNombre}? Vuelve a quedar pendiente/vencido.`,
    )
    if (!ok) return

    const { error } = await supabase.from('pagos').delete().eq('id', pago.id)
    if (error) {
      toast.error('No se pudo eliminar el pago')
      return
    }
    toast.success(`Pago de ${deptoNombre} eliminado`)
    cargarResumen()
    cargarHistorial()
  }

  function exportarHistorialExcel() {
    if (historial.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }

    const encabezados = ['Depto', 'Mes', 'Fecha de pago', 'Método de pago', 'Monto', 'Estado', 'Registrado por']
    const filas = historial.map((p) => [
      p.departamentos?.nombre || '',
      p.meses ? nombreMes(p.meses.mes, p.meses.anio) : '',
      new Date(p.fecha_pago).toLocaleDateString('es-AR'),
      p.metodo_pago,
      Number(p.monto || 0).toFixed(2),
      p.estado,
      p.registrado_por,
    ])

    const hoy = new Date().toISOString().slice(0, 10)
    descargarCSV(`historial-pagos-${hoy}.csv`, encabezados, filas)
    toast.success('Excel descargado')
  }

  async function handleGuardarMonto(e) {
    e.preventDefault()
    setGuardandoMonto(true)

    if (mesInfo) {
      const { error } = await supabase
        .from('meses')
        .update({ monto_expensa: Number(montoMes) })
        .eq('id', mesInfo.id)
      if (error) toast.error('No se pudo actualizar el monto')
      else toast.success('Monto actualizado')
    } else {
      const { error } = await supabase
        .from('meses')
        .insert({ anio, mes, monto_expensa: Number(montoMes) })
      if (error) toast.error('No se pudo crear el período')
      else toast.success('Monto definido para este mes')
    }

    setGuardandoMonto(false)
    cargarResumen()
  }

  if (cargando) {
    return <div className="py-20 text-center text-slate-400 text-sm">Cargando panel de administración...</div>
  }

  const totalAdeudadoComplejo = Object.values(deudaPorDepto).reduce((a, b) => a + Number(b || 0), 0)

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-56 shrink-0">
        <nav className="bg-white border border-tinta/10 rounded-2xl p-2 flex lg:flex-col gap-1">
          <button
            onClick={() => setModulo('pagos')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition ${
              modulo === 'pagos' ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="3" width="14" height="18" rx="1.5" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="13" y2="16" />
            </svg>
            Registro de pagos
          </button>
          <button
            onClick={() => setModulo('residentes')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition ${
              modulo === 'residentes' ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
              <path d="M16 6.5a3 3 0 0 1 0 5.5" />
              <path d="M18 14.5a5.5 5.5 0 0 1 2.5 4.5" />
            </svg>
            Residentes
          </button>
          <button
            onClick={() => setModulo('propietarios')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition ${
              modulo === 'propietarios' ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l9-7 9 7" />
              <path d="M5 10v10h14V10" />
              <rect x="10" y="14" width="4" height="6" />
            </svg>
            Propietarios
          </button>
          <button
            onClick={() => setModulo('egresos')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition ${
              modulo === 'egresos' ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <path d="M3 10h18" />
              <circle cx="16.5" cy="14.5" r="1.3" />
            </svg>
            Egresos
          </button>
          <button
            onClick={() => setModulo('extraordinarias')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition ${
              modulo === 'extraordinarias' ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18" />
              <path d="M5 8l7-5 7 5" />
              <path d="M5 8v8l7 5 7-5V8" />
            </svg>
            Extraordinarias
          </button>
          <button
            onClick={() => setModulo('balance')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition ${
              modulo === 'balance' ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="20" x2="6" y2="13" />
              <line x1="12" y1="20" x2="12" y2="8" />
              <line x1="18" y1="20" x2="18" y2="11" />
            </svg>
            Balance
          </button>
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {modulo === 'pagos' && (
          <div className="space-y-10">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-700">
                  Resumen de {nombreMes(mes, anio)}
                </h2>
          <button
            onClick={() => setModalAbierto(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
          >
            + Registrar pago
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-4 py-3 font-medium">Depto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha de pago</th>
                <th className="px-4 py-3 font-medium">Morosidad</th>
                <th className="px-4 py-3 font-medium text-right">Total adeudado</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departamentos.map((d) => {
                const pago = pagosMes.find((p) => p.depto_id === d.id)
                const estado = calcularEstado({ tienePago: Boolean(pago), anio, mes })
                const esMoroso = morosos.includes(d.id)
                return (
                  <tr key={d.id} className={esMoroso ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 font-medium text-slate-700">{d.nombre}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={estado} /></td>
                    <td className="px-4 py-3">{pago ? new Date(pago.fecha_pago).toLocaleDateString('es-AR') : '-'}</td>
                    <td className="px-4 py-3">
                      {esMoroso && <span className="text-red-600 font-medium text-xs">⚠ 2+ meses</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                      {deudaPorDepto[d.id] > 0 ? (
                        <span className="text-red-600">
                          ${Number(deudaPorDepto[d.id]).toLocaleString('es-AR')}
                        </span>
                      ) : (
                        <span className="text-green-600">$0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pago && (
                        <button
                          onClick={() => eliminarPago(pago, d.nombre)}
                          aria-label="Eliminar pago"
                          title="Eliminar pago (vuelve a quedar pendiente)"
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center transition"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-tinta border-t-2 border-slate-200">
                <td className="px-4 py-3" colSpan={4}>
                  Total adeudado del complejo
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-red-600">
                  ${totalAdeudadoComplejo.toLocaleString('es-AR')}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 max-w-md">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">
          Monto de expensas — {nombreMes(mes, anio)}
        </h3>
        <form onSubmit={handleGuardarMonto} className="flex gap-3">
          <input
            type="number"
            required
            value={montoMes}
            onChange={(e) => setMontoMes(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            placeholder="50000"
          />
          <button
            type="submit"
            disabled={guardandoMonto}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
          >
            Guardar
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-600">Historial completo</h3>
          <button
            onClick={exportarHistorialExcel}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg transition"
          >
            ⬇ Exportar a Excel
          </button>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={filtroDepto}
            onChange={(e) => setFiltroDepto(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Todos los deptos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Año"
            value={filtroAnio}
            onChange={(e) => setFiltroAnio(e.target.value)}
            className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Mes (1-12)"
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-4 py-3 font-medium">Depto</th>
                <th className="px-4 py-3 font-medium">Mes</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Registrado por</th>
                <th className="px-4 py-3 font-medium">Recibo</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historial.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">Sin resultados</td>
                </tr>
              )}
              {historial.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{p.departamentos?.nombre}</td>
                  <td className="px-4 py-3">{p.meses ? nombreMes(p.meses.mes, p.meses.anio) : '-'}</td>
                  <td className="px-4 py-3">{new Date(p.fecha_pago).toLocaleDateString('es-AR')}</td>
                  <td className="px-4 py-3 capitalize">{p.metodo_pago}</td>
                  <td className="px-4 py-3 capitalize">{p.estado}</td>
                  <td className="px-4 py-3 capitalize">{p.registrado_por}</td>
                  <td className="px-4 py-3">
                    {p.estado === 'pagado' ? (
                      <button
                        onClick={() => generarRecibo({ pago: p, depto: p.departamentos, mes: p.meses })}
                        className="text-tinta underline underline-offset-2 hover:opacity-70 text-xs font-medium"
                      >
                        Ver recibo
                      </button>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => eliminarPago(p, p.departamentos?.nombre || '')}
                      aria-label="Eliminar pago"
                      title="Eliminar pago (vuelve a quedar pendiente)"
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center transition"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
          </div>
        )}

        {modulo === 'residentes' && (
          <PersonasPanel
            tabla="residentes"
            titulo="Registro de residentes"
            subtitulo="Cada departamento puede tener uno o más residentes. El email se usa para los recibos de pago."
            etiquetaAgregar="Agregar residente"
          />
        )}

        {modulo === 'propietarios' && (
          <PersonasPanel
            tabla="propietarios"
            titulo="Registro de propietarios"
            subtitulo="Cada departamento puede tener uno o más propietarios. El email se usa para los recibos de expensas extraordinarias."
            etiquetaAgregar="Agregar propietario"
          />
        )}

        {modulo === 'egresos' && <EgresosPanel editable />}

        {modulo === 'extraordinarias' && <ExtraordinariasPanel editable />}

        {modulo === 'balance' && <BalancePanel />}
      </div>

      {modalAbierto && (
        <RegisterPaymentModal
          departamentos={departamentos}
          onClose={() => setModalAbierto(false)}
          onRegistrado={() => {
            cargarResumen()
            cargarHistorial()
          }}
        />
      )}
    </div>
  )
}
