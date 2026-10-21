import React, { useEffect, useState, useMemo } from 'react'
import { fetchStockDetails } from '../api'
import { etfKeyFor, loadCatalog, loadMySubmissions } from '../utils/etfHoldingsStore'
import { isEtfName } from '../utils/portfolioXray'
import HoldingPriceChart from '../components/HoldingPriceChart.jsx'

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

const SECTOR_TRANSLATIONS = {
    'Technology': 'Technologie',
    'Financial Services': 'Finanzdienstleistungen',
    'Healthcare': 'Gesundheitswesen',
    'Consumer Cyclical': 'Zyklischer Konsum',
    'Consumer Defensive': 'Basiskonsumgüter',
    'Industrials': 'Industrie',
    'Communication Services': 'Kommunikation',
    'Energy': 'Energie',
    'Utilities': 'Versorger',
    'Real Estate': 'Immobilien',
    'Basic Materials': 'Grundstoffe',
}

const translateSector = (sec) => SECTOR_TRANSLATIONS[sec] || sec

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
    const [showAllActivities, setShowAllActivities] = useState(false)

    const isin = stock?.isin || stock?.id || ''
    const val = stock?.value || 0
    const cost = stock?.costValue || 0
    const sharesNum = parseFloat(stock?.shares) || 0
    const profit = val - cost
    const profitPct = cost > 0 ? (profit / cost) * 100 : 0
    const avgBuyPrice = sharesNum > 0 && cost > 0 ? cost / sharesNum : null

    // ── ASSET-KLASSIFIZIERUNG ─────────────────────────────────────────────────
    const assetKind = useMemo(() => {
        const t = (stock?.type || '').toLowerCase()
        const n = (stock?.name || '').toLowerCase()
        if (t.includes('crypto') || t.includes('krypto') || isin.includes('BTC') || isin.includes('ETH')) {
            return 'CRYPTO'
        }
        if (t.includes('etf') || t.includes('fonds') || isEtfName(n)) {
            return 'ETF'
        }
        return 'EQUITY' // Einzelaktie
    }, [stock, isin])

    // Symbol für Yahoo ermitteln
    const lookupSymbol = useMemo(() => {
        if (assetKind === 'CRYPTO') {
            const clean = isin.replace('-EUR', '').toUpperCase()
            return `${clean}-EUR`
        }
        return isin
    }, [isin, assetKind])

    useEffect(() => {
        let active = true
        setLoading(true)
        fetchStockDetails(lookupSymbol)
            .then(res => { if (active) setData(res) })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [lookupSymbol])

    const myEtfs = useMemo(() => {
        if (assetKind !== 'EQUITY') return []
        return (allHoldings || []).filter(h => {
            const shares = parseFloat(h.shares) || 0
            const val = parseFloat(h.value) || 0
            if (shares <= 0.0001 || val <= 0) return false

            const t = (h.type || '').toLowerCase()
            return t.includes('etf') || t.includes('fonds') || isEtfName(h.name || '')
        })
    }, [allHoldings, assetKind])

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
        if (assetKind !== 'EQUITY' || !myEtfs.length) return []
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
                const indirectValue = (etfVal * weight) / 100

                if (indirectValue >= 0.01) {
                    results.push({
                        etfName: etf.name || etf.title || 'ETF',
                        weight,
                        indirectValue: indirectValue,
                    })
                }
            }
        })
        return results.sort((a, b) => b.indirectValue - a.indirectValue)
    }, [stock, isin, myEtfs, etfCatalog, assetKind])

    const totalIndirectValue = useMemo(() => {
        return indirectEtfHoldings.reduce((sum, item) => sum + item.indirectValue, 0)
    }, [indirectEtfHoldings])

    const totalExposure = val + totalIndirectValue
    const totalExposurePct = totalPortfolioValue > 0 ? ((totalExposure / totalPortfolioValue) * 100).toFixed(1).replace('.', ',') : null

    // Aktivitäten
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

    // Chart-Punkte
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
            {/* 1. TOP HEADER MIT ZURÜCK-BUTTON & ASSET-BADGE */}
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
                            {translateSector(f.sector)}
                        </span>
                    )}
                    <span style={{
                        background: assetKind === 'CRYPTO' ? 'rgba(245, 158, 11, 0.15)' : assetKind === 'ETF' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: assetKind === 'CRYPTO' ? '#fbbf24' : assetKind === 'ETF' ? '#38bdf8' : '#22c55e',
                        border: `1px solid ${assetKind === 'CRYPTO' ? '#fbbf2440' : assetKind === 'ETF' ? '#38bdf840' : '#22c55e40'}`,
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontWeight: 600
                    }}>
                        {assetKind === 'CRYPTO' ? '🪙 Krypto' : assetKind === 'ETF' ? '📁 ETF' : '📈 Aktie'}
                    </span>
                </div>
            </div>

            {/* 2. HERO-KARTE: LOGO, NAME, KURS & 52W-RANGE */}
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
                                <span>{assetKind === 'CRYPTO' ? 'Symbol:' : 'ISIN:'} <strong style={{ color: '#94a3b8' }}>{isin}</strong></span>
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

                {/* 52-Wochen-Spanne */}
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
            {/* 3. KURS- & DEPOTWERT-CHART */}
            <div>
                <HoldingPriceChart
                    symbol={lookupSymbol}
                    activities={allActivities}
                />
            </div>

            {/* 4. DYNAMISCHE KENNZAHLEN JE NACH ASSET-KLASSE */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>

                {/* A) BEWERTUNG: Passend für Aktie vs. ETF vs. Krypto */}
                <div style={cardStyle}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 14px' }}>
                        {assetKind === 'CRYPTO' ? '🪙 Markt-Kennzahlen' : assetKind === 'ETF' ? '📁 Fonds-Kennzahlen' : '📊 Fundamentaldaten & Bewertung'}
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {assetKind === 'EQUITY' && (
                            <>
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
                            </>
                        )}

                        {assetKind === 'ETF' && (
                            <>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Fondsvolumen</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{formatMarketCap(f.marketCap)}</div>
                                </div>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Ausschüttungsrendite</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e', marginTop: 2 }}>
                                        {f.dividendYield != null ? fmtPct(f.dividendYield * 100) : '—'}
                                    </div>
                                </div>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Beta</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{fmtNum(f.beta)}</div>
                                </div>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Vortagesschluss</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{prevClose ? fmtEur(prevClose) : '—'}</div>
                                </div>
                            </>
                        )}

                        {assetKind === 'CRYPTO' && (
                            <>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Marktkapitalisierung</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{formatMarketCap(f.marketCap)}</div>
                                </div>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>24h-Änderung</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: (dayChangePct ?? 0) >= 0 ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                                        {fmtPct(dayChangePct)}
                                    </div>
                                </div>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>52W Hoch</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{high52 ? fmtEur(high52) : '—'}</div>
                                </div>
                                <div style={{ background: '#0f1420', padding: '10px 12px', borderRadius: 10, border: '1px solid #1e2a3a' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>52W Tief</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{low52 ? fmtEur(low52) : '—'}</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* B) DEINE POSITION IM PORTFOLIO */}
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
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>
                                {fmtNum(sharesNum, assetKind === 'CRYPTO' ? 6 : 4)}
                            </div>
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

            {/* 5. ETF-DURCHDRINGUNG (WIRD NUR BEI EINZELAKTIEN GERENDERT!) */}
            {assetKind === 'EQUITY' && indirectEtfHoldings.length > 0 && (
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

            {/* 6. TRANSAKTIONSHISTORIE (KOMPAKT MIT "MEHR ANZEIGEN") */}
            <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                        📜 Transaktionen & Aktivitäten ({allActivities.length})
                    </h3>
                    {allActivities.length > 5 && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                            {showAllActivities ? `Alle ${allActivities.length}` : `Zuletzt 5 von ${allActivities.length}`}
                        </span>
                    )}
                </div>

                {allActivities.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 12 }}>Keine Aktivitäten für dieses Wertpapier verzeichnet.</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(showAllActivities ? allActivities : allActivities.slice(0, 5)).map((act, i) => {
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
                                                    {isDiv ? 'Ausschüttung erhalten' : `${fmtNum(shares, assetKind === 'CRYPTO' ? 6 : 4)} Anteile`}
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

                        {allActivities.length > 10 && (
                            <button
                                onClick={() => setShowAllActivities(v => !v)}
                                style={{
                                    marginTop: 10,
                                    background: '#0f1420',
                                    border: '1px solid #1e2a3a',
                                    borderRadius: 8,
                                    padding: '8px 14px',
                                    color: '#38bdf8',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    width: '100%',
                                    textAlign: 'center',
                                    transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#1a2233' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#0f1420' }}
                            >
                                {showAllActivities
                                    ? '▲ Weniger anzeigen'
                                    : `▼ Alle ${allActivities.length} Aktivitäten anzeigen (${allActivities.length - 5} weitere)`
                                }
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* 7. UNTERNEHMENSBESCHREIBUNG (NUR WENN VORHANDEN) */}
            {f.summary && (
                <div style={cardStyle}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 10px' }}>
                        ℹ️ Über {assetKind === 'ETF' ? 'den Fonds' : 'das Unternehmen'}
                    </h3>
                    <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                        {f.summary}
                    </p>
                </div>
            )}
        </div>
    )
}