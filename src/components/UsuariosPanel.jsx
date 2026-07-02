import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// Llama al backend /api/gestionar-usuarios enviando el token del admin.
async function apiUsuarios(accion, datos = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch('/api/gestionar-usuarios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ accion, ...datos }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Error del servidor')
  return json
}

const ROL_LABEL = {
  admin: { txt: 'Administrador', clases: 'bg-purple-100 text-purple-700' },
  residente: { txt: 'Residente', clases: 'bg-blue-100 text-blue-700' },
  propietario: { txt: 'Propietario', clases: 'bg-amber-100 text-amber-700' },
  sin_perfil: { txt: 'Sin perfil', clases: 'bg-slate-100 text-slate-500' },
}

// Modal de edición de un usuario existente.
function EditarUsuarioModal({ usuario, deptos, esSuperAdmin, onClose, onGuardado }) {
  const [email, setEmail] = useState(usuario.email || '')
  const [rol, setRol] = useState(
    ['residente', 'propietario', 'admin'].includes(usuario.rol) ? usuario.rol : 'residente',
  )
  const [deptoId, setDeptoId] = useState(() => {
    const d = deptos.find((x) => x.nombre === usuario.depto)
    return d ? String(d.id) : String(deptos[0]?.id || '')
  })
  const [guardando, setGuardando] = useState(false)

  const necesitaDepto = rol === 'residente' || rol === 'propietario'

  async function guardar(e) {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('El email no puede quedar vacío')
      return
    }
    setGuardando(true)
    try {
      await apiUsuarios('editar', {
        userId: usuario.id,
        email: email.trim(),
        rol,
        deptoId: rol === 'admin' ? null : Number(deptoId),
      })
      toast.success('Usuario actualizado')
      onGuardado()
      onClose()
    } catch (err) {
      toast.error(err.message)
    }
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Editar usuario</h3>
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email de acceso</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Categoría</label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="residente">Residente</option>
              <option value="propietario">Propietario</option>
              {esSuperAdmin && <option value="admin">Administrador</option>}
            </select>
          </div>
          {necesitaDepto && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Departamento</label>
              <select
                value={deptoId}
                onChange={(e) => setDeptoId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                {deptos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 bg-tinta hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg"
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UsuariosPanel() {
  const [usuarios, setUsuarios] = useState([])
  const [deptos, setDeptos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [esSuperAdmin, setEsSuperAdmin] = useState(false)
  const [editando, setEditando] = useState(null)

  // Formulario de alta
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState('residente')
  const [deptoId, setDeptoId] = useState('')
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [{ usuarios, esSuperAdmin }, { data: d }] = await Promise.all([
        apiUsuarios('listar'),
        supabase.from('departamentos').select('id, nombre').order('id'),
      ])
      setUsuarios(usuarios || [])
      setEsSuperAdmin(Boolean(esSuperAdmin))
      setDeptos(d || [])
      if (d?.length) setDeptoId((prev) => prev || String(d[0].id))
    } catch (err) {
      toast.error(err.message)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function crear(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      toast.error('Completá email y contraseña')
      return
    }
    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setCreando(true)
    try {
      await apiUsuarios('crear', {
        email: email.trim(),
        password,
        rol,
        deptoId: rol === 'admin' ? null : Number(deptoId),
      })
      toast.success('Usuario creado')
      setEmail('')
      setPassword('')
      cargar()
    } catch (err) {
      toast.error(err.message)
    }
    setCreando(false)
  }

  async function cambiarPassword(u) {
    const nueva = window.prompt(`Nueva contraseña para ${u.email}:`)
    if (!nueva) return
    if (nueva.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    try {
      await apiUsuarios('cambiar_password', { userId: u.id, password: nueva })
      toast.success('Contraseña actualizada')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function eliminar(u) {
    if (!window.confirm(`¿Eliminar la cuenta ${u.email}? Esta acción no se puede deshacer.`)) return
    try {
      await apiUsuarios('eliminar', { userId: u.id })
      toast.success('Usuario eliminado')
      cargar()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const necesitaDepto = rol === 'residente' || rol === 'propietario'
  // Un admin normal no puede tocar cuentas de administrador
  const puedeGestionar = (u) => u.rol !== 'admin' || esSuperAdmin

  return (
    <section>
      <h2 className="font-serif text-2xl text-tinta mb-1">Usuarios</h2>
      <p className="text-sm text-slate-500 mb-5">
        Creá cuentas de acceso, asigná su categoría y gestioná sus contraseñas.
      </p>

      {/* Alta de usuario */}
      <form onSubmit={crear} className="bg-white border border-tinta/10 rounded-2xl p-5 mb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email de acceso</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="depto20@complejofigueroa.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Contraseña</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Categoría</label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="residente">Residente</option>
              <option value="propietario">Propietario</option>
              {esSuperAdmin && <option value="admin">Administrador</option>}
            </select>
          </div>
          {necesitaDepto && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Departamento</label>
              <select
                value={deptoId}
                onChange={(e) => setDeptoId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                {deptos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Los nombres y emails reales se cargan aparte, en los módulos Residentes / Propietarios.
        </p>
        <button
          type="submit"
          disabled={creando}
          className="bg-tinta hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
        >
          {creando ? 'Creando...' : '+ Crear usuario'}
        </button>
      </form>

      {/* Lista de usuarios */}
      {cargando ? (
        <div className="py-10 text-center text-slate-400 text-sm">Cargando usuarios...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-tinta/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    No hay usuarios todavía
                  </td>
                </tr>
              )}
              {usuarios.map((u) => {
                const rl = ROL_LABEL[u.rol] || ROL_LABEL.admin
                const gestionable = puedeGestionar(u)
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3 text-slate-700">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${rl.clases}`}>
                        {rl.txt}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.depto || '—'}</td>
                    <td className="px-4 py-3">
                      {gestionable ? (
                        <div className="flex gap-2 justify-end flex-wrap">
                          <button
                            onClick={() => setEditando(u)}
                            className="text-xs font-medium text-slate-600 hover:text-tinta bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => cambiarPassword(u)}
                            className="text-xs font-medium text-slate-600 hover:text-tinta bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
                          >
                            Contraseña
                          </button>
                          <button
                            onClick={() => eliminar(u)}
                            className="text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <div className="text-right text-xs text-slate-300">—</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          deptos={deptos}
          esSuperAdmin={esSuperAdmin}
          onClose={() => setEditando(null)}
          onGuardado={cargar}
        />
      )}
    </section>
  )
}
