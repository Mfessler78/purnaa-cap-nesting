import { useEffect, useState } from 'react'
import { listFabrics, saveFabrics } from './lib/api'

const newId = () => crypto.randomUUID()

export default function FabricsScreen() {
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState(null)

  useEffect(() => {
    listFabrics()
      .then((fabrics) => setRows(fabrics.map((f) => ({ id: newId(), ...f }))))
      .catch((err) => setMessage({ kind: 'error', text: err.message }))
  }, [])

  const update = (id, patch) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  async function onSave() {
    setMessage(null)
    try {
      const fabrics = rows.map((r) => ({
        name: r.name,
        scale: Number(r.scale),
      }))
      await saveFabrics(fabrics)
      setMessage({ kind: 'ok', text: `Saved ${fabrics.length} fabric(s) to data/fabrics.json` })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    }
  }

  return (
    <div className="fabrics-screen">
      <h2>Fabrics</h2>
      <p className="hint-text">
        Stretch scale is a percent applied uniformly to the whole sheet at fill time —
        104 means the output prints 4% larger so it relaxes to size on this fabric.
      </p>
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
      <table>
        <thead>
          <tr>
            <th>Fabric name</th>
            <th>Stretch scale %</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
              </td>
              <td>
                <input
                  type="number"
                  min="50"
                  max="200"
                  step="0.5"
                  value={r.scale}
                  onChange={(e) => update(r.id, { scale: e.target.value })}
                />
              </td>
              <td>
                <button
                  className="delete"
                  onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fabrics-actions">
        <button onClick={() => setRows((all) => [...all, { id: newId(), name: '', scale: 100 }])}>
          + Add fabric
        </button>
        <button className="primary" onClick={onSave}>
          Save fabrics
        </button>
      </div>
    </div>
  )
}
