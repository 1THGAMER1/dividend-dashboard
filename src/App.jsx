import { useEffect, useState, useRef } from 'react'
import { startOAuthFlow, logout, getClientId, clearCachedClientId } from './auth'
import { supabase } from './supabaseClient'
import useDividendData from './hooks/useDividendData'
import { calcRealTotal } from './inflation'
import { setTickerProgressCallback } from './api'

import KpiCard           from './components/KpiCard'
import LoginScreen        from './components/LoginScreen'
import AppLogin           from './components/AppLogin'
import ParqetSetup        from './components/ParqetSetup'
import DividendChart      from './components/DividendChart'
import DividendHeatmap    from './components/DividendHeatmap'
import PositionsTable     from './components/PositionsTable'
import DividendDonut      from './components/DividendDonut'
import PortfolioDashboard from './components/PortfolioDashboard'
import DividendCalculator from './pages/DividendCalculator'
import DripSimulator      from './pages/DripSimulator'
import RoadmapPage        from './pages/RoadmapPage'
import ProfilePage        from './pages/ProfilePage'
import UpcomingDividends  from './components/UpcomingDividends'
import DividendCalendar   from './components/DividendCalendar'
import SkeletonDashboard  from './components/SkeletonDashboard'
import EmptyState         from './components/EmptyState'
import Footer             from './components/Footer'

const fmt    = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

const KPI_RANGES = [
  { key: 'all', label: 'Gesamt' },
  { key: 'ytd', label: 'YTD'   },
  { key: '12m', label: '12M'   },
]

// 2-in-1 Dual Navigations-Tabs
const DIVIDEND_TABS = [
  { id: 'dashboard',  emoji: '📊', label: 'Dashboard'  },
  { id: 'calendar',   emoji: '🗓',  label: 'Kalender'   },
  { id: 'calculator', emoji: '🧭', label: 'Rechner'    },
  { id: 'drip',       emoji: '♻️', label: 'DRIP'       },
]

