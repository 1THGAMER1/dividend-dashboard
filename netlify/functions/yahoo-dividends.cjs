// netlify/functions/yahoo-dividends.js
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/
const GBX_SUFFIXES = ['.L', '.IL']
const EUR_SUFFIXES = ['.AS', '.DE', '.F', '.MI', '.PA', '.BR', '.VI', '.MC']

function isGbxTicker(s) { return s ? GBX_SUFFIXES.some(x => s.endsWith(x)) : false }
function isEurTicker(s)  { return s ? EUR_SUFFIXES.some(x => s.endsWith(x))  : false }

async function probeYahooTicker(symbol) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=1700000000&period2=1750000000&interval=1mo`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
    )
    if (!res.ok) return null
    const json = await res.json()
    return json?.chart?.result?.[0]?.meta?.currency ?? null
  } catch { return null }
}

async function findEurTickerFromCandidates(candidates) {
  for (const s of candidates) {
    if (!isEurTicker(s)) continue
    if (await probeYahooTicker(s) === 'EUR') return s
  }
  return null
}

async function probeEurSuffixes(baseTicker) {
  let base = baseTicker
  for (const s of [...GBX_SUFFIXES, ...EUR_SUFFIXES]) {
    if (baseTicker.endsWith(s)) { base = baseTicker.slice(0, -s.length); break }
  }
  for (const suffix of EUR_SUFFIXES) {
    if (await probeYahooTicker(base + suffix) === 'EUR') return base + suffix
  }
  return null
}

async function searchYahoo(query) {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)', 'Accept': 'application/json' } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data?.quotes || []).filter(q =>
      q.symbol && !q.symbol.includes('=') &&
      ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType)
    )
  } catch { return [] }
}

async function resolveTickerFromOpenFigi(isin) {
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
      const item = (await res.json())?.[0]?.data?.[0]
      if (!item?.ticker) continue
      const candidate = item.ticker + (suffixMap[body.exchCode] || '')
      if (isGbxTicker(candidate)) continue
      // Nur EUR-Ticker akzeptieren - Waehrung via Yahoo pruefen
      const currency = await probeYahooTicker(candidate)
      if (currency === 'EUR') return candidate
    } catch { continue }
  }
  return null
}

async function resolveTickerFromIsin(isin) {
  const candidates = await searchYahoo(isin)
  const symbols = candidates.map(q => q.symbol)

  if (symbols.length > 0) {
    const eurDirect = await findEurTickerFromCandidates(symbols)
    if (eurDirect) { console.log(`[${isin}] -> ${eurDirect}`); return eurDirect }

    for (const q of candidates.filter(q => !isGbxTicker(q.symbol))) {
      const eur = await probeEurSuffixes(q.symbol)
      if (eur) { console.log(`[${isin}] -> ${eur} (Suffix-Probe)`); return eur }
    }
  }

  const figi = await resolveTickerFromOpenFigi(isin)
  if (figi) { console.log(`[${isin}] -> ${figi} (OpenFIGI)`); return figi }

  console.log(`[${isin}] -> nicht aufloesbar`)
  return null
}

// Holt historische EUR/USD Tageskurse fuer einen Zeitraum von Yahoo
async function fetchEurUsdRates(period1, period2) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?period1=${period1}&period2=${period2}&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)', 'Accept': 'application/json' } }
    )
    if (!res.ok) return null
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return null
    const timestamps = result.timestamp || []
    const closes = result.indicators?.quote?.[0]?.close || []
    const rates = {}
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        const d = new Date(timestamps[i] * 1000)
        const key = d.toISOString().slice(0, 10)
        rates[key] = closes[i]
      }
    }
    return rates
  } catch { return null }
}

// Findet den naechsten verfuegbaren Kurs um ein Datum herum (+-7 Tage)
function findRate(rates, dateStr) {
  if (!rates) return null
  if (rates[dateStr]) return rates[dateStr]
  const base = new Date(dateStr)
  for (let delta = 1; delta <= 7; delta++) {
    for (const sign of [-1, 1]) {
      const d = new Date(base)
      d.setDate(d.getDate() + sign * delta)
      const k = d.toISOString().slice(0, 10)
      if (rates[k]) return rates[k]
    }
  }
  return null
}

function normalizeDividendAmount(amount, currency) {
  if (['GBp', 'GBX', 'GBx'].includes(currency)) return { amount: amount / 100, currency: 'GBP' }
  return { amount, currency }
}

async function fetchDividends(symbol) {
  const period1 = Math.floor((Date.now() - 5 * 365 * 24 * 60 * 60 * 1000) / 1000)
  // +6 Monate in die Zukunft um angekuendigte Dividenden zu laden
  const period2 = Math.floor((Date.now() + 180 * 24 * 60 * 60 * 1000) / 1000)
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1mo&events=dividends&includePrePost=false`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)', 'Accept': 'application/json' } }
  )
  if (!res.ok) return { dividends: [], currency: 'EUR', resolvedTicker: symbol }
  const json = await res.json()
  const meta    = json?.chart?.result?.[0]?.meta ?? {}
  const rawDivs = json?.chart?.result?.[0]?.events?.dividends ?? {}
  const rawCurrency = meta.currency ?? 'EUR'

  const { currency: normalizedCurrency } = normalizeDividendAmount(0, rawCurrency)

  if (normalizedCurrency === 'GBP') {
    console.log(`[${symbol}] GBP -> verworfen`)
    return { dividends: [], currency: 'GBP', resolvedTicker: symbol }
  }

  let divEntries = Object.values(rawDivs).map(d => {
    const date = new Date(d.date * 1000)
    const { amount, currency } = normalizeDividendAmount(d.amount, rawCurrency)
    return { date: date.toISOString(), amount, currency, month: date.getMonth(), year: date.getFullYear(), timestamp: d.date }
  }).sort((a, b) => new Date(a.date) - new Date(b.date))

  if (normalizedCurrency === 'USD' && divEntries.length > 0) {
    console.log(`[${symbol}] USD-Dividenden -> konvertiere zu EUR`)
    const eurUsdRates = await fetchEurUsdRates(period1, period2)
    const sortedKeys = eurUsdRates ? Object.keys(eurUsdRates).sort() : []
    const latestRate = sortedKeys.length > 0 ? eurUsdRates[sortedKeys[sortedKeys.length - 1]] : null

    divEntries = divEntries.map(d => {
      const dateKey = d.date.slice(0, 10)
      const rate = (eurUsdRates && findRate(eurUsdRates, dateKey)) || latestRate
      if (!rate) return { ...d, currency: 'EUR' }
      return {
        ...d,
        amount: +(d.amount / rate).toFixed(6),
        currency: 'EUR',
      }
    })
  }

  const finalCurrency = divEntries.length > 0 ? divEntries[0].currency : normalizedCurrency

  if (finalCurrency !== 'EUR') {
    console.log(`[${symbol}] ${finalCurrency} -> verworfen`)
    return { dividends: [], currency: finalCurrency, resolvedTicker: symbol }
  }

  console.log(`[${symbol}] ${divEntries.length} EUR-Dividenden`)
  return { dividends: divEntries, currency: 'EUR', resolvedTicker: symbol }
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
