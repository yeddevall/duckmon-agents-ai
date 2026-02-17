// DUCKMON PREDICTION BOT v3.0 - Ensemble Model Price Prediction
import { contracts } from '../shared/config.js';
import { createLogger, formatUptime } from '../shared/logger.js';
import { createClients, registerAgent, postPrediction } from '../shared/wallet.js';
import { fetchPrice, buildHistory } from '../shared/priceService.js';
import { calculateRSI, calculateSMA, calculateMomentum, calculateVolatility, calculateTrendStrength, calculateSupportResistance } from '../shared/technical-analysis.js';
import AI from '../shared/aiModule.js';

const AGENT_NAME = 'Prediction Bot v3.0';
const log = createLogger('Predict');

const CONFIG = {
    PREDICTION_INTERVAL: 900000,
    PREDICTION_HORIZONS: [5, 15, 60, 240],
    HISTORY_SIZE: 300,
    MIN_CONFIDENCE: 55,
};

let priceHistory = [];
let isRegistered = false;

const performance = {
    totalPredictions: 0,
    pendingPredictions: [],
    correct: 0, incorrect: 0, accuracy: 0,
    startTime: Date.now(),
};

// ═══════════════════════════════════════════════════════════════════
// ENSEMBLE PREDICTION MODEL v3.0
// ═══════════════════════════════════════════════════════════════════

class EnsemblePredictor {
    constructor() {
        this.componentWeights = {
            linearRegression: 0.25,
            weightedMA: 0.25,
            meanReversion: 0.25,
            momentum: 0.25,
        };
    }

    linearRegressionPredict(prices, horizon) {
        const n = Math.min(prices.length, 30);
        const recent = prices.slice(-n);

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
            sumX += i; sumY += recent[i]; sumXY += i * recent[i]; sumX2 += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        const futureX = n + (horizon / 15);
        const predicted = slope * futureX + intercept;
        const current = recent[n - 1];

        const direction = predicted > current * 1.002 ? 1 : predicted < current * 0.998 ? -1 : 0;
        const magnitude = current > 0 ? Math.abs(predicted - current) / current : 0;

        const meanY = sumY / n;
        let ssRes = 0, ssTot = 0;
        for (let i = 0; i < n; i++) {
            ssRes += (recent[i] - (slope * i + intercept)) ** 2;
            ssTot += (recent[i] - meanY) ** 2;
        }
        const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

        return { direction, magnitude, confidence: Math.min(r2, 1) };
    }

    weightedMAPredict(prices) {
        if (prices.length < 20) return { direction: 0, magnitude: 0, confidence: 0.3 };

        const sma5 = calculateSMA(prices, 5);
        const sma10 = calculateSMA(prices, 10);
        const sma20 = calculateSMA(prices, 20);

        let direction = 0;
        if (sma5 > sma10 && sma10 > sma20) direction = 1;
        else if (sma5 < sma10 && sma10 < sma20) direction = -1;
        else if (sma5 > sma10) direction = 0.5;
        else if (sma5 < sma10) direction = -0.5;

        return { direction, magnitude: Math.abs(sma5 - sma20) / sma20, confidence: Math.abs(direction) > 0.5 ? 0.65 : 0.4 };
    }

    meanReversionPredict(prices, horizon) {
        if (prices.length < 20) return { direction: 0, magnitude: 0, confidence: 0.3 };

        const sma20 = calculateSMA(prices, 20);
        const current = prices[prices.length - 1];
        const deviation = (current - sma20) / sma20;

        let direction = 0;
        if (deviation > 0.03) direction = -1;
        else if (deviation < -0.03) direction = 1;
        else direction = -Math.sign(deviation) * 0.3;

        const horizonFactor = horizon <= 15 ? 0.7 : horizon <= 60 ? 0.5 : 0.3;
        return { direction, magnitude: Math.abs(deviation), confidence: Math.min(Math.abs(deviation) * 10, 0.8) * horizonFactor };
    }

