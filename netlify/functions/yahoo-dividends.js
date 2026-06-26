// netlify/functions/yahoo-dividends.js
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/
const GBX_SUFFIXES = ['.L', '.IL']
const EUR_SUFFIXES = ['.AS', '.DE', '.F', '.MI', '.PA', '.BR', '.VI', '.MC']
const EUR_CURRENCY = 'EUR'

function isGbxTicker(symbol) {
  return symbol ? GBX_SUFFIXES.some(s => symbol.endsWith(s)) : false
}

function isEurSuffixTicker(symbol) {
  return symbol ? EUR_SUFFIXES.some(s => symbol.endsWith(s)) : false
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

// Sucht EUR-Ticker fuer beliebigen Basis-Ticker (nicht nur .L)
// Gibt { symbol, currency } zurueck oder null
async function findEurTicker(baseTicker) {
  // Basis extrahieren: bekannte Suffixe abschneiden
  let base = baseTicker
  for (const suffix of [...GBX_SUFFIXES, ...EUR_SUFFIXES]) {
    if (baseTicker.endsWith(suffix)) {
      base = baseTicker.slice(0, -suffix.length)
      break
    }
  }

  console.log(`[Resolver] Suche EUR-Ticker fuer ${baseTicker} (base: ${base})`)
  for (const suffix of EUR_SUFFIXES) {
    const candidate = base + suffix
    const currency = await probeYahooTicker(candidate)
    if (currency === EUR_CURRENCY) {
      console.log(`[Resolver] EUR-Ticker gefunden: ${baseTicker} -> ${candidate} (EUR)`)
      return { symbol: candidate, currency: EUR_CURRENCY }
    }
  }
  console.log(`[Resolver] Kein EUR-Ticker fuer ${baseTicker} gefunden`)
  return null
}

// Yahoo Finance Search - gibt bevorzugt EUR-Ticker zurueck
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

    // Bevorzuge direkt EUR-Suffix-Ticker aus den Suchergebnissen
    const eurSuffixMatch = quotes.find(q => isEurSuffixTicker(q.symbol))
    if (eurSuffixMatch) {
      console.log(`[Resolver] EUR-Suffix direkt in Suchergebnissen: ${eurSuffixMatch.symbol}`)
      return eurSuffixMatch.symbol
    }

    // Kein EUR-Suffix direkt: Nicht-.L Ticker als Basis fuer EUR-Probe merken
    const nonGbx = quotes.find(q => !isGbxTicker(q.symbol))
    if (nonGbx) return nonGbx.symbol

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
  // Bevorzuge EUR-Boersen: AS=Amsterdam, GS=Frankfurt, PA=Paris, MI=Milan
  const strategies = [
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'AS' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'GS' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'PA' },
    { idType: 'ID_ISIN', idValue: isin, exchCode: 'MI' },
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
      if (isGbxTicker(candidate)) continue
      const valid = await validateTickerOnYahoo(candidate)
      if (valid) return candidate
    } catch { continue }
  }
  return null
}

// Hauptkette: immer EUR-Ticker anstreben
// 1. Yahoo Search -> bevorzuge EUR-Suffix direkt aus Ergebnissen
// 2. Falls nicht-EUR Ticker (z.B. AAPL/USD): EUR-Suffix-Probe
// 3. Falls .L: EUR-Probe
// 4. OpenFIGI (EUR-Boersen zuerst)
// -> Wenn kein EUR-Ticker gefunden: null zurueckgeben
async function resolveTickerFromIsin(isin) {
  let symbol = await resolveTickerFromYahooSearch(isin)

  if (symbol) {
    // Bereits EUR-Suffix -> fertig
    if (isEurSuffixTicker(symbol)) {
      console.log(`[Resolver] ${isin} -> ${symbol} (EUR-Suffix direkt)`)
      return symbol
    }

    // .L oder sonstiger non-EUR Ticker -> EUR-Variante suchen
    const eur = await findEurTicker(symbol)
    if (eur) {
      console.log(`[Resolver] ${isin} -> ${eur.symbol} (${isGbxTicker(symbol) ? 'GBX' : 'non-EUR'}->EUR)`)
      return eur.symbol
    }

    console.log(`[Resolver] ${isin}: kein EUR-Ticker via Search, versuche OpenFIGI`)
  }

  // OpenFIGI (EUR-Boersen bevorzugt)
  const figi = await resolveTickerFromOpenFigi(isin)
  if (figi) {
    if (isEurSuffixTicker(figi)) {
      console.log(`[Resolver] ${isin} -> ${figi} (OpenFIGI EUR)`)
      return figi
    }
    const eur = await findEurTicker(figi)
    if (eur) {
      console.log(`[Resolver] ${isin} -> ${eur.symbol} (OpenFIGI->EUR)`)
      return eur.symbol
    }
    // OpenFIGI hat keinen EUR-Ticker gefunden -> trotzdem zurueckgeben,
    // fetchDividends verwirft dann nicht-EUR Werte
    console.log(`[Resolver] ${isin} -> ${figi} (OpenFIGI, kein EUR-Suffix)`)
    return figi
  }

  console.log(`[Resolver] ${isin} -> nicht aufloesbar`)
  return null
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

  // Sicherheitsnetz: Nicht-EUR Dividenden verwerfen
  // (Fallback auf Parqet-History in estimateDpsWithSource)
  if (normalizedCurrency !== EUR_CURRENCY) {
    console.log(`[Yahoo] ${symbol}: ${normalizedCurrency} Dividenden verworfen (nur EUR erlaubt)`)
    return { dividends: [], currency: normalizedCurrency, resolvedTicker: symbol, discarded: true }
  }

  console.log(`[Yahoo] ${symbol}: ${dividends.length} Dividenden in EUR`)
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
    } else if (!isEurSuffixTicker(ticker)) {
      // Direkt uebergebener non-EUR Ticker (z.B. AAPL, AAPL.L) -> EUR-Variante suchen
      console.log(`[Handler] Non-EUR Ticker ${ticker} -> suche EUR-Alternative`)
      const eur = await findEurTicker(ticker)
      if (eur) symbol = eur.symbol
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
