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

const fmt    = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

const KPI_RANGES = [
  { key: 'all', label: 'Gesamt' },
  { key: 'ytd', label: 'YTD'   },
  { key: '12m', label: '12M'   },
]

const NAV_TABS = [
  { id: 'dashboard',  label: '📊 Dashboard' },
  { id: 'calculator', label: '🧮 Rechner'   },
]

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
  } = useDividendData()

  const [kpiRange,      setKpiRange]      = useState('all')
  const [page,          setPage]          = useState('dashboard')
  const [appUser,       setAppUser]       = useState(undefined)
  const [clientIdReady, setClientIdReady] = useState(false)
  const [profileLoading,setProfileLoading]= useState(true)

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

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadProfileState() {
      if (!appUser) {
        if (active) {
          setClientIdReady(false)
          setProfileLoading(false)
        }
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

  if (appUser === undefined || profileLoading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        <div style={{ fontSize:32 }}>⟳</div>
        <p style={{ color:'#7a8ba0' }}>App wird vorbereitet…</p>
      </div>
    )
  }

  if (!appUser) return <AppLogin />
  if (!clientIdReady) return <ParqetSetup onDone={() => setClientIdReady(true)} />

  if (authLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:32 }}>⟳</div>
      <p style={{ color:'#7a8ba0' }}>Authentifizierung läuft…</p>
    </div>
  )

  if (!loggedIn) return <LoginScreen onLogin={startOAuthFlow} loading={authLoading} error={error} />

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

  const topHolder = (() => {
    if (!byHolding || Object.keys(byHolding).length === 0) return null
    const now = new Date()
    let topIsin = null, topNet = 0
    for (const [isin, h] of Object.entries(byHolding)) {
      let net = 0
      for (const [year, months] of Object.entries(h.monthly || {})) {
        for (let m = 0; m < 12; m++) {
          const val  = months[m] || 0
          const date = new Date(+year, m, 1)
          const diff = (now - date) / 864e5
          if (kpiRange === 'ytd' && date.getFullYear() !== now.getFullYear()) continue
          if (kpiRange === '12m' && diff > 365) continue
          net += val
        }
      }
      if (net > topNet) { topNet = net; topIsin = isin }
    }
    if (!topIsin) return null
    const totalNet = (kpi[kpiRange] || kpi['all']).net || 1
    const share    = totalNet > 0 ? +((topNet / totalNet) * 100).toFixed(1) : 0
    return {
      name:  byHolding[topIsin].name || topIsin,
      value: fmt(topNet),
      share: `${String(share).replace('.', ',')} %`,
    }
  })()

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

  // Rolling 12-month sum helper: sum the 12 months ending at (year, month) inclusive
  const rolling12m = (endYear, endMonth) => {
    let total = 0
    for (let i = 0; i < 12; i++) {
      let m = endMonth - i
      let y = endYear
      if (m < 0) { m += 12; y -= 1 }
      total += monthly?.[y]?.[m] ?? 0
    }
    return total
  }

  const calcHistoricGrowth = () => {
    // Build a list of rolling-12m totals, stepping back month by month.
    // We need at least 2 data points 12 months apart to compute a meaningful growth rate.
    // Use up to 5 years of history (60 data points) for a stable CAGR.
    const now = new Date()
    const endYear  = now.getFullYear()
    const endMonth = now.getMonth() - 1  // last completed month

    // Normalise if endMonth went negative
    const baseYear  = endMonth < 0 ? endYear - 1 : endYear
    const baseMonth = endMonth < 0 ? endMonth + 12 : endMonth

    // Latest rolling 12m (ending last completed month)
    const latest = rolling12m(baseYear, baseMonth)

    // Rolling 12m one year earlier
    let prevMonth = baseMonth
    let prevYear  = baseYear - 1

    const earliest = rolling12m(prevYear, prevMonth)

    if (earliest <= 0 || latest <= 0) return 5

    // Simple 1-year growth rate — honest and partial-year-safe
    const growth = (latest / earliest - 1) * 100
    return +Math.min(Math.max(growth, 0), 50).toFixed(1)
  }

  const portfolioData = {
    currentValue,
    totalDividendsNet: calcForecastNext12mNet(),
    dividendYield:     ((dividendYield?.['12m'] ?? dividendYield?.['all'] ?? 0) + 0.01) / 100,
    forecastDividendYield: currentValue > 0 ? calcForecastNext12mNet() / currentValue : 0,
    historicGrowth: calcHistoricGrowth(),
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1420' }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#161b27', borderBottom: '1px solid #1e2a3a',
        padding: '10px 24px', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {NAV_TABS.map(tab => (
            <button key={tab.id} onClick={() => setPage(tab.id)} style={{
              background: page === tab.id ? '#009991' : 'transparent',
              color: page === tab.id ? 'white' : '#556070',
              border: 'none', borderRadius: 8, padding: '6px 18px',
              cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {lastUpdated && (
            <span style={{ color: dataSource === 'live' ? '#22c55e' : '#fb923c', fontSize: 12 }}>
              {dataSource === 'live' ? '● Live' : '○ Fehler'} · {lastUpdated.toLocaleTimeString('de-DE')}
            </span>
          )}
          <button onClick={loadData} disabled={loading} style={{
            background: loading ? '#1a2233' : '#1e3a5f',
            border: '1px solid #3b82f6', color: '#93c5fd',
            padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
          }}>
            {loading ? '⟳ Lade…' : '↻ Aktualisieren'}
          </button>
          <button onClick={logout} style={{
            background: 'transparent', border: '1px solid #2a3a50',
            color: '#7a8ba0', padding: '7px 14px', borderRadius: 8,
            cursor: 'pointer', fontSize: 13,
          }}>
            Abmelden
          </button>
        </div>
      </nav>

      {page === 'calculator' && (
        <DividendCalculator portfolioData={portfolioData} />
      )}

      {page === 'dashboard' && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={{ fontSize:22, fontWeight:700, color:'#e0e6f0' }}>📈 Dividenden Dashboard</h1>
              <p style={{ color:'#7a8ba0', fontSize:13, marginTop:4 }}>Portfolio-Übersicht · Nettowerte</p>
            </div>
          </div>

          {error && (
            <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:13 }}>
              ⚠ {error}
            </div>
          )}

          {loading && Object.keys(monthly).length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#7a8ba0' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⟳</div>
              <p>Dividenden werden geladen…</p>
            </div>
          )}

          {Object.keys(monthly).length > 0 && (
            <>
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
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

              <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:20 }}>
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
                {topHolder && (
                  <KpiCard label="Größter Dividendengeber" value={topHolder.name} color="#facc15"
                           detail={{ label:'Anteil', value:topHolder.share, color:'#facc15' }}
                           sub={topHolder.value} subHighlight
                           onClick={() => {
                             const el = document.getElementById('dividends-table')
                             window.scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' })
                           }}
                  />
                )}
              </div>

              <p style={{ fontSize:11, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
                Prognose · Nächste 12 Monate
              </p>
              <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:24 }}>
                <KpiCard label="Voraussichtlich Netto" value={fmt(forecast12m.total)} color="#f472b6"
                         detail={{ label:'Ø Monatlich', value:fmt(forecast12m.avg), color:'#f472b6' }}
                         sub="Prognose basierend auf Vorjahren" />
                <KpiCard
                  label="Wachstum ggü. letztem Jahr"
                  value={(() => {
                    const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0)
                    const actualLastYear = (Object.values(monthly[cy - 1] || [])).reduce((s, v) => s + v, 0)
                    if (actualLastYear === 0) return '–'
                    const growth = ((forecastCurrentYear - actualLastYear) / actualLastYear) * 100
                    return (growth >= 0 ? '+' : '') + growth.toFixed(1).replace('.', ',') + ' %'
                  })()}
                  color={(() => {
                    const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0)
                    const actualLastYear = (Object.values(monthly[cy - 1] || [])).reduce((s, v) => s + v, 0)
                    if (actualLastYear === 0) return '#7a8ba0'
                    const growth = ((forecastCurrentYear - actualLastYear) / actualLastYear) * 100
                    return growth >= 0 ? '#22c55e' : '#ef4444'
                  })()}
                  sub={`${cy} vs. ${cy - 1}`}
                />
                <KpiCard
                  label="Progn. Dividendenrendite"
                  value={(() => {
                    const forecastNet = calcForecastNext12mNet()
                    if (!currentValue || currentValue === 0) return '–'
                    const yield12m = (forecastNet / currentValue) * 100
                    return fmtPct(yield12m)
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
