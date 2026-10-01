// --- Namensbereinigung ---
export function normalizeName(name) {
    if (!name) return ''
    return name
        .toUpperCase()
        .trim()
        .replace(/['"`]/g, '')
        .replace(/\bCLASS\s+[A-Z]\b/g, '')
        .replace(/\bCL\s+[A-Z]\b/g, '')
        .replace(/\([A-Z]\)/g, '')
        .replace(/\b(SE|AG|B|A\/S|SA|NV|PLC|INC|CORP|LTD|LLC|GMBH|SPA|AB|ASA|OYJ|ADR|REG|REGISTERED|SHS|ORD|NEW|HOLDINGS|HOLDING)\b/g, '')
        .replace(/[-/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

// --- Gewichtung parsen ---
export function parseWeight(val) {
    if (typeof val === 'number') return val
    if (!val) return 0
    const cleaned = String(val).replace(',', '.')
    return parseFloat(cleaned) || 0
}

// --- Regionen-Zuordnung ---
export function getRegion(country) {
    if (!country) return 'Unbekannt'
    const c = country.toUpperCase()

    if (['VEREINIGTE STAATEN', 'KANADA', 'MEXIKO', 'BERMUDA', 'PUERTO RICO'].includes(c)) return 'Nordamerika'
    if (['VEREINIGTES KOENIGREICH', 'UNITED KINGDOM', 'DAENEMARK', 'DENMARK', 'DEUTSCHLAND', 'FRANKREICH', 'SCHWEIZ', 'NIEDERLANDE', 'SCHWEDEN', 'ITALIEN', 'SPANIEN', 'IRLAND', 'BELGIEN', 'NORWEGEN', 'FINNLAND', 'OESTERREICH', 'OSTERREICH', 'PORTUGAL', 'POLEN', 'TSCHECHIEN', 'UNGARN', 'GRIECHENLAND', 'TÜRKEI', 'TUERKEI', 'LUXEMBURG', 'JERSEY', 'ZYPERN', 'ISLAND'].some(x => c.includes(x))) return 'Europa'
    if (['JAPAN', 'TAIWAN', 'INDIEN', 'CHINA', 'HONGKONG', 'SINGAPUR', 'SUEDKOREA', 'NEUSEELAND', 'SAUDI-ARABIEN', 'INDONESIEN', 'MALAYSIA', 'THAILAND', 'KATAR', 'PHILIPPINEN', 'KUWAIT', 'ISRAEL', 'VIETNAM'].some(x => c.includes(x))) return 'Asien'
    if (['AUSTRALIEN'].includes(c)) return 'Ozeanien und Australien'
    if (['SUEDAFRIKA', 'AEGYPTEN', 'MAROKKO', 'KENIA'].some(x => c.includes(x))) return 'Afrika'
    if (c === 'KRYPTO') return 'Krypto'
    if (c === 'GLOBAL') return 'Global'

    return 'Sonstige'
}

// --- X-Ray Berechnung mit automatischen Live-Depotgewichten ---
export function computePortfolioXRay(etfHoldingsMap, userHoldings, currentValue) {
    const aggregated = {}
    if (!currentValue || currentValue <= 0 || !userHoldings) return []

    // 1. Echte Depot-Anteile (Gewichte) direkt aus den User-Holdings ermitteln
    const portfolioWeights = {}
    for (const item of userHoldings) {
        const nameKey = normalizeName(item.name || item.title || '')
        const itemValue = item.value || 0
        portfolioWeights[nameKey] = itemValue / currentValue // Anteil am Gesamtportfolio (0.0 bis 1.0)
    }

    // 2. ETFs aufdröseln und mit den echten Depot-Gewichten multiplizieren
    for (const [etfName, holdings] of Object.entries(etfHoldingsMap)) {
        const normalizedEtfName = normalizeName(etfName)
        const etfPortfolioWeight = portfolioWeights[normalizedEtfName] || 0

        if (etfPortfolioWeight <= 0 || !Array.isArray(holdings)) continue

        for (const item of holdings) {
            const name = normalizeName(item.Name)
            const country = item.Country || 'GLOBAL'
            const rawWeight = parseWeight(item.Weight) // z.B. 4.5 für 4.5% im ETF

            // Anteil am Gesamtportfolio
            const totalWeightContribution = (rawWeight / 100) * etfPortfolioWeight * 100

            if (!aggregated[name]) {
                aggregated[name] = { Name: name, Country: country, Weight: 0 }
            }
            aggregated[name].Weight += totalWeightContribution
        }
    }

    // 3. Direktkäufe (Aktien, Krypto, die keine gemappten ETFs sind) direkt einrechnen
    for (const item of userHoldings) {
        const name = normalizeName(item.name || item.title || '')
        // Wenn es kein bekannter ETF mit hochgeladenen Unter-Holdings ist, als Direktposition werten
        if (!etfHoldingsMap[item.name] && !etfHoldingsMap[item.title]) {
            const directWeight = ((item.value || 0) / currentValue) * 100
            if (directWeight > 0) {
                if (!aggregated[name]) {
                    // Versuche Land/Krypto zu erkennen
                    const isCrypto = ['BITCOIN', 'SOLANA', 'DOGECOIN', 'ETH'].some(c => name.includes(c))
                    aggregated[name] = { Name: name, Country: isCrypto ? 'Krypto' : 'GLOBAL', Weight: 0 }
                }
                aggregated[name].Weight += directWeight
            }
        }
    }

    return Object.values(aggregated).sort((a, b) => b.Weight - a.Weight)
}