import React, { useState } from 'react'
import {
    importVanguardHoldings,
    importVanEckHoldings,
    importStoxx600Holdings,
    importXtrackersHoldings,
    importGenericEtfHoldings
} from '../utils/etfFileParser'
import { extractHoldingRows, isEtfName } from '../utils/portfolioXray'
import PortfolioXRayView from '../Views/PortfolioXRayView.jsx'

export default function EtfUploadWidget({ holdings, currentValue }) {
    const [etfHoldingsMap, setEtfHoldingsMap] = useState({})
    const [etfStats, setEtfStats] = useState({}) // name -> { count, sum }
    const [loadingFile, setLoadingFile] = useState(null)

    const uploadedFiles = Object.keys(etfStats)

    // Nur aktive ETFs (verkaufte Positionen mit Menge <= 0 werden ignoriert)
    const portfolioEtfs = (holdings || []).filter(h => {
        const shares = h.shares !== undefined ? h.shares : (h.quantity !== undefined ? h.quantity : h.amount)
        if (shares !== undefined && shares <= 0) return false
        return isEtfName(h.name || h.title || '')
    })

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
        e.target.value = '' // gleiche Datei darf erneut gewählt werden
        if (!file) return

        setLoadingFile(etfName)
        try {
            const parsedData = await getParserForEtf(etfName)(file)
            console.info('[X-Ray]', etfName, '→ Rohdaten, erste 2 Zeilen:', Array.isArray(parsedData) ? parsedData.slice(0, 2) : parsedData)

            let rows = extractHoldingRows(parsedData)
            if (!rows.length) {
                throw new Error('Keine Zeilen mit Name und Gewicht gefunden. Wahrscheinlich passen Parser oder Spaltenüberschriften nicht (siehe Konsole).')
            }

            // Anteile als Bruchteile (z. B. 0,052) auf Prozent umrechnen
            let sum = rows.reduce((s, r) => s + r.Weight, 0)
            if (sum <= 1.5) {
                rows = rows.map(r => ({ ...r, Weight: r.Weight * 100 }))
                sum *= 100
            }

            setEtfHoldingsMap(prev => ({ ...prev, [etfName]: rows }))
            setEtfStats(prev => ({ ...prev, [etfName]: { count: rows.length, sum } }))
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
                <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: '0 0 8px 0' }}>📁 ETF-Holdings für dein Portfolio hochladen</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>
                    Hier erscheinen nur deine aktiven Depot-ETFs (verkaufte Positionen werden automatisch ausgeblendet).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {portfolioEtfs.map((etf, index) => {
                        const etfName = etf.name || etf.title || `ETF ${index + 1}`
                        const stats = etfStats[etfName]
                        const isLoading = loadingFile === etfName
                        const sumOk = stats && stats.sum >= 90 && stats.sum <= 101

                        return (
                            <div key={index} style={{ background: '#0f1420', padding: 14, borderRadius: 10, border: `1px solid ${stats ? (sumOk ? '#22c55e' : '#f59e0b') : '#2a3a50'}` }}>
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

                                <input
                                    type="file"
                                    accept=".xlsx, .xls, .csv"
                                    onChange={(e) => handleFileUpload(e, etfName)}
                                    style={{ fontSize: 11, color: '#888', width: '100%' }}
                                />
                                {isLoading && <p style={{ fontSize: 11, color: '#f59e0b', margin: '4px 0 0' }}>Datei wird eingelesen...</p>}
                            </div>
                        )
                    })}
                </div>

                {uploadedFiles.length > 0 && (
                    <p style={{ fontSize: 12, color: '#22c55e', marginTop: 16 }}>
                        ✓ {uploadedFiles.length} von {portfolioEtfs.length} ETF(s) mit Daten versorgt.
                    </p>
                )}
            </div>

            {uploadedFiles.length > 0 ? (
                <PortfolioXRayView etfHoldingsMap={etfHoldingsMap} userHoldings={holdings} currentValue={currentValue} />
            ) : (
                <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b' }}>
                    Bitte lade für mindestens einen aktiven ETF eine Datei hoch.
                </div>
            )}
        </div>
    )
}