// DUCKMON TRADING ORACLE v3.0 - Professional AI-Powered Trading Analysis
import { contracts } from '../shared/config.js';
import { createLogger, formatPrice, formatUptime } from '../shared/logger.js';
import { createClients, registerAgent, postSignal } from '../shared/wallet.js';
import { fetchPrice, buildHistory } from '../shared/priceService.js';
import { generateFullAnalysis } from '../shared/technical-analysis.js';
import { sendSignal } from '../shared/websocketClient.js';
import AI from '../shared/aiModule.js';

const AGENT_NAME = 'Trading Oracle v3.0';
const log = createLogger('Oracle');

const CONFIG = {
    ANALYSIS_INTERVAL: 900000,
    HISTORY_SIZE: 200,
    MIN_CONFIDENCE: 60,
};

let priceHistory = [];
let volumeHistory = [];
let isRegistered = false;

const performance = {
    totalSignals: 0, buySignals: 0, sellSignals: 0, holdSignals: 0,
    avgConfidence: 0, startTime: Date.now(),
};

// ═══════════════════════════════════════════════════════════════════
// SIGNAL GENERATION ENGINE v3.0
// ═══════════════════════════════════════════════════════════════════

function generateSignal(prices, volumes) {
    if (prices.length < 30) {
        return { type: 'HOLD', confidence: 30, reason: 'Insufficient data', price: prices[prices.length - 1] || 0, indicators: {} };
    }

    const analysis = generateFullAnalysis(prices, volumes);
    const { rsi, macd, bollinger, stochasticRSI, trend, momentum, volatility, atr, vwap, ichimoku, fearGreed, regime, supportResistance } = analysis;
    const currentPrice = prices[prices.length - 1];

    // Weighted scoring system
    const weights = { rsi: 0.20, macd: 0.15, bollinger: 0.15, trend: 0.15, ichimoku: 0.10, stochRSI: 0.10, momentum: 0.10, vwap: 0.05 };
    let buyScore = 0, sellScore = 0;
    const reasons = [];

    // RSI
    if (rsi < 30) { buyScore += weights.rsi * (1 + (30 - rsi) / 30); reasons.push('RSI oversold'); }
    else if (rsi > 70) { sellScore += weights.rsi * (1 + (rsi - 70) / 30); reasons.push('RSI overbought'); }

    // MACD (now with proper signal line)
    if (macd.histogram > 0 && macd.value > 0) { buyScore += weights.macd; reasons.push('MACD bullish'); }
    else if (macd.histogram < 0 && macd.value < 0) { sellScore += weights.macd; reasons.push('MACD bearish'); }

    // Bollinger Bands (using real percentB)
    if (bollinger.percentB < 10) { buyScore += weights.bollinger; reasons.push('BB oversold'); }
    else if (bollinger.percentB > 90) { sellScore += weights.bollinger; reasons.push('BB overbought'); }

    // Trend
    if (trend.direction === 'BULLISH') { buyScore += weights.trend * (trend.strength / 100); reasons.push('Bullish trend'); }
    else if (trend.direction === 'BEARISH') { sellScore += weights.trend * (trend.strength / 100); reasons.push('Bearish trend'); }

    // Ichimoku Cloud
    if (ichimoku.signal === 'STRONG_BULLISH') { buyScore += weights.ichimoku; reasons.push('Ichimoku bullish'); }
    else if (ichimoku.signal === 'STRONG_BEARISH') { sellScore += weights.ichimoku; reasons.push('Ichimoku bearish'); }
    else if (ichimoku.signal === 'BULLISH') { buyScore += weights.ichimoku * 0.5; }
    else if (ichimoku.signal === 'BEARISH') { sellScore += weights.ichimoku * 0.5; }

    // Stochastic RSI
    if (stochasticRSI.k < 20 && stochasticRSI.d < 20) { buyScore += weights.stochRSI; reasons.push('StochRSI oversold'); }
    else if (stochasticRSI.k > 80 && stochasticRSI.d > 80) { sellScore += weights.stochRSI; reasons.push('StochRSI overbought'); }

    // Momentum
    if (momentum > 3) { buyScore += weights.momentum; }
    else if (momentum < -3) { sellScore += weights.momentum; }

    // VWAP
    if (vwap > 0 && currentPrice < vwap * 0.98) { buyScore += weights.vwap; reasons.push('Below VWAP'); }
    else if (vwap > 0 && currentPrice > vwap * 1.02) { sellScore += weights.vwap; reasons.push('Above VWAP'); }

    // Determine signal
    const netScore = buyScore - sellScore;
    let type, confidence;

    if (netScore > 0.15) {
        type = 'BUY';
        confidence = Math.min(50 + Math.abs(netScore) * 100, 95);
    } else if (netScore < -0.15) {
        type = 'SELL';
        confidence = Math.min(50 + Math.abs(netScore) * 100, 95);
    } else {
        type = 'HOLD';
        confidence = 50 + Math.abs(netScore) * 50;
    }

    const detailedReason = [
        `RSI: ${rsi.toFixed(1)}`,
        `MACD: ${macd.histogram > 0 ? 'Bullish' : macd.histogram < 0 ? 'Bearish' : 'Neutral'}`,
        `Trend: ${trend.direction}`,
        `Ichimoku: ${ichimoku.signal}`,
        `Regime: ${regime}`,
        `F&G: ${fearGreed}`,
        reasons.length > 0 ? reasons.join(', ') : 'Consolidation',
    ].join(' | ');

    return {
        type,
        confidence: Math.round(confidence),
        reason: detailedReason,
        price: currentPrice,
        indicators: {
            rsi: rsi.toFixed(2),
            macd: macd.histogram.toFixed(6),
            macdSignal: macd.signal.toFixed(6),
            trend: trend.direction,
            trendStrength: trend.strength.toFixed(1),
            bollinger: { percentB: bollinger.percentB.toFixed(1), bandwidth: bollinger.bandwidth.toFixed(2) },
            stochasticRSI: { k: stochasticRSI.k.toFixed(1), d: stochasticRSI.d.toFixed(1) },
            ichimoku: ichimoku.signal,
            atr: atr.toFixed(8),
            vwap: vwap.toFixed(8),
            momentum: momentum.toFixed(2),
            volatility: volatility.toFixed(2),
            fearGreed,
            regime,
            support: supportResistance.support.toFixed(8),
            resistance: supportResistance.resistance.toFixed(8),
        },
        timestamp: Date.now(),
    };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOP
// ═══════════════════════════════════════════════════════════════════

async function runAnalysis() {
    log.separator();
    log.info('Running advanced market analysis...');

    const priceData = await fetchPrice();
    if (!priceData) { log.error('Failed to fetch price data'); return null; }

    priceHistory.push(priceData.price);
    volumeHistory.push(priceData.volume || 0);
    if (priceHistory.length > CONFIG.HISTORY_SIZE) {
        priceHistory = priceHistory.slice(-CONFIG.HISTORY_SIZE);
        volumeHistory = volumeHistory.slice(-CONFIG.HISTORY_SIZE);
    }

    const signal = generateSignal(priceHistory, volumeHistory);

    // AI Enhancement
    let aiAnalysis = null;
    if (AI.isAIEnabled()) {
        try {
            log.ai('Requesting AI analysis...');
            aiAnalysis = await AI.generateMarketAnalysis({
                price: priceData.price,
                priceChange24h: priceData.priceChange24h || 0,
                volume24h: priceData.volume || 0,
                rsi: parseFloat(signal.indicators.rsi),
                macd: parseFloat(signal.indicators.macd),
                macdSignal: parseFloat(signal.indicators.macdSignal),
                bollingerPosition: parseFloat(signal.indicators.bollinger.percentB),
                momentum: parseFloat(signal.indicators.momentum),
                volatility: parseFloat(signal.indicators.volatility),
                stochasticRSI: signal.indicators.stochasticRSI,
                ichimoku: { signal: signal.indicators.ichimoku },
                regime: signal.indicators.regime,
            });

            if (aiAnalysis) {
                log.ai(`AI Signal: ${aiAnalysis.signal} (${aiAnalysis.confidence}%)`);
                const aiReason = AI.formatAISignalReason(aiAnalysis);
                if (aiReason) {
                    signal.reason = aiReason;
                    signal.confidence = Math.round((signal.confidence + aiAnalysis.confidence) / 2);
                    signal.aiEnhanced = true;
                    signal.aiData = aiAnalysis;
                }
            }
        } catch (error) {
            log.warning(`AI unavailable: ${error.message}`);
        }
    }

    // Update performance
    performance.totalSignals++;
    if (signal.type === 'BUY') performance.buySignals++;
    else if (signal.type === 'SELL') performance.sellSignals++;
    else performance.holdSignals++;
    performance.avgConfidence = (performance.avgConfidence * (performance.totalSignals - 1) + signal.confidence) / performance.totalSignals;

    // Display
    log.banner('DUCKMON TRADING ORACLE v3.0 - Analysis Report', signal.aiEnhanced ? 'AI-ENHANCED ANALYSIS' : null);
    console.log(`  Price:       ${formatPrice(signal.price)} MON`);
    console.log(`  RSI:         ${signal.indicators.rsi} | StochRSI: K${signal.indicators.stochasticRSI.k} D${signal.indicators.stochasticRSI.d}`);
    console.log(`  MACD:        ${signal.indicators.macd} (Signal: ${signal.indicators.macdSignal})`);
    console.log(`  Bollinger:   %B=${signal.indicators.bollinger.percentB} BW=${signal.indicators.bollinger.bandwidth}`);
    console.log(`  Trend:       ${signal.indicators.trend} (${signal.indicators.trendStrength}%) | Ichimoku: ${signal.indicators.ichimoku}`);
    console.log(`  Regime:      ${signal.indicators.regime} | Fear/Greed: ${signal.indicators.fearGreed}`);
    console.log(`  Support:     ${signal.indicators.support} | Resistance: ${signal.indicators.resistance}`);
    if (signal.aiData) {
        console.log(`  AI Support:  ${signal.aiData.support || 'N/A'} | AI Resistance: ${signal.aiData.resistance || 'N/A'}`);
        console.log(`  AI R/R:      ${signal.aiData.riskReward || 'N/A'} | Sentiment: ${signal.aiData.sentiment || 'N/A'}`);
    }
    log.signal(signal.type, `Signal: ${signal.type} (${signal.confidence}% confidence)`);
    console.log(`  Reason:      ${signal.reason}`);
    log.separator();
    console.log(`  Stats: ${performance.buySignals}B | ${performance.sellSignals}S | ${performance.holdSignals}H | Uptime: ${formatUptime(Date.now() - performance.startTime)}`);

    // Post to blockchain
    if (isRegistered && signal.confidence >= CONFIG.MIN_CONFIDENCE) {
        await postSignal(signal.type, signal.confidence, signal.price, signal.reason, log);
    }

    // Send to ws-server for frontend
    try {
        await sendSignal({
            agentName: AGENT_NAME,
            type: signal.type,
            confidence: signal.confidence,
            price: signal.price,
            reason: signal.reason,
            category: 'technical',
            indicators: signal.indicators,
            aiEnhanced: signal.aiEnhanced || false,
            aiData: signal.aiData || null,
        });
    } catch (e) { /* ws-server may be offline */ }

    return signal;
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DUCKMON TRADING ORACLE v3.0                        ║
║     Professional AI-Powered Market Analysis                  ║
║              Powered by Monad                                ║
╚══════════════════════════════════════════════════════════════╝`);

    log.info(`Starting ${AGENT_NAME}...`);
    log.info(`DUCK Token: ${contracts.DUCK_TOKEN.slice(0, 10)}...`);
    log.info(`Network: Monad Mainnet (Chain ID: 143)`);
    log.info(`Interval: ${CONFIG.ANALYSIS_INTERVAL / 1000}s`);

    const { account } = createClients();
    if (account) log.success(`Wallet: ${account.address.slice(0, 10)}...`);
    isRegistered = await registerAgent(AGENT_NAME, log);

    log.info('Building price history...');
    const history = await buildHistory(50, 3000, log);
    priceHistory = history.map(d => d.price);
    volumeHistory = history.map(d => d.volume || 0);

    await runAnalysis();

    setInterval(async () => {
        try { await runAnalysis(); }
        catch (err) { log.error(`Analysis loop error: ${err.message}`); }
    }, CONFIG.ANALYSIS_INTERVAL);

    log.success('Agent is running!');
}

export { runAnalysis, performance };
main().catch(console.error);
