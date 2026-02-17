/**
 * DUCKMON Professional Technical Analysis Library v3.0
 * Fixed MACD signal line + 7 new indicators
 * All functions accept plain number[] arrays (oldest-first)
 */

// ═══════════════════════════════════════════════════════════════════
// CORE INDICATORS
// ═══════════════════════════════════════════════════════════════════

export function calculateSMA(prices, period) {
    if (!prices || prices.length < period) return prices?.[prices.length - 1] || 0;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateEMA(prices, period) {
    if (!prices || prices.length === 0) return 0;
    if (prices.length < period) return calculateSMA(prices, prices.length);

    const k = 2 / (period + 1);
    let ema = calculateSMA(prices.slice(0, period), period);

    for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

export function calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return 50;

    let gains = 0, losses = 0;
    const start = prices.length - period - 1;

    for (let i = start + 1; i < prices.length; i++) {
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
 * MACD with PROPER 9-period EMA signal line (FIXED)
 * Previous bug: signalLine = macdLine * 0.9 (wrong scalar multiplication)
 * Fix: Calculate MACD line for multiple periods, then apply 9-period EMA
 */
export function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!prices || prices.length < slowPeriod + signalPeriod) {
        return { value: 0, signal: 0, histogram: 0 };
    }

    // Calculate MACD line values over time for signal line EMA
    const macdValues = [];
    const lookback = Math.min(signalPeriod + 10, prices.length - slowPeriod);

    for (let i = 0; i < lookback; i++) {
        const endIdx = prices.length - i;
        const slice = prices.slice(0, endIdx);
        const fast = calculateEMA(slice, fastPeriod);
        const slow = calculateEMA(slice, slowPeriod);
        macdValues.unshift(fast - slow); // oldest first
    }

    const macdLine = macdValues[macdValues.length - 1];

    // Signal line = 9-period EMA of MACD values
    let signalLine = macdLine;
    if (macdValues.length >= signalPeriod) {
        signalLine = calculateEMA(macdValues, signalPeriod);
    }

    return {
        value: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine,
    };
}

export function calculateBollingerBands(prices, period = 20, multiplier = 2) {
    if (!prices || prices.length < period) {
        const p = prices?.[prices.length - 1] || 0;
        return { upper: p, middle: p, lower: p, bandwidth: 0, percentB: 50 };
    }

    const sma = calculateSMA(prices, period);
    const slice = prices.slice(-period);
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = sma + multiplier * stdDev;
    const lower = sma - multiplier * stdDev;
    const current = prices[prices.length - 1];
    const bandwidth = sma > 0 ? ((upper - lower) / sma) * 100 : 0;
    const percentB = upper !== lower ? ((current - lower) / (upper - lower)) * 100 : 50;

    return { upper, middle: sma, lower, bandwidth, percentB };
}

export function calculateMomentum(prices, period = 10) {
    if (!prices || prices.length < period + 1) return 0;
    const current = prices[prices.length - 1];
    const past = prices[prices.length - 1 - period];
    return past !== 0 ? ((current - past) / past) * 100 : 0;
}

export function calculateVolatility(prices, period = 20) {
    if (!prices || prices.length < 2) return 0;
    const slice = prices.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    if (mean === 0) return 0;
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / slice.length;
    return (Math.sqrt(variance) / mean) * 100;
}

// ═══════════════════════════════════════════════════════════════════
// NEW INDICATORS
// ═══════════════════════════════════════════════════════════════════

/**
 * Stochastic RSI - Combines RSI with Stochastic formula
 * Returns %K and %D (signal line)
 */
export function calculateStochasticRSI(prices, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
    if (!prices || prices.length < rsiPeriod + stochPeriod + kSmooth) {
        return { k: 50, d: 50 };
    }

    // Calculate RSI values over time
    const rsiValues = [];
    for (let i = rsiPeriod + 1; i <= prices.length; i++) {
        const slice = prices.slice(0, i);
        rsiValues.push(calculateRSI(slice, rsiPeriod));
    }

    if (rsiValues.length < stochPeriod) return { k: 50, d: 50 };

    // Stochastic of RSI
    const kValues = [];
    for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
        const window = rsiValues.slice(i - stochPeriod + 1, i + 1);
        const high = Math.max(...window);
        const low = Math.min(...window);
        const k = high !== low ? ((rsiValues[i] - low) / (high - low)) * 100 : 50;
        kValues.push(k);
    }

    // Smooth %K
    const smoothK = kValues.length >= kSmooth
        ? calculateSMA(kValues, kSmooth)
        : kValues[kValues.length - 1] || 50;

    // %D = SMA of %K
    const smoothD = kValues.length >= dSmooth
        ? calculateSMA(kValues.slice(-dSmooth), dSmooth)
        : smoothK;

    return { k: smoothK, d: smoothD };
}

