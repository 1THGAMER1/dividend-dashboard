import { getAccessToken } from './auth'
import { supabase } from './supabaseClient'

const BASE = '/api'
const YAHOO_FN = '/.netlify/functions/yahoo-dividends'
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/
const CACHE_TTL_DAYS = 30
const BATCH_SIZE = 5
const BATCH_DELAY_MS = 500
const RETRY_DELAYS = [1000, 2000, 4000]

const GBX_SUFFIXES = ['.L', '.IL']
const EUR_SUFFIXES = ['.AS', '.DE', '.F', '.MI', '.PA', '.BR', '.VI', '.MC']

function isGbxTicker(ticker) {
  return ticker ? GBX_SUFFIXES.some(s => ticker.endsWith(s)) : false
}
function isEurTicker(ticker) {
  return ticker ? EUR_SUFFIXES.some(s => ticker.endsWith(s)) : false
}
// Ticker der durch den Resolver muss: ISIN, GBX, oder kein EUR-Suffix
function needsResolution(ticker) {
  if (!ticker) return true
  if (ISIN_REGEX.test(ticker)) return true
  if (isGbxTicker(ticker)) return true
  if (!isEurTicker(ticker)) return true  // z.B. AAPL, MSFT, VWRL -> durch Resolver
  return false
}

let _portfolioId = import.meta.env.VITE_PORTFOLIO_ID || null

let _onTickerProgress = null
export function setTickerProgressCallback(fn) { _onTickerProgress = fn }

function emitProgress(done, total, label) {
  _onTickerProgress?.({ done, total, label })
}

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

export async function fetchSellActivities() {
  const PID = await getPortfolioId()
  let all = [], cursor = null
  do {
    const params = new URLSearchParams({ activityType: 'sell', limit: '200' })
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

  let cursor = null
  do {
    const params = new URLSearchParams({ limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const data = await request(`/portfolios/${PID}/holdings?${params}`)
    const items = data.items || data.holdings || []

    for (const h of items) {
      const isin = h.asset?.isin || h.asset?.symbol
      const name = h.asset?.name || h.asset?.symbol || isin
      if (!isin) continue

      names[isin]  = name
      types[isin]  = h.asset?.type || 'security'

      const ticker = h.asset?.ticker || h.asset?.symbol || null
      tickers[isin] = (ticker && ticker !== isin) ? ticker : isin
    }

    cursor = data.cursor || null
  } while (cursor)

  return { names, types, tickers }
}

// --- Supabase Ticker Cache ---
// GBX-Ticker und non-EUR Ticker werden nie gecacht bzw. beim Laden invalidiert.

async function invalidateNonEurTickerCache(isins) {
  if (isins.length === 0) return
  const { data } = await supabase
    .from('isin_ticker_cache')
    .select('isin, ticker')
    .in('isin', isins)
  if (!data) return
  const badIsins = data.filter(r => !isEurTicker(r.ticker)).map(r => r.isin)
  if (badIsins.length === 0) return
  console.log(`[Cache] Invalidiere ${badIsins.length} non-EUR Eintraege`)
  await supabase.from('isin_ticker_cache').delete().in('isin', badIsins)
}

async function loadTickerCache(isins) {
  if (isins.length === 0) return {}
  const { data } = await supabase
    .from('isin_ticker_cache')
    .select('isin, ticker, updated_at')
    .in('isin', isins)
  if (!data) return {}
  const cutoff = Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
  const map = {}
  for (const row of data) {
    if (!row.ticker) continue
    if (!isEurTicker(row.ticker)) continue  // nur EUR-Ticker aus Cache verwenden
    if (new Date(row.updated_at).getTime() > cutoff) {
      map[row.isin] = row.ticker
    }
  }
  return map
}

async function saveTickerCache(entries) {
  const valid = entries.filter(e => e.ticker && isEurTicker(e.ticker))
  if (valid.length === 0) return
  await supabase
    .from('isin_ticker_cache')
    .upsert(
      valid.map(e => ({ isin: e.isin, ticker: e.ticker, updated_at: new Date().toISOString() })),
      { onConflict: 'isin' }
    )
}

async function resolveOneIsin(isin) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(`${YAHOO_FN}?ticker=${encodeURIComponent(isin)}`)
      if (res.status === 429) {
        const wait = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      if (!res.ok) return null
      const data = await res.json()
      return data.resolvedTicker || null
    } catch {
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
      }
    }
  }
  return null
}

