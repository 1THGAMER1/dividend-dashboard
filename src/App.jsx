import { useEffect, useState } from 'react'
import { startOAuthFlow, logout, getClientId, clearCachedClientId } from './auth'
import { supabase } from './supabaseClient'
import useDividendData from './hooks/useDividendData'

import KpiCard            from './components/KpiCard'
import LoginScreen        from './components/LoginScreen'
import AppLogin           from './components/AppLogin'
import ParqetSetup        from './components/ParqetSetup'
import DividendChart      from './components/DividendChart'
import DividendHeatmap    from './components/DividendHeatmap'
import PositionsTable     from './components/PositionsTable'
import DividendCalculator from './pages/DividendCalculator'
import UpcomingDividends  from './components/UpcomingDividends'
import DividendCalendar   from './components/DividendCalendar'
import SkeletonDashboard  from './components/SkeletonDashboard'
import EmptyState         from './components/EmptyState'

const fmt    = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

const KPI_RANGES = [
  { key: 'all', label: 'Gesamt' },
  { key: 'ytd', label: 'YTD'   },
  { key: '12m', label: '12M'   },
]

const NAV_TABS = [
  { id: 'dashboard',  emoji: '📊', label: 'Dashboard'  },
  { id: 'calendar',   emoji: '🗓',  label: 'Kalender'   },
  { id: 'calculator', emoji: '🧭', label: 'Rechner'    },
]

const STATUS_INFO = {
  live:  { color: '#22c55e', text: '● Live',     tooltip: 'Frische Daten direkt von Parqet.' },
  cache: { color: '#60a5fa', text: '● Cache',    tooltip: 'Gespeicherte Daten. Klicke Aktualisieren.' },
  stale: { color: '#fb923c', text: '◑ Veraltet', tooltip: 'Älter als 24h. Bitte aktualisieren.' },
  error: { color: '#fb923c', text: '○ Fehler',   tooltip: 'Laden fehlgeschlagen.' },
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

function CenteredSpinner({ text }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:32 }}>⟳</div>
      <p style={{ color:'#7a8ba0' }}>{text}</p>
    </div>
  )
}

