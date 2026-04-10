import { useState, useRef, useEffect } from 'react'

function Spinner({ size = 14 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

export default function CarouselDownloader({ html }) {
  const iframeRef = useRef(null)
  const [slides, setSlides] = useState([])
  const [downloading, setDownloading] = useState(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [loaded, setLoaded] = useState(false)

  // Parse slides from HTML — look for slide containers
  useEffect(() => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    // Try to find slide elements by common patterns
    const slideEls = doc.querySelectorAll('[class*="slide"], [id*="slide"], [data-slide]')
    if (slideEls.length > 0) {
      setSlides(Array.from(slideEls).map((el, i) => ({ id: i, label: `Slide ${i + 1}` })))
    }
  }, [html])

  const captureSlide = async (slideIndex, label) => {
    const iframe = iframeRef.current
    if (!iframe) return null

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
      const html2canvas = iframe.contentWindow.html2canvas

      if (!html2canvas) {
        throw new Error('html2canvas no disponible')
      }

      // Find slide elements in iframe
      const slideEls = iframeDoc.querySelectorAll('[class*="slide"]:not([class*="swipe"]):not([class*="arrow"]), .carousel-slide, [data-slide-index]')
      const targetSlide = slideEls[slideIndex]

      if (!targetSlide) {
        // Fallback: capture the full visible area
        const allSlides = iframeDoc.querySelectorAll('[style*="aspect-ratio"], [style*="1080"]')
        const target = allSlides[slideIndex] || iframeDoc.body
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          width: 1080,
          height: 1350,
        })
        return canvas
      }

      const canvas = await html2canvas(targetSlide, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        width: targetSlide.offsetWidth,
        height: targetSlide.offsetHeight,
      })
      return canvas
    } catch (e) {
      console.error('Capture error:', e)
      return null
    }
  }

  const downloadSlide = async (index) => {
    setDownloading(index)
    try {
      const canvas = await captureSlide(index, `slide-${index + 1}`)
      if (canvas) {
        const link = document.createElement('a')
        link.download = `gorillagency-carrusel-slide-${String(index + 1).padStart(2, '0')}.jpg`
        link.href = canvas.toDataURL('image/jpeg', 0.95)
        link.click()
      }
    } finally { setDownloading(null) }
  }

  const downloadAll = async () => {
    setDownloadingAll(true)
    const iframe = iframeRef.current
    if (!iframe) { setDownloadingAll(false); return }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
    const html2canvas = iframe.contentWindow.html2canvas

    if (!html2canvas) { 
      alert('El carrusel aún está cargando. Espera un momento e intenta de nuevo.')
      setDownloadingAll(false)
      return 
    }

    // Find all slide containers
    let slideEls = Array.from(iframeDoc.querySelectorAll('.slide, [class*="slide-container"], [class*="carousel-slide"]'))
    
    // Fallback: find elements with 4:5 ratio or fixed dimensions
    if (slideEls.length === 0) {
      slideEls = Array.from(iframeDoc.querySelectorAll('[style]')).filter(el => {
        const style = el.getAttribute('style') || ''
        return (style.includes('1080') || style.includes('aspect-ratio: 4/5') || style.includes('aspect-ratio:4/5'))
      })
    }

    // Last fallback: get all major divs with background
    if (slideEls.length === 0) {
      slideEls = Array.from(iframeDoc.querySelectorAll('div')).filter(el => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return rect.width > 200 && rect.height > 200 && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
      }).slice(0, 10)
    }

    for (let i = 0; i < Math.max(slideEls.length, 1); i++) {
      try {
        const target = slideEls[i] || iframeDoc.body
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#1A1A1A',
          logging: false,
        })
        const link = document.createElement('a')
        link.download = `gorillagency-slide-${String(i + 1).padStart(2, '0')}.jpg`
        link.href = canvas.toDataURL('image/jpeg', 0.95)
        link.click()
        await new Promise(r => setTimeout(r, 500)) // small delay between downloads
      } catch (e) { console.error(`Error slide ${i}:`, e) }
    }
    setDownloadingAll(false)
  }

  // Inject html2canvas into iframe HTML
  const enrichedHtml = html.replace(
    '</head>',
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script></head>`
  )

  return (
    <div style={{ width: '100%' }}>
      {/* Download controls */}
      <div style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: '12px 12px 0 0', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F0F0F0', marginBottom: 2 }}>Carrusel generado — @gorillagency</div>
          <div style={{ fontSize: 11, color: '#555' }}>Descarga cada slide como JPG listo para Instagram</div>
        </div>
        <button
          className="btn-red"
          onClick={downloadAll}
          disabled={downloadingAll || !loaded}
          style={{ fontSize: 12, padding: '9px 16px', flexShrink: 0 }}
        >
          {downloadingAll ? <><Spinner size={12} />Descargando...</> : !loaded ? <><Spinner size={12} />Cargando...</> : '⬇ Descargar todos los slides'}
        </button>
      </div>

      {/* Preview iframe */}
      <div style={{ position: 'relative', border: '1px solid #222', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', background: '#111' }}>
        <iframe
          ref={iframeRef}
          srcDoc={enrichedHtml}
          style={{ width: '100%', height: '700px', border: 'none', display: 'block' }}
          title="Carrusel preview"
          onLoad={() => {
            setLoaded(true)
          }}
          sandbox="allow-scripts allow-same-origin"
        />
        {!loaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', gap: 10, color: '#555', fontSize: 13 }}>
            <Spinner size={16} /> Renderizando carrusel...
          </div>
        )}
      </div>

      {/* Instructions */}
      <div style={{ marginTop: 10, background: '#0A1400', border: '1px solid #1A3A00', borderRadius: 10, padding: '12px 16px', fontSize: 11.5, color: '#6EE387', lineHeight: 1.7 }}>
        <strong>💡 Cómo descargar:</strong> Haz clic en <strong>"⬇ Descargar todos los slides"</strong> y cada slide se descargará como JPG individual en tu carpeta de Descargas. Si el botón no funciona en tu navegador, haz clic derecho en cada slide del preview → "Guardar imagen como".
      </div>
    </div>
  )
}
