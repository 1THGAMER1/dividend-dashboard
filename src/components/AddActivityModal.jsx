import React, { useState, useEffect, useRef } from 'react'
import { createManualActivity } from '../utils/manualActivities'
import { searchAssets, fetchYahooDividends, fetchSingleCryptoPrice } from '../api'

export default function AddActivityModal({ onClose, onSuccess, existingHoldings = [] }) {
    const [type, setType] = useState('buy') // 'buy' | 'sell' | 'dividend'
    const [selectedAsset, setSelectedAsset] = useState(null)

    // Such-States
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [searching, setSearching] = useState(false)
    const debounceRef = useRef(null)

    // Formular-States
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [shares, setShares] = useState('')
    const [price, setPrice] = useState('')
    const [amount, setAmount] = useState('')
    const [fee, setFee] = useState('')
    const [tax, setTax] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // Live-Suche mit 300ms Debounce
    useEffect(() => {
        if (selectedAsset) return
        if (searchQuery.trim().length < 2) {
            setSearchResults([])
            setSearching(false)
            return
        }

        setSearching(true)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            const results = await searchAssets(searchQuery)
            setSearchResults(results)
            setSearching(false)
        }, 300)

        return () => clearTimeout(debounceRef.current)
    }, [searchQuery, selectedAsset])

    const handleSelectAsset = async (asset) => {
        setSelectedAsset(asset)
        setSearchQuery('')
        setSearchResults([])
        setError(null)

        const isCrypto = asset.rawType === 'Crypto' || asset.type === 'Krypto'

        try {
            let livePrice = null

            if (isCrypto) {
                // Krypto-Kurs direkt von CoinMarketCap in EUR holen
                livePrice = await fetchSingleCryptoPrice(asset.symbol)
            } else {
                // Aktien & ETFs von Yahoo Finance holen
                const data = await fetchYahooDividends(asset.symbol)
                livePrice = data?.price || null
            }

            if (livePrice && livePrice > 0) {
                // Bei Krypto mehr Nachkommastellen erlauben (z. B. bei Altcoins), bei Aktien 2 Stellen
                const formattedPrice = livePrice >= 1 ? livePrice.toFixed(2) : livePrice.toFixed(6)
                setPrice(formattedPrice)
                if (shares) {
                    setAmount((parseFloat(shares) * livePrice).toFixed(2))
                }
            }
        } catch (e) {
            console.warn('[AddActivityModal] Kursabruf fehlgeschlagen:', e)
        }
    }

    // Automatische Betragsberechnung bei Anteile * Kurs
    const handleSharesChange = (val) => {
        setShares(val)
        if (val && price) {
            const calculated = parseFloat(val) * parseFloat(price)
            if (!isNaN(calculated)) setAmount(calculated.toFixed(2))
        }
    }

    const handlePriceChange = (val) => {
        setPrice(val)
        if (shares && val) {
            const calculated = parseFloat(shares) * parseFloat(val)
            if (!isNaN(calculated)) setAmount(calculated.toFixed(2))
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!selectedAsset) {
            setError('Bitte wähle zuerst ein verifiziertes Wertpapier aus.')
            return
        }
        if (!amount || isNaN(parseFloat(amount))) {
            setError('Bitte gib einen gültigen Gesamtbetrag ein.')
            return
        }

        setLoading(true)
        setError(null)
        try {
            await createManualActivity({
                type,
                datetime: `${date}T12:00:00.000Z`,
                shares: shares ? parseFloat(shares) : 0,
                price: price ? parseFloat(price) : 0,
                amount: parseFloat(amount),
                fee: fee ? parseFloat(fee) : 0,
                tax: tax ? parseFloat(tax) : 0,
                asset: {
                    name: selectedAsset.name,
                    isin: selectedAsset.symbol, // Yahoo-Symbol/Ticker als eindeutiger Schlüssel
                    assetType: selectedAsset.rawType || 'Security'
                }
            })
            onSuccess?.()
            onClose()
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const inputStyle = {
        background: '#0f1420',
        border: '1px solid #2a3a50',
        borderRadius: 8,
        padding: '10px 12px',
        color: '#f1f5f9',
        fontSize: 13,
        width: '100%',
        boxSizing: 'border-box',
        marginTop: 4
    }

    const labelStyle = { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16
        }} onClick={onClose}>
            <div style={{
                background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16,
                padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box'
            }} onClick={e => e.stopPropagation()}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 17, color: '#f1f5f9', fontWeight: 700 }}>
                        ➕ Aktivität erfassen
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {error && (
                    <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
                        ⚠ {error}
                    </div>
                )}

                {/* 1. TYP-AUSWAHL */}
                <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 10, border: '1px solid #1e2a3a', marginBottom: 16 }}>
                    {[
                        ['buy', '🟢 Kauf'],
                        ['sell', '🔴 Verkauf'],
                        ['dividend', '💰 Dividende']
                    ].map(([t, lbl]) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setType(t)}
                            style={{
                                flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                background: type === t ? '#1e3a5f' : 'transparent',
                                color: type === t ? '#38bdf8' : '#64748b'
                            }}
                        >
                            {lbl}
                        </button>
                    ))}
                </div>

                {/* 2. ASSET-AUSWAHL: GEWÄHLTES ASSET ODER SUCHE */}
                {selectedAsset ? (
                    <div style={{
                        background: '#0f1420', border: '1px solid #22c55e40', borderRadius: 10,
                        padding: '12px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{selectedAsset.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {selectedAsset.symbol} · {selectedAsset.type} {selectedAsset.exchange ? `(${selectedAsset.exchange})` : ''}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setSelectedAsset(null); setPrice(''); setAmount('') }}
                            style={{ background: '#1e293b', border: 'none', color: '#38bdf8', fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                        >
                            Ändern
                        </button>
                    </div>
                ) : (
                    <div style={{ marginBottom: 16 }}>
                        {/* SCHNELLAUSWAHL AUS BESTEHENDEN BESTÄNDEN */}
                        {existingHoldings.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <label style={labelStyle}>Aus deinen Beständen wählen:</label>
                                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 0', maxWidth: '100%' }}>
                                    {existingHoldings.slice(0, 6).map((h, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                const rawType = (h.type || '').toLowerCase()
                                                const isCrypto = rawType.includes('crypto') ||
                                                    rawType.includes('krypto') ||
                                                    rawType.includes('coin') ||
                                                    ['BTC', 'ETH', 'SOL'].some(c => (h.isin || '').toUpperCase().includes(c))

                                                // Sauberes Symbol für CMC extrahieren (z. B. "BTC" statt "BTC-EUR" oder "hld_...")
                                                const cleanSym = (h.isin || h.ticker || h.id || '')
                                                    .toUpperCase()
                                                    .replace(/-EUR$/, '')
                                                    .replace(/^HLD_.*$/, h.name || '')

                                                handleSelectAsset({
                                                    name: h.name || cleanSym,
                                                    symbol: cleanSym,
                                                    type: isCrypto ? 'Krypto' : (h.type || 'Wertpapier'),
                                                    rawType: isCrypto ? 'Crypto' : 'Security',
                                                })
                                            }}
                                            style={{
                                                background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 8,
                                                padding: '5px 10px', color: '#e0e6f0', fontSize: 11, fontWeight: 500,
                                                whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0
                                            }}
                                        >
                                            {h.name || h.isin}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* LIVE-SUCHFELD */}
                        <div style={{ position: 'relative' }}>
                            <label style={labelStyle}>Wertpapier suchen (Name, Ticker, ISIN)</label>
                            <input
                                type="text"
                                placeholder="z.B. Apple, Microsoft, BTC, IE00B..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={inputStyle}
                                autoFocus
                            />
                            {searching && (
                                <span style={{ position: 'absolute', right: 12, top: 32, fontSize: 11, color: '#64748b' }}>Suche…</span>
                            )}

                            {/* SUCH-ERGEBNISSE DROPDOWN */}
                            {searchResults.length > 0 && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                                    background: '#0f1420', border: '1px solid #2a3a50', borderRadius: 8,
                                    marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                }}>
                                    {searchResults.map((res, i) => (
                                        <div
                                            key={i}
                                            onClick={() => handleSelectAsset(res)}
                                            style={{
                                                padding: '10px 12px', borderBottom: '1px solid #1e2a3a', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#1a2233'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {res.name}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                                    {res.symbol} {res.exchange ? `· ${res.exchange}` : ''}
                                                </div>
                                            </div>
                                            <span style={{ background: '#1e293b', color: '#38bdf8', fontSize: 10, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                                                {res.type}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. DETAILS NUR ANZEIGEN, WENN EIN ASSET GEWÄHLT IST */}
                {selectedAsset && (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>Datum</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} required />
                        </div>

                        {type !== 'dividend' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                    <label style={labelStyle}>Anteile (Stück)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        placeholder="z.B. 10"
                                        value={shares}
                                        onChange={e => handleSharesChange(e.target.value)}
                                        style={inputStyle}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Kurs (€)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        placeholder="z.B. 150.50"
                                        value={price}
                                        onChange={e => handlePriceChange(e.target.value)}
                                        style={inputStyle}
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label style={labelStyle}>{type === 'dividend' ? 'Auszahlungsbetrag Netto (€)' : 'Gesamtbetrag (€)'}</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="z.B. 1505.00"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                style={inputStyle}
                                required
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <label style={labelStyle}>Gebühren (€)</label>
                                <input type="number" step="any" placeholder="0.00" value={fee} onChange={e => setFee(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Steuern (€)</label>
                                <input type="number" step="any" placeholder="0.00" value={tax} onChange={e => setTax(e.target.value)} style={inputStyle} />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                marginTop: 10, background: '#009991', color: '#fff', border: 'none', borderRadius: 8,
                                padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s ease'
                            }}
                        >
                            {loading ? 'Speichere…' : 'Aktivität sicher erfassen'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}