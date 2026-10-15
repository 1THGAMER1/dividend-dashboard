// Erstmal hardcodierte overrides bis anderweitige Lösung gefunden wird (Novo bsp. aufgrund der Namensänderung)
export const COUNTRY_OVERRIDES = {
    'NOVO': 'Dänemark',
    'SANOFI': 'Frankreich',
    'MUENCHENER RUECKVERSICHERUNGS': 'Deutschland',
    'ROCHE': 'Schweiz',
    'CIE GENERALE DES ETABLISSEMENTS': 'Frankreich',
    'HANWHA AEROSPACE': 'Südkorea',
    'HYUNDAI ROTEM': 'Südkorea',
    'KOREA AEROSPACE INDUSTRIES': 'Südkorea',
    'DAI ICHI LIFE': 'Japan',
    'NIPPON TELEGRAPH AND TELEPHONE': 'Japan',
    'SUMITOMO MITSUI TRUST': 'Japan',
    'CACI INTERNATIONAL': 'Vereinigte Staaten',
    'MOOG': 'Vereinigte Staaten',
    'HUNTINGTON INGALLS INDUSTRIES': 'Vereinigte Staaten',
    'KRATOS DEFENSE AND SECURITY SOLUTIONS': 'Vereinigte Staaten',
    'BOOZ ALLEN HAMILTON': 'Vereinigte Staaten',
    'BABCOCK INTERNATIONAL GROUP': 'Vereinigtes Königreich'
}

export function lookupCountry(normName) {
    if (!normName) return null
    if (/\bPHYSICAL\b/.test(normName)) return 'Rohstoffe'      // z. B. WisdomTree Physical Gold
    if (/^OTHER CASH\b|^CASH$/.test(normName)) return 'Bargeld'
    for (const [key, country] of Object.entries(COUNTRY_OVERRIDES)) {
        if (normName === key || normName.startsWith(key + ' ')) return country
    }
    return null
}
// Sektor für direkt gehaltene Aktien ohne ETF-Daten (Schlüssel = Anfang des normalisierten Namens)
export const SECTOR_OVERRIDES = {
    'NETFLIX': 'Kommunikationsdienste',
    'VERIZON COMMUNICATIONS': 'Kommunikationsdienste',
    'NOVO': 'Gesundheitswesen',
    'SANOFI FRANCE': 'Gesundheitswesen',
    'ROCHE PS PAR': 'Gesundheitswesen',
    'MUENCHENER RUECKVERSICHERUNGS GESELLSCH': 'Finanzen',
    'DAI ICHI LIFE': 'Finanzen',
    'SUMITOMO MITSUI TRUST': 'Finanzen',
    'BLACKROCK FUNDING DE': 'Finanzen',
    'CHINA CONSTRUCTION BANK': 'Finanzen',
    'HANWHA AEROSPACE': 'Industrie',
    'CACI INTERNATIONAL': 'Industrie',
    'MOOG': 'Industrie',
    'NIPPON YUSEN KK': 'Industrie',
    'MITSUI OSK LINES': 'Industrie',
    'VOLKSWAGEN': 'Zyklischer Konsum',
    'CIE GENERALE DES ETABLISSEMENTS MICHELI': 'Zyklischer Konsum',
    'CIE FINANCIERE RICHEMONT': 'Zyklischer Konsum',
    'NIPPON TELEGRAPH AND TELEPHONE': 'Kommunikationsdienste',
    'MEDIATEK': 'Informationstechnologie',
    'OMV': 'Energie',
    'TERNA RETE ELETTRICA NAZIONALE': 'Versorger',
}

export function lookupSector(normName) {
    if (!normName) return null
    for (const [key, sector] of Object.entries(SECTOR_OVERRIDES)) {
        if (normName === key || normName.startsWith(key + ' ')) return sector
    }
    return null
}