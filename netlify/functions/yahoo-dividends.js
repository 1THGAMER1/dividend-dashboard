const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dividend-dashboard.netlify.app'

function corsHeaders(requestOrigin) {
  const isDev = requestOrigin && (
    requestOrigin.startsWith('http://localhost') ||
    requestOrigin.startsWith('http://127.0.0.1')
  )
  const origin = isDev ? requestOrigin : ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

export default async (request) => {
  const requestOrigin = request.headers.get('origin') || ''
  const CORS = corsHeaders(requestOrigin)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const url    = new URL(request.url)
  const ticker = url.searchParams.get('ticker')

  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker parameter required' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    // 2 Jahre History holen – reicht für cy-1 und cy-2
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=2y&events=dividends`
    const res = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Yahoo returned ${res.status}` }), {
        status: res.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    const meta      = data?.chart?.result?.[0]?.meta || {}
    const rawDivs   = data?.chart?.result?.[0]?.events?.dividends || {}
    const currency  = meta.currency || 'USD'

    // Dividenden als Array normalisieren: { date, amount, month, year }
    const dividends = Object.values(rawDivs).map(d => {
      const date = new Date(d.date * 1000)
      return {
        date:   date.toISOString(),
        amount: d.amount,
        month:  date.getMonth(),
        year:   date.getFullYear(),
      }
    }).sort((a, b) => new Date(a.date) - new Date(b.date))

    return new Response(JSON.stringify({ dividends, currency }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
}

export const config = {
  path: '/yahoo-dividends',
}
