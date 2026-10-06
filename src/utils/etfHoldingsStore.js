// Pfad und Export an deine bestehende Datei anpassen (bei Default-Export: import supabase from '...')
import { supabase } from "../supabaseClient"

const TABLE = 'etf_holdings'

export async function loadStoredHoldings() {
    const { data, error } = await supabase
        .from(TABLE)
        .select('etf_name, rows, row_count, weight_sum, updated_at')
    if (error) throw error
    return data || []
}

export async function saveHoldings(etfName, rows, sum) {
    const { error } = await supabase.from(TABLE).upsert(
        {
            etf_name: etfName,
            rows,
            row_count: rows.length,
            weight_sum: sum,
            updated_at: new Date().toISOString()
        },
        { onConflict: 'etf_name' }
    )
    if (error) throw error
}