const PORTFOLIO_TABS = [
  { id: 'portfolio-overview', emoji: '💼', label: 'Bestände'    },
  { id: 'portfolio-assets',   emoji: '🍰', label: 'Allokation'  },
  { id: 'calculator',         emoji: '🧭', label: 'Rechner'    },
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
      flexDirection: 'column', gap: 20,
    }}>
      <div style={{ animation: 'logoPulse 1.6s ease-in-out infinite' }}>
        <DashLogo size={64} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#e0e6f0', fontWeight: 700, fontSize: 16, margin: 0 }}>Dividenden Dashboard</p>
        <p style={{ color: '#556070', fontSize: 13, margin: '4px 0 0' }}>{text}</p>
      </div>

      {hasProgress ? (
        <div style={{ width: 220, textAlign: 'center' }}>
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
  const {
    loggedIn,
    monthly, cum, forecastCum, forecastMonthly,
    byHolding, forecastByHolding,
    holdings, // 👈 Jetzt aus useDividendData ausgelesen
    kpi, dividendYield,
    loading, authLoading,
    lastUpdated, dataSource, error,
    loadData,
    currentValue,
    buyActs,
  } = useDividendData()

  const [appMode,         setAppMode]         = useState('dividends') // 'dividends' | 'portfolio'
  const [page,            setPage]            = useState('dashboard')
  const [kpiRange,        setKpiRange]        = useState('all')
  const [appUser,         setAppUser]         = useState(undefined)
  const [clientIdReady,   setClientIdReady]   = useState(false)
  const [profileLoading,  setProfileLoading]  = useState(true)
  const [tooltipVisible,  setTooltipVisible]  = useState(false)
  const [tickerProgress, setTickerProgress] = useState(null)

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const handleModeSwitch = (newMode) => {
    setAppMode(newMode)
    setPage(newMode === 'dividends' ? 'dashboard' : 'portfolio-overview')
  }

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

  if (appUser === undefined || profileLoading) return <LoadingScreen text="App wird vorbereitet…" />
  if (!appUser)        return <AppLogin />
  if (!clientIdReady)  return <ParqetSetup onDone={() => setClientIdReady(true)} />
  if (authLoading)     return <LoadingScreen text="Authentifizierung läuft…" />
  if (!loggedIn)       return <LoginScreen onLogin={startOAuthFlow} loading={authLoading} error={error} />

  if (tickerProgress) {
    return <LoadingScreen
      text="Wertpapiere werden mit Yahoo Finance verknüpft…"
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

  const forecast12m = calcForecastNext12m()

  const calcKpi = () => {
    const k = kpi[kpiRange] || kpi['all']
    return {
      net:   fmt(k.net),
      gross: fmt(k.gross),
      tax:   fmt(k.tax),
      avg:   fmt(k.avgMonthly ?? 0),
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
    const years = Object.keys(monthly).map(Number).filter(y => y < cy).sort()
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
  const hasRealData  = nominalTotal > 0 && Object.keys(monthly).length > 1

  const statusIndicator = getStatusIndicator(dataSource)
  const hasData      = Object.keys(monthly).length > 0
  const showSkeleton = loading && !hasData
  const showEmpty    = !loading && !hasData

  return (
    <div style={{ minHeight: '100vh', background: '#0f1420', display: 'flex', flexDirection: 'column' }}>
      
      {/* NAVBAR */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#161b27', borderBottom: '1px solid #1e2a3a',
        padding: '0 12px', height: 52, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <DashLogo size={28} />

          {/* 2-in-1 Dual System Switcher */}
          <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
            <button
              onClick={() => handleModeSwitch('dividends')}
              style={{
                background: appMode === 'dividends' ? '#009991' : 'transparent',
                color: appMode === 'dividends' ? '#ffffff' : '#64748b',
                border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              💰 Dividenden
            </button>
            <button
              onClick={() => handleModeSwitch('portfolio')}
              style={{
                background: appMode === 'portfolio' ? '#009991' : 'transparent',
                color: appMode === 'portfolio' ? '#ffffff' : '#64748b',
                border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              💼 Portfolio
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {currentTabs.map(tab => (
            <button key={tab.id} onClick={() => setPage(tab.id)} style={{
              background: page === tab.id ? '#009991' : 'transparent',
              color: page === tab.id ? 'white' : '#556070',
              border: 'none', borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span>{tab.emoji}</span>
              <span className="nav-full-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {lastUpdated && (
            <div
              className="nav-status"
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={() => setTooltipVisible(true)}
              onMouseLeave={() => setTooltipVisible(false)}
            >
              <span style={{ color: statusIndicator.color, fontSize: 12, cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
                {statusIndicator.text} · {lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {tooltipVisible && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: '#1e2a3a', border: '1px solid #2a3a50',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12, color: '#c0ccd8', whiteSpace: 'nowrap',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 200,
                  pointerEvents: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: statusIndicator.color, fontSize: 10 }}>●</span>
                    {statusIndicator.tooltip}
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={loadData} disabled={loading} style={{
            background: loading ? '#1a2233' : '#1e3a5f',
            border: '1px solid #3b82f6', color: '#93c5fd',
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
            whiteSpace: 'nowrap',
          }}>
            <span>{loading ? '⟳' : '↻'}</span>
            <span className="nav-full-label" style={{ marginLeft: 4 }}>{loading ? 'Lade…' : 'Aktualisieren'}</span>
          </button>

          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                background: '#1e2a3a', border: '1px solid #2a3a50', borderRadius: '50%',
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0, overflow: 'hidden',
              }}
            >
              {appUser?.user_metadata?.avatar_url ? (
                <img src={appUser.user_metadata.avatar_url} alt="Profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>
                  {appUser?.email?.[0]?.toUpperCase() ?? '👤'}
                </span>
              )}
            </button>

            {userMenuOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: '#161b27', border: '1px solid #2a3a50', borderRadius: 12,
                  padding: '8px 0', width: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 200,
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
      <div style={{ flex: 1 }}>
        {page === 'calculator' && <DividendCalculator portfolioData={portfolioData} />}
        {page === 'roadmap'    && <RoadmapPage />}
        {page === 'profile'    && <ProfilePage appUser={appUser} onParqetUpdated={loadData} />}

        {/* DIVIDENDEN MODUS */}
        {appMode === 'dividends' && (
          <>
            {page === 'drip' && <DripSimulator portfolioData={portfolioData} />}
            {page === 'calendar' && (
              <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 12px' }}>
                <div style={{ marginBottom: 20 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e0e6f0' }}>🗓 Kalender & Nächste Zahlungen</h1>
                  <p style={{ color: '#7a8ba0', fontSize: 13, marginTop: 4 }}>Prognose basierend auf Vorjahresdaten</p>
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
                  <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 12px' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e0e6f0' }}>📈 Dividenden Dashboard</h1>
                      <p style={{ color: '#7a8ba0', fontSize: 13, marginTop: 4 }}>Portfolio-Übersicht · Nettowerte</p>
                    </div>

                    {error && (
                      <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:13 }}>
                        ⚠ {error}
                      </div>
                    )}

                    <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                      {KPI_RANGES.map(({ key, label }) => (
                        <button key={key} onClick={() => setKpiRange(key)} style={{
                          padding:'5px 16px', borderRadius:20, fontSize:12, cursor:'pointer',
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
                        <KpiCard label={`CAGR (${trueCagr.years}J)`} value={(trueCagr.value >= 0 ? '+' : '') + String(trueCagr.value).replace('.', ',') + ' %'} color={trueCagr.value >= 0 ? '#5bcec2' : '#ef4444'} sub={`${trueCagr.from} – ${trueCagr.to} · jährlich kumuliert`} />
                      )}
                      <KpiCard label="YoY-Wachstum" value={yoy === null ? '–' : (yoy >= 0 ? '+' : '') + String(yoy).replace('.', ',') + ' %'} color={yoy === null ? '#556070' : yoy >= 0 ? '#22c55e' : '#ef4444'} sub={yoy === null ? 'Nicht genügend Verlaufsdaten' : 'Akt. 12M vs. Vorjahr 12M'} />
                      {hasRealData && (
                        <KpiCard label="Real (inflationsber.)" value={fmt(realTotal)} color="#f59e0b" detail={{ label: 'Kaufkraftverlust', value: fmt(inflation), color: '#ef4444' }} sub={`Gesamt · Basis: ${Object.keys(monthly).map(Number).sort()[0]}`} />
                      )}
                    </div>

                    <p style={{ fontSize:11, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Prognose · Nächste 12 Monate</p>
                    <div className="kpi-grid">
                      <KpiCard label="Voraussichtlich Netto" value={fmt(forecast12m.total)} color="#f472b6" detail={{ label:'Ø Monatlich', value:fmt(forecast12m.avg), color:'#f472b6' }} sub="Prognose basierend auf Vorjahren" />
                      <KpiCard label={`Wachstum ${cy} vs. ${cy - 1}`} value={(() => { const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0); const actualLastYear = yearTotal(monthly, cy - 1); if (actualLastYear === 0) return '–'; const growth = ((forecastCurrentYear - actualLastYear) / actualLastYear) * 100; return (growth >= 0 ? '+' : '') + growth.toFixed(1).replace('.', ',') + ' %' })()} color={(() => { const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0); const actualLastYear = yearTotal(monthly, cy - 1); if (actualLastYear === 0) return '#7a8ba0'; return ((forecastCurrentYear - actualLastYear) / actualLastYear) >= 0 ? '#22c55e' : '#ef4444' })()} sub="Prognose Gesamtjahr" />
                      <KpiCard label="Progn. Dividendenrendite" value={(() => { const forecastNet = calcForecastNext12mNet(); if (!currentValue || currentValue === 0) return '–'; return fmtPct((forecastNet / currentValue) * 100) })()} color="#5bcec2" sub="Prognose nächste 12M / Marktwert" />
                    </div>

                    <DividendChart monthly={monthly} cum={cum} forecastCum={forecastCum} forecastMonthly={forecastMonthly} byHolding={byHolding} forecastByHolding={forecastByHolding} />
                    <DividendHeatmap monthly={monthly} />

                    <div id="dividends-table">
                      <DividendDonut byHolding={byHolding} kpiRange={kpiRange} />
                      <PositionsTable byHolding={byHolding} kpiRange={kpiRange} />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* PORTFOLIO MODUS */}
        {appMode === 'portfolio' && (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 12px' }}>
            {page === 'portfolio-overview' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e0e6f0' }}>💼 Portfolio Bestände</h1>
                  <p style={{ color: '#7a8ba0', fontSize: 13, marginTop: 4 }}>Echtzeit-Depotwerte & Positionen</p>
                </div>
                <PortfolioDashboard 
                  currentValue={currentValue} 
                  forecast12m={forecast12m} 
                  holdings={holdings} 
                  byHolding={byHolding} 
                />
              </>
            )}

            {page === 'portfolio-assets' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e0e6f0' }}>🍰 Asset Allokation</h1>
                  <p style={{ color: '#7a8ba0', fontSize: 13, marginTop: 4 }}>Aufteilung der Positionen</p>
                </div>
                <DividendDonut byHolding={byHolding} kpiRange={kpiRange} />
              </>
            )}
          </div>
        )}
      </div>

      <Footer onNavigate={setPage} />
    </div>
  )
}
