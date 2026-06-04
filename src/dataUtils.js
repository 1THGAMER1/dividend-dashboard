import { buildIsinMergeMap, makeResolver } from './isinMerge'

export const MONTHS = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

export const YEAR_COLORS = {
  2024: '#60a5fa',
  2025: '#a78bfa',
  2026: '#f472b6',
}

export function groupByYearMonth(activities) {
  const result = {}
  for (const a of activities) {
    const d = new Date(a.datetime)
    const y = d.getFullYear()
    const m = d.getMonth()
    if (!result[y]) result[y] = Array(12).fill(0)
    result[y][m] += a.amountNet ?? a.amount ?? 0
  }
  return result
}

export function toCumulative(monthly) {
  const result = {}
  for (const [y, vals] of Object.entries(monthly)) {
    let sum = 0
    result[y] = vals.map(v => +(sum += v).toFixed(4))
  }
  return result
}

export function buildForecast(cum, activities, buyActivities = [], names = {}) {
  const cy = new Date().getFullYear()
  const cm = new Date().getMonth()
  const ny = cy + 1

  // Auto-Merge: gleicher Name = gleiche Position
  const mergeMap = buildIsinMergeMap(activities, names)
  const resolve  = makeResolver(mergeMap)

  const byIsin = {}
  for (const a of activities) {
    const isin = resolve(a.asset?.isin || a.asset?.symbol || 'unknown')
    const d    = new Date(a.datetime)
    const y    = d.getFullYear()
    const m    = d.getMonth()
    if (!byIsin[isin])       byIsin[isin] = {}
    if (!byIsin[isin][y])    byIsin[isin][y] = Array(12).fill(null)
    if (!byIsin[isin][y][m]) byIsin[isin][y][m] = { amount: 0, shares: 0 }
    byIsin[isin][y][m].amount += a.amountNet ?? a.amount ?? 0
    byIsin[isin][y][m].shares += a.shares ?? 0
  }

  const currentSharesFromBuys = {}
  for (const a of buyActivities) {
    const isin = resolve(a.asset?.isin || a.asset?.symbol || 'unknown')
    currentSharesFromBuys[isin] = (currentSharesFromBuys[isin] || 0) + (a.shares ?? 0)
  }

  function currentShares(isin) {
    if (currentSharesFromBuys[isin] > 0) return currentSharesFromBuys[isin]
    const years = Object.keys(byIsin[isin] || {}).map(Number).sort()
    for (const y of [...years].reverse()) {
      for (let m = 11; m >= 0; m--) {
        const entry = byIsin[isin]?.[y]?.[m]
        if (entry && entry.shares > 0) return entry.shares
      }
    }
    return 0
  }

  function dividendGrowthRate(isin) {
    const yearData = byIsin[isin] || {}
    const years    = Object.keys(yearData).map(Number).filter(y => y < cy).sort()
    if (years.length < 2) return 1
    const sumDps = y => {
      let total = 0, count = 0
      for (let m = 0; m < 12; m++) {
        const e = yearData[y]?.[m]
        if (e && e.shares > 0) { total += e.amount / e.shares; count++ }
      }
      return count > 0 ? total : 0
    }
    const dpsLast = sumDps(years[years.length - 1])
    const dpsPrev = sumDps(years[years.length - 2])
    if (dpsPrev === 0 || dpsLast === 0) return 1
    return Math.min(Math.max(dpsLast / dpsPrev, 0.9), 1.2)
  }

  const isins = Object.keys(byIsin)

  const curYearActuals = Array(12).fill(0)
  for (const a of activities) {
    const d = new Date(a.datetime)
    if (d.getFullYear() === cy) {
      curYearActuals[d.getMonth()] += a.amountNet ?? a.amount ?? 0
    }
  }

  function estimateDps(isin, month) {
    const yearData = byIsin[isin] || {}
    const refYears = [cy - 1, cy - 2]
    const weights  = [0.7, 0.3]
    const points = refYears.map(y => {
      const e = yearData[y]?.[month]
      return e && e.shares > 0 ? e.amount / e.shares : null
    })
    const validPoints = points.filter(v => v !== null)
    if (validPoints.length === 0) {
      const qStart  = Math.floor(month / 3) * 3
      const qMonths = [qStart, qStart + 1, qStart + 2].filter(m => m !== month)
      for (const qm of qMonths) {
        const qPoints = refYears.map(y => {
          const e = yearData[y]?.[qm]
          return e && e.shares > 0 ? e.amount / e.shares : null
        }).filter(v => v !== null)
        if (qPoints.length > 0) return qPoints.reduce((a, b) => a + b, 0) / qPoints.length
      }
      return 0
    }
    let weightedSum = 0, weightTotal = 0
    points.forEach((v, i) => {
      if (v !== null) { weightedSum += v * weights[i]; weightTotal += weights[i] }
    })
    return weightTotal > 0 ? weightedSum / weightTotal : 0
  }

  const forecastByHolding = {}
  for (const isin of isins) {
    forecastByHolding[isin] = {}
    for (let m = 0; m < 12; m++) {
      const actual = byIsin[isin][cy]?.[m]
      if (actual && actual.amount > 0) {
        forecastByHolding[isin][m] = +actual.amount.toFixed(4)
      } else {
        const dps    = estimateDps(isin, m)
        const shares = currentShares(isin)
        forecastByHolding[isin][m] = +(dps * shares).toFixed(4)
      }
    }
  }

  const monthlyCy = Array(12).fill(0)
  for (let m = 0; m < 12; m++) {
    if (m < cm) {
      monthlyCy[m] = +curYearActuals[m].toFixed(4)
    } else if (m === cm) {
      const alreadyReceived = curYearActuals[cm]
      const stillExpected   = isins.reduce((s, isin) => {
        const actual = byIsin[isin][cy]?.[cm]
        if (actual && actual.amount > 0) return s
        return s + (forecastByHolding[isin][cm] || 0)
      }, 0)
      monthlyCy[m] = +(alreadyReceived + stillExpected).toFixed(4)
    } else {
      const total = isins.reduce((s, isin) => s + (forecastByHolding[isin][m] || 0), 0)
      monthlyCy[m] = +total.toFixed(4)
    }
  }

  const avgGrowth = (() => {
    const rates = isins.map(dividendGrowthRate).filter(r => r !== 1)
    if (rates.length === 0) return 1.05
    return rates.reduce((a, b) => a + b, 0) / rates.length
  })()

  const monthlyNy = monthlyCy.map(v => +(v * avgGrowth).toFixed(4))

  const cumCy = Array(12).fill(null)
  let proj = 0
  for (let m = 0; m < 12; m++) { proj += monthlyCy[m]; cumCy[m] = +proj.toFixed(4) }

  const cumNy = Array(12).fill(null)
  let projNy = 0
  for (let m = 0; m < 12; m++) { projNy += monthlyNy[m]; cumNy[m] = +projNy.toFixed(4) }

  return {
    cum:              { [cy]: cumCy,     [ny]: cumNy     },
    monthly:          { [cy]: monthlyCy, [ny]: monthlyNy },
    forecastByHolding,
  }
}

