import { useState } from 'react'
import ExtraordinariasPanel from './ExtraordinariasPanel'
import TablaDeudaComplejo from './TablaDeudaComplejo'
import ReclamosPanel from './ReclamosPanel'

// Panel del Propietario, reestructurado en módulos con barra lateral:
//  - Expensas extraordinarias: avance de cada extraordinaria (solo lectura),
//    con su unidad resaltada.
//  - Expensas comunes: estado de pago/deuda de todos los deptos (solo lectura).
//  - Reclamos y proyectos: crear y seguir reclamos.
export default function PropietarioPanel({ departamento }) {
  const [modulo, setModulo] = useState('extraordinarias')

  const botones = [
    {
      id: 'extraordinarias',
      label: 'Expensas extraordinarias',
      icono: (
        <>
          <path d="M12 3v18" />
          <path d="M5 8l7-5 7 5" />
          <path d="M5 8v8l7 5 7-5V8" />
        </>
      ),
    },
    {
      id: 'comunes',
      label: 'Expensas comunes',
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
      id: 'reclamos',
      label: 'Reclamos y proyectos',
      icono: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    },
  ]

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-56 shrink-0">
        <nav className="bg-white border border-tinta/10 rounded-2xl p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible [&>button]:shrink-0 [&>button]:whitespace-nowrap">
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
        {modulo === 'extraordinarias' && (
          <ExtraordinariasPanel editable={false} miDeptoId={departamento?.id ?? null} />
        )}

        {modulo === 'comunes' && (
          <section>
            <h2 className="font-serif text-2xl text-tinta mb-1">Expensas comunes</h2>
            <p className="text-sm text-slate-500 mb-5">
              Estado de pago de las expensas comunes de todos los departamentos (solo lectura).
            </p>
            <TablaDeudaComplejo />
          </section>
        )}

        {modulo === 'reclamos' && (
          <ReclamosPanel departamento={departamento} creadoPor="propietario" />
        )}
      </div>
    </div>
  )
}
