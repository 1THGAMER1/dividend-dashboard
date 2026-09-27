export function buildForecast(cum, activities, buyActivities = [], names = {}, yahooByIsin = {}, sellActivities = [], types = {}) {
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

  const sharesFromBuys  = {}
  const sharesFromSells = {}

  for (const buy of buyActivities) {
    const isin = resolve(buy.asset?.isin || buy.asset?.symbol || 'unknown')
    sharesFromBuys[isin] = (sharesFromBuys[isin] || 0) + (buy.shares ?? 0)
  }
  for (const sell of sellActivities) {
    const isin = resolve(sell.asset?.isin || sell.asset?.symbol || 'unknown')
    sharesFromSells[isin] = (sharesFromSells[isin] || 0) + (sell.shares ?? 0)
  }

  const netSharesMap = {}
  for (const isin of Object.keys(sharesFromBuys)) {
    const net = (sharesFromBuys[isin] || 0) - (sharesFromSells[isin] || 0)
    netSharesMap[isin] = net
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

  function estimateDpsWithSource(isin, month) {
    const yearData  = byIsin[isin] || {}

    const rawYahoo  = yahooByIsin[isin] || []
    const yahooDivs = Array.isArray(rawYahoo) ? rawYahoo : (rawYahoo.dividends || [])

    const refYears  = [cy - 1, cy - 2]
    const weights   = [0.7, 0.3]

    const parqetCy = yearData[cy]?.[month]
    if (parqetCy && parqetCy.shares > 0) {
      const dps = parqetCy.amount / parqetCy.shares
      return { dps, source: 'parqet-cy', detail: `${cy}-M${month}: ${dps.toFixed(6)}` }
    }

    const yahooCy = yahooDivs.find(d => d.year === cy && d.month === month)
    if (yahooCy) {
      return { dps: yahooCy.amount, source: 'yahoo-cy', detail: `${cy}-M${month}: ${yahooCy.amount.toFixed(6)}` }
    }

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
          detail.push(`${refYears[i]}:${v.toFixed(4)}`)
        }
      })
      const dps = weightTotal > 0 ? weightedSum / weightTotal : 0
      return { dps, source: 'historic', detail: detail.join(' ') }
    }

    if (yahooDivs.length === 0) return { dps: 0, source: 'zero', detail: 'keine Yahoo-Daten' }

    for (const refYear of refYears) {
      const match = yahooDivs.find(d => d.year === refYear && d.month === month)
      if (match) return { dps: match.amount, source: 'yahoo-exact', detail: `${refYear}-M${month}: ${match.amount.toFixed(6)}` }
    }

    const recentDivs = yahooDivs.filter(d => d.year >= cy - 2)
    if (recentDivs.length === 0) return { dps: 0, source: 'zero', detail: 'zu alt' }

    const payMonths = recentDivs.map(d => d.month)
    if (!payMonths.includes(month)) {
      return { dps: 0, source: 'zero', detail: `M${month} nie Zahlungsmonat` }
    }

    const monthMatches = recentDivs.filter(d => d.month === month)
    const avg = monthMatches.reduce((s, d) => s + d.amount, 0) / monthMatches.length
    return { dps: avg, source: 'yahoo-avg', detail: `avg(${monthMatches.length}): ${avg.toFixed(6)}` }
  }

  const isinsFromDivs  = Object.keys(byIsin)
  const isinsFromBuys  = Object.keys(sharesFromBuys).filter(isin => (netSharesMap[isin] ?? 0) > 0)
  const isinsFromNames = Object.keys(names)
  const isinsAll       = [...new Set([...isinsFromDivs, ...isinsFromBuys, ...isinsFromNames])]

  const isins = isinsAll.filter(isin => {
    if (!(isin in netSharesMap)) return true
    return netSharesMap[isin] > 0
  })

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

  const valueMap = {}
  for (const buy of buyActivities) {
    const isin = resolve(buy.asset?.isin || buy.asset?.symbol || 'unknown')
    const amount = parseFloat(String(buy.amount || buy.total || 0).replace(',', '.')) || 0
    valueMap[isin] = (valueMap[isin] || 0) + amount
  }

  const soldValueMap = {}
  for (const sell of sellActivities) {
    const isin = resolve(sell.asset?.isin || sell.asset?.symbol || 'unknown')
    const rawAmount = sell.amountNet ?? sell.amount ?? sell.total ?? sell.value ?? 0
    const amount = parseFloat(String(rawAmount).replace(',', '.')) || 0
    soldValueMap[isin] = (soldValueMap[isin] || 0) + amount
  }

  const forecastByHolding = {}
  const enrichedHoldings = []

  for (const isin of isinsAll) {
    forecastByHolding[isin] = {}
    const name   = names[isin] || isin
    const shares = currentShares(isin)

    const rawType   = types?.[isin] || 'security'
    const cleanType = formatAssetType(rawType, name)
    const costVal = valueMap[isin] || 0

    // --- LIVE-KURS DIREKT AUS YAHOO-BY-ISIN AUSLESEN ---
    const yahooEntry = yahooByIsin[isin]
    const livePrice = (yahooEntry && typeof yahooEntry === 'object') ? yahooEntry.price : null
    const marketValue = (livePrice != null && !isNaN(livePrice)) ? shares * livePrice : costVal
    // ----------------------------------------------------

    const row = {
      name: name,
      isin: isin,
      shares: shares,
      value: marketValue,
      costValue: costVal,
      soldValue: soldValueMap[isin] || 0,
      type: cleanType
    }

    for (let m = 0; m < 12; m++) {
      const actual = byIsin[isin]?.[cy]?.[m]
      if (actual && actual.amount > 0) {
        forecastByHolding[isin][m] = +actual.amount.toFixed(4)
        row[MONTHS[m]] = `✓${actual.amount.toFixed(2)}`
      } else {
        const { dps, source } = estimateDpsWithSource(isin, m)
        const total = +(dps * shares).toFixed(4)
        forecastByHolding[isin][m] = total
        if (m >= cm && total > 0) {
          const srcShort = { 'parqet-cy':'pcy', 'yahoo-cy':'ycy', 'historic':'hist', 'yahoo-exact':'yex', 'yahoo-avg':'yavg', 'zero':'0' }[source] || source
          row[MONTHS[m]] = `${total.toFixed(2)}(${srcShort})`
        } else {
          row[MONTHS[m]] = total > 0 ? total.toFixed(2) : '-'
        }
      }
    }
    enrichedHoldings.push(row)
  }

  const monthlyCy = Array(12).fill(0)
  for (let m = 0; m < 12; m++) {
    if (m < cm) {
      monthlyCy[m] = +curYearActuals[m].toFixed(4)
    } else if (m === cm) {
      const alreadyReceived = curYearActuals[cm]
      const stillExpected   = isins.reduce((s, isin) => {
        const actual = byIsin[isin]?.[cy]?.[cm]
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
    enrichedHoldings,
  }
}