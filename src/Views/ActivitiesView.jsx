import React, { useEffect, useMemo, useState } from 'react'
import { fetchAllDbActivities, syncParqetToSupabase, repairActivityNames } from '../utils/manualActivities'
import AddActivityModal from '../components/AddActivityModal.jsx'

const fmt = (n) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .format(Number(n || 0))
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const monthLabel = (iso) => new Date(iso).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

const TYPES = {
    buy:          { label: 'KAUF',          color: '#22c55e', sign: -1 },
    sell:         { label: 'VERKAUF',       color: '#ef4444', sign: 1 },
    dividend:     { label: 'DIVIDENDE',     color: '#fbbf24', sign: 1 },
    interest:     { label: 'ZINSEN',        color: '#fbbf24', sign: 1 },
    deposit:      { label: 'EINZAHLUNG',    color: '#38bdf8', sign: 1 },
    withdrawal:   { label: 'AUSZAHLUNG',    color: '#38bdf8', sign: -1 },
    transfer_in:  { label: 'EINBUCHUNG',    color: '#a78bfa', sign: 0 },
    transfer_out: { label: 'AUSBUCHUNG',    color: '#a78bfa', sign: 0 },
    fees_taxes:   { label: 'GEBÜHR/STEUER', color: '#94a3b8', sign: -1 },
}

const FILTERS = [
    ['all', 'Alle'],
    ['buy', 'Käufe'],
    ['sell', 'Verkäufe'],
    ['dividend', 'Dividenden'],
    ['manual', '✍️ Manuell'],
    ['other', 'Sonstige'],
]

const matchesFilter = (row, f) => {
    if (f === 'all') return true
    if (f === 'manual') return Boolean(row.isManual)
    if (f === 'other') return !['buy', 'sell', 'dividend'].includes(row.type)
    return row.type === f
}

const PAGE = 100

const chip = (active) => ({
    background: active ? '#009991' : '#0f1420',
    color: active ? '#fff' : '#93c5fd',
    border: '1px solid #2a3a50',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
})

const card = {
    background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16,
    padding: 'clamp(14px, 3vw, 20px)',
}