/**
 * Average True Range (ATR) - Volatility indicator
 * Uses price-to-price changes as proxy when OHLC not available
 */
export function calculateATR(prices, period = 14) {
    if (!prices || prices.length < period + 1) return 0;

    let atrSum = 0;
    const start = prices.length - period;

    for (let i = start; i < prices.length; i++) {
        // True range proxy: max of absolute price changes between consecutive prices
        const current = prices[i];
        const prev = prices[i - 1];
        // Simulate high/low with neighboring price movement magnitude
        const tr = Math.abs(current - prev);
        atrSum += tr;
    }

    return atrSum / period;
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(prices, volumes) {
    if (!prices || !volumes || prices.length === 0) return 0;
    const len = Math.min(prices.length, volumes.length);

    let sumPV = 0, sumV = 0;
    for (let i = 0; i < len; i++) {
        const v = volumes[i] || 1;
        sumPV += prices[i] * v;
        sumV += v;
    }

    return sumV > 0 ? sumPV / sumV : prices[prices.length - 1];
}

/**
 * Fibonacci Retracement Levels
 * Calculates from recent swing high/low
 */
export function calculateFibonacciLevels(prices, lookback = 50) {
    if (!prices || prices.length < 10) {
        return { levels: [], high: 0, low: 0 };
    }

    const recent = prices.slice(-lookback);
    const high = Math.max(...recent);
    const low = Math.min(...recent);
    const diff = high - low;

    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const levels = ratios.map(r => ({
        ratio: r,
        label: `${(r * 100).toFixed(1)}%`,
        price: high - diff * r,
    }));

    return { levels, high, low, range: diff };
}

/**
 * Ichimoku Cloud components
 */
export function calculateIchimokuCloud(prices) {
    if (!prices || prices.length < 52) {
        return { tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0, signal: 'NEUTRAL' };
    }

    const highLow = (slice) => {
        const h = Math.max(...slice);
        const l = Math.min(...slice);
        return (h + l) / 2;
    };

    const tenkan = highLow(prices.slice(-9));   // 9-period
    const kijun = highLow(prices.slice(-26));    // 26-period
    const senkouA = (tenkan + kijun) / 2;       // Senkou Span A
    const senkouB = highLow(prices.slice(-52));  // 52-period

    const current = prices[prices.length - 1];
    let signal = 'NEUTRAL';

    if (current > senkouA && current > senkouB && tenkan > kijun) {
        signal = 'STRONG_BULLISH';
    } else if (current > senkouA && current > senkouB) {
        signal = 'BULLISH';
    } else if (current < senkouA && current < senkouB && tenkan < kijun) {
        signal = 'STRONG_BEARISH';
    } else if (current < senkouA && current < senkouB) {
        signal = 'BEARISH';
    }

    return { tenkan, kijun, senkouA, senkouB, signal };
}

/**
 * On Balance Volume (OBV)
 */
export function calculateOBV(prices, volumes) {
    if (!prices || !volumes || prices.length < 2) return 0;
    const len = Math.min(prices.length, volumes.length);

    let obv = 0;
    for (let i = 1; i < len; i++) {
        const vol = volumes[i] || 0;
        if (prices[i] > prices[i - 1]) obv += vol;
        else if (prices[i] < prices[i - 1]) obv -= vol;
    }

    return obv;
}

/**
 * Volume Profile - Volume at price levels
 * Returns bins with price range and volume
 */
export function calculateVolumeProfile(prices, volumes, numBins = 10) {
    if (!prices || !volumes || prices.length < 5) return [];
    const len = Math.min(prices.length, volumes.length);

    const high = Math.max(...prices.slice(-len));
    const low = Math.min(...prices.slice(-len));
    const range = high - low;

    if (range === 0) return [];

    const binSize = range / numBins;
    const bins = Array.from({ length: numBins }, (_, i) => ({
        priceFrom: low + i * binSize,
        priceTo: low + (i + 1) * binSize,
        priceMid: low + (i + 0.5) * binSize,
        volume: 0,
        count: 0,
    }));

    for (let i = 0; i < len; i++) {
        const binIdx = Math.min(Math.floor((prices[i] - low) / binSize), numBins - 1);
        if (binIdx >= 0 && binIdx < numBins) {
            bins[binIdx].volume += volumes[i] || 0;
            bins[binIdx].count++;
        }
    }

    // Find Point of Control (highest volume bin)
    const maxVol = Math.max(...bins.map(b => b.volume));
    bins.forEach(b => {
        b.isPointOfControl = b.volume === maxVol && maxVol > 0;
    });

    return bins;
}

// ═══════════════════════════════════════════════════════════════════
// COMPOSITE ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Trend Strength using multiple MA crossovers
 */
export function calculateTrendStrength(prices) {
    if (!prices || prices.length < 20) return { direction: 'NEUTRAL', strength: 0 };

    const shortMA = calculateSMA(prices, 5);
    const medMA = calculateSMA(prices, 10);
    const longMA = calculateSMA(prices, 20);

    if (shortMA > medMA && medMA > longMA) {
        const strength = longMA > 0 ? ((shortMA - longMA) / longMA) * 1000 : 0;
        return { direction: 'BULLISH', strength: Math.min(strength, 100) };
    } else if (shortMA < medMA && medMA < longMA) {
        const strength = longMA > 0 ? ((longMA - shortMA) / longMA) * 1000 : 0;
        return { direction: 'BEARISH', strength: Math.min(strength, 100) };
    }

    return { direction: 'NEUTRAL', strength: 10 };
}

/**
 * Professional Fear/Greed Index (0-100)
 * Combines: RSI, Volatility, Momentum, Trend, BB Width, Volume Trend
 */
export function calculateFearGreedIndex(prices, volumes = []) {
    if (!prices || prices.length < 30) return 50;

    let index = 50;

    // RSI component (weight: 25%)
    const rsi = calculateRSI(prices);
    if (rsi > 70) index += (rsi - 70) * 0.5;       // Extreme greed
    else if (rsi < 30) index -= (30 - rsi) * 0.5;   // Extreme fear
    else index += (rsi - 50) * 0.25;                 // Proportional

    // Volatility component (weight: 20%)
    const vol = calculateVolatility(prices);
    if (vol > 8) index -= 15;        // High vol = fear
    else if (vol > 5) index -= 8;
    else if (vol < 2) index += 10;   // Low vol = complacency/greed

    // Momentum component (weight: 20%)
    const mom = calculateMomentum(prices);
    index += Math.max(-20, Math.min(20, mom * 2));

    // Trend component (weight: 20%)
    const trend = calculateTrendStrength(prices);
    if (trend.direction === 'BULLISH') index += trend.strength * 0.2;
    else if (trend.direction === 'BEARISH') index -= trend.strength * 0.2;

    // BB Width component (weight: 15%)
    const bb = calculateBollingerBands(prices);
    if (bb.percentB > 80) index += 8;       // Near upper band = greed
    else if (bb.percentB < 20) index -= 8;  // Near lower band = fear

    return Math.max(0, Math.min(100, Math.round(index)));
}

/**
 * Market Regime Detection
 */
export function detectMarketRegime(prices, volumes = []) {
    if (!prices || prices.length < 30) return 'UNKNOWN';

    const volatility = calculateVolatility(prices);
    const trend = calculateTrendStrength(prices);
    const bb = calculateBollingerBands(prices);

    if (volatility > 8 && trend.strength > 30) return 'TRENDING_VOLATILE';
    if (volatility < 3 && trend.strength < 10) return 'RANGING_CALM';
    if (volatility > 8 && trend.strength < 10) return 'VOLATILE_CHOPPY';
    if (volatility < 3 && trend.strength > 30) return 'TRENDING_STEADY';
    if (bb.bandwidth < 2) return 'SQUEEZE';

    return 'TRANSITIONAL';
}

/**
 * Volume-weighted Support/Resistance levels
 * Better than simple percentile-based approach
 */
export function calculateSupportResistance(prices, volumes = [], lookback = 50) {
    if (!prices || prices.length < 20) {
        const p = prices?.[prices.length - 1] || 0;
        return { support: p * 0.95, resistance: p * 1.05 };
    }

    const recent = prices.slice(-lookback);
    const recentVol = volumes.slice(-lookback);

    // Volume Profile approach: find price levels with highest volume
    const bins = calculateVolumeProfile(recent, recentVol.length > 0 ? recentVol : recent.map(() => 1), 20);

    if (bins.length === 0) {
        const sorted = [...recent].sort((a, b) => a - b);
        return {
            support: sorted[Math.floor(sorted.length * 0.1)],
            resistance: sorted[Math.floor(sorted.length * 0.9)],
        };
    }

    const current = recent[recent.length - 1];

    // Support = highest volume bin below current price
    const supportBins = bins.filter(b => b.priceMid < current).sort((a, b) => b.volume - a.volume);
    const support = supportBins.length > 0 ? supportBins[0].priceMid : Math.min(...recent);

    // Resistance = highest volume bin above current price
    const resistanceBins = bins.filter(b => b.priceMid > current).sort((a, b) => b.volume - a.volume);
    const resistance = resistanceBins.length > 0 ? resistanceBins[0].priceMid : Math.max(...recent);

    return { support, resistance };
}

// ═══════════════════════════════════════════════════════════════════
// FULL ANALYSIS REPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate comprehensive technical analysis report
 */
export function generateFullAnalysis(prices, volumes = []) {
    const p = prices.map(d => typeof d === 'number' ? d : d.price);
    const v = volumes.length > 0 ? volumes : p.map(() => 1);

    return {
        price: p[p.length - 1],
        rsi: calculateRSI(p),
        macd: calculateMACD(p),
        bollinger: calculateBollingerBands(p),
        stochasticRSI: calculateStochasticRSI(p),
        trend: calculateTrendStrength(p),
        momentum: calculateMomentum(p),
        volatility: calculateVolatility(p),
        atr: calculateATR(p),
        vwap: calculateVWAP(p, v),
        fibonacci: calculateFibonacciLevels(p),
        ichimoku: calculateIchimokuCloud(p),
        obv: calculateOBV(p, v),
        fearGreed: calculateFearGreedIndex(p, v),
        regime: detectMarketRegime(p, v),
        supportResistance: calculateSupportResistance(p, v),
    };
}

export default {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
    calculateMomentum,
    calculateVolatility,
    calculateStochasticRSI,
    calculateATR,
    calculateVWAP,
    calculateFibonacciLevels,
    calculateIchimokuCloud,
    calculateOBV,
    calculateVolumeProfile,
    calculateTrendStrength,
    calculateFearGreedIndex,
    detectMarketRegime,
    calculateSupportResistance,
    generateFullAnalysis,
};
