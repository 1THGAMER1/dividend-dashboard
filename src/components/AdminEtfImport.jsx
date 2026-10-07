import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { importEtfHoldings, readFileMeta } from '../utils/etfFileParser'
import { extractHoldingRows } from '../utils/portfolioXray'
import { checkFile, validateEtfUpload, sanitizeRows } from '../utils/etfValidation'
import { etfKeyFor, submitHoldings } from '../utils/etfHoldingsStore'

const ADMIN_ID = import.meta.env.VITE_ADMIN_USER_ID
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/

const COLORS = { prüfe: '#f59e0b', speichere: '#f59e0b', bereit: '#93c5fd', gespeichert: '#22c55e', warnung: '#f59e0b', fehler: '#ef4444' }
const inputStyle = { background: '#161b27', color: '#f1f5f9', border: '1px solid #2a3a50', borderRadius: 6, padding: '6px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box' }

export default function AdminEtfImport() {
    const [isAdmin, setIsAdmin] = useState(false)
    const [items, setItems] = useState([])
    const [busy, setBusy] = useState(false)
    const [ignoreWarnings, setIgnoreWarnings] = useState(false)
    const [alsoByName, setAlsoByName] = useState(false)

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setIsAdmin(!!ADMIN_ID && data?.user?.id === ADMIN_ID))
    }, [])

    if (!isAdmin) return null

    const patch = (id, changes) => setItems(list => list.map(it => (it.id === id ? { ...it, ...changes } : it)))
    const savable = (it) => it.rows && it.status !== 'gespeichert'

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files || [])
        e.target.value = ''
        for (const file of files) {
            const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            setItems(list => [...list, {
                id, fileName: file.name, name: file.name.replace(/\.[^.]+$/, ''), isin: '', status: 'prüfe', message: ''
            }])
            try {
                const fileErrors = checkFile(file)
                if (fileErrors.length) throw new Error(fileErrors.join(' '))

                const rows = sanitizeRows(extractHoldingRows(await importEtfHoldings(file)))
                const sum = rows.reduce((s, r) => s + r.Weight, 0)
                const metaText = await readFileMeta(file).catch(() => '')
                // Falls die Datei oberhalb der Tabelle eine ISIN enthält (z. B. SPDR), wird sie vorgeschlagen
                const isin = (metaText.toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/) || [''])[0]

                patch(id, { rows, sum, metaText, isin, status: 'bereit', message: `${rows.length} Pos. · Σ ${sum.toFixed(1)} %` })
            } catch (err) {
                patch(id, { status: 'fehler', message: err.message })
            }
        }
    }

    const saveAll = async () => {
        setBusy(true)
        for (const it of items.filter(savable)) {
            const etfName = it.name.trim()
            const isin = it.isin.trim().toUpperCase()

            if (!etfName) { patch(it.id, { status: 'fehler', message: 'Name fehlt.' }); continue }
            if (isin && !ISIN.test(isin)) { patch(it.id, { status: 'fehler', message: 'Ungültige ISIN.' }); continue }

            const { errors, warnings } = validateEtfUpload({ etfName, rows: it.rows, sum: it.sum, metaText: it.metaText })
            if (errors.length) { patch(it.id, { status: 'fehler', message: errors.join(' | ') }); continue }
            if (warnings.length && !ignoreWarnings) {
                patch(it.id, { status: 'warnung', message: `${warnings.join(' | ')} (Häkchen „Warnungen ignorieren“ setzen, um trotzdem zu speichern)` })
                continue
            }

            try {
                patch(it.id, { status: 'speichere', message: '' })
                const keys = [etfKeyFor({ isin, name: etfName })]
                if (alsoByName && isin) keys.push(etfKeyFor({ name: etfName }))
                for (const etfKey of keys) await submitHoldings({ etfKey, etfName, rows: it.rows })
                patch(it.id, { status: 'gespeichert', message: `Im Katalog unter: ${keys.join(' + ')}` })
            } catch (err) {
                patch(it.id, { status: 'fehler', message: err.message })
            }
        }
        setBusy(false)
    }

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, color: '#c8d4e0' }}>
            <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: '0 0 8px' }}>🛠 Admin: ETFs in den Katalog laden</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
                Mehrere Dateien auswählen, Name (so wie in Parqet) und ISIN prüfen, dann speichern. Deine Uploads gehen direkt in den Katalog.
            </p>

            <input type="file" multiple accept=".xlsx,.csv" onChange={handleFiles} disabled={busy}
                   style={{ fontSize: 12, color: '#888', marginBottom: 16 }} />

            <div style={{ display: 'grid', gap: 10 }}>
                {items.map(it => (
                    <div key={it.id} style={{ background: '#0f1420', border: `1px solid ${COLORS[it.status] || '#2a3a50'}`, borderRadius: 10, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, marginBottom: 8 }}>
                            <span style={{ color: '#64748b' }}>{it.fileName}</span>
                            <span style={{ color: COLORS[it.status] }}>{it.status}</span>
                        </div>
                        {it.rows && it.status !== 'gespeichert' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                                <input style={inputStyle} value={it.name} placeholder="ETF-Name (wie in Parqet)"
                                       onChange={e => patch(it.id, { name: e.target.value })} />
                                <input style={inputStyle} value={it.isin} placeholder="ISIN (optional)"
                                       onChange={e => patch(it.id, { isin: e.target.value })} />
                            </div>
                        )}
                        {it.message && <p style={{ fontSize: 11, color: COLORS[it.status] || '#64748b', margin: 0 }}>{it.message}</p>}
                    </div>
                ))}
            </div>

            {items.some(savable) && (
                <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                    <label><input type="checkbox" checked={ignoreWarnings} onChange={e => setIgnoreWarnings(e.target.checked)} /> Warnungen ignorieren</label>
                    <label title="Falls Parqet für deine ETFs keine ISIN liefert, findet die Seite sie sonst nicht">
                        <input type="checkbox" checked={alsoByName} onChange={e => setAlsoByName(e.target.checked)} /> zusätzlich unter dem Namen speichern
                    </label>
                    <button onClick={saveAll} disabled={busy}
                            style={{ background: '#009991', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                        {busy ? 'Speichere...' : 'In Katalog speichern'}
                    </button>
                </div>
            )}
        </div>
    )
}