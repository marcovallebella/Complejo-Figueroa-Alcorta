import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase, fechaCorta } from '../lib/supabase'
import MetaBar from './MetaBar'
import EstadoBadge from './EstadoBadge'
import InformarTransferenciaExtraModal from './InformarTransferenciaExtraModal'
import { generarReciboExtraordinaria, enviarReciboPropietario } from '../lib/recibo'

// Módulo de expensas extraordinarias (caja separada del fondo común).
//   editable = true  -> admin (crea expensas, registra pagos, recibos)
//   editable = false -> propietario (solo ve el avance / meta y el estado)
// Cada expensa puede afectar a todas las unidades o solo a algunas.
// Las tarjetas son colapsables: colapsadas muestran solo título + barra de avance.
export default function ExtraordinariasPanel({ editable = false, miDeptoId = null }) {
  const [extras, setExtras] = useState([])
  const [deptos, setDeptos] = useState([])
  const [pagos, setPagos] = useState([])
  const [propietarios, setPropietarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [razon, setRazon] = useState('')
  const [monto, setMonto] = useState('')
  const [unidadesSel, setUnidadesSel] = useState(null) // null = aún no inicializado
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState(null) // id de la extraordinaria en edición (null = creando nueva)
  const [expandidas, setExpandidas] = useState(() => new Set())
  const [informando, setInformando] = useState(null) // { extra, depto } para el modal del propietario

  const cargar = useCallback(async () => {
    const [ex, d, pe, pr] = await Promise.all([
      supabase.from('extraordinarias').select('*').order('id', { ascending: false }),
      supabase.from('departamentos').select('id, nombre').order('id'),
      supabase.from('pagos_extraordinarios').select('*'),
      supabase.from('propietarios').select('*'),
    ])
    setExtras(ex.data || [])
    setDeptos(d.data || [])
    setPagos(pe.data || [])
    setPropietarios(pr.data || [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('extra-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_extraordinarios' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extraordinarias' }, () => cargar())
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar])

  // Inicializa la selección de unidades (todas) cuando cargan los deptos
  useEffect(() => {
    if (unidadesSel === null && deptos.length) setUnidadesSel(deptos.map((d) => d.id))
  }, [deptos, unidadesSel])

  const seleccion = unidadesSel || deptos.map((d) => d.id)

  function toggleUnidad(id) {
    setUnidadesSel((prev) => {
      const base = prev || deptos.map((d) => d.id)
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    })
  }

  function toggleExpand(id) {
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setRazon('')
    setMonto('')
    setUnidadesSel(deptos.map((d) => d.id))
  }

  function iniciarEdicion(extra) {
    setEditandoId(extra.id)
    setRazon(extra.razon)
    setMonto(String(extra.monto))
    setUnidadesSel(
      extra.afecta_deptos && extra.afecta_deptos.length ? extra.afecta_deptos : deptos.map((d) => d.id),
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function eliminar(extra) {
    if (!window.confirm(`¿Eliminar la expensa extraordinaria "${extra.razon}"? Se borrarán también los pagos registrados de esta expensa.`)) {
      return
    }
    // Borramos primero las dependencias (pagos y avisos de transferencia) por las FK.
    await supabase.from('pagos_extraordinarios').delete().eq('extraordinaria_id', extra.id)
    await supabase.from('transferencias').delete().eq('extraordinaria_id', extra.id)
    const { error } = await supabase.from('extraordinarias').delete().eq('id', extra.id)
    if (error) {
      toast.error('No se pudo eliminar')
      return
    }
    toast.success('Expensa extraordinaria eliminada')
    if (editandoId === extra.id) cancelarEdicion()
    cargar()
  }

  async function crear(e) {
    e.preventDefault()
    if (!razon.trim() || !monto || Number(monto) <= 0) {
      toast.error('Completá la razón y el monto')
      return
    }
    if (seleccion.length === 0) {
      toast.error('Seleccioná al menos una unidad afectada')
      return
    }
    setCreando(true)
    const afecta_deptos = seleccion.length === deptos.length ? null : seleccion
    const payload = { razon, monto: Number(monto), afecta_deptos }
    const { error } = editandoId
      ? await supabase.from('extraordinarias').update(payload).eq('id', editandoId)
      : await supabase.from('extraordinarias').insert(payload)
    setCreando(false)
    if (error) {
      toast.error(editandoId ? 'No se pudieron guardar los cambios' : 'No se pudo crear la expensa extraordinaria')
      return
    }
    toast.success(editandoId ? 'Expensa extraordinaria actualizada' : 'Expensa extraordinaria creada')
    cancelarEdicion()
    cargar()
  }

  async function registrarPago(extra, depto, cuota) {
    const { error } = await supabase.from('pagos_extraordinarios').insert({
      extraordinaria_id: extra.id,
      depto_id: depto.id,
      monto: cuota,
      fecha_pago: new Date().toISOString(),
      metodo_pago: 'transferencia',
      estado: 'pagado',
    })
    if (error) {
      toast.error('No se pudo registrar el pago')
      return
    }
    toast.success(`Pago de ${depto.nombre} registrado`)
    cargar()
  }

  async function anularPago(pago, deptoNombre) {
    const { error } = await supabase.from('pagos_extraordinarios').delete().eq('id', pago.id)
    if (error) {
      toast.error('No se pudo anular')
      return
    }
    toast.success(`Pago de ${deptoNombre} anulado`)
    cargar()
  }

  function emailsDelDepto(deptoId) {
    return propietarios.filter((p) => p.depto_id === deptoId).map((p) => p.email).filter(Boolean)
  }

  if (cargando) {
    return <div className="py-20 text-center text-slate-400 text-sm">Cargando expensas extraordinarias...</div>
  }

  return (
    <section>
      <h2 className="font-serif text-2xl text-tinta mb-1">Expensas extraordinarias</h2>
      <p className="text-sm text-slate-500 mb-5">
        Caja separada del fondo común. La barra muestra el avance de la recaudación hacia la meta.
      </p>

      {editable && (
        <form onSubmit={crear} className="bg-white border border-tinta/10 rounded-2xl p-5 mb-6">
          {editandoId && (
            <p className="text-xs text-tinta font-medium mb-3">
              ✎ Editando una expensa extraordinaria — modificá los campos y guardá.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">Razón de la expensa extraordinaria</label>
              <input
                value={razon}
                onChange={(e) => setRazon(e.target.value)}
                placeholder="Ej: Reparación de fachada"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Monto total (objetivo)</label>
              <input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creando}
                className="flex-1 bg-tinta hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
              >
                {creando ? 'Guardando...' : editandoId ? 'Guardar' : 'Crear'}
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-500">
                Unidades afectadas ({seleccion.length}/{deptos.length})
              </label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setUnidadesSel(deptos.map((d) => d.id))} className="text-tinta hover:underline">
                  Todas
                </button>
                <span className="text-slate-300">·</span>
                <button type="button" onClick={() => setUnidadesSel([])} className="text-tinta hover:underline">
                  Ninguna
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {deptos.map((d) => {
                const sel = seleccion.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleUnidad(d.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      sel
                        ? 'bg-tinta text-white border-tinta'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {d.id}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              La cuota por unidad se calcula como monto ÷ unidades afectadas.
            </p>
          </div>
        </form>
      )}

      {extras.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center bg-white border border-tinta/10 rounded-2xl">
          No hay expensas extraordinarias registradas.
        </p>
      )}

      <div className="space-y-4">
        {extras.map((extra) => {
          const afectados =
            extra.afecta_deptos && extra.afecta_deptos.length
              ? deptos.filter((d) => extra.afecta_deptos.includes(d.id))
              : deptos
          const pagosExtra = pagos.filter((p) => p.extraordinaria_id === extra.id)
          const recaudado = pagosExtra.reduce((a, p) => a + Number(p.monto || 0), 0)
          const cuota = afectados.length ? extra.monto / afectados.length : 0
          const pagados = pagosExtra.length
          const todas = !extra.afecta_deptos || extra.afecta_deptos.length === deptos.length
          const abierta = expandidas.has(extra.id)
          return (
            <div key={extra.id} className="bg-white border border-tinta/10 rounded-2xl p-5">
              <button
                onClick={() => toggleExpand(extra.id)}
                className="w-full flex items-start justify-between gap-3 text-left"
                aria-expanded={abierta}
              >
                <div className="min-w-0">
                  <h3 className="font-serif text-xl text-tinta">{extra.razon}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {todas ? 'Afecta a todas las unidades' : `Afecta a ${afectados.length} unidades`} · Cuota:
                    {' '}${Number(cuota).toLocaleString('es-AR')} · {pagados}/{afectados.length} al día
                  </p>
                </div>
                <span className={`text-slate-400 mt-1 transition-transform ${abierta ? 'rotate-180' : ''}`}>▾</span>
              </button>

              {editable && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => iniciarEdicion(extra)}
                    className="text-xs font-medium text-slate-600 hover:text-tinta bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => eliminar(extra)}
                    className="text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                  >
                    Eliminar
                  </button>
                </div>
              )}

              <div className="mt-4">
                <MetaBar recaudado={recaudado} objetivo={Number(extra.monto)} />
              </div>

              {abierta && (
                <div className="overflow-x-auto rounded-xl border border-tinta/10 mt-4">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-left">
                        <th className="px-4 py-3 font-medium">Unidad</th>
                        <th className="px-4 py-3 font-medium">Estado</th>
                        <th className="px-4 py-3 font-medium">Fecha de pago</th>
                        <th className="px-4 py-3 font-medium text-right">{editable ? 'Acciones' : ''}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {afectados.map((depto) => {
                        const pago = pagosExtra.find((p) => p.depto_id === depto.id)
                        const esMio = miDeptoId === depto.id
                        return (
                          <tr key={depto.id} className={esMio ? 'bg-amber-50' : ''}>
                            <td className="px-4 py-3 font-medium text-slate-700">
                              {depto.nombre}
                              {esMio && <span className="ml-2 text-[10px] text-amber-600">(tu unidad)</span>}
                            </td>
                            <td className="px-4 py-3">
                              <EstadoBadge estado={pago ? 'pagado' : 'pendiente'} />
                            </td>
                            <td className="px-4 py-3">
                              {pago ? fechaCorta(pago.fecha_pago) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {editable ? (
                                <div className="flex gap-2 justify-end flex-wrap">
                                  {!pago ? (
                                    <button
                                      onClick={() => registrarPago(extra, depto, cuota)}
                                      className="bg-tinta hover:opacity-90 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                                    >
                                      Registrar pago
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => generarReciboExtraordinaria({ extra, depto, pago })}
                                        className="text-tinta underline underline-offset-2 hover:opacity-70 text-xs font-medium"
                                      >
                                        Recibo
                                      </button>
                                      <button
                                        onClick={() =>
                                          enviarReciboPropietario({ extra, depto, pago, emails: emailsDelDepto(depto.id) })
                                        }
                                        className="text-blue-600 underline underline-offset-2 hover:opacity-70 text-xs font-medium"
                                      >
                                        Enviar
                                      </button>
                                      <button
                                        onClick={() => anularPago(pago, depto.nombre)}
                                        className="text-slate-400 hover:text-red-600 text-xs font-medium"
                                      >
                                        Anular
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : pago ? (
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => generarReciboExtraordinaria({ extra, depto, pago })}
                                    className="text-tinta underline underline-offset-2 hover:opacity-70 text-xs font-medium"
                                  >
                                    Recibo
                                  </button>
                                </div>
                              ) : (
                                esMio && (
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => setInformando({ extra, depto })}
                                      className="bg-tinta hover:opacity-90 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                                    >
                                      Informar transferencia
                                    </button>
                                  </div>
                                )
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {informando && (
        <InformarTransferenciaExtraModal
          depto={informando.depto}
          extra={informando.extra}
          onClose={() => setInformando(null)}
          onEnviado={cargar}
        />
      )}
    </section>
  )
}
