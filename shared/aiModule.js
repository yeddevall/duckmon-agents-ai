// Shared AI Analysis Module for DuckMon Agents
// Uses Google Gemini API for intelligent market analysis

import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                      🧠 DUCKMON AI INTELLIGENCE MODULE                        ║
// ║              Powered by Google Gemini - Advanced Market Analysis              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const GEMINI_API_KEY = process.env.VITE_API_KEY || process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// AI Module Configuration
const AI_CONFIG = {
    maxRetries: 3,
    timeout: 30000,
    temperature: 0.7,
    maxOutputTokens: 1024,
};

// Logging utilities
const log = {
    ai: (msg) => console.log(`\x1b[35m[🧠 AI]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
};

/**
 * Call Gemini API with structured prompt
 */
async function callGeminiAPI(prompt, retries = AI_CONFIG.maxRetries) {
    if (!GEMINI_API_KEY) {
        log.error('Gemini API key not configured');
        return null;
    }

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: AI_CONFIG.temperature,
                    maxOutputTokens: AI_CONFIG.maxOutputTokens,
                }
            }),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        log.error(`Gemini API call failed: ${error.message}`);
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 1000));
            return callGeminiAPI(prompt, retries - 1);
        }
        return null;
    }
}

/**
 * Generate comprehensive market analysis using AI
 */
export async function generateMarketAnalysis(data) {
    const {
        price,
        priceChange24h,
        volume24h,
        rsi,
        macd,
        macdSignal,
        bollingerPosition,
        momentum,
        volatility
    } = data;

    const prompt = `You are an expert cryptocurrency market analyst. Analyze the following DUCK token data and provide a professional trading signal.

MARKET DATA:
- Current Price: $${price}
- 24h Change: ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(2)}%
- 24h Volume: $${volume24h.toLocaleString()}
- RSI(14): ${rsi.toFixed(1)}
- MACD: ${macd.toFixed(6)} (Signal: ${macdSignal.toFixed(6)})
- Bollinger Position: ${bollingerPosition.toFixed(2)}% (0=lower band, 100=upper band)
- Momentum: ${momentum.toFixed(2)}%
- Volatility: ${volatility.toFixed(2)}%

TASK: Provide a JSON response with the following structure:
{
    "signal": "BUY" or "SELL" or "HOLD",
    "confidence": number between 50-95,
    "reason": "Brief 1-line explanation with key indicators",
    "support": "price level",
    "resistance": "price level",
    "riskReward": "ratio like 1:2.5",
    "stopLoss": "price level",
    "takeProfit": "price level",
    "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
    "keyFactors": ["factor1", "factor2", "factor3"]
}

Respond with ONLY the JSON, no additional text.`;

    const aiResponse = await callGeminiAPI(prompt);

    if (!aiResponse) {
        return null;
    }

    try {
        // Extract JSON from response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        log.error(`Failed to parse AI response: ${e.message}`);
    }

    return null;
}

/**
 * Generate AI-powered price prediction
 */
export async function generatePricePrediction(data) {
    const {
        currentPrice,
        priceHistory,
        trend,
        support,
        resistance,
        timeframe // '1h', '4h', '24h'
    } = data;

    const recentPrices = priceHistory.slice(-10).map(p => p.toFixed(8)).join(', ');

    const prompt = `You are an expert cryptocurrency price prediction analyst. Predict future price movement for DUCK token.

CURRENT DATA:
- Current Price: $${currentPrice}
- Recent Prices (10 points): ${recentPrices}
- Overall Trend: ${trend}
- Support Level: $${support}
- Resistance Level: $${resistance}
- Timeframe: ${timeframe}

TASK: Provide a JSON response:
{
    "direction": "UP" or "DOWN" or "SIDEWAYS",
    "confidence": number between 50-95,
    "targetPrice": "predicted price",
    "percentChange": "expected % change",
    "analysis": "Brief 1-line reasoning",
    "probability": {
        "bullish": number,
        "bearish": number,
        "sideways": number
    },
    "keyLevels": {
        "strongSupport": "price",
        "weakSupport": "price",
        "weakResistance": "price",
        "strongResistance": "price"
    }
}

Respond with ONLY the JSON, no additional text.`;

    const aiResponse = await callGeminiAPI(prompt);

    if (!aiResponse) {
        return null;
    }

    try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        log.error(`Failed to parse prediction: ${e.message}`);
    }

    return null;
}

/**
 * Generate whale behavior analysis using AI
 */
export async function analyzeWhaleBehavior(data) {
    const {
        wallet,
        balanceChange,
        newBalance,
        percentOfSupply,
        recentActivity,
        networkStats
    } = data;

    const prompt = `You are an expert on-chain analyst specializing in whale behavior. Analyze this whale wallet activity.

WHALE DATA:
- Wallet: ${wallet}
- Balance Change: ${balanceChange > 0 ? '+' : ''}${balanceChange.toLocaleString()} DUCK
- New Balance: ${newBalance.toLocaleString()} DUCK
- % of Total Supply: ${percentOfSupply.toFixed(2)}%
- Recent Activity Pattern: ${recentActivity}

NETWORK CONTEXT:
- Gas Price: ${networkStats.gasPrice} gwei
- Network Activity: ${networkStats.txPerBlock} TX/block
- Network Congestion: ${networkStats.congestion}

TASK: Provide a JSON response:
{
    "behavior": "ACCUMULATING" or "DISTRIBUTING" or "TRADING" or "DORMANT",
    "intent": "Brief analysis of likely intent",
    "marketImpact": "LOW" or "MODERATE" or "HIGH" or "CRITICAL",
    "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
    "recommendation": "Brief action recommendation",
    "riskAssessment": "Risk level for retail traders",
    "historicalPattern": "Pattern comparison if applicable",
    "priceImpact": "Expected price impact"
}

Respond with ONLY the JSON, no additional text.`;

    const aiResponse = await callGeminiAPI(prompt);

    if (!aiResponse) {
        return null;
    }

    try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        log.error(`Failed to parse whale analysis: ${e.message}`);
    }

    return null;
}

/**
 * Generate comprehensive market summary using AI
 */
export async function generateDailySummary(data) {
    const {
        signals,
        predictions,
        whaleAlerts,
        pricePerformance,
        volumeStats
    } = data;

    const prompt = `You are a professional cryptocurrency market analyst. Create a comprehensive daily summary.

TODAY'S DATA:
- Signals Generated: ${signals.buy} BUY, ${signals.sell} SELL, ${signals.hold} HOLD
- Predictions: ${predictions.bullish} Bullish, ${predictions.bearish} Bearish
- Whale Alerts: ${whaleAlerts.accumulation} Accumulation, ${whaleAlerts.distribution} Distribution
- Price Performance: ${pricePerformance > 0 ? '+' : ''}${pricePerformance.toFixed(2)}%
- Volume (24h): $${volumeStats.volume24h.toLocaleString()} (${volumeStats.volumeChange > 0 ? '+' : ''}${volumeStats.volumeChange.toFixed(1)}%)

TASK: Provide a JSON response:
{
    "marketCondition": "BULLISH" or "BEARISH" or "CONSOLIDATING" or "VOLATILE",
    "summary": "2-3 sentence professional summary",
    "keyHighlights": ["highlight1", "highlight2", "highlight3"],
    "outlook": "Brief next 24h outlook",
    "riskLevel": "LOW" or "MODERATE" or "HIGH",
    "actionableInsight": "One clear actionable recommendation",
    "confidenceScore": number between 60-95
}

Respond with ONLY the JSON, no additional text.`;

    const aiResponse = await callGeminiAPI(prompt);

    if (!aiResponse) {
        return null;
    }

    try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        log.error(`Failed to parse summary: ${e.message}`);
    }

    return null;
}

/**
 * Format AI analysis for on-chain signal reason
 */
export function formatAISignalReason(aiAnalysis) {
    if (!aiAnalysis) return null;

    const {
        signal,
        confidence,
        reason,
        support,
        resistance,
        riskReward,
        sentiment,
        keyFactors
    } = aiAnalysis;

    // Format: 🧠 AI ANALYSIS | Signal Details | Levels | Factors
    const parts = [
        `🧠 AI ${signal}`,
        reason,
        `Support: $${support}`,
        `Resistance: $${resistance}`,
        `R/R: ${riskReward}`,
        sentiment,
        keyFactors ? `Factors: ${keyFactors.slice(0, 2).join(', ')}` : null
    ].filter(Boolean);

    return parts.join(' | ');
}

/**
 * Check if AI module is available
 */
export function isAIEnabled() {
    return !!GEMINI_API_KEY;
}

/**
 * Get AI module status
 */
export function getAIStatus() {
    return {
        enabled: isAIEnabled(),
        model: 'gemini-2.0-flash',
        features: ['market-analysis', 'price-prediction', 'whale-behavior', 'daily-summary'],
    };
}

// Export for use in agents
export default {
    generateMarketAnalysis,
    generatePricePrediction,
    analyzeWhaleBehavior,
    generateDailySummary,
    formatAISignalReason,
    isAIEnabled,
    getAIStatus,
};
