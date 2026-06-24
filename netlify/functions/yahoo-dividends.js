// netlify/functions/yahoo-dividends.js
// Proxy fuer Yahoo Finance Dividendenhistorie
// Aufruf: GET /yahoo-dividends?ticker=AAPL

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
    // Yahoo Finance v8 chart endpoint – 5 Jahre Historie, 1d Interval reicht
    const period1 = Math.floor((Date.now() - 5 * 365 * 24 * 60 * 60 * 1000) / 1000)
    const period2 = Math.floor(Date.now() / 1000)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
      `?period1=${period1}&period2=${period2}&interval=1mo&events=dividends&includePrePost=false`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DividendDashboard/1.0)',
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Yahoo returned ${res.status}` }),
      }
    }

    const json = await res.json()
    const meta      = json?.chart?.result?.[0]?.meta ?? {}
    const rawDivs   = json?.chart?.result?.[0]?.events?.dividends ?? {}
    const currency  = meta.currency ?? 'USD'

    // rawDivs ist ein Objekt mit Unix-Timestamp als Key
    const dividends = Object.values(rawDivs).map(d => {
      const date = new Date(d.date * 1000)
      return {
        date:   date.toISOString(),
        amount: d.amount,
        month:  date.getMonth(),   // 0-indexed, passend zu groupByYearMonth
        year:   date.getFullYear(),
      }
    }).sort((a, b) => new Date(a.date) - new Date(b.date))

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dividends, currency, ticker }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
