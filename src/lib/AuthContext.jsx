import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Tres tipos de cuenta, determinados por la asociación del user_id:
//   - residente  -> existe en `departamentos` (user_id = uid)
//   - propietario -> existe en `propietarios` (user_id = uid)
//   - admin      -> no está asociado a ninguna de las dos
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

      // ¿Residente? Usamos limit(1) en vez de maybeSingle() para que, si por
      // algún motivo hay filas duplicadas, no falle la detección de rol (con
      // maybeSingle un duplicado da error y caería en admin por descarte).
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
      const { data: propRows } = await supabase
        .from('propietarios')
        .select('*')
        .eq('user_id', userId)
        .order('id')
        .limit(1)
      const prop = propRows?.[0]

      if (prop) {
        const { data: deptoProp } = await supabase
          .from('departamentos')
          .select('*')
          .eq('id', prop.depto_id)
          .maybeSingle()
        setRol('propietario')
        setPropietario(prop)
        setDepartamento(deptoProp || null)
        setCargandoPerfil(false)
        return
      }

      // Si no es residente ni propietario -> admin
      setRol('admin')
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
