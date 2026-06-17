import { useEffect, useRef, useState } from 'react'
import { startRender } from './lib/pdfRender'

// Read-only PDF page viewer with zoom (canvas only, no overlay).
export default function PdfViewer({ pdf }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [scale, setScale] = useState(null)

  useEffect(() => {
    if (!pdf || !containerRef.current) return
    const avail = containerRef.current.clientWidth - 4
    setScale(Math.min(1, avail / pdf.width))
  }, [pdf])

  useEffect(() => {
    if (!pdf || !scale || !canvasRef.current) return
    renderTaskRef.current?.cancel()
    const task = startRender(pdf.page, canvasRef.current, scale)
    renderTaskRef.current = task
    task.promise.catch(() => {})
  }, [pdf, scale])

  if (!pdf) return null

  const zoom = (factor) => setScale((s) => Math.min(3, Math.max(0.05, s * factor)))
  const fit = () => {
    const avail = containerRef.current.clientWidth - 4
    setScale(Math.min(1, avail / pdf.width))
  }

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button onClick={() => zoom(0.8)}>−</button>
        <button onClick={() => zoom(1.25)}>+</button>
        <button onClick={fit}>Fit</button>
        {scale && <span className="zoom-label">{Math.round(scale * 100)}%</span>}
      </div>
      <div className="editor-scroll" ref={containerRef}>
        <div
          className="editor-stage"
          style={scale ? { width: pdf.width * scale, height: pdf.height * scale } : undefined}
        >
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  )
}