    momentumPredict(prices, horizon) {
        if (prices.length < 15) return { direction: 0, magnitude: 0, confidence: 0.3 };

        const mom10 = calculateMomentum(prices, 10);
        const mom5 = calculateMomentum(prices, 5);
        const rsi = calculateRSI(prices);

        let direction = 0;
        if (mom10 > 2 && mom5 > 1) direction = 1;
        else if (mom10 < -2 && mom5 < -1) direction = -1;
        else if (mom10 > 0 && rsi < 70) direction = 0.3;
        else if (mom10 < 0 && rsi > 30) direction = -0.3;

        const horizonFactor = horizon >= 60 ? 0.7 : horizon >= 15 ? 0.5 : 0.3;
        return { direction, magnitude: Math.abs(mom10) / 100, confidence: Math.min(Math.abs(mom10) / 10, 0.8) * horizonFactor };
    }

    predict(prices, horizon) {
        const components = {
            linearRegression: this.linearRegressionPredict(prices, horizon),
            weightedMA: this.weightedMAPredict(prices),
            meanReversion: this.meanReversionPredict(prices, horizon),
            momentum: this.momentumPredict(prices, horizon),
        };

        let totalDirection = 0, totalMagnitude = 0, totalConfidence = 0, totalWeight = 0;
        for (const [name, result] of Object.entries(components)) {
            const weight = this.componentWeights[name];
            totalDirection += result.direction * weight * result.confidence;
            totalMagnitude += result.magnitude * weight;
            totalConfidence += result.confidence * weight;
            totalWeight += weight;
        }

        return {
            direction: totalDirection / totalWeight,
            magnitude: totalMagnitude / totalWeight,
            confidence: totalConfidence / totalWeight,
            components,
        };
    }

    generatePredictions(prices) {
        if (prices.length < 30) {
            return [{ direction: 'SIDEWAYS', confidence: 30, horizon: 5, reason: 'Insufficient data', currentPrice: prices[prices.length - 1] || 0, targetTime: Date.now() + 300000 }];
        }

        const current = prices[prices.length - 1];
        const volatility = calculateVolatility(prices);
        const sr = calculateSupportResistance(prices);
        const results = [];

        for (const horizon of CONFIG.PREDICTION_HORIZONS) {
            const ensemble = this.predict(prices, horizon);

            let direction, confidence;
            if (ensemble.direction > 0.15) {
                direction = 'UP';
                confidence = Math.min(55 + ensemble.confidence * 50, 92);
            } else if (ensemble.direction < -0.15) {
                direction = 'DOWN';
                confidence = Math.min(55 + ensemble.confidence * 50, 92);
            } else {
                direction = 'SIDEWAYS';
                confidence = 45 + ensemble.confidence * 20;
            }

            if (volatility > 10) confidence *= 0.85;

            const expectedMove = ensemble.direction * ensemble.magnitude * (horizon / 15);
            const expectedPrice = current * (1 + expectedMove);
            const atrProxy = volatility / 100 * current;
            const intervalWidth = atrProxy * Math.sqrt(horizon / 15);

            const reasons = [];
            for (const [name, comp] of Object.entries(ensemble.components)) {
                if (Math.abs(comp.direction) > 0.3) {
                    reasons.push(`${name.replace(/([A-Z])/g, ' $1').trim()}: ${comp.direction > 0 ? 'UP' : 'DOWN'}`);
                }
            }

            results.push({
                direction,
                confidence: Math.round(confidence),
                horizon,
                currentPrice: current,
                expectedPrice,
                expectedMove: (expectedMove * 100).toFixed(3),
                targetTime: Date.now() + horizon * 60 * 1000,
                confidenceInterval: { low: expectedPrice - intervalWidth, high: expectedPrice + intervalWidth },
                support: sr.support,
                resistance: sr.resistance,
                reason: reasons.length > 0 ? reasons.join(', ') : 'Ensemble analysis',
            });
        }

        return results;
    }
}

const predictor = new EnsemblePredictor();

// ═══════════════════════════════════════════════════════════════════
// PREDICTION VERIFICATION
// ═══════════════════════════════════════════════════════════════════

