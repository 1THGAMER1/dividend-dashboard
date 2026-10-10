  import { getAccessToken } from './auth'
  import { supabase } from './supabaseClient'
  
  const BASE = '/api'
  const YAHOO_FN = '/.netlify/functions/yahoo-dividends'
  const CMC_FN = '/.netlify/functions/coinmarketcap' // CoinMarketCap Abfrage
  const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/
  const CACHE_TTL_DAYS = 30
  const NOT_FOUND_TTL_DAYS = 7
  const NOT_FOUND_SENTINEL = 'NOT_FOUND'
  const BATCH_SIZE = 5
  const BATCH_DELAY_MS = 500
  const RETRY_DELAYS = [1000, 2000, 4000]
  
  const GBX_SUFFIXES = ['.L', '.IL']
  const EUR_SUFFIXES = ['.AS', '.DE', '.F', '.MI', '.PA', '.BR', '.VI', '.MC']
  
  // Bekannte Krypto-Symbole, die niemals durch den Yahoo-Resolver laufen dürfen
  const KNOWN_CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'DOT', 'AVAX', 'LINK', 'MATIC', 'BNB', 'USDT', 'USDC']
  
  function isGbxTicker(ticker) {
    return ticker ? GBX_SUFFIXES.some(s => ticker.endsWith(s)) : false
  }
  function isEurTicker(ticker) {
    return ticker ? EUR_SUFFIXES.some(s => ticker.endsWith(s)) : false
  }
  function needsResolution(ticker) {
    if (!ticker) return true
    // Wenn es sich um ein bekanntes Krypto-Symbol handelt, NIEMALS durch den Yahoo-Resolver jagen!
    if (KNOWN_CRYPTO_SYMBOLS.includes(ticker.toUpperCase())) return false
    if (ISIN_REGEX.test(ticker)) return true
    if (isGbxTicker(ticker)) return true
    if (!isEurTicker(ticker)) return true
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
  
  async function invalidateNonEurTickerCache(isins) {
    if (isins.length === 0) return
    const { data } = await supabase
        .from('isin_ticker_cache')
        .select('isin, ticker')
        .in('isin', isins)
    if (!data) return
    const badIsins = data.filter(r => r.ticker !== NOT_FOUND_SENTINEL && !isEurTicker(r.ticker) && !KNOWN_CRYPTO_SYMBOLS.includes(r.ticker?.toUpperCase())).map(r => r.isin)
    if (badIsins.length === 0) return
    await supabase.from('isin_ticker_cache').delete().in('isin', badIsins)
  }
  
  async function loadTickerCache(isins) {
    if (isins.length === 0) return {}
    const { data } = await supabase
        .from('isin_ticker_cache')
        .select('isin, ticker, updated_at')
        .in('isin', isins)
    if (!data) return {}
    const eurCutoff      = Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
    const notFoundCutoff = Date.now() - NOT_FOUND_TTL_DAYS * 24 * 60 * 60 * 1000
    const map = {}
    for (const row of data) {
      if (!row.ticker) continue
      const ts = new Date(row.updated_at).getTime()
      if (row.ticker === NOT_FOUND_SENTINEL) {
        if (ts > notFoundCutoff) map[row.isin] = null
      } else {
        if ((isEurTicker(row.ticker) || KNOWN_CRYPTO_SYMBOLS.includes(row.ticker.toUpperCase())) && ts > eurCutoff) {
          map[row.isin] = row.ticker
        }
      }
    }
    return map
  }
  
  async function saveTickerCache(entries) {
    if (entries.length === 0) return
    const rows = entries.map(e => ({
      isin:       e.isin,
      ticker:     e.ticker ?? NOT_FOUND_SENTINEL,
      updated_at: new Date().toISOString(),
    }))
    await supabase
        .from('isin_ticker_cache')
        .upsert(rows, { onConflict: 'isin' })
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
        return data.resolvedTicker || data.symbol || null
      } catch {
        if (attempt < RETRY_DELAYS.length) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
        }
      }
    }
    return null
  }
  
  async function resolveIsinsToTickers(isins) {
    await invalidateNonEurTickerCache(isins)
  
    const cached  = await loadTickerCache(isins)
    const missing = isins.filter(i => !(i in cached))
  
    if (missing.length === 0) return cached
  
    const total  = missing.length
    let   done   = 0
    const result = { ...cached }
    const newEntries = []
  
    emitProgress(0, total, 'Ticker werden aufgelöst…')
  
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE)
  
      const batchResults = await Promise.allSettled(
          batch.map(isin => resolveOneIsin(isin))
      )
  
      for (let j = 0; j < batch.length; j++) {
        const isin   = batch[j]
        const ticker = batchResults[j].status === 'fulfilled' ? batchResults[j].value : null
        result[isin] = ticker
        newEntries.push({ isin, ticker })
        done++
      }
  
      emitProgress(done, total, `Ticker aufgelöst: ${done}/${total}`)
  
      if (i + BATCH_SIZE < missing.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }
  
    await saveTickerCache(newEntries)
    emitProgress(total, total, 'Fertig')
    return result
  }
  
  // --- Kurs- & Dividendendaten (Smart Routing) ---
  
  export async function fetchYahooDividends(ticker) {
    if (!ticker) return { dividends: [], currency: 'EUR', price: null, _resolvedTicker: null }
    try {
      const res = await fetch(`${YAHOO_FN}?ticker=${encodeURIComponent(ticker)}`)
      if (!res.ok) return { dividends: [], currency: 'EUR', price: null, _resolvedTicker: null }
      const data = await res.json()
      return {
        dividends:       data.dividends          || [],
        currency:        data.currency           || 'EUR',
        price:           data.regularMarketPrice || data.price || null,
        _resolvedTicker: data.resolvedTicker     || null,
      }
    } catch {
      return { dividends: [], currency: 'EUR', price: null, _resolvedTicker: null }
    }
  }
  
  async function fetchCryptoPricesBatch(symbols = []) {
    if (symbols.length === 0) return {}
    try {
      const joined = symbols.join(',')
      const res = await fetch(`${CMC_FN}?symbols=${encodeURIComponent(joined)}`)
      if (!res.ok) return {}
      const data = await res.json()
      return data.coins || {}
    } catch {
      return {}
    }
  }
  
  export async function fetchYahooDividendsForHoldings(tickers = {}, types = {}) {
    const allIsins = Object.keys(tickers)
    if (allIsins.length === 0) return {}
  
    const cryptoSymbolsToFetch = []
    const cryptoIsinMap = {}
    const standardIsins = []
  
    // 1. Strenge Vorab-Trennung: Krypto (wie BTC) direkt für CoinMarketCap einplanen
    for (const isin of allIsins) {
      const rawType = (types[isin] || '').toLowerCase()
      const rawTicker = (tickers[isin] || '').toUpperCase()
  
      const isCrypto = rawType.includes('crypto') ||
          rawType.includes('coin') ||
          rawType.includes('token') ||
          KNOWN_CRYPTO_SYMBOLS.includes(rawTicker)
  
      if (isCrypto) {
        cryptoSymbolsToFetch.push(rawTicker)
        cryptoIsinMap[rawTicker] = isin
      } else {
        standardIsins.push(isin)
      }
    }
  
    const map = {}
  
    // 2. Krypto direkt über CoinMarketCap abfragen (kein Yahoo-Kontakt!)
    if (cryptoSymbolsToFetch.length > 0) {
      console.log(`[CMC Batch] Lade Krypto direkt:`, cryptoSymbolsToFetch)
      const cmcCoins = await fetchCryptoPricesBatch(cryptoSymbolsToFetch)
  
      for (const [rawSymbol, coinData] of Object.entries(cmcCoins)) {
        const isin = cryptoIsinMap[rawSymbol]
        if (isin && coinData.regularMarketPrice > 0) {
          map[isin] = {
            dividends: [],
            price: coinData.regularMarketPrice
          }
          console.log(`[CMC Erfolg] ${rawSymbol} -> ${coinData.regularMarketPrice} €`)
        }
      }
    }
  
    // 3. Reguläre Aktien & ETFs über Yahoo abwickeln
    if (standardIsins.length > 0) {
      const toResolve = standardIsins.filter(isin => needsResolution(tickers[isin]))
      const tickerMap = await resolveIsinsToTickers(toResolve)
  
      const resolvedTickers = {}
      for (const isin of standardIsins) {
        const raw = tickers[isin]
        if (isEurTicker(raw)) {
          resolvedTickers[isin] = raw
        } else {
          resolvedTickers[isin] = tickerMap[isin] || raw || null
        }
      }
  
      const withTicker = standardIsins.filter(isin => resolvedTickers[isin])
  
      const results = await Promise.allSettled(
          withTicker.map(async isin => {
            const symbol = resolvedTickers[isin]
            const { dividends, price } = await fetchYahooDividends(symbol)
            return { isin, dividends, price, symbol }
          })
      )
  
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { isin, dividends, price } = r.value
          if (price != null && !isNaN(price) && price > 0) {
            map[isin] = { dividends, price }
          }
        }
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

  // --- Performance: Depotwert und Verlaufsdaten aus EINEM Abruf ---

  const toIsoDate = (d) => {
    const t = new Date(d)
    return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10)
  }

  const toNum = (v) => {
    if (v == null) return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'object') return toNum(v.value ?? v.amount ?? v.net ?? v.gross)
    const n = parseFloat(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  // Ergebnis: [{ d: 'YYYY-MM-DD', v: Depotwert, c: eingesetztes Kapital, t: Rendite in % (zeitgewichtet) }]
  function extractPerformanceSeries(data) {
    const charts = data?.charts ?? data?.performance?.charts
    if (!charts) {
      console.warn('[Performance] Keine Chart-Daten in der Antwort. Felder:', Object.keys(data || {}))
      return []
    }

    // Zeilenform [{ date, history, ... }] oder Spaltenform { date: [...], history: [...] }
    let rows = []
    const firstChart = Array.isArray(charts) ? charts[0] : charts
    if (Array.isArray(firstChart?.date)) {
      rows = firstChart.date.map((date, i) => ({
        date,
        history: firstChart.history?.[i],
        capitalHistory: firstChart.capitalHistory?.[i],
        ttwror: firstChart.ttwror?.[i],
      }))
    } else if (Array.isArray(charts)) {
      rows = charts
    }

    let pts = rows
        .map(r => ({ d: toIsoDate(r?.date), v: toNum(r?.history), c: toNum(r?.capitalHistory), t: toNum(r?.ttwror) }))
        .filter(p => p.d && p.v != null)
        .sort((a, b) => a.d.localeCompare(b.d))

    pts = [...new Map(pts.map(p => [p.d, p])).values()] // pro Tag ein Punkt

    if (pts.length === 0) {
      console.warn('[Performance] Chart-Format nicht erkannt:', JSON.stringify(charts).slice(0, 600))
      return []
    }

    // ttwror: Bruchteil (0,05) oder Prozent (5)? Anhand des Gewinns auf das eingesetzte Kapital abschätzen
    const lastT = [...pts].reverse().find(p => p.t != null)?.t
    if (lastT != null) {
      const end = pts[pts.length - 1]
      const gainPct = end.c > 0 ? ((end.v - end.c) / end.c) * 100 : null
      const factor = gainPct != null
          ? (Math.abs(lastT * 100 - gainPct) < Math.abs(lastT - gainPct) ? 100 : 1)
          : (Math.max(...pts.map(p => Math.abs(p.t ?? 0))) <= 2 ? 100 : 1)
      if (factor !== 1) pts.forEach(p => { if (p.t != null) p.t = p.t * factor })
    }

    // Höchstens ~600 Punkte speichern (Cache und Ladezeit)
    const MAX_POINTS = 600
    if (pts.length > MAX_POINTS) {
      const step = Math.ceil(pts.length / MAX_POINTS)
      pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1)
    }

    return pts.map(p => ({
      d: p.d,
      v: +p.v.toFixed(2),
      c: p.c != null ? +p.c.toFixed(2) : null,
      t: p.t != null ? +p.t.toFixed(3) : null,
    }))
  }

  export async function fetchPerformance() {
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
      // Zum Prüfen der Rohdaten kurz einkommentieren:
      // console.log('PERF RAW', data)
      return {
        currentValue: data?.performance?.valuation?.atIntervalEnd ?? 0,
        series: extractPerformanceSeries(data),
      }
    } catch (e) {
      console.error('fetchPerformance Fehler:', e.message)
      return { currentValue: 0, series: [] }
    }
  }

  // Bleibt für bestehende Aufrufe erhalten
  export async function fetchCurrentValue() {
    return (await fetchPerformance()).currentValue
  }
  
  export async function fetchCurrentPrice(tickerOrIsin) {
    try {
      const upper = (tickerOrIsin || '').toUpperCase()
      if (KNOWN_CRYPTO_SYMBOLS.includes(upper)) {
        const cmcData = await fetchCryptoPricesBatch([upper])
        return cmcData[upper]?.regularMarketPrice || null
      }
  
      const res = await fetch(`${YAHOO_FN}?ticker=${encodeURIComponent(tickerOrIsin)}`)
      const data = await res.json()
      return data.regularMarketPrice || data.price || null
    } catch (e) {
      console.warn(`Konnte Kurs für ${tickerOrIsin} nicht laden:`, e.message)
      return null
    }
  }