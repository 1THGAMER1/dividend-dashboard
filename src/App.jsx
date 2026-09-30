import { useEffect, useState, useRef } from 'react'
import { startOAuthFlow, logout, getClientId, clearCachedClientId } from './auth'
import { supabase } from './supabaseClient'
import useDividendData from './hooks/useDividendData'
import { calcRealTotal } from './inflation'
import { setTickerProgressCallback } from './api'

import KpiCard           from './components/KpiCard'
import LoginScreen       from './components/LoginScreen.jsx'
import AppLogin          from './components/AppLogin.jsx'
import ParqetSetup       from './components/ParqetSetup'
import DividendChart     from './components/DividendChart'
import DividendHeatmap   from './components/DividendHeatmap'
import PositionsTable    from './components/PositionsTable'
import DividendDonut     from './components/DividendDonut'
import PortfolioDashboard from './components/PortfolioDashboard.jsx'
import DividendCalculator from './pages/DividendCalculator'
import DripSimulator     from './pages/DripSimulator'
import RoadmapPage       from './pages/RoadmapPage'
import ProfilePage       from './pages/ProfilePage'
import UpcomingDividends from './components/UpcomingDividends'
import DividendCalendar  from './components/DividendCalendar.jsx'
import SkeletonDashboard from './components/SkeletonDashboard'
import EmptyState        from './components/EmptyState'
import Footer            from './components/Footer'
import AssetAllocationDonut from './components/AssetAllocationDonut'
import AssetHoldingDonut from "./components/AssetHoldingDonut.jsx"

const fmt    = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

const KPI_RANGES = [
  { key: 'all', label: 'Gesamt' },
  { key: 'ytd', label: 'YTD'   },
  { key: '12m', label: '12M'   },
]

const DIVIDEND_TABS = [
  { id: 'dashboard',  emoji: '📊', label: 'Dashboard'  },
  { id: 'calendar',   emoji: '🗓',  label: 'Kalender'   },
  { id: 'calculator', emoji: '🧭', label: 'Rechner'    },
  { id: 'drip',       emoji: '♻️', label: 'DRIP'       },
]

const PORTFOLIO_TABS = [
  { id: 'portfolio-overview', emoji: '💼', label: 'Bestände'    },
  { id: 'portfolio-assets',   emoji: '🍰', label: 'Allokation'  },
]

const STATUS_INFO = {
  live:  { color: '#22c55e', text: '● Live',    tooltip: 'Frische Daten direkt von Parqet.' },
  cache: { color: '#60a5fa', text: '● Cache',   tooltip: 'Gespeicherte Daten. Klicke Aktualisieren.' },
  stale: { color: '#fb923c', text: '◑ Veraltet', tooltip: 'Älter als 24h. Bitte aktualisieren.' },
  error: { color: '#fb923c', text: '○ Fehler',  tooltip: 'Laden fehlgeschlagen.' },
}

function getStatusIndicator(dataSource) {
  return STATUS_INFO[dataSource] ?? STATUS_INFO.error
}

function yearTotal(monthly, year) {
  const arr = monthly?.[year]
  if (!arr) return 0
  return arr.reduce((s, v) => s + (v || 0), 0)
}

function rolling12m(monthly, endYear, endMonth) {
  let total = 0
  for (let i = 0; i < 12; i++) {
    let m = endMonth - i
    let y = endYear
    if (m < 0) { m += 12; y -= 1 }
    total += monthly?.[y]?.[m] ?? 0
  }
  return total
}

export function DashLogo({ size = 32 }) {
  return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} aria-label="Dividend Dashboard">
        <rect width="32" height="32" rx="8" fill="#0f1420"/>
        <circle cx="16" cy="16" r="12" fill="none" stroke="#1e3a2a" strokeWidth="2"/>
        <circle cx="16" cy="16" r="12" fill="none" stroke="#22c55e" strokeWidth="2"
                strokeDasharray="28 48" strokeDashoffset="0" strokeLinecap="round"/>
        <polyline points="11,19 15,13 17,16 21,10" fill="none" stroke="#4ade80"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
  )
}