async function verifyPendingPredictions() {
    const now = Date.now();
    const toVerify = performance.pendingPredictions.filter(p => p.targetTime <= now);

    for (const pred of toVerify) {
        const currentData = await fetchPrice();
        if (!currentData) continue;

        const change = (currentData.price - pred.currentPrice) / pred.currentPrice;
        let actualDirection;
        if (change > 0.005) actualDirection = 'UP';
        else if (change < -0.005) actualDirection = 'DOWN';
        else actualDirection = 'SIDEWAYS';

        const correct = pred.direction === actualDirection || (pred.direction === 'SIDEWAYS' && Math.abs(change) < 0.01);

        if (correct) { performance.correct++; log.success(`Prediction verified: ${pred.direction} correct! (${(change * 100).toFixed(2)}%)`); }
        else { performance.incorrect++; log.warning(`Prediction missed: Expected ${pred.direction}, got ${actualDirection}`); }

        pred.verified = true;
    }

    performance.pendingPredictions = performance.pendingPredictions.filter(p => !p.verified);
    const total = performance.correct + performance.incorrect;
    if (total > 0) performance.accuracy = (performance.correct / total) * 100;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════

async function runPrediction() {
    log.separator();
    log.info('Generating ensemble predictions...');

    await verifyPendingPredictions();

    const priceData = await fetchPrice();
    if (!priceData) { log.error('No price data'); return; }

    priceHistory.push(priceData.price);
    if (priceHistory.length > CONFIG.HISTORY_SIZE) priceHistory = priceHistory.slice(-CONFIG.HISTORY_SIZE);

    const predictions = predictor.generatePredictions(priceHistory);
    performance.totalPredictions += predictions.length;
    performance.pendingPredictions.push(...predictions);

    // AI Enhancement
    if (AI.isAIEnabled() && predictions.length > 0) {
        try {
            const best = predictions[0];
            const trend = calculateTrendStrength(priceHistory);
            const aiPred = await AI.generatePricePrediction({
                currentPrice: best.currentPrice,
                priceHistory: priceHistory.slice(-20),
                trend: trend.direction,
                support: best.support,
                resistance: best.resistance,
                timeframe: `${best.horizon}min`,
            });
            if (aiPred) {
                log.ai(`AI Prediction: ${aiPred.direction} (${aiPred.confidence}%)`);
                predictions[0].aiEnhanced = true;
            }
        } catch (err) {
            log.warning(`AI prediction unavailable: ${err.message}`);
        }
    }

    // Display
    log.banner('DUCKMON PREDICTION BOT v3.0 - Ensemble Forecast');
    console.log(`  Price: ${priceData.price.toFixed(8)} MON`);
    log.separator();

    for (const pred of predictions) {
        const arrow = pred.direction === 'UP' ? '\x1b[32m^' : pred.direction === 'DOWN' ? '\x1b[31mv' : '\x1b[33m-';
        console.log(`  ${arrow}\x1b[0m ${pred.horizon}min: ${pred.direction} (${pred.confidence}%) -> ${pred.expectedPrice.toFixed(8)} (${pred.expectedMove}%)`);
        console.log(`    CI: [${pred.confidenceInterval.low.toFixed(8)}, ${pred.confidenceInterval.high.toFixed(8)}]`);
        console.log(`    ${pred.reason}`);
    }

    log.separator();
    const total = performance.correct + performance.incorrect;
    console.log(`  Accuracy: ${total > 0 ? performance.accuracy.toFixed(1) + '%' : 'N/A'} (${performance.correct}/${total}) | Pending: ${performance.pendingPredictions.length}`);
    console.log(`  Uptime: ${formatUptime(Date.now() - performance.startTime)}`);

    const bestPred = predictions.find(p => p.direction !== 'SIDEWAYS' && p.confidence >= CONFIG.MIN_CONFIDENCE);
    if (bestPred && isRegistered) {
        await postPrediction(bestPred.direction, bestPred.confidence, bestPred.currentPrice, bestPred.targetTime, log);
    }

    return predictions;
}

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DUCKMON PREDICTION BOT v3.0                        ║
║         Ensemble Model Price Forecasting                     ║
║              Powered by Monad                                ║
╚══════════════════════════════════════════════════════════════╝`);

    log.info(`Starting ${AGENT_NAME}...`);
    log.info(`Horizons: ${CONFIG.PREDICTION_HORIZONS.join(', ')} minutes`);

    const { account } = createClients();
    if (account) log.success(`Wallet: ${account.address.slice(0, 10)}...`);
    isRegistered = await registerAgent(AGENT_NAME, log);

    log.info('Building price history...');
    const history = await buildHistory(60, 3000, log);
    priceHistory = history.map(d => d.price);

    await runPrediction();

    setInterval(async () => {
        try { await runPrediction(); }
        catch (err) { log.error(`Prediction loop error: ${err.message}`); }
    }, CONFIG.PREDICTION_INTERVAL);

    log.success('Agent running!');
}

export { runPrediction, performance };
main().catch(console.error);
