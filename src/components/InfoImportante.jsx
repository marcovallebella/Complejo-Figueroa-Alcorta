import { useState } from 'react'
import toast from 'react-hot-toast'

// Datos de pago del consorcio (alias para transferir + mail de contacto).
const ALIAS = 'expensas.figueroa898'
const MAIL = 'admconsorcioalcorta@gmail.com'

export default function InfoImportante({ className = '' }) {
  const [abierto, setAbierto] = useState(false)

  function copiar(texto) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(texto).then(
        () => toast.success('Copiado'),
        () => {},
      )
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex items-center justify-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium py-3 px-4 rounded-xl transition ${className}`}
      >
        <span>ℹ️</span> Información importante
      </button>

      {abierto && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50"
          onClick={() => setAbierto(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-xl text-tinta mb-1">Información importante</h3>
            <p className="text-sm text-slate-500 mb-4">
              Datos del consorcio para pagar tus expensas por transferencia:
            </p>

            <div className="space-y-3">
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Alias</p>
                  <p className="text-sm font-medium text-slate-800 break-all">{ALIAS}</p>
                </div>
                <button
                  onClick={() => copiar(ALIAS)}
                  className="text-xs font-medium text-tinta bg-white border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-lg shrink-0"
                >
                  Copiar
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Mail de contacto</p>
                  <p className="text-sm font-medium text-slate-800 break-all">{MAIL}</p>
                </div>
                <button
                  onClick={() => copiar(MAIL)}
                  className="text-xs font-medium text-tinta bg-white border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-lg shrink-0"
                >
                  Copiar
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-4">
              Una vez que transfieras, avisá con el botón "Informar transferencia" para que la administración registre el pago.
            </p>

            <button
              onClick={() => setAbierto(false)}
              className="w-full mt-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-lg"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
