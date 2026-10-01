import { useEffect, useState, useRef } from 'react'
import { startOAuthFlow, logout, getClientId, clearCachedClientId } from './auth'
import { supabase } from './supabaseClient'
import useDividendData from './hooks/useDividendData'
import { calcRealTotal } from './inflation'
import { setTickerProgressCallback } from './api'

import LoginScreen           from './components/LoginScreen.jsx'
import AppLogin              from './components/AppLogin.jsx'
import ParqetSetup           from './components/ParqetSetup'
import SharedPortfolioView   from './Views/SharedPortfolioView.jsx'
import DividendDashboardView from './Views/DividendDashboardView.jsx'
import PortfolioPageView     from './Views/PortfolioPageView.jsx'
import DividendsPageView     from './Views/DividendsPageView.jsx'
import ProfilePage           from './pages/ProfilePage'
import RoadmapPage           from './pages/RoadmapPage'
import Footer                from './components/Footer'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'

const DIVIDEND_TABS = [
  { id: 'dashboard',  emoji: '📊', label: 'Dashboard'  },
  { id: 'calendar',   emoji: '🗓',  label: 'Kalender'   },
  { id: 'calculator', emoji: '🧭', label: 'Rechner'    },
  { id: 'drip',       emoji: '♻️', label: 'DRIP'       },
]

const PORTFOLIO_TABS = [
  { id: 'portfolio-overview', emoji: '💼', label: 'Bestände'    },
  { id: 'portfolio-assets',   emoji: '🍰', label: 'Allokation'  },
  { id: 'portfolio-xray', emoji: '🔬', label: 'X-Ray'}
]

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
        <circle cx="16" cy="16" r="12" fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="28 48" strokeDashoffset="0" strokeLinecap="round"/>
        <polyline points="11,19 15,13 17,16 21,10" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
  )
}