export default function ActivitiesView({ holdings = [], enrichedHoldings = [] }) {
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [repairing, setRepairing] = useState(false)
    const [error, setError] = useState(null)
    const [filter, setFilter] = useState('all')
    const [query, setQuery] = useState('')
    const [visible, setVisible] = useState(PAGE)

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState(null)

    // Name-Map aus Positionen aufbauen (ISIN -> Klarname)
    const names = useMemo(() => {
        const m = {}
        ;[...(holdings || []), ...(enrichedHoldings || [])].forEach(h => {
            const n = h.name || h.title
            if (!n) return
                ;[h.id, h.isin, h.holdingId, h.symbol].filter(Boolean).forEach(k => {
                m[String(k).toUpperCase()] = n
            })
        })
        return m
    }, [holdings, enrichedHoldings])

    const hasNamesMap = Object.keys(names).length > 0

    const loadFromSupabase = async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await fetchAllDbActivities()
            setRows(data)
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    // WICHTIG: names-Map wird jetzt korrekt an den Sync übergeben!
    const handleSync = async () => {
        setSyncing(true)
        setError(null)
        try {
            await syncParqetToSupabase(names)
            const updated = await fetchAllDbActivities()
            setRows(updated)
        } catch (e) {
            setError('Sync fehlgeschlagen: ' + e.message)
        } finally {
            setSyncing(false)
        }
    }

    // Reparatur-Funktion für bereits kaputte Einträge (Name = ISIN)
    const handleRepairNames = async () => {
        if (!hasNamesMap) {
            setError('Keine Positionen geladen – Namen können aktuell nicht aufgelöst werden.')
            return
        }
        setRepairing(true)
        setError(null)
        try {
            const result = await repairActivityNames(names)
            const updated = await fetchAllDbActivities()
            setRows(updated)
            if (result.fixedCount > 0) {
                alert(`✓ ${result.fixedCount} von ${result.total} Aktivitäten wurden korrigiert.`)
            } else {
                alert('Es wurden keine fehlerhaften Namen gefunden.')
            }
        } catch (e) {
            setError('Reparatur fehlgeschlagen: ' + e.message)
        } finally {
            setRepairing(false)
        }
    }

    useEffect(() => {
        loadFromSupabase()
    }, [])

    // Zeigt, ob ein Eintrag fehlerhaft ist (Name == ISIN)
    const isBrokenName = (r) => {
        if (!r.isin || !r.name) return false
        return r.isin.toUpperCase() === r.name.toUpperCase()
    }

    const brokenCount = useMemo(() => rows.filter(isBrokenName).length, [rows])

    const counts = useMemo(() => {
        const c = {}
        FILTERS.forEach(([f]) => { c[f] = rows.filter(r => matchesFilter(r, f)).length })
        return c
    }, [rows])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return rows
            .filter(r => matchesFilter(r, filter))
            .filter(r => !q || (r.name || '').toLowerCase().includes(q) || (r.isin || '').toLowerCase().includes(q))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    }, [rows, filter, query])

    useEffect(() => { setVisible(PAGE) }, [filter, query])

    const sum = (type) => filtered.filter(r => r.type === type).reduce((s, r) => s + r.amount, 0)
    const shown = filtered.slice(0, visible)

    if (loading && rows.length === 0) {
        return <div style={{ ...card, color: '#64748b', fontSize: 13 }}>Lade Aktivitäten…</div>
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={card}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                    {FILTERS.map(([f, label]) => (
                        <button key={f} onClick={() => setFilter(f)} style={chip(filter === f)}>
                            {label} <span style={{ opacity: 0.7 }}>({counts[f] ?? 0})</span>
                        </button>
                    ))}
                    <span style={{ flex: 1 }} />

                    <button
                        onClick={() => { setEditingItem(null); setIsModalOpen(true) }}
                        style={{ ...chip(false), background: '#009991', color: '#fff', border: 'none' }}
                    >
                        + Neu
                    </button>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        style={{ ...chip(false), opacity: syncing ? 0.6 : 1 }}
                        title="Neue Buchungen aus Parqet in deine Datenbank übertragen"
                    >
                        {syncing ? '⏳ Sync läuft…' : '🔄 Mit Parqet abgleichen'}
                    </button>
                </div>

                {/* Warnbanner, falls fehlerhafte Namen gefunden wurden */}
                {brokenCount > 0 && (
                    <div style={{
                        background: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                    }}>
                        <span style={{ fontSize: 12, color: '#fbbf24' }}>
                            ⚠ {brokenCount} Aktivität{brokenCount !== 1 ? 'en zeigen' : ' zeigt'} nur die ISIN statt des Namens an.
                        </span>
                        <button
                            onClick={handleRepairNames}
                            disabled={repairing || !hasNamesMap}
                            style={{
                                background: '#fbbf24',
                                color: '#1a1200',
                                border: 'none',
                                borderRadius: 6,
                                padding: '5px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: hasNamesMap ? 'pointer' : 'not-allowed',
                                opacity: hasNamesMap ? 1 : 0.5,
                            }}
                            title={!hasNamesMap ? 'Positionen werden noch geladen…' : 'Namen jetzt automatisch korrigieren'}
                        >
                            {repairing ? 'Repariere…' : '🛠 Namen reparieren'}
                        </button>
                    </div>
                )}

                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Suchen nach Name oder ISIN…"
                    style={{ width: '100%', boxSizing: 'border-box', background: '#0f1420', color: '#e0e6f0', border: '1px solid #2a3a50', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
                    {[
                        ['Einträge', String(filtered.length), '#f1f5f9'],
                        ['Käufe', fmt(sum('buy')), '#f1f5f9'],
                        ['Verkäufe', fmt(sum('sell')), '#f1f5f9'],
                        ['Dividenden (netto)', fmt(sum('dividend')), '#22c55e'],
                    ].map(([label, value, color]) => (
                        <div key={label} style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: '8px 10px' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color, marginTop: 2 }}>{value}</div>
                        </div>
                    ))}
                </div>

                {error && (
                    <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>
                        ⚠ {error}
                    </div>
                )}
            </div>

            {shown.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Keine Aktivitäten gefunden.</div>
            ) : (
                <div style={{ ...card, padding: 'clamp(8px, 2vw, 14px)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {shown.map((r, i) => {
                        const t = TYPES[r.type] || { label: r.type.toUpperCase() || 'SONSTIGES', color: '#94a3b8', sign: 0 }
                        const monthChanged = i === 0 || r.date?.slice(0, 7) !== shown[i - 1].date?.slice(0, 7)
                        const sign = t.sign > 0 ? '+' : t.sign < 0 ? '−' : ''
                        const isTrade = ['buy', 'sell'].includes(r.type)
                        const broken = isBrokenName(r)
                        const displayName = broken && names[r.isin?.toUpperCase()] ? names[r.isin.toUpperCase()] : r.name

                        return (
                            <React.Fragment key={r.id}>
                                {monthChanged && r.date && (
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: i === 0 ? '0 0 2px' : '10px 0 2px' }}>
                                        {monthLabel(r.date)}
                                    </div>
                                )}
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                        <span style={{ background: `${t.color}26`, color: t.color, border: `1px solid ${t.color}55`, borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, minWidth: 74, textAlign: 'center', flexShrink: 0 }}>
                                            {t.label}
                                        </span>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: broken ? '#fbbf24' : '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayName}>
                                                {displayName} {broken && <span style={{ fontSize: 9, fontWeight: 400 }}>⚠</span>}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                <span>{fmtDate(r.date)}</span>
                                                {r.isin && <span style={{ fontFamily: 'monospace' }}>{r.isin}</span>}
                                                {r.isManual && (
                                                    <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                                        MANUELL
                                                    </span>
                                                )}
                                                {isTrade && r.shares > 0 && <span>· {r.shares.toLocaleString('de-DE', { maximumFractionDigits: 4 })} Anteile zu {fmt(r.price)}</span>}
                                                {r.type === 'dividend' && r.tax > 0 && <span>· Brutto {fmt(r.gross)}, Steuer {fmt(r.tax)}</span>}
                                                {isTrade && (r.fee > 0 || r.tax > 0) && (
                                                    <span>· {r.fee > 0 ? `Gebühr ${fmt(r.fee)}` : ''}{r.fee > 0 && r.tax > 0 ? ', ' : ''}{r.tax > 0 ? `Steuer ${fmt(r.tax)}` : ''}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: t.sign > 0 ? '#22c55e' : '#f1f5f9', textAlign: 'right' }}>
                                            {r.amount > 0 || t.sign === 0 ? `${sign}${fmt(r.amount)}` : '—'}
                                        </div>

                                        {r.isManual && (
                                            <button
                                                onClick={() => { setEditingItem(r); setIsModalOpen(true) }}
                                                title="Aktivität bearbeiten oder löschen"
                                                style={{
                                                    background: '#1e293b',
                                                    border: '1px solid #334155',
                                                    color: '#94a3b8',
                                                    borderRadius: 6,
                                                    padding: '4px 7px',
                                                    fontSize: 11,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                ✏️
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        )
                    })}

                    {filtered.length > visible && (
                        <button onClick={() => setVisible(v => v + PAGE)} style={{ ...chip(false), marginTop: 6, alignSelf: 'center' }}>
                            Weitere {Math.min(PAGE, filtered.length - visible)} anzeigen ({filtered.length - visible} übrig)
                        </button>
                    )}
                </div>
            )}

            <AddActivityModal
                isOpen={isModalOpen}
                initialActivity={editingItem}
                onClose={() => { setIsModalOpen(false); setEditingItem(null) }}
                onSuccess={loadFromSupabase}
                existingHoldings={[...(holdings || []), ...(enrichedHoldings || [])]}
            />
        </div>
    )
}