async function resolveIsinsToTickers(isins) {
  // Nicht-EUR Eintraege aus Cache loeschen
  await invalidateNonEurTickerCache(isins)

  const cached  = await loadTickerCache(isins)
  const missing = isins.filter(i => !(i in cached))

  console.log(`[Cache] ${Object.keys(cached).length} gecacht, ${missing.length} aufzuloesen`)

  if (missing.length === 0) return cached

  const total      = missing.length
  let   done       = 0
  const result     = { ...cached }
  const newEntries = []

  emitProgress(0, total, 'Ticker werden aufgeloest…')

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map(isin => resolveOneIsin(isin))
    )

    for (let j = 0; j < batch.length; j++) {
      const isin   = batch[j]
      const ticker = batchResults[j].status === 'fulfilled' ? batchResults[j].value : null
      result[isin] = ticker
      if (ticker) newEntries.push({ isin, ticker })
      done++
      console.log(`[Resolve] ${isin} -> ${ticker ?? 'nicht gefunden'}`)
    }

    emitProgress(done, total, `Ticker aufgeloest: ${done}/${total}`)

    if (i + BATCH_SIZE < missing.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  await saveTickerCache(newEntries)
  emitProgress(total, total, 'Fertig')
  return result
}

// --- Yahoo Dividenden ---

export async function fetchYahooDividends(ticker) {
  if (!ticker) return { dividends: [], currency: 'EUR', _resolvedTicker: null }
  try {
    const res = await fetch(`${YAHOO_FN}?ticker=${encodeURIComponent(ticker)}`)
    if (!res.ok) return { dividends: [], currency: 'EUR', _resolvedTicker: null }
    const data = await res.json()
    return {
      dividends:       data.dividends      || [],
      currency:        data.currency       || 'EUR',
      _resolvedTicker: data.resolvedTicker || null,
    }
  } catch {
    return { dividends: [], currency: 'EUR', _resolvedTicker: null }
  }
}

const NO_DIVIDEND_TYPES = new Set(['crypto', 'cryptocurrency'])

export async function fetchYahooDividendsForHoldings(tickers = {}, types = {}) {
  const allIsins = Object.keys(tickers)
  if (allIsins.length === 0) return {}

  const relevant = allIsins.filter(isin => {
    const t = (types[isin] || '').toLowerCase()
    return !NO_DIVIDEND_TYPES.has(t)
  })

  // Alle Holdings durch Resolver schicken die keinen EUR-Ticker haben
  const toResolve = relevant.filter(isin => needsResolution(tickers[isin]))
  console.log(`[Yahoo] ${toResolve.length}/${relevant.length} benoetigen Resolver (non-EUR/ISIN/.L)`)

  const tickerMap = await resolveIsinsToTickers(toResolve)

  const resolvedTickers = {}
  for (const isin of relevant) {
    const raw = tickers[isin]
    if (isEurTicker(raw)) {
      // Parqet hat bereits einen EUR-Ticker geliefert -> direkt verwenden
      resolvedTickers[isin] = raw
    } else {
      // Resolver-Ergebnis verwenden
      resolvedTickers[isin] = tickerMap[isin] || null
    }
  }

  const withTicker = relevant.filter(isin => resolvedTickers[isin])
  console.log(`[Yahoo] ${withTicker.length}/${relevant.length} mit EUR-Ticker`)

  const results = await Promise.allSettled(
    withTicker.map(async isin => {
      const symbol = resolvedTickers[isin]
      const { dividends } = await fetchYahooDividends(symbol)
      return { isin, dividends }
    })
  )

  const map = {}
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.dividends.length > 0) {
      map[r.value.isin] = r.value.dividends
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
