import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Email del super admin (siempre tiene acceso, aunque no figure en ninguna
// tabla). El resto de los admins se definen en la tabla `administradores`.
const SUPER_ADMIN_EMAIL = 'marcoluisvallebella@gmail.com'

// El rol se determina por el vínculo de login en `departamentos`:
//   - residente   -> departamentos.user_id = uid
//   - propietario -> departamentos.propietario_user_id = uid
//   - admin       -> el email está en `administradores` (o es el super admin)
//   - sin perfil  -> ninguna de las anteriores (sin acceso)
// Las tablas residentes/propietarios son solo registro de contacto.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [rol, setRol] = useState(null) // 'admin' | 'residente' | 'propietario'
  const [departamento, setDepartamento] = useState(null)
  const [propietario, setPropietario] = useState(null)
  const [cargandoPerfil, setCargandoPerfil] = useState(true)
  // Recordamos qué usuario está activo. Así ignoramos los eventos de auth
  // que solo refrescan el token (al volver a la pestaña) pero no cambian
  // de usuario, evitando que la app recargue todo cada vez.
  const uidActual = useRef(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      uidActual.current = data.session?.user?.id ?? null
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sesion) => {
      const nuevoUid = sesion?.user?.id ?? null
      // Solo actualizamos si realmente cambió el usuario (login/logout),
      // no en un simple refresco de token del mismo usuario.
      if (nuevoUid !== uidActual.current) {
        uidActual.current = nuevoUid
        setSession(sesion)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // El perfil se recarga SOLO cuando cambia el usuario (login/logout), no en
  // cada refresco de sesión. Por eso la dependencia es el id del usuario y no
  // el objeto `session` (que Supabase regenera al volver a la pestaña).
  const sesionLista = session !== undefined
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!sesionLista) return

    async function cargarPerfil() {
      if (!userId) {
        setRol(null)
        setDepartamento(null)
        setPropietario(null)
        setCargandoPerfil(false)
        return
      }

      setCargandoPerfil(true)

      // El rol se determina SOLO por el vínculo de login en departamentos:
      //   user_id             -> residente
      //   propietario_user_id -> propietario
      // Las tablas residentes/propietarios son solo registro de contacto y no
      // intervienen en el rol.

      // ¿Residente?
      const { data: deptoRows } = await supabase
        .from('departamentos')
        .select('*')
        .eq('user_id', userId)
        .order('id')
        .limit(1)
      const depto = deptoRows?.[0]

      if (depto) {
        setRol('residente')
        setDepartamento(depto)
        setPropietario(null)
        setCargandoPerfil(false)
        return
      }

      // ¿Propietario?
      const { data: deptoPropRows } = await supabase
        .from('departamentos')
        .select('*')
        .eq('propietario_user_id', userId)
        .order('id')
        .limit(1)
      const deptoProp = deptoPropRows?.[0]

      if (deptoProp) {
        setRol('propietario')
        setPropietario(null)
        setDepartamento(deptoProp)
        setCargandoPerfil(false)
        return
      }

      // ¿Administrador? SOLO si está en la lista explícita de administradores
      // (o es el super admin). Una cuenta sin rol NO es admin por descarte:
      // queda "sin perfil". Así, borrar la ficha de un propietario no lo
      // convierte sin querer en administrador con acceso total.
      const email = (session?.user?.email || '').toLowerCase()
      let esAdminExplicito = email === SUPER_ADMIN_EMAIL
      if (!esAdminExplicito) {
        const { data: admins } = await supabase.from('administradores').select('email')
        esAdminExplicito = (admins || []).some((a) => (a.email || '').toLowerCase() === email)
      }

      setRol(esAdminExplicito ? 'admin' : 'sinPerfil')
      setDepartamento(null)
      setPropietario(null)
      setCargandoPerfil(false)
    }

    cargarPerfil()
  }, [userId, sesionLista])

  const cerrarSesion = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider
      value={{
        session,
        usuario: session?.user ?? null,
        rol,
        departamento,
        propietario,
        esAdmin: rol === 'admin',
        esResidente: rol === 'residente',
        esPropietario: rol === 'propietario',
        cargando: session === undefined || cargandoPerfil,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