export default function App() {
  const {
    loggedIn,
    monthly, cum, forecastCum, forecastMonthly,
    byHolding, forecastByHolding,
    kpi, dividendYield,
    loading, authLoading,
    lastUpdated, dataSource, error,
    loadData,
    currentValue,
    buyActs,
  } = useDividendData()

  const [kpiRange,       setKpiRange]       = useState('all')
  const [page,           setPage]           = useState('dashboard')
  const [appUser,        setAppUser]        = useState(undefined)
  const [clientIdReady,  setClientIdReady]  = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [tooltipVisible, setTooltipVisible] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAppUser(data.session?.user ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAppUser(session?.user ?? null)
      clearCachedClientId()
      setClientIdReady(false)
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

  if (appUser === undefined || profileLoading) return <CenteredSpinner text="App wird vorbereitet…" />
  if (!appUser)        return <AppLogin />
  if (!clientIdReady)  return <ParqetSetup onDone={() => setClientIdReady(true)} />
  if (authLoading)     return <CenteredSpinner text="Authentifizierung läuft…" />
  if (!loggedIn)       return <LoginScreen onLogin={startOAuthFlow} loading={authLoading} error={error} />

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
    const years = Object.keys(monthly)
      .map(Number)
      .filter(y => y < cy)
      .sort()
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

  const portfolioData = {
    currentValue,
    totalDividendsNet:     calcForecastNext12mNet(),
    dividendYield:         ((dividendYield?.['12m'] ?? dividendYield?.['all'] ?? 0) + 0.01) / 100,
    forecastDividendYield: currentValue > 0 ? calcForecastNext12mNet() / currentValue : 0,
    cagrTotal:   yoy,
    cagrOrganic: null,
  }

  const statusIndicator = getStatusIndicator(dataSource)

  const hasData      = Object.keys(monthly).length > 0
  const showSkeleton = loading && !hasData
  const showEmpty    = !loading && !hasData

  return (
    <div style={{ minHeight: '100vh', background: '#0f1420' }}>

      {/* NAV */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#161b27', borderBottom: '1px solid #1e2a3a',
        padding: '0 10px', height: 52,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {NAV_TABS.map(tab => (
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <button onClick={logout} style={{
            background: 'transparent', border: '1px solid #2a3a50',
            color: '#7a8ba0', padding: '6px 10px', borderRadius: 8,
            cursor: 'pointer', fontSize: 12,
          }}>
            <span className="nav-full-label">Abmelden</span>
            <span className="nav-short-label">✕</span>
          </button>
        </div>
      </nav>

      {/* PAGES */}
      {page === 'calculator' && <DividendCalculator portfolioData={portfolioData} />}

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
            )
          }
        </div>
      )}

      {page === 'dashboard' && (
        <>
          {/* 1. Skeleton: erstes Laden, noch keine Daten */}
          {showSkeleton && <SkeletonDashboard />}

          {/* 2. Empty State: Laden fertig, aber keine Daten */}
          {showEmpty && <EmptyState onRefresh={loadData} loading={loading} error={error} />}

          {/* 3. Echter Inhalt */}
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
                <KpiCard label="Dividenden Netto" value={k.net} color="#22c55e"
                         detail={{ label:'Ø Monatlich', value:k.avg, color:'#a78bfa' }} />
                <KpiCard label="Brutto" value={k.gross} color="#60a5fa"
                         detail={{ label:'davon Steuern', value:k.tax, color:'#fb923c' }} />
                <KpiCard
                  label="Dividendenrendite"
                  value={fmtPct((dividendYield[kpiRange] ?? 0) + 0.01)}
                  color="#34d399"
                  sub="auf den Einstandskurs"
                />
                <KpiCard
                  label="YoY-Wachstum"
                  value={
                    yoy === null
                      ? '–'
                      : (yoy >= 0 ? '+' : '') + String(yoy).replace('.', ',') + ' %'
                  }
                  color={yoy === null ? '#556070' : yoy >= 0 ? '#22c55e' : '#ef4444'}
                  sub={yoy === null ? 'Nicht genügend Verlaufsdaten' : 'Akt. 12M vs. Vorjahr 12M'}
                />
              </div>

              {trueCagr !== null && (
                <div className="kpi-grid">
                  <KpiCard
                    label={`CAGR (${trueCagr.years}J)`}
                    value={(trueCagr.value >= 0 ? '+' : '') + String(trueCagr.value).replace('.', ',') + ' %'}
                    color={trueCagr.value >= 0 ? '#5bcec2' : '#ef4444'}
                    sub={`${trueCagr.from} – ${trueCagr.to} · jährlich kumuliert`}
                  />
                </div>
              )}

              <p style={{ fontSize:11, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
                Prognose · Nächste 12 Monate
              </p>
              <div className="kpi-grid">
                <KpiCard label="Voraussichtlich Netto" value={fmt(forecast12m.total)} color="#f472b6"
                         detail={{ label:'Ø Monatlich', value:fmt(forecast12m.avg), color:'#f472b6' }}
                         sub="Prognose basierend auf Vorjahren" />
                <KpiCard
                  label={`Wachstum ${cy} vs. ${cy - 1}`}
                  value={(() => {
                    const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0)
                    const actualLastYear = yearTotal(monthly, cy - 1)
                    if (actualLastYear === 0) return '–'
                    const growth = ((forecastCurrentYear - actualLastYear) / actualLastYear) * 100
                    return (growth >= 0 ? '+' : '') + growth.toFixed(1).replace('.', ',') + ' %'
                  })()}
                  color={(() => {
                    const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0)
                    const actualLastYear = yearTotal(monthly, cy - 1)
                    if (actualLastYear === 0) return '#7a8ba0'
                    return ((forecastCurrentYear - actualLastYear) / actualLastYear) >= 0 ? '#22c55e' : '#ef4444'
                  })()}
                  sub="Prognose Gesamtjahr"
                />
                <KpiCard
                  label="Progn. Dividendenrendite"
                  value={(() => {
                    const forecastNet = calcForecastNext12mNet()
                    if (!currentValue || currentValue === 0) return '–'
                    return fmtPct((forecastNet / currentValue) * 100)
                  })()}
                  color="#5bcec2"
                  sub="Prognose nächste 12M / Marktwert"
                />
              </div>

              <DividendChart
                monthly={monthly} cum={cum}
                forecastCum={forecastCum} forecastMonthly={forecastMonthly}
                byHolding={byHolding} forecastByHolding={forecastByHolding}
              />
              <DividendHeatmap monthly={monthly} />
              <div id="dividends-table">
                <PositionsTable byHolding={byHolding} kpiRange={kpiRange} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
