// netlify/functions/yahoo-dividends.js
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/
const GBX_SUFFIXES = ['.L', '.IL']
const EUR_SUFFIXES = ['.AS', '.DE', '.F', '.MI', '.PA']

function isGbxTicker(symbol) {
  return symbol ? GBX_SUFFIXES.some(s => symbol.endsWith(s)) : false
}

// Prueft ob ein Ticker bei Yahoo existiert und gibt Waehrung zurueck (oder null)
async function probeYahooTicker(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?period1=1700000000&period2=1750000000&interval=1mo`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return null
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return null
    return result.meta?.currency ?? null
  } catch {
    return null
  }
}

// Wenn .L gefunden: probiere EUR-Suffixe direkt ohne Waehrungs-API-Call
async function findEurAlternative(gbxTicker) {
  const base = gbxTicker.slice(0, gbxTicker.lastIndexOf('.'))
  console.log(`[Resolver] .L-Ticker ${gbxTicker} -> probiere EUR-Alternativen: ${EUR_SUFFIXES.map(s => base+s).join(', ')}`)
  for (const suffix of EUR_SUFFIXES) {
    const candidate = base + suffix
    const currency = await probeYahooTicker(candidate)
    if (currency !== null && currency !== 'GBp' && currency !== 'GBX' && currency !== 'GBx') {
      console.log(`[Resolver] EUR-Swap: ${gbxTicker} -> ${candidate} (${currency})`)
      return candidate
    }
  }
  console.log(`[Resolver] Kein EUR-Aequivalent fuer ${gbxTicker}, behalte .L`)
  return gbxTicker
}

// Yahoo Finance Search
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
      q.symbol && !q.symbol.includes('=') &&
      ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType)
    )
    if (quotes.length === 0) return null
    console.log(`[Resolver] ${isin} Yahoo-Kandidaten: ${quotes.map(q => q.symbol).join(', ')}`)
    // Bevorzuge Nicht-.L Ticker direkt aus den Suchergebnissen
    const nonGbx = quotes.find(q => !isGbxTicker(q.symbol))
    if (nonGbx) return nonGbx.symbol
    // Nur .L vorhanden
    return quotes[0].symbol
  } catch {
    return null
  }
}

async function validateTickerOnYahoo(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=1&interval=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)', 'Accept': 'application/json' },
    })
    if (!res.ok) return false
    const json = await res.json()
    return !!(json?.chart?.result?.[0])
  } catch {
    return false
  }
}

async function resolveTickerFromOpenFigi(isin) {
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
      if (isGbxTicker(candidate)) continue  // .L aus OpenFIGI auch ueberspringen
      const valid = await validateTickerOnYahoo(candidate)
      if (valid) return candidate
    } catch { continue }
  }
  return null
}

// Hauptkette: Search -> falls .L -> EUR-Probe -> OpenFIGI
async function resolveTickerFromIsin(isin) {
  let symbol = await resolveTickerFromYahooSearch(isin)

  // Falls Yahoo Search nur .L liefert: EUR-Alternative suchen
  if (symbol && isGbxTicker(symbol)) {
    symbol = await findEurAlternative(symbol)
  }

  // Falls immer noch .L oder gar nichts: OpenFIGI probieren
  if (!symbol || isGbxTicker(symbol)) {
    const figi = await resolveTickerFromOpenFigi(isin)
    if (figi) symbol = figi
  }

  if (!symbol) {
    console.log(`[Resolver] ${isin} -> nicht aufloesbar`)
    return null
  }

  console.log(`[Resolver] ${isin} -> ${symbol}`)
  return symbol
}

function normalizeDividendAmount(amount, currency) {
  if (currency === 'GBp' || currency === 'GBX' || currency === 'GBx') {
    return { amount: amount / 100, currency: 'GBP' }
  }
  return { amount, currency }
}

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
  const meta = json?.chart?.result?.[0]?.meta ?? {}
  const rawDivs = json?.chart?.result?.[0]?.events?.dividends ?? {}
  const rawCurrency = meta.currency ?? 'EUR'
  const dividends = Object.values(rawDivs).map(d => {
    const date = new Date(d.date * 1000)
    const { amount, currency } = normalizeDividendAmount(d.amount, rawCurrency)
    return { date: date.toISOString(), amount, currency, month: date.getMonth(), year: date.getFullYear() }
  }).sort((a, b) => new Date(a.date) - new Date(b.date))
  const normalizedCurrency = dividends.length > 0 ? dividends[0].currency : normalizeDividendAmount(0, rawCurrency).currency
  console.log(`[Yahoo] ${symbol}: ${dividends.length} Dividenden, Waehrung ${rawCurrency}${rawCurrency !== normalizedCurrency ? ' -> ' + normalizedCurrency : ''}`)
  return { dividends, currency: normalizedCurrency, resolvedTicker: symbol }
}

exports.handler = async function (event) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }

  const ticker = event.queryStringParameters?.ticker
  if (!ticker) return {
    statusCode: 400,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'ticker parameter required' }),
  }

  try {
    let symbol = ticker
    if (ISIN_REGEX.test(ticker)) {
      const resolved = await resolveTickerFromIsin(ticker)
      if (!resolved) return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dividends: [], currency: 'EUR', resolvedTicker: null }),
      }
      symbol = resolved
    } else if (isGbxTicker(ticker)) {
      // Direkt .L Ticker -> EUR-Alternative suchen
      console.log(`[Handler] Direkter .L Ticker ${ticker} -> suche EUR-Alternative`)
      symbol = await findEurAlternative(ticker)
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
