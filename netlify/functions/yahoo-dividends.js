// netlify/functions/yahoo-dividends.js
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/
const GBX_SUFFIXES = ['.L', '.IL']
const EUR_SUFFIXES = ['.AS', '.DE', '.F', '.MI', '.PA', '.BR', '.VI', '.MC']

function isGbxTicker(symbol) {
  return symbol ? GBX_SUFFIXES.some(s => symbol.endsWith(s)) : false
}

function isEurTicker(symbol) {
  return symbol ? EUR_SUFFIXES.some(s => symbol.endsWith(s)) : false
}

// Prueft ob Ticker bei Yahoo existiert und gibt Waehrung zurueck (oder null)
async function probeYahooTicker(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?period1=1700000000&period2=1750000000&interval=1mo`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

// Sucht EUR-Ticker aus einer Liste von Kandidaten-Symbolen.
// Jedes Symbol wird direkt geprueft — der base-Ticker kann ein anderer sein (z.B. APC != AAPL).
async function findEurTickerFromCandidates(candidates) {
  for (const symbol of candidates) {
    if (!isEurTicker(symbol)) continue
    const currency = await probeYahooTicker(symbol)
    if (currency === 'EUR') {
      console.log(`[Resolver] EUR-Kandidat bestaetigt: ${symbol}`)
      return symbol
    }
  }
  return null
}

// Probiert EUR-Suffixe auf Basis eines bekannten Tickers (z.B. AAPL -> AAPL.DE usw.)
// Nur sinnvoll wenn der Boersen-Ticker identisch ist (seltenerer Fall)
async function probeEurSuffixes(baseTicker) {
  // Suffix abschneiden falls vorhanden
  let base = baseTicker
  for (const s of [...GBX_SUFFIXES, ...EUR_SUFFIXES]) {
    if (baseTicker.endsWith(s)) { base = baseTicker.slice(0, -s.length); break }
  }
  for (const suffix of EUR_SUFFIXES) {
    const candidate = base + suffix
    const currency = await probeYahooTicker(candidate)
    if (currency === 'EUR') {
      console.log(`[Resolver] EUR via Suffix-Probe: ${baseTicker} -> ${candidate}`)
      return candidate
    }
  }
  return null
}

// Yahoo Finance Search — gibt alle Kandidaten zurueck
async function searchYahoo(query) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.quotes || []).filter(q =>
      q.symbol && !q.symbol.includes('=') &&
      ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType)
    )
  } catch {
    return []
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
  // EUR-Boersen zuerst: AS=Amsterdam, GS=Frankfurt, PA=Paris, MI=Milan
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

// Hauptkette — immer EUR-Ticker anstreben:
// 1. Yahoo Search nach ISIN -> alle Kandidaten pruefen -> EUR-Suffix direkt nehmen (z.B. APC.DE)
// 2. Falls kein EUR-Suffix in Kandidaten: Suffix-Probe auf alle non-GBX Kandidaten
// 3. OpenFIGI (EUR-Boersen bevorzugt)
// 4. Kein EUR gefunden -> null (Parqet-History wird als Fallback genutzt)
async function resolveTickerFromIsin(isin) {
  const candidates = await searchYahoo(isin)

  if (candidates.length > 0) {
    const symbols = candidates.map(q => q.symbol)
    console.log(`[Resolver] ${isin} Kandidaten: ${symbols.join(', ')}`)

    // Schritt 1: direkt EUR-Suffix-Ticker in den Suchergebnissen?
    const eurDirect = await findEurTickerFromCandidates(symbols)
    if (eurDirect) {
      console.log(`[Resolver] ${isin} -> ${eurDirect} (EUR direkt in Search)`)
      return eurDirect
    }

    // Schritt 2: Suffix-Probe auf jeden non-GBX Kandidaten
    // (fuer Faelle wo z.B. AAPL in Search ist aber kein APC.DE — sehr selten)
    const nonGbx = candidates.filter(q => !isGbxTicker(q.symbol))
    for (const q of nonGbx) {
      const eur = await probeEurSuffixes(q.symbol)
      if (eur) {
        console.log(`[Resolver] ${isin} -> ${eur} (EUR via Suffix-Probe auf ${q.symbol})`)
        return eur
      }
    }
  }

  // Schritt 3: OpenFIGI
  const figi = await resolveTickerFromOpenFigi(isin)
  if (figi) {
    console.log(`[Resolver] ${isin} -> ${figi} (OpenFIGI)`)
    return figi
  }

  console.log(`[Resolver] ${isin} -> kein EUR-Ticker gefunden`)
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

  // Sicherheitsnetz: Nicht-EUR Dividenden verwerfen -> Fallback auf Parqet-History
  if (normalizedCurrency !== 'EUR') {
    console.log(`[Yahoo] ${symbol}: ${normalizedCurrency} Dividenden verworfen (kein EUR)`)
    return { dividends: [], currency: normalizedCurrency, resolvedTicker: symbol }
  }

  console.log(`[Yahoo] ${symbol}: ${dividends.length} EUR-Dividenden`)
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
    } else if (!isEurTicker(ticker)) {
      // Direkt uebergebener non-EUR Ticker -> EUR-Suffix-Probe
      console.log(`[Handler] Non-EUR Ticker ${ticker} -> Suffix-Probe`)
      const eur = await probeEurSuffixes(ticker)
      if (eur) symbol = eur
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
