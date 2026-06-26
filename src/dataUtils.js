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

/**
 * @param {object} yahooByIsin   { [isin]: [{month, year, amount}, ...] }
 * @param {Array}  sellActivities  Parqet sell-activities (zum Berechnen der Netto-Stückzahlen)
 */
export function buildForecast(cum, activities, buyActivities = [], names = {}, yahooByIsin = {}, sellActivities = []) {
  const cy = new Date().getFullYear()
  const cm = new Date().getMonth()
  const ny = cy + 1

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

  // Netto-Stückzahlen: Käufe minus Verkäufe
  const sharesFromBuys  = {}
  const sharesFromSells = {}

  for (const a of buyActivities) {
    const isin = resolve(a.asset?.isin || a.asset?.symbol || 'unknown')
    sharesFromBuys[isin] = (sharesFromBuys[isin] || 0) + (a.shares ?? 0)
  }

  for (const a of sellActivities) {
    const isin = resolve(a.asset?.isin || a.asset?.symbol || 'unknown')
    sharesFromSells[isin] = (sharesFromSells[isin] || 0) + (a.shares ?? 0)
  }

  const netSharesMap = {}
  for (const isin of Object.keys(sharesFromBuys)) {
    const net = (sharesFromBuys[isin] || 0) - (sharesFromSells[isin] || 0)
    netSharesMap[isin] = net
    if (net <= 0) {
      console.log(`[Forecast] ${isin} übersprungen – vollständig verkauft (net=${net.toFixed(4)})`)
    }
  }

  function currentShares(isin) {
    if (isin in netSharesMap) return Math.max(0, netSharesMap[isin])
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

  /**
   * Schätzt DPS für einen Monat.
   * Gibt { dps, source, detail } zurück.
   * Quellen: 'historic' | 'yahoo-exact' | 'yahoo-avg' | 'zero'
   */
  function estimateDpsWithSource(isin, month) {
    const yearData  = byIsin[isin] || {}
    const yahooDivs = yahooByIsin[isin] || []
    const refYears  = [cy - 1, cy - 2]
    const weights   = [0.7, 0.3]

    // Priorität 1: Parqet-History cy-1 / cy-2
    const points = refYears.map(y => {
      const e = yearData[y]?.[month]
      return (e && e.shares > 0) ? e.amount / e.shares : null
    })
    if (!points.every(p => p === null)) {
      let weightedSum = 0, weightTotal = 0
      const detail = []
      points.forEach((v, i) => {
        if (v !== null) {
          weightedSum += v * weights[i]
          weightTotal += weights[i]
          detail.push(`${refYears[i]}: DPS=${v.toFixed(6)} (w=${weights[i]})`)
        }
      })
      const dps = weightTotal > 0 ? weightedSum / weightTotal : 0
      return { dps, source: 'historic', detail: detail.join(', ') }
    }

    // Priorität 2: Yahoo exakter Monats-Match cy-1 / cy-2
    if (yahooDivs.length === 0) return { dps: 0, source: 'zero', detail: 'keine Yahoo-Daten' }

    for (const refYear of refYears) {
      const match = yahooDivs.find(d => d.year === refYear && d.month === month)
      if (match) return { dps: match.amount, source: 'yahoo-exact', detail: `Yahoo ${refYear}-M${month}: ${match.amount.toFixed(6)}` }
    }

    // Priorität 3: Yahoo Durchschnitt für diesen Monat
    const recentDivs = yahooDivs.filter(d => d.year >= cy - 2)
    if (recentDivs.length === 0) return { dps: 0, source: 'zero', detail: 'Yahoo-Daten zu alt' }

    const payMonths = recentDivs.map(d => d.month)
    if (!payMonths.includes(month)) {
      return { dps: 0, source: 'zero', detail: `Monat ${month} war nie Zahlungsmonat (bekannte Monate: ${[...new Set(payMonths)].sort().join(',')})` }
    }

    const monthMatches = recentDivs.filter(d => d.month === month)
    const avg = monthMatches.reduce((s, d) => s + d.amount, 0) / monthMatches.length
    return { dps: avg, source: 'yahoo-avg', detail: `Yahoo-Durchschnitt aus ${monthMatches.length} Einträgen: ${avg.toFixed(6)}` }
  }

  // ISINs aus Dividendenaktivitäten + aktive Positionen aus buyActivities
  const isinsFromDivs = Object.keys(byIsin)
  const isinsFromBuys = Object.keys(sharesFromBuys).filter(isin => (netSharesMap[isin] ?? 0) > 0)
  const isinsAll      = [...new Set([...isinsFromDivs, ...isinsFromBuys])]

  // Verkaufte Positionen ausschließen
  const isins = isinsAll.filter(isin => {
    if (!(isin in netSharesMap)) return true
    return netSharesMap[isin] > 0
  })

  // Für neue Positionen (nur in buyActivities, noch nie Dividende erhalten)
  for (const isin of isinsFromBuys) {
    if (!byIsin[isin]) byIsin[isin] = {}
  }

  const curYearActuals = Array(12).fill(0)
  for (const a of activities) {
    const d = new Date(a.datetime)
    if (d.getFullYear() === cy) {
      curYearActuals[d.getMonth()] += a.amountNet ?? a.amount ?? 0
    }
  }

  const forecastByHolding = {}
  for (const isin of isins) {
    forecastByHolding[isin] = {}

    // ── DEBUG: Vanguard-ISINs detailliert loggen ──────────────────────────
    const name = names[isin] || isin
    const isVanguard = name.toLowerCase().includes('vanguard') || isin === 'IE00B8GKDB10'
    if (isVanguard) {
      const shares = currentShares(isin)
      const buys   = sharesFromBuys[isin]  ?? 'n/a'
      const sells  = sharesFromSells[isin] ?? 0
      const net    = netSharesMap[isin]    ?? 'n/a (keine Käufe)'
      console.group(`%c[Forecast DEBUG] ${name} (${isin})`, 'color:#f472b6;font-weight:bold')
      console.log(`  Anteile → Käufe: ${typeof buys === 'number' ? buys.toFixed(4) : buys} | Verkäufe: ${typeof sells === 'number' ? sells.toFixed(4) : sells} | Netto: ${typeof net === 'number' ? net.toFixed(4) : net} | currentShares(): ${shares.toFixed(4)}`)
      console.log(`  Yahoo-Daten vorhanden: ${(yahooByIsin[isin] || []).length} Einträge`)
      if ((yahooByIsin[isin] || []).length > 0) {
        console.log('  Yahoo-Dividenden:', yahooByIsin[isin].map(d => `${d.year}-M${d.month}: ${d.amount.toFixed(6)}`).join(' | '))
      }
      console.log('  Historische Dividenden (byIsin):')
      for (const y of Object.keys(byIsin[isin] || {}).sort()) {
        for (let m = 0; m < 12; m++) {
          const e = byIsin[isin][y]?.[m]
          if (e && e.amount > 0) {
            console.log(`    ${y}-M${m} (${MONTHS[m]}): amount=${e.amount.toFixed(4)}, shares=${e.shares.toFixed(4)}, DPS=${(e.amount/e.shares).toFixed(6)}`)
          }
        }
      }
      console.log('  Prognose pro Monat:')
    }
    // ─────────────────────────────────────────────────────────────────────

    for (let m = 0; m < 12; m++) {
      const actual = byIsin[isin][cy]?.[m]
      if (actual && actual.amount > 0) {
        forecastByHolding[isin][m] = +actual.amount.toFixed(4)
        if (isVanguard) {
          console.log(`    ${MONTHS[m]}: ACTUAL ${actual.amount.toFixed(4)}€ (${actual.shares.toFixed(4)} Anteile, DPS=${(actual.amount/actual.shares).toFixed(6)})`)
        }
      } else {
        const { dps, source, detail } = estimateDpsWithSource(isin, m)
        const shares = currentShares(isin)
        const total  = +(dps * shares).toFixed(4)
        forecastByHolding[isin][m] = total
        if (isVanguard) {
          console.log(`    ${MONTHS[m]}: PROGNOSE ${total.toFixed(4)}€ | DPS=${dps.toFixed(6)} × ${shares.toFixed(4)} Anteile | Quelle: ${source} | ${detail}`)
        }
      }
    }

    if (isVanguard) {
      const jahresSumme = Object.values(forecastByHolding[isin]).reduce((s, v) => s + v, 0)
      console.log(`  ── Jahressumme Prognose: ${jahresSumme.toFixed(2)}€`)
      console.groupEnd()
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
  const from = [20, 83, 45]
  const to   = [21, 180, 90]
  const rgb  = from.map((f, i) => Math.round(f + (to[i] - f) * Math.pow(intensity, 0.45)))
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}

export function groupByHolding(activities, names = {}, types = {}, purchaseValues = {}, tickers = {}) {
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
