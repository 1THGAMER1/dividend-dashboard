import React, { useEffect, useState, useMemo } from 'react'
import {
    ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts'
import { fetchStockDetails } from '../api'
import { etfKeyFor, loadCatalog, loadMySubmissions } from '../utils/etfHoldingsStore'
import { isEtfName } from '../utils/portfolioXray'

const RANGES = [
    { id: '1M', label: '1M', months: 1 },
    { id: '6M', label: '6M', months: 6 },
    { id: '1Y', label: '1J', months: 12 },
    { id: '3Y', label: '3J', months: 36 },
    { id: 'MAX', label: 'Max', months: null },
]

const fmtEur = (n) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0)

const fmtNum = (n, dec = 2) =>
    n == null ? '—' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtPct = (n) =>
    n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(2).replace('.', ',')} %`

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const formatMarketCap = (num) => {
    if (!num) return '—'
    if (num >= 1e12) return `${(num / 1e12).toFixed(2).replace('.', ',')} Bio. €`
    if (num >= 1e9)  return `${(num / 1e9).toFixed(2).replace('.', ',')} Mrd. €`
    if (num >= 1e6)  return `${(num / 1e6).toFixed(2).replace('.', ',')} Mio. €`
    return fmtEur(num)
}

let _cachedCatalog = null

export default function StockDetailView({
                                            stock,
                                            onBack,
                                            allHoldings = [],
                                            buyActs = [],
                                            sellActs = [],
                                            byHolding = {},
                                            totalPortfolioValue = 0,
                                        }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [chartRange, setChartRange] = useState('1Y')
    const [chartMode, setChartMode] = useState('price') // 'price' | 'value'
    const [etfCatalog, setEtfCatalog] = useState(_cachedCatalog || {})

    const isin = stock?.isin || stock?.id || ''
    const val = stock?.value || 0
    const cost = stock?.costValue || 0
    const sharesNum = parseFloat(stock?.shares) || 0
    const profit = val - cost
    const profitPct = cost > 0 ? (profit / cost) * 100 : 0
    const avgBuyPrice = sharesNum > 0 && cost > 0 ? cost / sharesNum : null

    // Symbol für Yahoo ermitteln
    const lookupSymbol = useMemo(() => {
        if (/krypto|crypto/i.test(stock?.type || '')) {
            return `${String(isin).toUpperCase()}-EUR`
        }
        return isin
    }, [isin, stock?.type])

    useEffect(() => {
        let active = true
        setLoading(true)
        fetchStockDetails(lookupSymbol)
            .then(res => { if (active) setData(res) })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [lookupSymbol])

    // ETF-Katalogdaten laden (für die Durchdringungsanalyse)
    const myEtfs = useMemo(() => {
        return (allHoldings || []).filter(h => {
            const t = (h.type || '').toLowerCase()
            return t.includes('etf') || t.includes('fonds') || isEtfName(h.name || '')
        })
    }, [allHoldings])

    useEffect(() => {
        if (_cachedCatalog || !myEtfs.length) return
        const keys = [...new Set(myEtfs.map(etfKeyFor).filter(Boolean))]
        Promise.all([loadCatalog(keys), loadMySubmissions(keys)])
            .then(([cat, own]) => {
                const merged = { ...cat, ...own }
                _cachedCatalog = merged
                setEtfCatalog(merged)
            })
            .catch(() => {})
    }, [myEtfs])

    // Indirekte ETF-Anteile berechnen
    const indirectEtfHoldings = useMemo(() => {
        if (!stock || !myEtfs.length) return []
        const isinUpper = isin.trim().toUpperCase()
        const nameLower = (stock.name || '').trim().toLowerCase()

        const clean = (s) => (s || '').toLowerCase()
            .replace(/\(adr\)|\(the\)|\(registered\)|a\/s|class [a-z]|cl [a-z]|inc\.?|corp\.?|ag|se|nv|plc/gi, '')
            .replace(/[^a-z0-9]/g, ' ').trim()
        const baseHoldingName = clean(nameLower)

        const results = []
        myEtfs.forEach(etf => {
            const entry = etfCatalog[etfKeyFor(etf)]
            if (!entry || !Array.isArray(entry.rows)) return

            const match = entry.rows.find(r => {
                const rIsin = (r.ISIN || r.isin || '').trim().toUpperCase()
                if (isinUpper && rIsin && isinUpper === rIsin) return true
                const rName = (r.Name || r.name || r.Holding || '').trim().toLowerCase()
                if (!rName) return false
                if (nameLower && (rName === nameLower || rName.includes(nameLower))) return true
                const baseR = clean(rName)
                return baseHoldingName.length >= 4 && (baseR.includes(baseHoldingName) || baseHoldingName.includes(baseR))
            })

            if (match) {
                const weight = parseFloat(String(match.Weight || match.weight || 0).replace(',', '.')) || 0
                const etfVal = parseFloat(etf.value || 0)
                results.push({
                    etfName: etf.name || etf.title || 'ETF',
                    weight,
                    indirectValue: (etfVal * weight) / 100,
                })
            }
        })
        return results.sort((a, b) => b.indirectValue - a.indirectValue)
    }, [stock, isin, myEtfs, etfCatalog])

    const totalIndirectValue = useMemo(() => {
        return indirectEtfHoldings.reduce((sum, item) => sum + item.indirectValue, 0)
    }, [indirectEtfHoldings])

    const totalExposure = val + totalIndirectValue
    const totalExposurePct = totalPortfolioValue > 0 ? ((totalExposure / totalPortfolioValue) * 100).toFixed(1).replace('.', ',') : null

    // Aktivitäten (Käufe, Verkäufe, Dividenden)
    const isMyAct = (a) => {
        const aIsin = a.asset?.isin || a.asset?.symbol || a.holdingId || a.isin
        return aIsin === isin || aIsin === stock.id
    }
    const myBuys = (buyActs || []).filter(isMyAct).map(a => ({ ...a, _type: 'BUY' }))
    const mySells = (sellActs || []).filter(isMyAct).map(a => ({ ...a, _type: 'SELL' }))

    const divEntry = byHolding[isin] || byHolding[stock.id] || {}
    const myDivs = []
    if (divEntry.monthly) {
        Object.entries(divEntry.monthly).forEach(([y, months]) => {
            months.forEach((amt, mIdx) => {
                if (amt > 0) {
                    myDivs.push({
                        _type: 'DIVIDEND',
                        datetime: `${y}-${String(mIdx + 1).padStart(2, '0')}-15`,
                        amount: amt,
                    })
                }
            })
        })
    }
    const allActivities = [...myBuys, ...mySells, ...myDivs].sort(
        (a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0)
    )

    // Kurshistorie & Chartpunkte vorbereiten
    const chartPoints = useMemo(() => {
        const raw = data?.history || []
        if (!raw.length) return []

        const rangeCfg = RANGES.find(r => r.id === chartRange)
        let filtered = raw
        if (rangeCfg?.months) {
            const cutDate = new Date()
            cutDate.setMonth(cutDate.getMonth() - rangeCfg.months)
            const cutIso = cutDate.toISOString().slice(0, 10)
            filtered = raw.filter(p => p.d >= cutIso)
        }
        if (filtered.length < 2) filtered = raw.slice(-30)

        return filtered.map(p => ({
            d: p.d,
            price: +p.close.toFixed(2),
            value: +(p.close * sharesNum).toFixed(2),
            buyIn: avgBuyPrice ? +avgBuyPrice.toFixed(2) : null,
            totalCost: cost > 0 ? +cost.toFixed(2) : null,
        }))
    }, [data, chartRange, sharesNum, avgBuyPrice, cost])

    // Kennzahlen & Live-Preise
    const currentPrice = data?.regularMarketPrice ?? (sharesNum > 0 ? val / sharesNum : null)
    const prevClose = data?.previousClose ?? null
    const dayChange = (currentPrice != null && prevClose != null && prevClose > 0) ? currentPrice - prevClose : null
    const dayChangePct = (dayChange != null && prevClose > 0) ? (dayChange / prevClose) * 100 : null

    const f = data?.fundamentals || {}
    const high52 = f.fiftyTwoWeekHigh ?? data?.fiftyTwoWeekHigh ?? null
    const low52 = f.fiftyTwoWeekLow ?? data?.fiftyTwoWeekLow ?? null

    const high52Pct = (high52 != null && low52 != null && high52 > low52 && currentPrice != null)
        ? Math.min(100, Math.max(0, ((currentPrice - low52) / (high52 - low52)) * 100))
        : null

    const cardStyle = {
        background: '#161b27',
        border: '1px solid #1e2a3a',
        borderRadius: 16,
        padding: 'clamp(14px, 2.5vw, 20px)',
    }

    const btnStyle = (active) => ({
        background: active ? '#009991' : 'transparent',
        color: active ? '#fff' : '#64748b',
        border: 'none',
        borderRadius: 6,
        padding: '5px 12px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
    })

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', boxSizing: 'border-box' }}>
            {/* 1. TOP HEADER MIT ZURÜCK-BUTTON */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <button
                    onClick={onBack}
                    style={{
                        background: '#0f1420',
                        color: '#38bdf8',
                        border: '1px solid #1e2a3a',
                        borderRadius: 10,
                        padding: '8px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    ← Zurück zum Portfolio
                </button>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {f.sector && (
                        <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                            {f.sector}
                        </span>
                    )}
                    <span style={{ background: '#1e293b', color: '#38bdf8', fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 500 }}>
                        {stock?.type || 'Asset'}
                    </span>
                </div>
            </div>

            {/* 2. HERO-KARTE: LOGO, NAME, LIVE-KURS & TAGESPERFORMANCE */}
            <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {stock?.logo && (
                            <img
                                src={stock.logo}
                                alt=""
                                width={52}
                                height={52}
                                style={{ borderRadius: 12, background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                                onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                        )}
                        <div>
                            <h1 style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
                                {stock?.name || isin}
                            </h1>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', gap: 10 }}>
                                <span>ISIN: <strong style={{ color: '#94a3b8' }}>{isin}</strong></span>
                                {data?.symbol && <span>Ticker: <strong style={{ color: '#94a3b8' }}>{data.symbol}</strong></span>}
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 800, color: '#f1f5f9' }}>
                            {currentPrice != null ? fmtEur(currentPrice) : '—'}
                        </div>
                        {dayChange != null && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: dayChange >= 0 ? '#22c55e' : '#ef4444', marginTop: 3 }}>
                                {dayChange >= 0 ? '+' : ''}{fmtEur(dayChange)} ({fmtPct(dayChangePct)}) Heute
                            </div>
                        )}
                    </div>
                </div>

                {/* 52-WOCHEN-SPANNE */}
                {high52 != null && low52 != null && high52Pct != null && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1e2a3a' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                            <span>52W Tief: <strong style={{ color: '#94a3b8' }}>{fmtEur(low52)}</strong></span>
                            <span>52-Wochen-Spanne</span>
                            <span>52W Hoch: <strong style={{ color: '#94a3b8' }}>{fmtEur(high52)}</strong></span>
                        </div>
                        <div style={{ width: '100%', height: 6, background: '#0f1420', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ width: `${high52Pct}%`, height: '100%', background: 'linear-gradient(90deg, #38bdf8, #22c55e)', borderRadius: 3 }} />
                        </div>
                    </div>
                )}
            </div>

            {/* 3. INTERAKTIVER KURS- & WERT-CHART */}
            <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                            📈 {chartMode === 'price' ? 'Aktienkurs' : 'Positionswert & Einstand'}
                        </h3>
                        <p style={{ color: '#64748b', fontSize: 11, margin: '2px 0 0' }}>
                            {chartMode === 'price' ? 'Historische Schlusskurse in EUR' : 'Entwicklung deines gehaltenen Bestands'}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
                            <button onClick={() => setChartMode('price')} style={btnStyle(chartMode === 'price')}>Kurs</button>
                            <button onClick={() => setChartMode('value')} style={btnStyle(chartMode === 'value')}>Depotwert</button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
                        Lade Kursdaten von Yahoo Finance…
                    </div>
                ) : chartPoints.length < 2 ? (
                    <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
                        Keine historischen Kursdaten verfügbar.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={chartPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="stockPriceFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#1e2a3a" vertical={false} />
                            <XAxis dataKey="d" tickFormatter={(d) => d.slice(5)} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis width={56} domain={['auto', 'auto']} tickFormatter={(v) => `${Math.round(v)}€`} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ background: '#161b27', border: '1px solid #2a3a50', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: '#94a3b8' }}
                                labelFormatter={fmtDate}
                                formatter={(val, name) => [fmtEur(val), name === 'price' ? 'Aktienkurs' : name === 'value' ? 'Depotwert' : name === 'buyIn' ? 'Dein Buy-In' : 'Einstand']}
                            />
                            {chartMode === 'price' ? (
                                <>
                                    <Area type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={2} fill="url(#stockPriceFill)" dot={false} isAnimationActive={false} />
                                    {avgBuyPrice && (
                                        <Line type="monotone" dataKey="buyIn" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                                    )}
                                </>
                            ) : (
                                <>
                                    <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fill="url(#stockPriceFill)" dot={false} isAnimationActive={false} />
                                    {cost > 0 && (
                                        <Line type="monotone" dataKey="totalCost" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                                    )}
                                </>
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                )}

                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    {RANGES.map(r => (
                        <button key={r.id} onClick={() => setChartRange(r.id)} style={btnStyle(chartRange === r.id)}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 4. ZWEI SPALTEN: LINKS KENNZAHLEN, RECHTS PORTFOLIO-POSITION */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
                {/* FINANZ- & BEWERTUNGSKENNZAHLEN */}
                <div style={cardStyle}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 14px' }}>
                        📊 Fundamentaldaten & Bewertung
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>KGV (P/E)</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{fmtNum(f.peRatio)}</div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Forward KGV</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{fmtNum(f.forwardPE)}</div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Marktkapitalisierung</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{formatMarketCap(f.marketCap)}</div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Dividendenrendite</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e', marginTop: 2 }}>
                                {f.dividendYield != null ? fmtPct(f.dividendYield * 100) : '—'}
                            </div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Payout Ratio</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>
                                {f.payoutRatio != null ? fmtPct(f.payoutRatio * 100) : '—'}
                            </div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Beta (Volatilität)</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{fmtNum(f.beta)}</div>
                        </div>
                    </div>
                </div>

                {/* DEINE POSITION IM PORTFOLIO */}
                <div style={cardStyle}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 14px' }}>
                        💼 Deine Position
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Marktwert</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{fmtEur(val)}</div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Kursgewinn</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: profit >= 0 ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                                {profit >= 0 ? '+' : ''}{fmtEur(profit)} ({fmtPct(profitPct)})
                            </div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Anteile</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>{fmtNum(sharesNum, 4)}</div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Ø Kaufkurs (Buy-In)</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>{avgBuyPrice ? fmtEur(avgBuyPrice) : '—'}</div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Einstandswert</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>{fmtEur(cost)}</div>
                        </div>
                        <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Depotanteil</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', marginTop: 2 }}>
                                {totalPortfolioValue > 0 ? `${((val / totalPortfolioValue) * 100).toFixed(1).replace('.', ',')} %` : '—'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. ETF DURCHDRINGUNG (LOOK-THROUGH) */}
            {indirectEtfHoldings.length > 0 && (
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                📦 Indirekt in deinen ETFs enthalten
                            </h3>
                            <p style={{ color: '#64748b', fontSize: 12, margin: '2px 0 0' }}>
                                Enthalten in {indirectEtfHoldings.length} {indirectEtfHoldings.length === 1 ? 'ETF' : 'ETFs'} deines Portfolios
                            </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>+{fmtEur(totalIndirectValue)}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                Gesamt-Exposure: <strong style={{ color: '#f1f5f9' }}>{fmtEur(totalExposure)}</strong> {totalExposurePct && `(${totalExposurePct} %)`}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
                        {indirectEtfHoldings.map((item, idx) => (
                            <div key={idx} style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{item.etfName}</div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                        Gewichtung: <strong style={{ color: '#94a3b8' }}>{fmtPct(item.weight)}</strong>
                                    </div>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>
                                    {fmtEur(item.indirectValue)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 6. AKTIVITÄTEN-HISTORIE DIESES ASSETS */}
            <div style={cardStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 14px' }}>
                    📜 Transaktionen & Ausschüttungen ({allActivities.length})
                </h3>
                {allActivities.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 12 }}>Keine Aktivitäten für dieses Wertpapier verzeichnet.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {allActivities.map((act, i) => {
                            const isBuy = act._type === 'BUY'
                            const isSell = act._type === 'SELL'
                            const isDiv = act._type === 'DIVIDEND'
                            const badgeColor = isBuy ? '#22c55e' : isSell ? '#ef4444' : '#fbbf24'
                            const badgeBg = isBuy ? 'rgba(34, 197, 94, 0.15)' : isSell ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)'
                            const badgeLabel = isBuy ? 'KAUF' : isSell ? 'VERKAUF' : 'DIVIDENDE'
                            const shares = parseFloat(act.shares || act.quantity || 0)
                            const amount = parseFloat(act.amount || act.total || act.amountNet || 0)

                            return (
                                <div key={i} style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}40`, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, minWidth: 65, textAlign: 'center' }}>
                                            {badgeLabel}
                                        </span>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
                                                {isDiv ? 'Ausschüttung erhalten' : `${fmtNum(shares, 4)} Anteile`}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{fmtDate(act.datetime)}</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: isDiv ? '#22c55e' : '#f1f5f9' }}>
                                        {isDiv ? `+${fmtEur(amount)}` : fmtEur(amount)}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* 7. UNTERNEHMENSBESCHREIBUNG */}
            {f.summary && (
                <div style={cardStyle}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 10px' }}>
                        ℹ️ Über das Unternehmen
                    </h3>
                    <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                        {f.summary}
                    </p>
                </div>
            )}
        </div>
    )
}