function LoadingScreen({ text, progress }) {
  const hasProgress = progress && progress.total > 0
  const pct = hasProgress ? Math.round((progress.done / progress.total) * 100) : null

  return (
      <div style={{
        minHeight: '100vh', background: '#0f1420',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 20, padding: 16,
      }}>
        <div style={{ animation: 'logoPulse 1.6s ease-in-out infinite' }}>
          <DashLogo size={64} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#e0e6f0', fontWeight: 700, fontSize: 16, margin: 0 }}>Dividenden Dashboard</p>
          <p style={{ color: '#556070', fontSize: 13, margin: '4px 0 0' }}>{text}</p>
        </div>

        {hasProgress ? (
            <div style={{ width: '100%', maxWidth: 220, textAlign: 'center' }}>
              <div style={{ width: '100%', height: 6, background: '#1e2a3a', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                  borderRadius: 99,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ color: '#556070', fontSize: 12 }}>
            {progress.label} ({pct} %)
          </span>
            </div>
        ) : (
            <div style={{ width: 160, height: 3, background: '#1e2a3a', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                borderRadius: 99,
                animation: 'loadBar 1.6s ease-in-out infinite',
              }} />
            </div>
        )}

        <style>{`
        @keyframes logoPulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.7; transform: scale(0.93); }
        }
        @keyframes loadBar {
          0%   { width: 0%;   margin-left: 0;    }
          50%  { width: 70%;  margin-left: 15%;  }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
      </div>
  )
}

export default function App() {
  // Share-Token Logik in der Komponente
  const [sharedToken, setSharedToken] = useState(() => {
    const hash = window.location.hash
    if (hash.startsWith('#share/')) {
      return hash.replace('#share/', '')
    }
    return null
  })

  const [sharedData, setSharedData] = useState(null)
  const [sharedLoading, setSharedLoading] = useState(!!sharedToken)

  useEffect(() => {
    if (!sharedToken) return
    async function loadShared() {
      const { data } = await supabase
          .from('shared_portfolios')
          .select('portfolio_data')
          .eq('share_token', sharedToken)
          .single()

      if (data) {
        setSharedData(data.portfolio_data)
      }
      setSharedLoading(false)
    }
    loadShared()
  }, [sharedToken])

  const [page, setPage] = useState(() => {
    const hash = window.location.hash.replace('#', '')
    return hash || 'dashboard'
  })

  const [appMode, setAppMode] = useState(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash && hash.startsWith('portfolio')) return 'portfolio'
    return 'dividends'
  })

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash && hash !== page) {
        setPage(hash)
        if (hash.startsWith('portfolio')) {
          setAppMode('portfolio')
        } else {
          setAppMode('dividends')
        }
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [page])

  const handlePageChange = (newPage) => {
    setPage(newPage)
    window.location.hash = newPage
  }

  const handleModeSwitch = (newMode) => {
    setAppMode(newMode)
    const defaultPage = newMode === 'dividends' ? 'dashboard' : 'portfolio-overview'
    handlePageChange(defaultPage)
  }

  const {
    loggedIn,
    monthly, cum, forecastCum, forecastMonthly,
    byHolding, forecastByHolding,
    holdings,
    enrichedHoldings,
    kpi, dividendYield,
    loading, authLoading,
    lastUpdated, dataSource, error,
    loadData,
    currentValue,
  } = useDividendData()

  const [kpiRange,        setKpiRange]        = useState('all')
  const [appUser,         setAppUser]         = useState(undefined)
  const [clientIdReady,   setClientIdReady]   = useState(false)
  const [profileLoading,  setProfileLoading]  = useState(true)
  const [tooltipVisible,  setTooltipVisible]  = useState(false)
  const [tickerProgress,  setTickerProgress]  = useState(null)

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const currentTabs = appMode === 'dividends' ? DIVIDEND_TABS : PORTFOLIO_TABS

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setTickerProgressCallback((p) => {
      setTickerProgress(p.done >= p.total ? null : p)
    })
    return () => setTickerProgressCallback(null)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAppUser(data.session?.user ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setAppUser(session?.user ?? null)

      const shouldResetClientId = event === 'SIGNED_OUT' || event === 'USER_UPDATED' || !session?.user
      if (shouldResetClientId) {
        clearCachedClientId()
        setClientIdReady(false)
      }
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    async function loadProfileState() {
      if (!appUser) {
        if (active) { setClientIdReady(false); setProfileLoading(false) }
        return
      }
      setProfileLoading(true)
      try {
        const clientId = await getClientId()
        if (active) setClientIdReady(!!clientId)
      } catch {
        if (active) setClientIdReady(false)
      } finally {
        if (active) setProfileLoading(false)
      }
    }
    loadProfileState()
    return () => { active = false }
  }, [appUser])

  // Wenn im Share-Modus, zeige die anonyme Ansicht
  if (sharedToken) {
    if (sharedLoading) return <LoadingScreen text="Geteiltes Portfolio wird geladen…" />
    if (!sharedData) return <div style={{ color: '#fff', textAlign: 'center', padding: 50 }}>Portfolio nicht gefunden oder Link abgelaufen.</div>

    return (
        <div style={{ minHeight: '100vh', background: '#0f1420', color: '#c8d4e0', padding: 20 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, background: '#161b27', padding: '16px 20px', borderRadius: 16, border: '1px solid #1e2a3a' }}>
              <div>
                <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: 0 }}>📊 Anonymes Portfolio</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Read-Only Ansicht</p>
              </div>
              <a href="/" style={{ background: '#1e3a5f', color: '#93c5fd', padding: '8px 14px', borderRadius: 8, fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>
                Eigenes Dashboard erstellen
              </a>
            </div>

            <PortfolioDashboard
                currentValue={sharedData.currentValue}
                forecast12m={{ net: sharedData.kpi?.['all']?.net || 0 }}
                holdings={sharedData.holdings || []}
            />
          </div>
        </div>
    )
  }

  if (appUser === undefined || profileLoading) return <LoadingScreen text="App wird vorbereitet…" />
  if (!appUser)        return <AppLogin />
  if (!clientIdReady)  return <ParqetSetup onDone={() => setClientIdReady(true)} />
  if (authLoading)     return <LoadingScreen text="Authentifizierung läuft…" />
  if (!loggedIn)       return <LoginScreen onLogin={startOAuthFlow} loading={authLoading} error={error} />

  if (tickerProgress) {
    return <LoadingScreen
        text="Wertpapiere & Kurse werden geladen…"
        progress={tickerProgress}
    />
  }

  const cy = new Date().getFullYear()
  const cm = new Date().getMonth()

  const calcForecastNext12m = () => {
    let total = 0
    for (let i = 0; i < 12; i++) {
      const futureMonth = (cm + 1 + i) % 12
      const futureYear  = cy + Math.floor((cm + 1 + i) / 12)
      total += forecastMonthly?.[futureYear]?.[futureMonth] ?? 0
    }
    return { total: +total.toFixed(2), avg: +(total / 12).toFixed(2) }
  }

  const calcForecastNext12mNet = () => {
    let total = 0
    for (let i = 0; i < 12; i++) {
      const futureMonth = (cm + 1 + i) % 12
      const futureYear  = cy + Math.floor((cm + 1 + i) / 12)
      total += forecastMonthly?.[futureYear]?.[futureMonth] ?? 0
    }
    return +total.toFixed(2)
  }

  const forecast12m = {
    ...calcForecastNext12m(),
    net: calcForecastNext12mNet()
  }

  const calcKpi = () => {
    const k = kpi[kpiRange] || kpi['all']
    return {
      net:   fmt(k?.net ?? 0),
      gross: fmt(k?.gross ?? 0),
      tax:   fmt(k?.tax ?? 0),
      avg:   fmt(k?.avgMonthly ?? 0),
    }
  }
  const k = calcKpi()

  const calcYoY = () => {
    const now      = new Date()
    const endYear  = now.getFullYear()
    const endMonth = now.getMonth()
    const latest   = rolling12m(monthly, endYear, endMonth)
    const previous = rolling12m(monthly, endYear - 1, endMonth)
    if (latest < 1 || previous < 1) return null
    return +((latest / previous - 1) * 100).toFixed(1)
  }

  const calcTrueCagr = () => {
    const years = Object.keys(monthly || {}).map(Number).filter(y => y < cy).sort()
    if (years.length < 2) return null
    const firstYear = years[0]
    const lastYear  = years[years.length - 1]
    const numYears  = lastYear - firstYear
    const startVal  = yearTotal(monthly, firstYear)
    const endVal    = yearTotal(monthly, lastYear)
    if (startVal < 1 || endVal < 1 || numYears < 1) return null
    const cagr = (Math.pow(endVal / startVal, 1 / numYears) - 1) * 100
    return { value: +cagr.toFixed(1), from: firstYear, to: lastYear, years: numYears }
  }

  const yoy      = calcYoY()
  const trueCagr = calcTrueCagr()

  const rawYield      = dividendYield?.['12m'] ?? dividendYield?.['all'] ?? 0
  const forecastYield = currentValue > 0
      ? calcForecastNext12mNet() / currentValue
      : rawYield / 100

  const portfolioData = {
    currentValue,
    totalDividendsNet:     kpi?.['all']?.net ?? kpi?.['12m']?.net ?? calcForecastNext12mNet(),
    dividendYield:         rawYield / 100,
    forecastDividendYield: forecastYield,
    cagrTotal:   yoy,
    cagrOrganic: null,
  }

  const nominalTotal = kpi?.['all']?.net ?? 0
  const realTotal    = calcRealTotal(monthly)
  const inflation    = nominalTotal - realTotal
  const hasRealData  = nominalTotal > 0 && Object.keys(monthly || {}).length > 1

  const statusIndicator = getStatusIndicator(dataSource)
  const hasData      = Object.keys(monthly || {}).length > 0
  const showSkeleton = loading && !hasData
  const showEmpty    = !loading && !hasData

  return (
      <div style={{ minHeight: '100vh', background: '#0f1420', display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>

        {/* RESPONSIVE NAVBAR */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#161b27', borderBottom: '1px solid #1e2a3a',
          padding: '0 8px', height: 52, position: 'sticky', top: 0, zIndex: 100,
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <DashLogo size={26} />

            <div style={{ display: 'flex', background: '#0f1420', padding: 2, borderRadius: 8, border: '1px solid #1e2a3a' }}>
              <button
                  onClick={() => handleModeSwitch('dividends')}
                  style={{
                    background: appMode === 'dividends' ? '#009991' : 'transparent',
                    color: appMode === 'dividends' ? '#ffffff' : '#64748b',
                    border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11,
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
                  }}
              >
                💰 <span className="nav-full-label">Dividenden</span>
              </button>
              <button
                  onClick={() => handleModeSwitch('portfolio')}
                  style={{
                    background: appMode === 'portfolio' ? '#009991' : 'transparent',
                    color: appMode === 'portfolio' ? '#ffffff' : '#64748b',
                    border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11,
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
                  }}
              >
                💼 <span className="nav-full-label">Portfolio</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 2 }}>
            {currentTabs.map(tab => (
                <button key={tab.id} onClick={() => handlePageChange(tab.id)} style={{
                  background: page === tab.id ? '#009991' : 'transparent',
                  color: page === tab.id ? 'white' : '#556070',
                  border: 'none', borderRadius: 8,
                  padding: '5px 8px',
                  cursor: 'pointer', fontWeight: 600, fontSize: 12,
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4,
                  whiteSpace: 'nowrap'
                }}>
                  <span>{tab.emoji}</span>
                  <span className="nav-full-label">{tab.label}</span>
                </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={loadData} disabled={loading} style={{
              background: loading ? '#1a2233' : '#1e3a5f',
              border: '1px solid #3b82f6', color: '#93c5fd',
              padding: '5px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11,
              whiteSpace: 'nowrap',
            }}>
              <span>{loading ? '⟳' : '↻'}</span>
            </button>

            <div style={{ position: 'relative' }} ref={menuRef}>
              <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  style={{
                    background: '#1e2a3a', border: '1px solid #2a3a50', borderRadius: '50%',
                    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0, overflow: 'hidden', flexShrink: 0
                  }}
              >
                {appUser?.user_metadata?.avatar_url ? (
                    <img src={appUser.user_metadata.avatar_url} alt="Profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
                  {appUser?.email?.[0]?.toUpperCase() ?? '👤'}
                </span>
                )}
              </button>

              {userMenuOpen && (
                  <div
                      style={{
                        position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                        background: '#161b27', border: '1px solid #2a3a50', borderRadius: 12,
                        padding: '8px 0', width: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 200,
                      }}
                  >
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #1e2a3a', marginBottom: 4 }}>
                      <p style={{ margin: 0, color: '#e0e6f0', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {appUser?.user_metadata?.full_name || 'Benutzer'}
                      </p>
                      <p style={{ margin: '2px 0 0', color: '#7a8ba0', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {appUser?.email}
                      </p>
                    </div>

                    <button
                        onClick={() => { setPage('profile'); setUserMenuOpen(false); }}
                        style={{
                          width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                          color: '#e0e6f0', padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                    >
                      <span>⚙️</span> Mein Profil
                    </button>

                    <button
                        onClick={() => { logout(); setUserMenuOpen(false); }}
                        style={{
                          width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                          color: '#fca5a5', padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #1e2a3a', marginTop: 4,
                        }}
                    >
                      <span>🚪</span> Abmelden
                    </button>
                  </div>
              )}
            </div>
          </div>
        </nav>

        {/* HAUPTINHALT */}
        <div style={{ flex: 1, padding: '16px 10px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {page === 'calculator' && <DividendCalculator portfolioData={portfolioData} />}
          {page === 'roadmap'    && <RoadmapPage />}
          {page === 'profile'    && <ProfilePage appUser={appUser} onParqetUpdated={loadData} />}

          {appMode === 'dividends' && (
              <>
                {page === 'drip' && <DripSimulator portfolioData={portfolioData} />}
                {page === 'calendar' && (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>🗓 Kalender & Nächste Zahlungen</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 4 }}>Prognose basierend auf Vorjahresdaten</p>
                      </div>
                      {showEmpty
                          ? <EmptyState onRefresh={loadData} loading={loading} error={error} />
                          : (
                              <>
                                <UpcomingDividends forecastByHolding={forecastByHolding} byHolding={byHolding} days={90} />
                                <DividendCalendar  forecastByHolding={forecastByHolding} byHolding={byHolding} monthly={monthly} />
                              </>
                          )}
                    </div>
                )}

                {page === 'dashboard' && (
                    <>
                      {showSkeleton && <SkeletonDashboard />}
                      {showEmpty    && <EmptyState onRefresh={loadData} loading={loading} error={error} />}

                      {!showSkeleton && !showEmpty && (
                          <div>
                            <div style={{ marginBottom: 14 }}>
                              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>📈 Dividenden Dashboard</h1>
                              <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Portfolio-Übersicht · Nettowerte</p>
                            </div>

                            {error && (
                                <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:12 }}>
                                  ⚠ {error}
                                </div>
                            )}

                            <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                              {KPI_RANGES.map(({ key, label }) => (
                                  <button key={key} onClick={() => setKpiRange(key)} style={{
                                    padding:'4px 14px', borderRadius:20, fontSize:11, cursor:'pointer',
                                    border:'1px solid #2a3a50',
                                    background: kpiRange === key ? '#1e3a5f' : 'transparent',
                                    color: kpiRange === key ? '#93c5fd' : '#7a8ba0',
                                  }}>
                                    {label}
                                  </button>
                              ))}
                            </div>

                            <div className="kpi-grid">
                              <KpiCard label="Dividenden Netto" value={k.net} color="#22c55e" detail={{ label:'Ø Monatlich', value:k.avg, color:'#a78bfa' }} />
                              <KpiCard label="Brutto" value={k.gross} color="#60a5fa" detail={{ label:'davon Steuern', value:k.tax, color:'#fb923c' }} />
                              <KpiCard label="Dividendenrendite" value={fmtPct((dividendYield[kpiRange] ?? 0) + 0.01)} color="#34d399" sub="auf den Einstandskurs" />
                            </div>

                            <div className="kpi-grid">
                              {trueCagr !== null && (
                                  <KpiCard label={`CAGR (${trueCagr.years}J)`} value={(trueCagr.value >= 0 ? '+' : '') + String(trueCagr.value).replace('.', ',') + ' %'} color={trueCagr.value >= 0 ? '#5bcec2' : '#ef4444'} sub={`${trueCagr.from} – ${trueCagr.to}`} />
                              )}
                              <KpiCard label="YoY-Wachstum" value={yoy === null ? '–' : (yoy >= 0 ? '+' : '') + String(yoy).replace('.', ',') + ' %'} color={yoy === null ? '#556070' : yoy >= 0 ? '#22c55e' : '#ef4444'} sub={yoy === null ? 'Nicht genügend Daten' : '12M vs. Vorjahr'} />
                              {hasRealData && (
                                  <KpiCard label="Real (inflationsber.)" value={fmt(realTotal)} color="#f59e0b" detail={{ label: 'Verlust', value: fmt(inflation), color: '#ef4444' }} sub={`Basis: ${Object.keys(monthly || {}).map(Number).sort()[0]}`} />
                              )}
                            </div>

                            <p style={{ fontSize:10, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, marginTop:6 }}>Prognose · Nächste 12 Monate</p>
                            <div className="kpi-grid">
                              <KpiCard label="Voraussichtlich Netto" value={fmt(forecast12m.total)} color="#f472b6" detail={{ label:'Ø Monatlich', value:fmt(forecast12m.avg), color:'#f472b6' }} sub="Basierend auf Vorjahren" />
                              <KpiCard label={`Wachstum ${cy} vs. ${cy - 1}`} value={(() => { const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0); const actualLastYear = yearTotal(monthly, cy - 1); if (actualLastYear === 0) return '–'; const growth = ((forecastCurrentYear - actualLastYear) / actualLastYear) * 100; return (growth >= 0 ? '+' : '') + growth.toFixed(1).replace('.', ',') + ' %' })()} color={(() => { const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0); const actualLastYear = yearTotal(monthly, cy - 1); if (actualLastYear === 0) return '#7a8ba0'; return ((forecastCurrentYear - actualLastYear) / actualLastYear) >= 0 ? '#22c55e' : '#ef4444' })()} sub="Prognose Gesamtjahr" />
                              <KpiCard label="Progn. Dividendenrendite" value={(() => { const forecastNet = calcForecastNext12mNet(); if (!currentValue || currentValue === 0) return '–'; return fmtPct((forecastNet / currentValue) * 100) })()} color="#5bcec2" sub="Nächste 12M / Marktwert" />
                            </div>

                            <div style={{ marginTop: 16 }}>
                              <DividendChart monthly={monthly} cum={cum} forecastCum={forecastCum} forecastMonthly={forecastMonthly} byHolding={byHolding} forecastByHolding={forecastByHolding} />
                            </div>
                            <div style={{ marginTop: 16 }}>
                              <DividendHeatmap monthly={monthly} />
                            </div>

                            <div id="dividends-table" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                              <DividendDonut byHolding={byHolding} kpiRange={kpiRange} />
                              <PositionsTable byHolding={byHolding} kpiRange={kpiRange} />
                            </div>
                          </div>
                      )}
                    </>
                )}
              </>
          )}

          {appMode === 'portfolio' && (
              <div>
                {page === 'portfolio-overview' && (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>💼 Portfolio Bestände</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Echtzeit-Depotwerte & Positionen</p>
                      </div>

                      <PortfolioDashboard
                          currentValue={currentValue}
                          holdings={enrichedHoldings || holdings}
                          byHolding={byHolding}
                      />
                    </>
                )}

                {page === 'portfolio-assets' && (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>🍰 Asset Allokation</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Aufteilung deiner echten Depotwerte nach Klassen</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <AssetHoldingDonut holdings={enrichedHoldings || holdings} />
                        <AssetAllocationDonut holdings={enrichedHoldings || holdings} />
                      </div>
                    </>
                )}
              </div>
          )}
        </div>

        <Footer onNavigate={setPage} />
      </div>
  )
}