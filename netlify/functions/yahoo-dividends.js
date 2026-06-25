// netlify/functions/yahoo-dividends.js
// Proxy fuer Yahoo Finance Dividendenhistorie
// Aufruf: GET /yahoo-dividends?ticker=AAPL
//         GET /yahoo-dividends?ticker=IE000S9YS762  <- ISIN wird aufgeloest

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/

// --- Resolver: Yahoo Finance Search (primaer) ------------------------------------
// Yahoo Search gibt direkt Yahoo-kompatible Ticker zurueck.
async function resolveTickerFromYahooSearch(isin) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0&listsCount=0`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    const quotes = (data?.quotes || []).filter(q =>
      q.symbol &&
      !q.symbol.includes('=') &&
      ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType)
    )
    if (quotes.length === 0) return null
    // Bevorzuge Ticker ohne Punkt (US-Boerse) oder mit bekannten Suffixen
    const preferred = quotes.find(q => !q.symbol.includes('.')) || quotes[0]
    return preferred.symbol
  } catch {
    return null
  }
}

// --- Validator: prueft ob ein Ticker bei Yahoo Daten liefert --------------------
async function validateTickerOnYahoo(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=1&interval=1d`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) return false
    const json = await res.json()
    return !!(json?.chart?.result?.[0])
  } catch {
    return false
  }
}

// --- Resolver: OpenFIGI (Fallback) -----------------------------------------------
async function resolveTickerFromOpenFigi(isin) {
  const strategies = [
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'US' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'LN' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'GS' },
    { idType: 'ID_ISIN', idValue: isin },
  ]
  const suffixMap = { GS: '.DE', LN: '.L', PA: '.PA', AS: '.AS', SW: '.SW' }

  for (const body of strategies) {
    try {
      const res = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([body]),
      })
      if (!res.ok) continue
      const data = await res.json()
      const item = data?.[0]?.data?.[0]
      if (!item?.ticker) continue
      const suffix = suffixMap[body.exchCode] || ''
      const candidate = item.ticker + suffix
      const valid = await validateTickerOnYahoo(candidate)
      if (valid) return candidate
    } catch {
      continue
    }
  }
  return null
}

// --- Hauptkette: Yahoo Search -> OpenFIGI ----------------------------------------
async function resolveTickerFromIsin(isin) {
  const yahooResult = await resolveTickerFromYahooSearch(isin)
  if (yahooResult) {
    console.log(`[Resolver] ${isin} via Yahoo Search -> ${yahooResult}`)
    return yahooResult
  }
  const figiResult = await resolveTickerFromOpenFigi(isin)
  if (figiResult) {
    console.log(`[Resolver] ${isin} via OpenFIGI -> ${figiResult}`)
    return figiResult
  }
  console.log(`[Resolver] ${isin} -> nicht aufloesbar`)
  return null
}

// --- Yahoo Finance Dividendenhistorie --------------------------------------------
async function fetchDividends(symbol) {
  const period1 = Math.floor((Date.now() - 5 * 365 * 24 * 60 * 60 * 1000) / 1000)
  const period2 = Math.floor(Date.now() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1mo&events=dividends&includePrePost=false`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) return { dividends: [], currency: 'EUR', resolvedTicker: symbol }

  const json = await res.json()
  const meta    = json?.chart?.result?.[0]?.meta ?? {}
  const rawDivs = json?.chart?.result?.[0]?.events?.dividends ?? {}
  const currency = meta.currency ?? 'EUR'

  const dividends = Object.values(rawDivs).map(d => {
    const date = new Date(d.date * 1000)
    return {
      date:   date.toISOString(),
      amount: d.amount,
      month:  date.getMonth(),
      year:   date.getFullYear(),
    }
  }).sort((a, b) => new Date(a.date) - new Date(b.date))

  return { dividends, currency, resolvedTicker: symbol }
}

// --- Handler ---------------------------------------------------------------------
exports.handler = async function (event) {
  const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' }
  }

  const ticker = event.queryStringParameters?.ticker
  if (!ticker) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ticker parameter required' }),
    }
  }

  try {
    let symbol = ticker

    if (ISIN_REGEX.test(ticker)) {
      const resolved = await resolveTickerFromIsin(ticker)
      if (!resolved) {
        return {
          statusCode: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dividends: [], currency: 'EUR', resolvedTicker: null }),
        }
      }
      symbol = resolved
    }

    const result = await fetchDividends(symbol)
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...result, resolvedTicker: symbol }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
