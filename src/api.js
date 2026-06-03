import { getAccessToken } from './auth'

const BASE = '/api'
let _portfolioId = import.meta.env.VITE_PORTFOLIO_ID || null

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
  const data  = await request(`/portfolios/${PID}/holdings`)
  const names   = {}
  const types   = {}
  const tickers = {}

  const items = data.items || data.holdings || []
  for (const h of items) {
    const isin = h.asset?.isin || h.asset?.symbol
    const name = h.asset?.name || h.asset?.symbol || isin
    if (isin) {
      names[isin] = name
      types[isin] = h.asset?.type || 'security'
    }
  }
  return { names, types, tickers }
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

export async function fetchCurrentValue() {
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
    return data?.performance?.valuation?.atIntervalEnd ?? 0
  } catch (e) {
    console.error('fetchCurrentValue Fehler:', e.message)
    return 0
  }
}
