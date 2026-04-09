import { useState } from 'react'
import { storage } from '../lib/api.js'

export default function Settings({ apiKey, setApiKey, onClose }) {
  const [val, setVal] = useState(apiKey || '')
  const [saved, setSaved] = useState(false)

  const save = () => {
    storage.set('anthropic_key', val.trim())
    setApiKey(val.trim())
    setSaved(true)
    setTimeout(() => { setSaved(false); if (onClose) onClose() }, 1000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, borderRadius: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 2, color: '#D63028' }}>CONFIGURACIÓN</div>
          {onClose && <button className="btn-ghost" onClick={onClose} style={{ padding: '5px 10px' }}>×</button>}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>Anthropic API Key</label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <div style={{ fontSize: 11.5, color: '#555', marginTop: 8, lineHeight: 1.7 }}>
            Obtén tu key en <strong style={{ color: '#D63028' }}>console.anthropic.com</strong> → API Keys → Create Key.<br />
            Se guarda solo en tu navegador, nunca se envía a ningún servidor.
          </div>
        </div>

        <button className="btn-red" onClick={save} disabled={!val.trim()} style={{ width: '100%', padding: 13, justifyContent: 'center' }}>
          {saved ? '✅ Guardado' : 'Guardar y continuar'}
        </button>

        <div style={{ marginTop: 20, background: '#1A1400', border: '1px solid #3A2E00', borderRadius: 10, padding: 14, fontSize: 12, color: '#C8A840', lineHeight: 1.7 }}>
          <strong>¿Por qué necesito esto?</strong><br />
          Esta app corre completamente en tu navegador. La API Key le permite al Creador de Contenido y al Generador de Carruseles conectarse directamente a Claude. Anthropic cobra por uso según la cantidad de tokens generados.
        </div>
      </div>
    </div>
  )
}
