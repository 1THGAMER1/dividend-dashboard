export function computePortfolioXRay(etfHoldingsMap, userHoldings, currentValue) {
    const aggregated = {}
    if (!currentValue || currentValue <= 0 || !userHoldings) return []

    const portfolioWeights = {}
    for (const item of userHoldings) {
        const nameKey = normalizeName(item.name || item.title || '')
        const itemValue = item.value || 0
        portfolioWeights[nameKey] = itemValue / currentValue
    }

    // Nur ETFs aufdröseln, die im etfHoldingsMap UND im Portfolio sind
    for (const [etfName, holdings] of Object.entries(etfHoldingsMap)) {
        const normalizedEtfName = normalizeName(etfName)

        // Suche im Portfolio nach einem passenden Eintrag
        const matchingPortfolioKey = Object.keys(portfolioWeights).find(pKey => pKey.includes(normalizedEtfName) || normalizedEtfName.includes(pKey))

        if (!matchingPortfolioKey) continue // Überspringen, wenn nicht im Portfolio!

        const etfPortfolioWeight = portfolioWeights[matchingPortfolioKey] || 0
        if (etfPortfolioWeight <= 0 || !Array.isArray(holdings)) continue

        for (const item of holdings) {
            const name = normalizeName(item.Name)
            const country = item.Country || 'GLOBAL'
            const rawWeight = parseWeight(item.Weight)

            const totalWeightContribution = (rawWeight / 100) * etfPortfolioWeight * 100

            if (!aggregated[name]) {
                aggregated[name] = { Name: name, Country: country, Weight: 0 }
            }
            aggregated[name].Weight += totalWeightContribution
        }
    }

    // Direktkäufe (Aktien, Krypto) hinzufügen, die keine ETFs sind
    for (const item of userHoldings) {
        const name = normalizeName(item.name || item.title || '')
        const rawNameLower = (item.name || item.title || '').toLowerCase()

        const isEtf = rawNameLower.includes('etf') || rawNameLower.includes('ucits') || rawNameLower.includes('msci')
        const hasBeenExpandedAsEtf = Object.keys(etfHoldingsMap).some(eKey => name.includes(normalizeName(eKey)))

        if (!isEtf && !hasBeenExpandedAsEtf) {
            const directWeight = ((item.value || 0) / currentValue) * 100
            if (directWeight > 0) {
                if (!aggregated[name]) {
                    const isCrypto = ['BITCOIN', 'SOLANA', 'DOGECOIN', 'ETH'].some(c => name.includes(c))
                    aggregated[name] = { Name: name, Country: isCrypto ? 'Krypto' : 'GLOBAL', Weight: 0 }
                }
                aggregated[name].Weight += directWeight
            }
        }
    }

    return Object.values(aggregated).sort((a, b) => b.Weight - a.Weight)
}