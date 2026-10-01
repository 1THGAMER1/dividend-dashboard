import React, { useState } from 'react'
import {
    importVanguardHoldings,
    importVanEckHoldings,
    importStoxx600Holdings,
    importXtrackersHoldings
} from '../utils/etfFileParser'
import PortfolioXRayView from '../Views/PortfolioXRayView.jsx'
import { normalizeName } from '../utils/portfolioXray'

export default function EtfUploadWidget({ holdings, currentValue }) {
    const [etfHoldingsMap, setEtfHoldingsMap] = useState({})
    const [loadingFile, setLoadingFile] = useState(null)
    const [uploadedFiles, setUploadedFiles] = useState([])

    const handleFileUpload = async (e, key, parserFn) => {
        const file = e.target.files[0]
        if (!file) return

        setLoadingFile(key)
        try {
            const parsedData = await parserFn(file)
            setEtfHoldingsMap(prev => ({ ...prev, [key]: parsedData }))
            if (!uploadedFiles.includes(key)) {
                setUploadedFiles(prev => [...prev, key])
            }
        } catch (err) {
            alert(`Fehler beim Einlesen von ${file.name}: ${err.message}`)
        } finally {
            setLoadingFile(null)
        }
    }

    // Prüfen, welche ETFs tatsächlich im Portfolio des Nutzers existieren
    const activePortfolioNames = (holdings || []).map(h => normalizeName(h.name || h.title || ''))

    // Filtere die Map, sodass nur ETFs übrig bleiben, die auch im Depot sind
    const filteredEtfMap = {}
    for (const [etfName, data] of Object.entries(etfHoldingsMap)) {
        const normalizedKey = normalizeName(etfName)
        // Prüfen, ob der ETF-Name in den Holdings vorkommt (oder Teil davon ist)
        const existsInPortfolio = activePortfolioNames.some(pName => pName.includes(normalizedKey) || normalizedKey.includes(pName))

        if (existsInPortfolio) {
            filteredEtfMap[etfName] = data
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, color: '#c8d4e0' }}>
                <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: '0 0 8px 0' }}>📁 ETF-Holdings hochladen (Excel)</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>
                    Lade deine ETF-Dateien hoch. Es werden automatisch nur die ETFs berücksichtigt, die sich aktuell in deinem Portfolio befinden.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    <div style={{ background: '#0f1420', padding: 12, borderRadius: 10, border: '1px solid #2a3a50' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px 0', color: '#93c5fd' }}>Vanguard High Dividend</p>
                        <input type="file" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'Vanguard FTSE All-World High Dividend Yield UCITS ETF', importVanguardHoldings)} style={{ fontSize: 11, color: '#888' }} />
                        {loadingFile === 'Vanguard FTSE All-World High Dividend Yield UCITS ETF' && <span style={{ fontSize: 11, color: '#f59e0b' }}> Lädt...</span>}
                    </div>

                    <div style={{ background: '#0f1420', padding: 12, borderRadius: 10, border: '1px solid #2a3a50' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px 0', color: '#93c5fd' }}>VanEck Dividend / Defense</p>
                        <input type="file" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'VanEck', importVanEckHoldings)} style={{ fontSize: 11, color: '#888' }} />
                        {loadingFile === 'VanEck' && <span style={{ fontSize: 11, color: '#f59e0b' }}> Lädt...</span>}
                    </div>

                    <div style={{ background: '#0f1420', padding: 12, borderRadius: 10, border: '1px solid #2a3a50' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px 0', color: '#93c5fd' }}>STOXX 600</p>
                        <input type="file" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'STOXX Europe 600', importStoxx600Holdings)} style={{ fontSize: 11, color: '#888' }} />
                        {loadingFile === 'STOXX Europe 600' && <span style={{ fontSize: 11, color: '#f59e0b' }}> Lädt...</span>}
                    </div>

                    <div style={{ background: '#0f1420', padding: 12, borderRadius: 10, border: '1px solid #2a3a50' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px 0', color: '#93c5fd' }}>Xtrackers Consumer Staples</p>
                        <input type="file" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'Xtrackers', importXtrackersHoldings)} style={{ fontSize: 11, color: '#888' }} />
                        {loadingFile === 'Xtrackers' && <span style={{ fontSize: 11, color: '#f59e0b' }}> Lädt...</span>}
                    </div>
                </div>

                {uploadedFiles.length > 0 && (
                    <div style={{ marginTop: 12, fontSize: 12 }}>
                        <span style={{ color: '#22c55e' }}>✓ {uploadedFiles.length} Datei(en) hochgeladen. </span>
                        <span style={{ color: '#94a3b8' }}>Aktive Portfolio-Übereinstimmungen: {Object.keys(filteredEtfMap).length}</span>
                    </div>
                )}
            </div>

            {Object.keys(filteredEtfMap).length > 0 ? (
                <PortfolioXRayView etfHoldingsMap={filteredEtfMap} userHoldings={holdings} currentValue={currentValue} />
            ) : (
                <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b' }}>
                    {uploadedFiles.length === 0
                        ? 'Bitte lade mindestens eine Excel-Datei hoch.'
                        : 'Keiner der hochgeladenen ETFs stimmt mit den Positionen in deinem aktuellen Portfolio überein.'}
                </div>
            )}
        </div>
    )
}