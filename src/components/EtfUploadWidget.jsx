import React, { useState } from 'react'
import {
    importVanguardHoldings,
    importVanEckHoldings,
    importStoxx600Holdings,
    importXtrackersHoldings,
    importGenericEtfHoldings
} from '../utils/etfFileParser'

import PortfolioXRayView from "../Views/PortfolioXRayView.jsx";
import { normalizeName } from "../utils/portfolioXray.js"

export default function EtfUploadWidget({ holdings, currentValue }) {
    const [etfHoldingsMap, setEtfHoldingsMap] = useState({})
    const [loadingFile, setLoadingFile] = useState(null)
    const [uploadedFiles, setUploadedFiles] = useState([])

    // 1. Filtere alle Positionen aus deinen Holdings heraus, die ETFs sind
    const portfolioEtfs = (holdings || []).filter(h => {
        const name = (h.name || h.title || '').toLowerCase()
        return name.includes('etf') || name.includes('ucits') || name.includes('msci') || name.includes('stoxx')
    })

    // Universeller Parser-Mapper je nach ETF-Namen
    const getParserForEtf = (etfName) => {
        const lower = etfName.toLowerCase()
        if (lower.includes('vanguard')) return importVanguardHoldings
        if (lower.includes('vaneck')) return importVanEckHoldings
        if (lower.includes('stoxx')) return importStoxx600Holdings
        if (lower.includes('xtrackers')) return importXtrackersHoldings
        return importGenericEtfHoldings
    }

    const handleFileUpload = async (e, etfName) => {
        const file = e.target.files[0]
        if (!file) return

        setLoadingFile(etfName)
        try {
            const parserFn = getParserForEtf(etfName)
            const parsedData = await parserFn(file)

            setEtfHoldingsMap(prev => ({
                ...prev,
                [etfName]: parsedData
            }))

            if (!uploadedFiles.includes(etfName)) {
                setUploadedFiles(prev => [...prev, etfName])
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
                Keine ETFs in deinem aktuellen Portfolio gefunden.
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, color: '#c8d4e0' }}>
                <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: '0 0 8px 0' }}>📁 ETF-Holdings für dein Portfolio hochladen</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>
                    Hier siehst du automatisch alle ETFs, die aktuell in deinem Depot liegen. Lade für diese die entsprechenden Excel-Dateien hoch, um den X-Ray zu starten.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {portfolioEtfs.map((etf, index) => {
                        const etfName = etf.name || etf.title || `ETF ${index + 1}`
                        const isUploaded = uploadedFiles.includes(etfName)
                        const isLoading = loadingFile === etfName

                        return (
                            <div key={index} style={{ background: '#0f1420', padding: 14, borderRadius: 10, border: `1px solid ${isUploaded ? '#22c55e' : '#2a3a50'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={etfName}>
                                        {etfName}
                                    </p>
                                    {isUploaded && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Bereit</span>}
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

            {/* X-Ray Ansicht wird aktiv, sobald mindestens eine Datei für ein echtes Portfolio-ETF hochgeladen wurde */}
            {uploadedFiles.length > 0 ? (
                <PortfolioXRayView etfHoldingsMap={etfHoldingsMap} userHoldings={holdings} currentValue={currentValue} />
            ) : (
                <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b' }}>
                    Bitte lade für mindestens einen deiner Portfolio-ETFs die Excel-Datei hoch, um die X-Ray-Durchleuchtung zu sehen.
                </div>
            )}
        </div>
    )
}