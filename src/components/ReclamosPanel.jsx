import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// Grados de avance del reclamo (en orden de progreso)
const ESTADOS = [
  { value: 'visto', label: 'Visto', icono: '👁', clases: 'bg-blue-100 text-blue-700' },
  { value: 'en_proceso', label: 'En proceso', icono: '🛠', clases: 'bg-amber-100 text-amber-700' },
  { value: 'solucionado', label: 'Solucionado', icono: '✅', clases: 'bg-green-100 text-green-700' },
]

function BadgeEstado({ estado }) {
  const e = ESTADOS.find((x) => x.value === estado) || ESTADOS[0]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${e.clases}`}>
      <span>{e.icono}</span>
      {e.label}
    </span>
  )
}

// Módulo de Reclamos y Proyectos.
//   editable  = true  -> admin: puede cambiar estado y eliminar
//   editable  = false -> residente o propietario: solo crea y ve
//   departamento      -> depto del usuario logueado (null si es admin)
//   creadoPor         -> 'admin' | 'residente' | 'propietario'
export default function ReclamosPanel({ editable = false, departamento = null, creadoPor = 'residente' }) {
  const [reclamos, setReclamos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [descripcion, setDescripcion] = useState('')
  const [imagen1, setImagen1] = useState(null)
  const [imagen2, setImagen2] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('reclamos')
      .select('*, departamentos(*)')
      .order('created_at', { ascending: false })
    setReclamos(data || [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('reclamos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reclamos' }, () => cargar())
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar])

  async function subirImagen(file, prefijo) {
    if (!file) return null
    const ruta = `${departamento?.id || 'admin'}/${Date.now()}-${prefijo}-${file.name}`
    const { error } = await supabase.storage.from('reclamos').upload(ruta, file)
    if (error) {
      console.error('Error subiendo imagen:', error)
      return null
    }
    const { data } = supabase.storage.from('reclamos').getPublicUrl(ruta)
    return data.publicUrl
  }

  async function crear(e) {
    e.preventDefault()
    if (!descripcion.trim()) {
      toast.error('Describí brevemente el reclamo')
      return
    }
    setEnviando(true)

    const [imagen1_url, imagen2_url] = await Promise.all([
      subirImagen(imagen1, 'img1'),
      subirImagen(imagen2, 'img2'),
    ])

    const { error } = await supabase.from('reclamos').insert({
      depto_id: departamento?.id || null,
      descripcion,
      imagen1_url,
      imagen2_url,
      estado: 'visto',
      creado_por: creadoPor,
    })

    setEnviando(false)

    if (error) {
      toast.error('No se pudo registrar el reclamo')
      return
    }

    toast.success('Reclamo registrado')
    setDescripcion('')
    setImagen1(null)
    setImagen2(null)
    document.querySelectorAll('input[type=file]').forEach((el) => (el.value = ''))
    cargar()
  }

  async function cambiarEstado(reclamo, nuevoEstado) {
    const { error } = await supabase
      .from('reclamos')
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id', reclamo.id)
    if (error) {
      toast.error('No se pudo actualizar el estado')
      return
    }
    toast.success('Estado actualizado')
    cargar()
  }

  async function eliminar(reclamo) {
    if (!window.confirm('¿Eliminar este reclamo?')) return
    const { error } = await supabase.from('reclamos').delete().eq('id', reclamo.id)
    if (error) {
      toast.error('No se pudo eliminar')
      return
    }
    toast.success('Reclamo eliminado')
    cargar()
  }

  if (cargando) {
    return <div className="py-20 text-center text-slate-400 text-sm">Cargando reclamos...</div>
  }

  return (
    <section>
      <h2 className="font-serif text-2xl text-tinta mb-1">Reclamos y proyectos</h2>
      <p className="text-sm text-slate-500 mb-5">
        {editable
          ? 'Gestioná los reclamos del complejo y actualizá su grado de avance.'
          : 'Reportá un reclamo o seguí el avance de los proyectos del complejo.'}
      </p>

      {/* Formulario para crear */}
      <form onSubmit={crear} className="bg-white border border-tinta/10 rounded-2xl p-5 mb-6 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Describí brevemente el reclamo o proyecto
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Ej: La luz del pasillo del 3er piso no funciona"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Imagen 1 (opcional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImagen1(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Imagen 2 (opcional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImagen2(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={enviando}
          className="bg-tinta hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
        >
          {enviando ? 'Enviando...' : '+ Registrar reclamo'}
        </button>
      </form>

      {/* Lista de reclamos */}
      <div className="space-y-3">
        {reclamos.length === 0 && (
          <div className="py-10 text-center text-slate-400 text-sm bg-white border border-tinta/10 rounded-2xl">
            No hay reclamos registrados todavía.
          </div>
        )}
        {reclamos.map((r) => (
          <div key={r.id} className="bg-white border border-tinta/10 rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs text-slate-400 mb-1">
                  <span className="font-medium text-slate-500">
                    {r.departamentos?.nombre || 'Administración'}
                  </span>
                  {' · '}
                  {new Date(r.created_at).toLocaleDateString('es-AR')}
                  {' · '}
                  <span className="capitalize">{r.creado_por}</span>
                </p>
                <p className="text-sm text-slate-700">{r.descripcion}</p>
              </div>
              <BadgeEstado estado={r.estado} />
            </div>

            {/* Imágenes */}
            {(r.imagen1_url || r.imagen2_url) && (
              <div className="flex gap-2 mt-3">
                {r.imagen1_url && (
                  <a href={r.imagen1_url} target="_blank" rel="noreferrer">
                    <img
                      src={r.imagen1_url}
                      alt="Imagen reclamo"
                      className="w-24 h-24 object-cover rounded-xl border border-slate-200 hover:opacity-90 transition"
                    />
                  </a>
                )}
                {r.imagen2_url && (
                  <a href={r.imagen2_url} target="_blank" rel="noreferrer">
                    <img
                      src={r.imagen2_url}
                      alt="Imagen reclamo"
                      className="w-24 h-24 object-cover rounded-xl border border-slate-200 hover:opacity-90 transition"
                    />
                  </a>
                )}
              </div>
            )}

            {/* Controles del admin: cambiar estado y eliminar */}
            {editable && (
              <div className="flex gap-2 mt-4 flex-wrap items-center">
                <span className="text-xs text-slate-400 mr-1">Avance:</span>
                {ESTADOS.map((e) => (
                  <button
                    key={e.value}
                    onClick={() => cambiarEstado(r, e.value)}
                    disabled={r.estado === e.value}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                      r.estado === e.value
                        ? 'bg-slate-100 text-slate-400 border-slate-100 cursor-default'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-tinta/30 hover:bg-slate-50'
                    }`}
                  >
                    {e.icono} {e.label}
                  </button>
                ))}
                <button
                  onClick={() => eliminar(r)}
                  className="text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg ml-auto transition"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
