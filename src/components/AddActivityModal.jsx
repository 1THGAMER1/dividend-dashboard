import React, { useState } from 'react'
import { createManualActivity } from '../utils/manualActivities'

export default function AddActivityModal({ onClose, onSuccess }) {
    const [type, setType] = useState('buy') // 'buy' | 'sell' | 'dividend'
    const [name, setName] = useState('')
    const [isin, setIsin] = useState('')
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [shares, setShares] = useState('')
    const [price, setPrice] = useState('')
    const [amount, setAmount] = useState('')
    const [fee, setFee] = useState('')
    const [tax, setTax] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // Automatisches Berechnen von Gesamtbetrag bei Shares * Price
    const handlePriceChange = (val) => {
        setPrice(val)
        if (shares && val) {
            const calculated = parseFloat(shares) * parseFloat(val)
            if (!isNaN(calculated)) setAmount(calculated.toFixed(2))
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
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
                    name: name.trim() || isin.trim() || 'Wertpapier',
                    isin: isin.trim().toUpperCase() || null,
                    assetType: 'Security'
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
                padding: 24, width: '100%', maxWidth: 480, boxSizing: 'border-box'
            }} onClick={e => e.stopPropagation()}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 17, color: '#f1f5f9', fontWeight: 700 }}>
                        ➕ Aktivität hinzufügen
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {error && (
                    <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
                        ⚠ {error}
                    </div>
                )}

                {/* Typ-Auswahl (Kauf, Verkauf, Dividende) */}
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

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={labelStyle}>Name des Wertpapiers</label>
                        <input type="text" placeholder="z.B. Apple Inc." value={name} onChange={e => setName(e.target.value)} style={inputStyle} required />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={labelStyle}>ISIN / Ticker</label>
                            <input type="text" placeholder="z.B. US0378331005" value={isin} onChange={e => setIsin(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Datum</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} required />
                        </div>
                    </div>

                    {type !== 'dividend' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <label style={labelStyle}>Anteile (Stück)</label>
                                <input type="number" step="any" placeholder="z.B. 10" value={shares} onChange={e => setShares(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Kurs (€)</label>
                                <input type="number" step="any" placeholder="z.B. 150.50" value={price} onChange={e => handlePriceChange(e.target.value)} style={inputStyle} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label style={labelStyle}>{type === 'dividend' ? 'Dividendenbetrag Gesamt (€)' : 'Gesamtbetrag (€)'}</label>
                        <input type="number" step="any" placeholder="z.B. 1505.00" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} required />
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
                        {loading ? 'Speichere...' : 'Aktivität sicher speichern'}
                    </button>
                </form>
            </div>
        </div>
    )
}