// netlify/functions/yahoo-dividends.js
// Proxy fuer Yahoo Finance Dividendenhistorie
// Aufruf: GET /yahoo-dividends?ticker=AAPL
//         GET /yahoo-dividends?ticker=IE000S9YS762  <- ISIN wird aufgeloest

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/

// Suffix-Prioritaet: EUR-Boersen (AS, DE, PA, MI, MC) vor GBP (L) vor US (kein Suffix)
// VHYL.L handelt in GBX (Pence), VHYL.AS handelt in EUR -> EUR bevorzugen
const SUFFIX_PRIORITY = ['.AS', '.DE', '.PA', '.MI', '.MC', '.SW', '', '.L', '.TO']

// --- Resolver: Yahoo Finance Search (primaer) ------------------------------------
async function resolveTickerFromYahooSearch(isin) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=10&newsCount=0&listsCount=0`
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

    // Sortiere nach Suffix-Praeferenz: EUR-Boersen zuerst, GBX (London) zuletzt
    const ranked = quotes.slice().sort((a, b) => {
      const suffixOf = sym => {
        const dot = sym.lastIndexOf('.')
        return dot >= 0 ? sym.slice(dot) : ''
      }
      const ia = SUFFIX_PRIORITY.indexOf(suffixOf(a.symbol))
      const ib = SUFFIX_PRIORITY.indexOf(suffixOf(b.symbol))
      const ra = ia === -1 ? SUFFIX_PRIORITY.length : ia
      const rb = ib === -1 ? SUFFIX_PRIORITY.length : ib
      return ra - rb
    })

    console.log(`[Resolver] ${isin} Yahoo-Kandidaten: ${ranked.map(q => q.symbol).join(', ')}`)
    return ranked[0].symbol
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
  // Bevorzuge EUR-Boersen: AS (Amsterdam), GS (Xetra), dann LN (London)
  const strategies = [
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'AS' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'GS' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'PA' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'US' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'LN' },
    { idType: 'ID_ISIN', idValue: isin },
  ]
  const suffixMap = { GS: '.DE', LN: '.L', PA: '.PA', AS: '.AS', SW: '.SW', MI: '.MI' }

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

// --- Waehrungskorrektur ----------------------------------------------------------
// GBX (Pence) muss durch 100 dividiert werden um GBP zu erhalten.
// Alle anderen Waehrungen werden unveraendert durchgereicht.
function normalizeDividendAmount(amount, currency) {
  if (currency === 'GBp' || currency === 'GBX' || currency === 'GBx') {
    return { amount: amount / 100, currency: 'GBP' }
  }
  return { amount, currency }
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
  const rawCurrency = meta.currency ?? 'EUR'

  const dividends = Object.values(rawDivs).map(d => {
    const date = new Date(d.date * 1000)
    const { amount, currency } = normalizeDividendAmount(d.amount, rawCurrency)
    return {
      date:     date.toISOString(),
      amount,
      currency,
      month:    date.getMonth(),
      year:     date.getFullYear(),
    }
  }).sort((a, b) => new Date(a.date) - new Date(b.date))

  // Normalisierte Waehrung aus erstem Eintrag, sonst rawCurrency
  const normalizedCurrency = dividends.length > 0 ? dividends[0].currency : normalizeDividendAmount(0, rawCurrency).currency

  console.log(`[Yahoo] ${symbol}: ${dividends.length} Dividenden, Waehrung ${rawCurrency}${rawCurrency !== normalizedCurrency ? ' -> ' + normalizedCurrency : ''}`)

  return { dividends, currency: normalizedCurrency, resolvedTicker: symbol }
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
