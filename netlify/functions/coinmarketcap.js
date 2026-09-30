export const handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const symbol = (event.queryStringParameters?.symbol || '').toUpperCase();

        if (!symbol) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Symbol parameter is required' })
            };
        }

        // CoinMarketCap Pro API (oder über einen Public Price Endpunkt / CoinGecko Fallback)
        // Hier nutzen wir die offizielle CoinMarketCap API (erfordert einen kostenlosen API-Key in deinen Netlify Environment Variables: CMC_API_KEY)
        const apiKey = process.env.CMC_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'CMC_API_KEY is not configured in environment variables' })
            };
        }

        const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol)}&convert=EUR`;

        const response = await fetch(url, {
            headers: {
                'X-CMC_PRO_API_KEY': apiKey,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`CoinMarketCap API returned status ${response.status}`);
        }

        const data = await response.json();
        const coinData = data.data?.[symbol];

        if (!coinData) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Crypto symbol not found on CoinMarketCap' })
            };
        }

        const quote = coinData.quote?.EUR || {};

        const responseData = {
            symbol: coinData.symbol,
            name: coinData.name,
            regularMarketPrice: quote.price || 0,
            percentChange24h: quote.percent_change_24h || 0,
            marketCap: quote.market_cap || 0,
            currency: 'EUR'
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error('Error in coinmarketcap function:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to fetch crypto data',
                details: error.message
            })
        };
    }
};