function LoadingScreen({ text, progress }) {
  const hasProgress = progress && progress.total > 0
  const pct = hasProgress ? Math.round((progress.done / progress.total) * 100) : null

  return (
      <div style={{ minHeight: '100vh', background: '#0f1420', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 16 }}>
        <div style={{ animation: 'logoPulse 1.6s ease-in-out infinite' }}><DashLogo size={64} /></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#e0e6f0', fontWeight: 700, fontSize: 16, margin: 0 }}>Portfolio Dashboard</p>
          <p style={{ color: '#556070', fontSize: 13, margin: '4px 0 0' }}>{text}</p>
        </div>
        {hasProgress ? (
            <div style={{ width: '100%', maxWidth: 220, textAlign: 'center' }}>
              <div style={{ width: '100%', height: 6, background: '#1e2a3a', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', borderRadius: 99, transition: 'width 0.3s ease' }} />
              </div>
              <span style={{ color: '#556070', fontSize: 12 }}>{progress.label} ({pct} %)</span>
            </div>
        ) : (
            <div style={{ width: 160, height: 3, background: '#1e2a3a', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #22c55e, #4ade80)', borderRadius: 99, animation: 'loadBar 1.6s ease-in-out infinite' }} />
            </div>
        )}
      </div>
  )
}

export default function App() {
  const sharedToken = window.location.hash.startsWith('#share/') ? window.location.hash.replace('#share/', '') : null
  if (sharedToken) return <SharedPortfolioView sharedToken={sharedToken} />

  const [page, setPage] = useState(() => window.location.hash.replace('#', '') || 'dashboard')
  const [appMode, setAppMode] = useState(() => window.location.hash.startsWith('#portfolio') ? 'portfolio' : 'dividends')

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash && hash !== page) {
        setPage(hash)
        setAppMode(hash.startsWith('portfolio') ? 'portfolio' : 'dividends')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [page])

  const handlePageChange = (newPage) => { setPage(newPage); window.location.hash = newPage }
  const handleModeSwitch = (newMode) => {
    setAppMode(newMode)
    handlePageChange(newMode === 'dividends' ? 'dashboard' : 'portfolio-overview')
  }

  const {
    loggedIn, monthly, cum, forecastCum, forecastMonthly,
    byHolding, forecastByHolding, holdings, enrichedHoldings,
    kpi, dividendYield, loading, authLoading, error, loadData, currentValue
  } = useDividendData()

  const [kpiRange, setKpiRange] = useState('all')
  const [appUser, setAppUser] = useState(undefined)
  const [clientIdReady, setClientIdReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [tickerProgress, setTickerProgress] = useState(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const currentTabs = appMode === 'dividends' ? DIVIDEND_TABS : PORTFOLIO_TABS

  useEffect(() => {
    const handleClickOutside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setTickerProgressCallback((p) => setTickerProgress(p.done >= p.total ? null : p))
    return () => setTickerProgressCallback(null)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => { if (mounted) setAppUser(data.session?.user ?? null) })
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setAppUser(session?.user ?? null)
      if (!session?.user) { clearCachedClientId(); setClientIdReady(false) }
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    async function loadProfileState() {
      if (!appUser) { if (active) { setClientIdReady(false); setProfileLoading(false) } return }
      try {
        const clientId = await getClientId()
        if (active) setClientIdReady(!!clientId)
      } catch { if (active) setClientIdReady(false) }
      finally { if (active) setProfileLoading(false) }
    }
    loadProfileState()
    return () => { active = false }
  }, [appUser])

  if (appUser === undefined || profileLoading) return <LoadingScreen text="App wird vorbereitet…" />
  if (!appUser)        return <AppLogin />
  if (!clientIdReady)  return <ParqetSetup onDone={() => setClientIdReady(true)} />
  if (authLoading)     return <LoadingScreen text="Authentifizierung läuft…" />
  if (!loggedIn)       return <LoginScreen onLogin={startOAuthFlow} loading={authLoading} error={error} />
  if (tickerProgress)  return <LoadingScreen text="Wertpapiere & Kurse werden geladen…" progress={tickerProgress} />

  const cy = new Date().getFullYear()
  const cm = new Date().getMonth()

  const calcForecastNext12m = () => {
    let total = 0
    for (let i = 0; i < 12; i++) total += forecastMonthly?.[cy + Math.floor((cm + 1 + i) / 12)]?.[(cm + 1 + i) % 12] ?? 0
    return { total: +total.toFixed(2), avg: +(total / 12).toFixed(2) }
  }

  const forecast12m = { ...calcForecastNext12m(), net: calcForecastNext12m()?.total || 0 }
  const k = {
    net: fmt(kpi[kpiRange]?.net ?? 0),
    gross: fmt(kpi[kpiRange]?.gross ?? 0),
    tax: fmt(kpi[kpiRange]?.tax ?? 0),
    avg: fmt(kpi[kpiRange]?.avgMonthly ?? 0),
  }

  const yoy = (() => {
    const latest = rolling12m(monthly, cy, cm)
    const prev = rolling12m(monthly, cy - 1, cm)
    return (latest < 1 || prev < 1) ? null : +((latest / prev - 1) * 100).toFixed(1)
  })()

  const trueCagr = (() => {
    const years = Object.keys(monthly || {}).map(Number).filter(y => y < cy).sort()
    if (years.length < 2) return null
    const firstYear = years[0], lastYear = years[years.length - 1], numYears = lastYear - firstYear
    const startVal = yearTotal(monthly, firstYear), endVal = yearTotal(monthly, lastYear)
    if (startVal < 1 || endVal < 1 || numYears < 1) return null
    return { value: +(((Math.pow(endVal / startVal, 1 / numYears) - 1) * 100)).toFixed(1), from: firstYear, to: lastYear, years: numYears }
  })()

  const nominalTotal = kpi['all']?.net ?? 0
  const realTotal = calcRealTotal(monthly)
  const portfolioData = { currentValue, totalDividendsNet: nominalTotal, dividendYield: (dividendYield['12m'] ?? dividendYield['all'] ?? 0) / 100, cagrTotal: yoy }

  return (
      <div style={{ minHeight: '100vh', background: '#0f1420', display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b27', borderBottom: '1px solid #1e2a3a', padding: '0 8px', height: 52, position: 'sticky', top: 0, zIndex: 100, gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <DashLogo size={26} />
            <div style={{ display: 'flex', background: '#0f1420', padding: 2, borderRadius: 8, border: '1px solid #1e2a3a' }}>
              <button onClick={() => handleModeSwitch('dividends')} style={{ background: appMode === 'dividends' ? '#009991' : 'transparent', color: appMode === 'dividends' ? '#ffffff' : '#64748b', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>💰 Dividenden</button>
              <button onClick={() => handleModeSwitch('portfolio')} style={{ background: appMode === 'portfolio' ? '#009991' : 'transparent', color: appMode === 'portfolio' ? '#ffffff' : '#64748b', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>💼 Portfolio</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 2 }}>
            {currentTabs.map(tab => (
                <button key={tab.id} onClick={() => handlePageChange(tab.id)} style={{ background: page === tab.id ? '#009991' : 'transparent', color: page === tab.id ? 'white' : '#556070', border: 'none', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <span>{tab.emoji}</span><span>{tab.label}</span>
                </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={loadData} disabled={loading} style={{ background: loading ? '#1a2233' : '#1e3a5f', border: '1px solid #3b82f6', color: '#93c5fd', padding: '5px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11 }}>↻</button>
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button onClick={() => setUserMenuOpen(!userMenuOpen)} style={{ background: '#1e2a3a', border: '1px solid #2a3a50', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
                {appUser?.user_metadata?.avatar_url ? <img src={appUser.user_metadata.avatar_url} alt="Profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>{appUser?.email?.[0]?.toUpperCase()}</span>}
              </button>
              {userMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#161b27', border: '1px solid #2a3a50', borderRadius: 12, padding: '8px 0', width: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 200 }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #1e2a3a', marginBottom: 4 }}>
                      <p style={{ margin: 0, color: '#e0e6f0', fontSize: 13, fontWeight: 600 }}>{appUser?.user_metadata?.full_name || 'Benutzer'}</p>
                      <p style={{ margin: '2px 0 0', color: '#7a8ba0', fontSize: 11 }}>{appUser?.email}</p>
                    </div>
                    <button onClick={() => { setPage('profile'); setUserMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#e0e6f0', padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>⚙️ Mein Profil</button>
                    <button onClick={() => { logout(); setUserMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#fca5a5', padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderTop: '1px solid #1e2a3a', marginTop: 4 }}>🚪 Abmelden</button>
                  </div>
              )}
            </div>
          </div>
        </nav>

        <div style={{ flex: 1, padding: '16px 10px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {page === 'profile' && <ProfilePage appUser={appUser} />}
          {page === 'roadmap' && <RoadmapPage />}

          {appMode === 'dividends' && (
              <>
                {page === 'dashboard' && (
                    <DividendDashboardView
                        showSkeleton={loading && Object.keys(monthly || {}).length === 0}
                        showEmpty={!loading && Object.keys(monthly || {}).length === 0}
                        loadData={loadData} loading={loading} error={error}
                        kpiRange={kpiRange} setKpiRange={setKpiRange} k={k}
                        dividendYield={dividendYield} trueCagr={trueCagr} yoy={yoy}
                        hasRealData={nominalTotal > 0 && Object.keys(monthly || {}).length > 1}
                        realTotal={realTotal} inflation={nominalTotal - realTotal}
                        forecast12m={forecast12m} cy={cy} forecastMonthly={forecastMonthly}
                        monthly={monthly} cum={cum} forecastCum={forecastCum}
                        byHolding={byHolding} forecastByHolding={forecastByHolding}
                        currentValue={currentValue} yearTotal={yearTotal}
                    />
                )}
                <DividendsPageView page={page} portfolioData={portfolioData} forecastByHolding={forecastByHolding} byHolding={byHolding} monthly={monthly} loadData={loadData} loading={loading} error={error} />
              </>
          )}

          {appMode === 'portfolio' && (
              <PortfolioPageView page={page} currentValue={currentValue} enrichedHoldings={enrichedHoldings} holdings={holdings} byHolding={byHolding} />
          )}
        </div>
        <Footer onNavigate={setPage} />
      </div>
  )
}