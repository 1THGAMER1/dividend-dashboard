export function groupByYearMonth(activities) {
  const result = {}

  for (const a of activities) {
    const d = new Date(a.datetime)
    const year = d.getFullYear()
    const month = d.getMonth()

    if (!result[year]) result[year] = Array(12).fill(0)
    result[year][month] += a.amountNet ?? a.amount ?? 0
  }

  return result
}

export function toCumulative(monthly) {
  const result = {}

  for (const [year, values] of Object.entries(monthly)) {
    let sum = 0
    result[year] = values.map(value => +(sum += value).toFixed(4))
  }

  return result
}
export function buildForecast(cum, activities, buyActivities = [], names = {}, yahooByIsin = {}, sellActivities = [], types = {}, parqetPositions = {}) {
  const cy = new Date().getFullYear()
  const cm = new Date().getMonth()
  const ny = cy + 1

  const mergeMap = buildIsinMergeMap(activities, names)
  const resolve  = makeResolver(mergeMap)

  // Einheitlicher Helper zur sauberen ISIN-Ermittlung
  const getCleanIsin = (item) => {
    const raw = item?.asset?.isin || item?.asset?.symbol || item?.isin || 'unknown'
    return resolve(raw)
  }

  // --- AKTIENSPLITS (von Yahoo): Buchungen vor einem Split in heutige Stückzahl umrechnen ---
  const splitsFor = (item) => {
    const raw   = item?.asset?.isin || item?.asset?.symbol || item?.isin
    const entry = yahooByIsin[getCleanIsin(item)] || yahooByIsin[raw]
    return entry && !Array.isArray(entry) && Array.isArray(entry.splits) ? entry.splits : []
  }
  const adjShares = (item) => {
    const shares = parseFloat(String(item?.shares ?? 0).replace(',', '.')) || 0
    const day    = String(item?.datetime || '').slice(0, 10)
    if (!day) return shares
    const factor = splitsFor(item).reduce(
        (f, s) => (s?.date && s.ratio > 0 && day < s.date ? f * s.ratio : f), 1
    )
    return shares * factor
  }

  // --- PARQET-POSITIONEN (Splits, Überträge usw. sind dort schon eingerechnet) ---
  const parqetByIsin = {}
  for (const [rawKey, pos] of Object.entries(parqetPositions || {})) {
    if (!pos) continue
    const isin = resolve(rawKey)
    const prev = parqetByIsin[isin]
    parqetByIsin[isin] = prev
        ? {
          shares:       prev.shares + (pos.shares ?? 0),
          cost:         prev.cost + (pos.cost ?? 0),
          realizedGain: prev.realizedGain + (pos.realizedGain ?? 0),
        }
        : { shares: pos.shares ?? 0, cost: pos.cost ?? 0, realizedGain: pos.realizedGain ?? 0 }
  }

  const byIsin = {}
  for (const a of activities) {
    const isin = getCleanIsin(a)
    const d    = new Date(a.datetime)
    const y    = d.getFullYear()
    const m    = d.getMonth()
    if (!byIsin[isin])       byIsin[isin] = {}
    if (!byIsin[isin][y])    byIsin[isin][y] = Array(12).fill(null)
    if (!byIsin[isin][y][m]) byIsin[isin][y][m] = { amount: 0, shares: 0 }
    byIsin[isin][y][m].amount += a.amountNet ?? a.amount ?? 0
    byIsin[isin][y][m].shares += adjShares(a) // splitbereinigt → Dividende pro Aktie stimmt
  }

  const sharesFromBuys  = {}
  const sharesFromSells = {}

  for (const buy of buyActivities) {
    const isin = getCleanIsin(buy)
    sharesFromBuys[isin] = (sharesFromBuys[isin] || 0) + adjShares(buy)
  }
  for (const sell of sellActivities) {
    const isin = getCleanIsin(sell)
    sharesFromSells[isin] = (sharesFromSells[isin] || 0) + adjShares(sell)
  }

  const netSharesMap = {}
  const allKnownIsins = new Set([
    ...Object.keys(sharesFromBuys),
    ...Object.keys(sharesFromSells),
    ...Object.keys(byIsin),
    ...Object.keys(names),
    ...Object.keys(yahooByIsin),
    ...Object.keys(parqetByIsin),
  ])

  for (const isin of allKnownIsins) {
    const bShares = sharesFromBuys[isin] || 0
    const sShares = sharesFromSells[isin] || 0
    netSharesMap[isin] = Math.max(0, bShares - sShares)
  }

  // --- FIFO-BERECHNUNG: EINSTANDSWERTE, RESTANTEILE, REALISIERTE GEWINNE ---
  const valueMap = {}
  const exactSharesMap = {}
  const realizedGainMap = {}

  for (const isin of allKnownIsins) {
    const buys = buyActivities
        .filter(b => getCleanIsin(b) === isin)
        .map(b => ({
          date: new Date(b.datetime || 0),
          shares: adjShares(b),
          cost: parseFloat(String(b.amount || b.total || 0).replace(',', '.')) || 0
        }))
        .sort((a, b) => a.date - b.date)

    const sells = sellActivities
        .filter(s => getCleanIsin(s) === isin)
        .map(s => ({
          date: new Date(s.datetime || 0),
          shares: adjShares(s),
          totalEarning: parseFloat(String(s.amount || s.total || s.value || 0).replace(',', '.')) || 0
        }))
        .sort((a, b) => a.date - b.date)

    const lots = buys.map(b => ({
      shares: b.shares,
      costPerShare: b.shares > 0 ? b.cost / b.shares : 0
    }))

    let totalRealizedGain = 0

    for (const sell of sells) {
      let toSell = sell.shares
      let costOfSold = 0

      while (toSell > 0.000001 && lots.length > 0) {
        const lot  = lots[0]
        const take = Math.min(lot.shares, toSell)
        costOfSold += take * lot.costPerShare
        toSell     -= take
        lot.shares -= take
        if (lot.shares <= 0.000001) lots.shift()
      }

      if (sell.totalEarning > 0) {
        totalRealizedGain += sell.totalEarning - costOfSold
      }
    }

    const remainingShares = lots.reduce((sum, lot) => sum + lot.shares, 0)
    const remainingCost   = lots.reduce((sum, lot) => sum + lot.shares * lot.costPerShare, 0)

    exactSharesMap[isin]  = remainingShares > 0.000001 ? remainingShares : 0
    valueMap[isin]        = remainingShares > 0.000001 ? remainingCost : 0
    realizedGainMap[isin] = totalRealizedGain
  }

  // Parqet-Werte haben Vorrang, FIFO bleibt Rückfall für fehlende Positionen
  for (const [isin, pos] of Object.entries(parqetByIsin)) {
    netSharesMap[isin]    = pos.shares
    exactSharesMap[isin]  = pos.shares
    valueMap[isin]        = pos.cost
    realizedGainMap[isin] = pos.realizedGain
  }
  // ---------------------------------------------------------------------

  function currentShares(isin) {
    if (isin in exactSharesMap) return exactSharesMap[isin]
    if (isin in netSharesMap) return netSharesMap[isin]
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

  const isinsFromBuys = Object.keys(sharesFromBuys)
  const isinsAll = [...allKnownIsins]

  const isins = isinsAll.filter(isin => {
    const shares = currentShares(isin)
    return shares > 0.000001
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

  const soldValueMap = {}
  for (const sell of sellActivities) {
    const isin = getCleanIsin(sell)
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
    const costVal   = valueMap[isin] || 0

    const yahooEntry = yahooByIsin[isin]
    const livePrice  = (yahooEntry && typeof yahooEntry === 'object') ? yahooEntry.price : null
    const marketValue = (livePrice != null && !isNaN(livePrice)) ? shares * livePrice : costVal

    const row = {
      name: name,
      isin: isin,
      shares: shares,
      value: marketValue,
      costValue: costVal,
      soldValue: soldValueMap[isin] || 0,
      realizedGain: realizedGainMap[isin] || 0,
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
export function groupByHolding(activities, names = {}, types = {}, purchaseValues = {}, tickers = {}) {
  const mergeMap = buildIsinMergeMap(activities, names)
  const resolve = makeResolver(mergeMap)
  const palette = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#facc15', '#38bdf8', '#f87171', '#4ade80', '#c084fc', '#e879f9', '#2dd4bf', '#fbbf24', '#818cf8', '#fb7185']
  const map = {}

  for (const a of activities) {
    const rawIsin = a.asset?.isin || a.asset?.symbol || 'unknown'
    const isin = resolve(rawIsin)
    const date = new Date(a.datetime)
    const year = date.getFullYear()
    const month = date.getMonth()

    if (!map[isin]) {
      map[isin] = {
        name: names[isin] || names[rawIsin] || a.asset?.name || a.asset?.symbol || isin,
        type: types[isin] || types[rawIsin] || a.holdingAssetType || 'security',
        ticker: tickers[isin] || tickers[rawIsin] || null,
        monthly: {}, gross: {}, tax: {},
      }
    }

    for (const key of ['monthly', 'gross', 'tax']) {
      if (!map[isin][key][year]) map[isin][key][year] = Array(12).fill(0)
    }

    const net = a.amountNet ?? a.amount ?? 0
    const gross = a.amount ?? net
    map[isin].monthly[year][month] += net
    map[isin].gross[year][month] += gross
    map[isin].tax[year][month] += gross - net
  }

  const now = new Date()

  Object.keys(map).forEach((isin, index) => {
    map[isin].color = palette[index % palette.length]
    const purchaseValue = purchaseValues[isin] ?? 0
    const totalNet = Object.values(map[isin].monthly).flat().reduce((sum, value) => sum + value, 0)

    map[isin].yield = purchaseValue > 0 ? +((totalNet / purchaseValue) * 100).toFixed(2) : null

    let last12m = 0
    for (const [year, months] of Object.entries(map[isin].monthly)) {
      for (let month = 0; month < 12; month++) {
        const date = new Date(Number(year), month, 1)
        if ((now - date) / 864e5 <= 365) last12m += months[month] || 0
      }
    }

    map[isin].assetYield = purchaseValue > 0 ? +((last12m / purchaseValue) * 100).toFixed(2) : null
  })

  return map
}