export function heatColor(value, max) {
  if (!value || value === 0) return '#1a2233'
  const intensity = Math.min(value / max, 1)
  const from = [26, 34, 51]
  const to   = [34, 197, 94]
  const rgb  = from.map((f, i) => Math.round(f + (to[i] - f) * Math.pow(intensity, 0.5)))
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}

export function groupByHolding(activities, names = {}, types = {}, purchaseValues = {}, tickers = {}) {
  // Auto-Merge: gleicher Name = gleiche Position
  const mergeMap = buildIsinMergeMap(activities, names)
  const resolve  = makeResolver(mergeMap)

  const palette = [
    '#60a5fa','#a78bfa','#f472b6','#34d399','#fb923c',
    '#facc15','#38bdf8','#f87171','#4ade80','#c084fc',
    '#e879f9','#2dd4bf','#fbbf24','#818cf8','#fb7185',
  ]
  const map = {}
  for (const a of activities) {
    const rawIsin = a.asset?.isin || a.asset?.symbol || 'unknown'
    const isin    = resolve(rawIsin)
    // Namen: kanonische ISIN zuerst, dann Original, dann Activity
    const name   = names[isin] || names[rawIsin] || a.asset?.name || a.asset?.symbol || isin
    const type   = types[isin] || types[rawIsin] || a.holdingAssetType || 'security'
    const ticker = tickers[isin] || tickers[rawIsin] || null
    const d      = new Date(a.datetime)
    const year   = d.getFullYear()
    const month  = d.getMonth()

    if (!map[isin]) map[isin] = { name, type, ticker, monthly: {}, gross: {}, tax: {} }

    if (!map[isin].monthly[year]) map[isin].monthly[year] = Array(12).fill(0)
    if (!map[isin].gross[year])   map[isin].gross[year]   = Array(12).fill(0)
    if (!map[isin].tax[year])     map[isin].tax[year]     = Array(12).fill(0)

    const net   = a.amountNet ?? a.amount ?? 0
    const gross = a.amount    ?? net
    map[isin].monthly[year][month] += net
    map[isin].gross[year][month]   += gross
    map[isin].tax[year][month]     += gross - net
  }

  const now = new Date()
  Object.keys(map).forEach((isin, idx) => {
    map[isin].color = palette[idx % palette.length]
    const pv       = purchaseValues[isin] ?? 0
    const totalNet = Object.values(map[isin].monthly).flatMap(m => m).reduce((s, v) => s + v, 0)
    map[isin].yield = pv > 0 ? +((totalNet / pv) * 100).toFixed(2) : null
    let last12m = 0
    for (const [year, months] of Object.entries(map[isin].monthly)) {
      for (let m = 0; m < 12; m++) {
        const date = new Date(+year, m, 1)
        if ((now - date) / 864e5 <= 365) last12m += months[m] || 0
      }
    }
    map[isin].assetYield = pv > 0 ? +((last12m / pv) * 100).toFixed(2) : null
  })

  return map
}
