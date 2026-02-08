/**
 * Shared Technical Analysis Utilities
 * Common functions used by all agents
 */

/**
 * Calculate RSI (Relative Strength Index)
 * @param {number[]} prices - Price history (newest first)
 * @param {number} period - RSI period (default: 14)
 * @returns {number} RSI value (0-100)
 */
export function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Calculate Simple Moving Average
 * @param {number[]} prices - Price history
 * @param {number} period - SMA period
 * @returns {number} SMA value
 */
export function calculateSMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const slice = prices.slice(0, period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate MACD
 * @param {number[]} prices - Price history
 * @returns {{ value: number, signal: number, histogram: number }}
 */
export function calculateMACD(prices) {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    const signalLine = macdLine * 0.9;

    return {
        value: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine
    };
}

/**
 * Calculate EMA
 */
export function calculateEMA(prices, period) {
    if (prices.length < period) return calculateSMA(prices, prices.length);

    const multiplier = 2 / (period + 1);
    let ema = calculateSMA(prices.slice(-period), period);

    for (let i = prices.length - period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(prices, period = 20) {
    const sma = calculateSMA(prices, period);
    const slice = prices.slice(0, Math.min(period, prices.length));

    const squaredDiffs = slice.map(p => Math.pow(p - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / slice.length;
    const stdDev = Math.sqrt(variance);

    return {
        upper: sma + (stdDev * 2),
        middle: sma,
        lower: sma - (stdDev * 2)
    };
}

/**
 * Calculate Momentum
 */
export function calculateMomentum(prices, period = 10) {
    if (prices.length < period) return 0;
    return ((prices[0] - prices[period - 1]) / prices[period - 1]) * 100;
}

/**
 * Calculate Volatility
 */
export function calculateVolatility(prices) {
    if (prices.length < 2) return 0;

    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = Math.sqrt(variance);

    return (stdDev / mean) * 100;
}

export default {
    calculateRSI,
    calculateSMA,
    calculateMACD,
    calculateEMA,
    calculateBollingerBands,
    calculateMomentum,
    calculateVolatility
};
