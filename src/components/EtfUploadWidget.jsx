import React, { useState, useEffect } from 'react'
import {
    importVanguardHoldings,
    importVanEckHoldings,
    importStoxx600Holdings,
    importXtrackersHoldings,
    importGenericEtfHoldings,
    readFileMeta
} from '../utils/etfFileParser'
import { checkFile, validateEtfUpload } from '../utils/etfValidation'
import { extractHoldingRows, isEtfName } from '../utils/portfolioXray'
import { loadStoredHoldings, saveHoldings } from '../utils/etfHoldingsStore'
import PortfolioXRayView from '../Views/PortfolioXRayView.jsx'

const STALE_DAYS = 120
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '')
const isStale = (iso) => iso && Date.now() - new Date(iso).getTime() > STALE_DAYS * 86400000

export default function EtfUploadWidget({ holdings, currentValue }) {
    const [etfHoldingsMap, setEtfHoldingsMap] = useState({})
    const [etfStats, setEtfStats] = useState({}) // name -> { count, sum, updatedAt }
    const [loadingFile, setLoadingFile] = useState(null)
    const [loadingStored, setLoadingStored] = useState(true)
    const [storeError, setStoreError] = useState(null)

    // Gespeicherte Holdings beim Start automatisch laden
    useEffect(() => {
        let cancelled = false
        loadStoredHoldings()
            .then(list => {
                if (cancelled) return
                const map = {}
                const stats = {}
                for (const r of list) {
                    map[r.etf_name] = r.rows
                    stats[r.etf_name] = { count: r.row_count, sum: Number(r.weight_sum), updatedAt: r.updated_at }
                }
                setEtfHoldingsMap(prev => ({ ...map, ...prev }))
                setEtfStats(prev => ({ ...stats, ...prev }))
            })
            .catch(err => {
                console.warn('[X-Ray] Gespeicherte Holdings konnten nicht geladen werden:', err)
                if (!cancelled) setStoreError(err.message)
            })
            .finally(() => { if (!cancelled) setLoadingStored(false) })
        return () => { cancelled = true }
    }, [])

    // Nur aktive ETFs (verkaufte Positionen mit Menge <= 0 werden ignoriert)
    const portfolioEtfs = (holdings || []).filter(h => {
        const shares = h.shares !== undefined ? h.shares : (h.quantity !== undefined ? h.quantity : h.amount)
        if (shares !== undefined && shares <= 0) return false
        return isEtfName(h.name || h.title || '')
    })

    const readyCount = portfolioEtfs.filter(e => etfStats[e.name || e.title]).length

    const getParserForEtf = (etfName) => {
        const lower = etfName.toLowerCase()
        if (lower.includes('vanguard')) return importVanguardHoldings
        if (lower.includes('vaneck')) return importVanEckHoldings
        if (lower.includes('xtrackers')) return importXtrackersHoldings // vor 'stoxx'!
        if (lower.includes('stoxx')) return importStoxx600Holdings
        return importGenericEtfHoldings
    }

    const handleFileUpload = async (e, etfName) => {
        const file = e.target.files[0]
        e.target.value = ''
        if (!file) return

        // 1. Dateicheck, bevor irgendetwas eingelesen wird
        const fileErrors = checkFile(file)
        if (fileErrors.length) {
            alert(`„${file.name}“ wurde nicht übernommen:\n\n- ${fileErrors.join('\n- ')}`)
            return
        }

        setLoadingFile(etfName)
        setStoreError(null)
        try {
            const parsedData = await getParserForEtf(etfName)(file)
            const rows = extractHoldingRows(parsedData)
            const sum = rows.reduce((s, r) => s + r.Weight, 0)

            let metaText = ''
            try { metaText = await readFileMeta(file) } catch { /* optional */ }

            // 2. Inhaltscheck, bevor etwas übernommen oder gespeichert wird
            const { errors, warnings } = validateEtfUpload({
                etfName, rows, sum, metaText, previousCount: etfStats[etfName]?.count
            })
            if (errors.length) {
                alert(`„${file.name}“ wurde nicht übernommen:\n\n- ${errors.join('\n- ')}`)
                return
            }
            if (warnings.length && !window.confirm(
                `Auffälligkeiten bei „${file.name}“:\n\n- ${warnings.join('\n- ')}\n\nTrotzdem übernehmen und speichern?`
            )) {
                return
            }

            // 3. Erst jetzt übernehmen und speichern
            setEtfHoldingsMap(prev => ({ ...prev, [etfName]: rows }))
            setEtfStats(prev => ({ ...prev, [etfName]: { count: rows.length, sum, updatedAt: new Date().toISOString() } }))
            try {
                await saveHoldings(etfName, rows, sum)
            } catch (saveErr) {
                console.warn('[X-Ray] Speichern fehlgeschlagen:', saveErr)
                setStoreError(`Datei gelesen, aber nicht dauerhaft gespeichert: ${saveErr.message}`)
            }
        } catch (err) {
            // z. B. "Keine Holdings-Tabelle gefunden": nichts wurde übernommen
            alert(`Fehler beim Einlesen von ${file.name}: ${err.message}`)
        } finally {
            setLoadingFile(null)
        }
    }

    if (!portfolioEtfs.length) {
        return (
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b' }}>
                Keine aktiven ETFs in deinem Portfolio gefunden.
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, color: '#c8d4e0' }}>
                <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: '0 0 8px 0' }}>📁 ETF-Holdings</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>
                    Gespeicherte Holdings werden automatisch geladen. Eine neue Datei brauchst du nur für ETFs ohne Daten oder zum Aktualisieren.
                </p>
                {loadingStored && <p style={{ fontSize: 11, color: '#f59e0b', margin: '0 0 12px' }}>Gespeicherte Holdings werden geladen...</p>}
                {storeError && <p style={{ fontSize: 11, color: '#f59e0b', margin: '0 0 12px' }}>⚠ {storeError}</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {portfolioEtfs.map((etf, index) => {
                        const etfName = etf.name || etf.title || `ETF ${index + 1}`
                        const stats = etfStats[etfName]
                        const isLoading = loadingFile === etfName
                        const sumOk = stats && stats.sum >= 90 && stats.sum <= 101
                        const stale = stats && isStale(stats.updatedAt)
                        const borderColor = stats ? (sumOk && !stale ? '#22c55e' : '#f59e0b') : '#2a3a50'

                        return (
                            <div key={index} style={{ background: '#0f1420', padding: 14, borderRadius: 10, border: `1px solid ${borderColor}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={etfName}>
                                        {etfName}
                                    </p>
                                    {stats && (
                                        <span style={{ fontSize: 11, color: sumOk ? '#22c55e' : '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {sumOk ? '✓' : '⚠'} {stats.count} Pos. · Σ {stats.sum.toFixed(1)} %
                                        </span>
                                    )}
                                </div>

                                {stats && (
                                    <p style={{ fontSize: 11, color: stale ? '#f59e0b' : '#64748b', margin: '0 0 8px' }}>
                                        Stand: {fmtDate(stats.updatedAt)}{stale ? ` · älter als ${STALE_DAYS / 30} Monate, bitte aktualisieren` : ''}
                                    </p>
                                )}

                                <input
                                    type="file"
                                    accept=".xlsx, .xls, .csv"
                                    onChange={(e) => handleFileUpload(e, etfName)}
                                    style={{ fontSize: 11, color: '#888', width: '100%' }}
                                    title={stats ? 'Neue Datei hochladen, um die Holdings zu aktualisieren' : 'Holdings-Datei hochladen'}
                                />
                                {isLoading && <p style={{ fontSize: 11, color: '#f59e0b', margin: '4px 0 0' }}>Datei wird eingelesen...</p>}
                            </div>
                        )
                    })}
                </div>

                {readyCount > 0 && (
                    <p style={{ fontSize: 12, color: '#22c55e', marginTop: 16 }}>
                        ✓ {readyCount} von {portfolioEtfs.length} ETF(s) mit Daten versorgt.
                    </p>
                )}
            </div>

            {Object.keys(etfHoldingsMap).length > 0 ? (
                <PortfolioXRayView etfHoldingsMap={etfHoldingsMap} userHoldings={holdings} currentValue={currentValue} />
            ) : (
                !loadingStored && (
                    <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b' }}>
                        Bitte lade für mindestens einen aktiven ETF eine Datei hoch.
                    </div>
                )
            )}
        </div>
    )
}