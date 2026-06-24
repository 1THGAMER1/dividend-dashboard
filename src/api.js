import { getAccessToken } from './auth'

const BASE = '/api'
let _portfolioId = import.meta.env.VITE_PORTFOLIO_ID || null

export async function getPortfolioId() {
  if (_portfolioId) return _portfolioId
  const data = await request('/portfolios')
  _portfolioId = (data.items || data.portfolios || [])[0]?.id
  return _portfolioId
}

async function request(path, options = {}) {
  const token = await getAccessToken()
  if (!token) throw new Error('Nicht eingeloggt')
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`API Fehler ${res.status}: ${path}`)
  return res.json()
}

export async function fetchDividendActivities() {
  const PID = await getPortfolioId()
  let all = [], cursor = null
  do {
    const params = new URLSearchParams({ activityType: 'dividend', limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const data = await request(`/portfolios/${PID}/activities?${params}`)
    all    = all.concat(data.activities || data.items || [])
    cursor = data.cursor || null
  } while (cursor)
  return all
}

export async function fetchBuyActivities() {
  const PID = await getPortfolioId()
  let all = [], cursor = null
  do {
    const params = new URLSearchParams({ activityType: 'buy', limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const data = await request(`/portfolios/${PID}/activities?${params}`)
    all    = all.concat(data.activities || data.items || [])
    cursor = data.cursor || null
  } while (cursor)
  return all
}

export async function fetchPurchaseValue() {
  const all = await fetchBuyActivities()
  return all.reduce((s, a) => s + (a.amount ?? 0), 0)
}

export async function fetchPurchaseValuePerHolding() {
  const all = await fetchBuyActivities()
  const map = {}
  for (const a of all) {
    const key = a.asset?.isin || a.asset?.symbol || 'unknown'
    map[key] = (map[key] || 0) + (a.amount ?? 0)
  }
  return map
}

export async function fetchHoldingNames() {
  const PID = await getPortfolioId()
  const names   = {}
  const types   = {}
  const tickers = {}

  // Pagination-Loop: lade ALLE Holdings, nicht nur Seite 1
  let cursor = null
  do {
    const params = new URLSearchParams({ limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const data = await request(`/portfolios/${PID}/holdings?${params}`)
    const items = data.items || data.holdings || []

    for (const h of items) {
      const isin = h.asset?.isin || h.asset?.symbol
      const name = h.asset?.name || h.asset?.symbol || isin
      if (isin) {
        names[isin]   = name
        types[isin]   = h.asset?.type || 'security'
        const ticker  = h.asset?.ticker || h.asset?.symbol || null
        if (ticker) tickers[isin] = ticker
      }
    }

    cursor = data.cursor || null
  } while (cursor)

  // Debug: zeige alle Holdings mit Typ und Ticker
  console.log('[Holdings] Rohdaten von Parqet:')
  for (const isin of Object.keys(names)) {
    console.log(`  ${isin} | type="${types[isin]}" | ticker="${tickers[isin] ?? '–'}" | name="${names[isin]}"`)
  }

  return { names, types, tickers }
}

/**
 * Holt Yahoo Finance Dividendenhistorie fuer einen Ticker oder eine ISIN.
 * Gibt ein Array von { date, amount, month, year } zurueck.
 * Bei Fehler oder fehlendem Ticker wird [] zurueckgegeben.
 */
export async function fetchYahooDividends(ticker) {
  if (!ticker) return []
  try {
    const res = await fetch(`/yahoo-dividends?ticker=${encodeURIComponent(ticker)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.dividends || []
  } catch {
    return []
  }
}

// Typen die keine Dividenden zahlen → kein Yahoo-Request
const NO_DIVIDEND_TYPES = new Set(['crypto', 'cryptocurrency'])

// ISINs beginnen mit 2 Großbuchstaben gefolgt von Ziffern/Buchstaben (12 Zeichen)
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/

/**
 * Ladet Yahoo-Dividendendaten fuer alle Holdings parallel.
 * Strategie pro Holding:
 *   1. Versuche mit Ticker (falls vorhanden und kein ISIN-Format)
 *   2. Falls keine Dividenden → versuche direkt mit ISIN
 *   3. Falls immer noch nichts → leer
 * Krypto-Holdings werden uebersprungen.
 * Gibt { [isin]: [{month, year, amount}, ...] } zurueck.
 */
export async function fetchYahooDividendsForHoldings(tickers = {}, types = {}) {
  const allIsins = Object.keys(tickers)
  if (allIsins.length === 0) return {}

  // Debug: zeige welche Types ankommen und was gefiltert wird
  console.log('[Yahoo] Filter-Entscheidungen:')
  for (const isin of allIsins) {
    const t    = types[isin] ?? '(nicht im types-Objekt)'
    const skip = NO_DIVIDEND_TYPES.has((types[isin] || '').toLowerCase())
    console.log(`  ${isin} | type="${t}" | ${skip ? '⛔ übersprungen' : '✓ wird abgefragt'}`)
  }

  // Krypto rausfiltern
  const relevant = allIsins.filter(isin => {
    const t = (types[isin] || '').toLowerCase()
    return !NO_DIVIDEND_TYPES.has(t)
  })

  const skipped = allIsins.length - relevant.length
  console.log(`[Yahoo] ${relevant.length}/${allIsins.length} Holdings werden abgefragt (${skipped} Krypto uebersprungen)`)

  const results = await Promise.allSettled(
    relevant.map(async isin => {
      const rawTicker = tickers[isin] || null

      // Pruefe ob rawTicker ein echter Boersen-Ticker ist oder nur eine ISIN/interner Code
      const tickerIsReal = rawTicker &&
        !ISIN_REGEX.test(rawTicker) &&
        rawTicker !== isin

      // Schritt 1: Ticker versuchen (falls echter Ticker vorhanden)
      if (tickerIsReal) {
        const divs = await fetchYahooDividends(rawTicker)
        if (divs.length > 0) {
          console.log(`[Yahoo] ✓ ${rawTicker} (Ticker): ${divs.length} Dividenden`)
          return { isin, divs }
        }
        console.log(`[Yahoo] ~ ${rawTicker} (Ticker): keine Dividenden, versuche ISIN...`)
      }

      // Schritt 2: ISIN direkt versuchen (Yahoo kennt viele ISINs direkt)
      if (ISIN_REGEX.test(isin)) {
        const divs = await fetchYahooDividends(isin)
        if (divs.length > 0) {
          console.log(`[Yahoo] ✓ ${isin} (ISIN): ${divs.length} Dividenden`)
          return { isin, divs }
        }
        console.log(`[Yahoo] - ${isin}: keine Dividenden gefunden`)
      }

      return { isin, divs: [] }
    })
  )

  const map = {}
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.divs.length > 0) {
      map[r.value.isin] = r.value.divs
    }
  }
  return map
}

export function calcKpiFromActivities(activities, range = 'all') {
  const now = new Date()

  const filtered = activities.filter(a => {
    const diff = (now - new Date(a.datetime)) / 864e5
    if (range === 'ytd') {
      const d = new Date(a.datetime)
      return d.getFullYear() === now.getFullYear()
    }
    if (range === '12m') return diff <= 365
    return true
  })

  const gross = filtered.reduce((s, a) => s + (a.amount    ?? 0), 0)
  const net   = filtered.reduce((s, a) => s + (a.amountNet ?? a.amount ?? 0), 0)
  const tax   = gross - net

  let months
  if (range === 'ytd') {
    months = now.getMonth() + 1
  } else if (range === '12m') {
    months = 12
  } else {
    if (activities.length > 0) {
      const first = new Date(activities.slice().sort((a, b) => new Date(a.datetime) - new Date(b.datetime))[0].datetime)
      months = Math.max(1, Math.round((now - first) / (1000 * 60 * 60 * 24 * 30.44)))
    } else {
      months = 1
    }
  }

  return {
    net:        +net.toFixed(2),
    gross:      +gross.toFixed(2),
    tax:        +tax.toFixed(2),
    avgMonthly: +(net / months).toFixed(2),
  }
}

export async function fetchCurrentValue() {
  const PID = await getPortfolioId()
  try {
    const data = await request('/performance', {
      method: 'POST',
      body: JSON.stringify({
        portfolioIds: [PID],
        intervalType: 'relative',
        intervalValue: 'max',
      }),
    })
    return data?.performance?.valuation?.atIntervalEnd ?? 0
  } catch (e) {
    console.error('fetchCurrentValue Fehler:', e.message)
    return 0
  }
}
