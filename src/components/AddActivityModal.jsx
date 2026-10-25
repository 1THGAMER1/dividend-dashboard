import React, { useState, useEffect } from 'react'
import { createManualActivity, updateManualActivity, deleteManualActivity } from '../utils/manualActivities'

export default function AddActivityModal({
                                             isOpen = true,
                                             onClose,
                                             onSuccess,
                                             initialActivity = null,
                                             existingHoldings = []
                                         }) {
    if (isOpen === false) return null

    const isEdit = Boolean(initialActivity?.id)

    const [type, setType] = useState('buy')
    const [datetime, setDatetime] = useState(() => new Date().toISOString().slice(0, 16))
    const [selectedAsset, setSelectedAsset] = useState(null)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [searching, setSearching] = useState(false)

    const [shares, setShares] = useState('')
    const [price, setPrice] = useState('')
    const [amount, setAmount] = useState('')
    const [fee, setFee] = useState('0')
    const [tax, setTax] = useState('0')

    const [submitting, setSubmitting] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (initialActivity) {
            setType(initialActivity.type || 'buy')
            setDatetime(initialActivity.datetime ? new Date(initialActivity.datetime).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16))
            setSelectedAsset({
                name: initialActivity.name || initialActivity.asset?.name || '',
                isin: initialActivity.isin || initialActivity.asset?.isin || '',
                assetType: initialActivity.assetType || initialActivity.asset?.assetType || 'Security'
            })
            setShares(String(initialActivity.shares || ''))
            setPrice(String(initialActivity.price || ''))
            setAmount(String(initialActivity.amount || ''))
            setFee(String(initialActivity.fee || '0'))
            setTax(String(initialActivity.tax || '0'))
            setConfirmDelete(false)
        } else {
            setType('buy')
            setDatetime(new Date().toISOString().slice(0, 16))
            setSelectedAsset(null)
            setQuery('')
            setResults([])
            setShares('')
            setPrice('')
            setAmount('')
            setFee('0')
            setTax('0')
            setConfirmDelete(false)
        }
        setError(null)
    }, [initialActivity])

    // Suche in existierenden Beständen oder über Yahoo Netlify Proxy
    useEffect(() => {
        if (!query.trim() || query.length < 2 || selectedAsset) {
            setResults([])
            return
        }

        const timer = setTimeout(async () => {
            setSearching(true)
            const q = query.toLowerCase()

            // 1. Zuerst lokale Holdings durchsuchen
            const localMatches = (existingHoldings || [])
                .filter(h => (h.name || '').toLowerCase().includes(q) || (h.isin || '').toLowerCase().includes(q) || (h.symbol || '').toLowerCase().includes(q))
                .slice(0, 5)
                .map(h => ({
                    name: h.name || h.title,
                    symbol: h.isin || h.symbol || h.id,
                    type: h.assetType || 'Holding',
                }))

            // 2. Falls Yahoo-Funktion erreichbar ist, externe Treffer ergänzen
            try {
                const res = await fetch(`/.netlify/functions/yahoo-dividends?q=${encodeURIComponent(query)}`)
                if (res.ok) {
                    const data = await res.json()
                    const yahooMatches = (data?.quotes || []).slice(0, 5).map(item => ({
                        name: item.shortname || item.longname || item.symbol,
                        symbol: item.symbol,
                        type: item.quoteType || 'Security'
                    }))
                    setResults([...localMatches, ...yahooMatches])
                    return
                }
            } catch {
                // Fallback auf lokale Matches
            }

            setResults(localMatches)
            setSearching(false)
        }, 300)

        return () => clearTimeout(timer)
    }, [query, selectedAsset, existingHoldings])

    const handleSharesChange = (val) => {
        setShares(val)
        const p = parseFloat(price.replace(',', '.')) || 0
        const s = parseFloat(val.replace(',', '.')) || 0
        if (p > 0 && s > 0) setAmount((p * s).toFixed(2))
    }

    const handlePriceChange = (val) => {
        setPrice(val)
        const p = parseFloat(val.replace(',', '.')) || 0
        const s = parseFloat(shares.replace(',', '.')) || 0
        if (p > 0 && s > 0) setAmount((p * s).toFixed(2))
    }

    const handleSelectAsset = (item) => {
        setSelectedAsset({
            name: item.name,
            isin: item.symbol,
            assetType: item.type || 'Security'
        })
        setResults([])
        setQuery('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)

        try {
            const payload = {
                type,
                datetime,
                shares: parseFloat(String(shares).replace(',', '.')) || 0,
                price: parseFloat(String(price).replace(',', '.')) || 0,
                amount: parseFloat(String(amount).replace(',', '.')) || 0,
                fee: parseFloat(String(fee).replace(',', '.')) || 0,
                tax: parseFloat(String(tax).replace(',', '.')) || 0,
                asset: selectedAsset || { name: query || 'Manuelle Buchung', isin: null, assetType: 'Security' }
            }

            if (isEdit) {
                await updateManualActivity(initialActivity.id, payload)
            } else {
                await createManualActivity(payload)
            }

            onSuccess?.()
            onClose?.()
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }

        setDeleting(true)
        setError(null)
        try {
            await deleteManualActivity(initialActivity.id)
            onSuccess?.()
            onClose?.()
        } catch (err) {
            setError(err.message)
        } finally {
            setDeleting(false)
        }
    }

    const inputStyle = {
        width: '100%',
        boxSizing: 'border-box',
        background: '#0f1420',
        border: '1px solid #1e2a3a',
        borderRadius: 8,
        padding: '8px 12px',
        color: '#f1f5f9',
        fontSize: 13,
        marginTop: 4,
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
            backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                background: '#161b27',
                border: '1px solid #2a3a50',
                borderRadius: 16,
                padding: 'clamp(16px, 3vw, 24px)',
                width: '100%',
                maxWidth: 480,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
                        {isEdit ? '✏️ Aktivität bearbeiten' : '➕ Aktivität erfassen'}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}
                    >
                        ✕
                    </button>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef444455', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                        ⚠ {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[
                            ['buy', '🟢 Kauf'],
                            ['sell', '🔴 Verkauf'],
                            ['dividend', '💰 Dividende'],
                        ].map(([t, label]) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                style={{
                                    flex: 1,
                                    background: type === t ? '#009991' : '#0f1420',
                                    color: type === t ? '#fff' : '#94a3b8',
                                    border: '1px solid #1e2a3a',
                                    borderRadius: 8,
                                    padding: '8px 4px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>DATUM & UHRZEIT</label>
                        <input
                            type="datetime-local"
                            value={datetime}
                            onChange={(e) => setDatetime(e.target.value)}
                            required
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>WERTPAPIER / ASSET</label>
                        {selectedAsset ? (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#0f1420',
                                border: '1px solid #00999155',
                                borderRadius: 8,
                                padding: '8px 12px',
                                marginTop: 4,
                            }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{selectedAsset.name}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{selectedAsset.isin}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedAsset(null)}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}
                                >
                                    Ändern
                                </button>
                            </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Name oder ISIN eingeben…"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    style={inputStyle}
                                />
                                {searching && <div style={{ position: 'absolute', right: 10, top: 12, fontSize: 11, color: '#64748b' }}>Sucht…</div>}
                                {results.length > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: '100%',
                                        background: '#0f1420',
                                        border: '1px solid #2a3a50',
                                        borderRadius: 8,
                                        marginTop: 4,
                                        maxHeight: 180,
                                        overflowY: 'auto',
                                        zIndex: 10,
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                                    }}>
                                        {results.map((item, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleSelectAsset(item)}
                                                style={{
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    borderBottom: '1px solid #1e2a3a',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = '#161b27'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{item.name}</div>
                                                    <div style={{ fontSize: 10, color: '#64748b' }}>{item.symbol}</div>
                                                </div>
                                                <span style={{ fontSize: 10, background: '#1e293b', color: '#94a3b8', padding: '2px 6px', borderRadius: 4 }}>
                                                    {item.type}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {type !== 'dividend' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>ANTEILE</label>
                                <input
                                    type="text"
                                    placeholder="z. B. 1,5"
                                    value={shares}
                                    onChange={(e) => handleSharesChange(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>KURS (€)</label>
                                <input
                                    type="text"
                                    placeholder="z. B. 150,00"
                                    value={price}
                                    onChange={(e) => handlePriceChange(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                            {type === 'dividend' ? 'DIVIDENDE BRUTTO (€)' : 'GESAMTBETRAG (€)'}
                        </label>
                        <input
                            type="text"
                            placeholder="0,00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>GEBÜHREN (€)</label>
                            <input
                                type="text"
                                placeholder="0,00"
                                value={fee}
                                onChange={(e) => setFee(e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>STEUERN (€)</label>
                            <input
                                type="text"
                                placeholder="0,00"
                                value={tax}
                                onChange={(e) => setTax(e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        {isEdit && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={deleting || submitting}
                                style={{
                                    flex: 1,
                                    background: confirmDelete ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                                    color: confirmDelete ? '#fff' : '#ef4444',
                                    border: '1px solid #ef444455',
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                {deleting ? 'Löscht…' : confirmDelete ? 'Sicher löschen?' : '🗑️ Löschen'}
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={submitting || deleting}
                            style={{
                                flex: isEdit ? 2 : 1,
                                background: '#009991',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '10px 14px',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            {submitting ? 'Speichert…' : isEdit ? '💾 Aktualisieren' : 'Aktivität speichern'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}