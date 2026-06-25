// netlify/functions/yahoo-dividends.js
// Proxy fuer Yahoo Finance Dividendenhistorie
// Aufruf: GET /yahoo-dividends?ticker=AAPL
//         GET /yahoo-dividends?ticker=IE000S9YS762  <- ISIN wird automatisch aufgeloest

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/

async function resolveTickerFromIsin(isin) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=3&newsCount=0&listsCount=0`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    // Bevorzuge Aktien/ETFs, kein Geldmarkt oder Futures
    const quotes = (data?.quotes || []).filter(q =>
      q.symbol &&
      !q.symbol.includes('=') &&
      ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType)
    )
    return quotes[0]?.symbol || null
  } catch {
    return null
  }
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
  const meta     = json?.chart?.result?.[0]?.meta ?? {}
  const rawDivs  = json?.chart?.result?.[0]?.events?.dividends ?? {}
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

    // ISIN erkannt -> zuerst Yahoo Search nach echtem Symbol
    if (ISIN_REGEX.test(ticker)) {
      const resolved = await resolveTickerFromIsin(ticker)
      if (resolved) {
        symbol = resolved
      } else {
        // Keine Aufloesung moeglich -> leeres Ergebnis mit resolvedTicker=null
        return {
          statusCode: 200,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dividends: [], currency: 'EUR', resolvedTicker: null }),
        }
      }
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
