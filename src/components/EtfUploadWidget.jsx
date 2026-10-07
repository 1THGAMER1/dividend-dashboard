import React, { useState, useEffect } from 'react'
import {
    importVanguardHoldings,
    importVanEckHoldings,
    importStoxx600Holdings,
    importXtrackersHoldings,
    importGenericEtfHoldings,
    readFileMeta
} from '../utils/etfFileParser'
import { checkFile, validateEtfUpload, sanitizeRows } from '../utils/etfValidation'
import { etfKeyFor, loadCatalog, loadMySubmissions, submitHoldings } from '../utils/etfHoldingsStore'
import PortfolioXRayView from '../Views/PortfolioXRayView.jsx'
import { extractHoldingRows, isEtfName, getShares } from '../utils/portfolioXray'
import AdminEtfImport from "./AdminEtfImport.jsx";

const STALE_DAYS = 120
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '')
const isStale = (iso) => iso && Date.now() - new Date(iso).getTime() > STALE_DAYS * 86400000

const BADGES = {
    catalog: { text: 'Katalog', color: '#22c55e' },
    pending: { text: 'Deine Datei · wartet auf Freigabe', color: '#3b82f6' },
    local: { text: 'Nur in dieser Sitzung', color: '#f59e0b' }
}

export default function EtfUploadWidget({ holdings, currentValue }) {
    const [catalog, setCatalog] = useState({})   // freigegebene Daten (alle Nutzer)
    const [mine, setMine] = useState({})         // eigene Uploads (pending / approved / local)
    const [loadingFile, setLoadingFile] = useState(null)
    const [loadingStored, setLoadingStored] = useState(true)
    const [storeError, setStoreError] = useState(null)
    const [notice, setNotice] = useState(null)

    const portfolioEtfs = (holdings || []).filter(h => {
        const shares = getShares(h)
        if (shares !== undefined && shares <= 0) return false
        return isEtfName(h.name || h.title || '')
    })

    const keys = [...new Set(portfolioEtfs.map(etfKeyFor).filter(Boolean))]
    const keysSignature = keys.join('|')

    const entryFor = (key) => mine[key] || catalog[key]

    const reload = async () => {
        if (!keys.length) { setLoadingStored(false); return }
        try {
            const [cat, own] = await Promise.all([loadCatalog(keys), loadMySubmissions(keys)])
            setCatalog(cat)
            setMine(prev => {
                const localOnly = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.status === 'local'))
                return { ...own, ...localOnly }
            })
        } catch (err) {
            console.warn('[X-Ray] Laden fehlgeschlagen:', err)
            setStoreError(err.message)
        } finally {
            setLoadingStored(false)
        }
    }

    useEffect(() => { reload() }, [keysSignature]) // eslint-disable-line react-hooks/exhaustive-deps

    // Map für die X-Ray-Berechnung: Schlüssel = ETF-Name wie in Parqet
    const etfHoldingsMap = {}
    for (const h of portfolioEtfs) {
        const e = entryFor(etfKeyFor(h))
        if (e) etfHoldingsMap[h.name || h.title] = e.rows
    }

    const readyCount = portfolioEtfs.filter(h => entryFor(etfKeyFor(h))).length

    const getParserForEtf = (etfName) => {
        const lower = etfName.toLowerCase()
        if (lower.includes('vanguard')) return importVanguardHoldings
        if (lower.includes('vaneck')) return importVanEckHoldings
        if (lower.includes('xtrackers')) return importXtrackersHoldings // vor 'stoxx'!
        if (lower.includes('stoxx')) return importStoxx600Holdings
        return importGenericEtfHoldings
    }

    const handleFileUpload = async (e, etf) => {
        const file = e.target.files[0]
        e.target.value = ''
        if (!file) return

        const etfName = etf.name || etf.title
        const etfKey = etfKeyFor(etf)

        // 1. Dateicheck, bevor irgendetwas eingelesen wird
        const fileErrors = checkFile(file)
        if (fileErrors.length) {
            alert(`„${file.name}“ wurde nicht übernommen:\n\n- ${fileErrors.join('\n- ')}`)
            return
        }

        setLoadingFile(etfKey)
        setStoreError(null)
        setNotice(null)
        try {
            const parsedData = await getParserForEtf(etfName)(file)
            const rows = sanitizeRows(extractHoldingRows(parsedData))
            const sum = rows.reduce((s, r) => s + r.Weight, 0)

            let metaText = ''
            try { metaText = await readFileMeta(file) } catch { /* optional */ }

            // 2. Inhaltscheck, bevor etwas übernommen oder gesendet wird
            const { errors, warnings } = validateEtfUpload({
                etfName, rows, sum, metaText, previousCount: entryFor(etfKey)?.count
            })
            if (errors.length) {
                alert(`„${file.name}“ wurde nicht übernommen:\n\n- ${errors.join('\n- ')}`)
                return
            }
            if (warnings.length && !window.confirm(
                `Auffälligkeiten bei „${file.name}“:\n\n- ${warnings.join('\n- ')}\n\nTrotzdem übernehmen?`
            )) {
                return
            }

            // 3. An den Server senden (prüft erneut, Quarantäne bzw. Freigabe)
            const entry = { rows, count: rows.length, sum, updatedAt: new Date().toISOString() }
            try {
                const result = await submitHoldings({ etfKey, etfName, rows })
                setMine(prev => ({
                    ...prev,
                    [etfKey]: { ...entry, status: result.status === 'approved' ? 'approved' : 'pending' }
                }))
                setNotice(result.message || null)
                if (result.status === 'approved') await reload()
            } catch (submitErr) {
                // Datei ist gültig, aber nicht gespeichert: für diese Sitzung trotzdem nutzbar
                setMine(prev => ({ ...prev, [etfKey]: { ...entry, status: 'local' } }))
                setStoreError(`Datei übernommen, aber nicht gespeichert: ${submitErr.message}`)
            }
        } catch (err) {
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
                    Geprüfte Holdings aus dem gemeinsamen Katalog werden automatisch geladen. Für ETFs ohne Daten kannst du eine Datei hochladen:
                    Du nutzt sie sofort selbst, für alle anderen wird sie nach einer Prüfung freigegeben. Es werden nur die öffentlichen
                    Fondspositionen geteilt, nichts über dein Depot.
                </p>
                {loadingStored && <p style={{ fontSize: 11, color: '#f59e0b', margin: '0 0 12px' }}>Holdings werden geladen...</p>}
                {storeError && <p style={{ fontSize: 11, color: '#f59e0b', margin: '0 0 12px' }}>⚠ {storeError}</p>}
                {notice && <p style={{ fontSize: 11, color: '#93c5fd', margin: '0 0 12px' }}>{notice}</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {portfolioEtfs.map((etf, index) => {
                        const etfName = etf.name || etf.title || `ETF ${index + 1}`
                        const etfKey = etfKeyFor(etf)
                        const entry = entryFor(etfKey)
                        const kind = mine[etfKey]?.status === 'local' ? 'local'
                            : mine[etfKey]?.status === 'pending' ? 'pending'
                                : entry ? 'catalog' : null
                        const sumOk = entry && entry.sum >= 90 && entry.sum <= 101
                        const stale = entry && isStale(entry.updatedAt)
                        const borderColor = entry ? (sumOk && !stale && kind === 'catalog' ? '#22c55e' : BADGES[kind].color) : '#2a3a50'
                        const isLoading = loadingFile === etfKey

                        return (
                            <div key={index} style={{ background: '#0f1420', padding: 14, borderRadius: 10, border: `1px solid ${borderColor}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={etfName}>
                                        {etfName}
                                    </p>
                                    {entry && (
                                        <span style={{ fontSize: 11, color: sumOk ? '#22c55e' : '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {sumOk ? '✓' : '⚠'} {entry.count} Pos. · Σ {entry.sum.toFixed(1)} %
                                        </span>
                                    )}
                                </div>

                                {entry && (
                                    <p style={{ fontSize: 11, color: stale ? '#f59e0b' : '#64748b', margin: '0 0 8px' }}>
                                        {BADGES[kind].text} · Stand: {fmtDate(entry.updatedAt)}
                                        {stale ? ` · älter als ${STALE_DAYS / 30} Monate, bitte aktualisieren` : ''}
                                    </p>
                                )}

                                <input
                                    type="file"
                                    accept=".xlsx,.csv"
                                    onChange={(e) => handleFileUpload(e, etf)}
                                    style={{ fontSize: 11, color: '#888', width: '100%' }}
                                    title={entry ? 'Neue Datei hochladen, um die Holdings zu aktualisieren' : 'Holdings-Datei hochladen'}
                                />
                                {isLoading && <p style={{ fontSize: 11, color: '#f59e0b', margin: '4px 0 0' }}>Datei wird geprüft...</p>}
                            </div>
                        )
                    })}
                </div>

                {readyCount > 0 && (
                    <p style={{ fontSize: 12, color: '#22c55e', marginTop: 16 }}>
                        ✓ {readyCount} von {portfolioEtfs.length} ETF(s) mit Daten versorgt.
                    </p>
                )}
                <AdminEtfImport />
            </div>

            {Object.keys(etfHoldingsMap).length > 0 ? (
                <PortfolioXRayView etfHoldingsMap={etfHoldingsMap} userHoldings={holdings} currentValue={currentValue} />
            ) : (
                !loadingStored && (
                    <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b' }}>
                        Für deine ETFs liegen noch keine Daten vor. Bitte lade für mindestens einen ETF eine Datei hoch.
                    </div>
                )
            )}
        </div>
    )
}