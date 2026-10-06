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