import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadMainnet, contracts, LENS_ABI, DUCK_SIGNALS_ABI } from './config.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                      🎯 DUCKMON PREDICTION BOT v2.0                          ║
// ║                  Neural Network Price Prediction Engine                       ║
// ║                           Powered by Monad                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const AGENT_NAME = 'Prediction Bot v2.0';
const AGENT_VERSION = '2.0.0';

// Configuration
const CONFIG = {
    PREDICTION_INTERVAL: 900000,         // 15 minutes
    PREDICTION_HORIZONS: [5, 15, 60],  // Minutes ahead
    HISTORY_SIZE: 300,
    MIN_CONFIDENCE: 55,
    NEURAL_LAYERS: [10, 8, 4, 1],      // Simulated network architecture
};

// State
let priceHistory = [];
let predictions = [];
let demoMode = false;
let lastRealPrice = 0.000019;

// Performance tracking
const performance = {
    totalPredictions: 0,
    pendingPredictions: [],
    verifiedPredictions: [],
    correct: 0,
    incorrect: 0,
    accuracy: 0,
    avgError: 0,
    startTime: Date.now(),
};

// Agent state
const agentState = {
    isRunning: true,
    currentPredictions: [],
    isRegistered: false,
};

// Clients
const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(monadMainnet.rpcUrls.default.http[0]),
});

let walletClient = null;
let account = null;

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    predict: (dir, msg) => {
        const arrow = dir === 'UP' ? '📈' : dir === 'DOWN' ? '📉' : '➡️';
        const color = dir === 'UP' ? '\x1b[32m' : dir === 'DOWN' ? '\x1b[31m' : '\x1b[33m';
        console.log(`${color}[${arrow} ${dir}]\x1b[0m ${msg}`);
    },
};

function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ${s % 60}s`;
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function initWallet() {
    const privateKey = process.env.PRIVATE_KEY;
    if (privateKey) {
        const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
        account = privateKeyToAccount(formattedKey);
        walletClient = createWalletClient({
            account,
            chain: monadMainnet,
            transport: http(monadMainnet.rpcUrls.default.http[0]),
        });
        log.success(`Wallet: ${account.address.slice(0, 10)}...`);
        return true;
    }
    log.warning('No PRIVATE_KEY - read-only mode');
    return false;
}

async function registerAgent() {
    if (!walletClient || contracts.DUCK_SIGNALS === '0x0000000000000000000000000000000000000000') {
        return false;
    }

    try {
        const data = await publicClient.readContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'agents',
            args: [account.address],
        });

        if (data[5]) {
            log.success('Agent registered on-chain');
            agentState.isRegistered = true;
            return true;
        }

        log.info('Registering on blockchain...');
        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'registerAgent',
            args: [AGENT_NAME],
        });

        log.success(`Tx: ${hash.slice(0, 20)}...`);
        agentState.isRegistered = true;
        return true;
    } catch (error) {
        log.error(`Registration failed: ${error.message}`);
        return false;
    }
}

async function postPredictionOnChain(prediction) {
    if (!walletClient || !agentState.isRegistered) return false;
    if (prediction.confidence < CONFIG.MIN_CONFIDENCE) return false;

    try {
        const priceWei = parseEther(prediction.currentPrice.toFixed(18));
        const targetTime = BigInt(Math.floor(prediction.targetTime / 1000));

        log.info('Broadcasting prediction...');
        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'postPrediction',
            args: [prediction.direction, BigInt(prediction.confidence), priceWei, targetTime],
        });

        log.success(`Tx: ${hash.slice(0, 20)}...`);
        return hash;
    } catch (error) {
        log.error(`Post failed: ${error.message}`);
        return false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICE FETCHING
// ══════════════════════════════════════════════════════════════════════════════

async function fetchPrice() {
    if (demoMode) return generateDemoPrice();

    try {
        const result = await publicClient.readContract({
            address: contracts.LENS,
            abi: LENS_ABI,
            functionName: 'getAmountOut',
            args: [contracts.DUCK_TOKEN, parseEther('1'), true],
        });

        const duckPerMon = Number(formatEther(result[1]));
        const price = duckPerMon > 0 ? 1 / duckPerMon : 0;
        lastRealPrice = price;
        return { price, timestamp: Date.now() };
    } catch (error) {
        if (!demoMode) {
            log.warning('DEMO MODE activated');
            demoMode = true;
        }
        return generateDemoPrice();
    }
}

function generateDemoPrice() {
    const trend = Math.sin(Date.now() / 120000) * 0.008;
    const noise = (Math.random() - 0.5) * 0.012;
    lastRealPrice *= (1 + trend + noise);
    lastRealPrice = Math.max(lastRealPrice, 0.000001);
    return { price: lastRealPrice, timestamp: Date.now() };
}

// ══════════════════════════════════════════════════════════════════════════════
// NEURAL NETWORK SIMULATION
// ══════════════════════════════════════════════════════════════════════════════

class NeuralNetwork {
    constructor(layers) {
        this.layers = layers;
        this.weights = this.initializeWeights();
        this.learningRate = 0.01;
        this.momentum = 0.9;
    }

    initializeWeights() {
        // Xavier initialization simulation
        const weights = [];
        for (let i = 0; i < this.layers.length - 1; i++) {
            const layerWeights = [];
            const scale = Math.sqrt(2 / (this.layers[i] + this.layers[i + 1]));
            for (let j = 0; j < this.layers[i]; j++) {
                const row = [];
                for (let k = 0; k < this.layers[i + 1]; k++) {
                    row.push((Math.random() * 2 - 1) * scale);
                }
                layerWeights.push(row);
            }
            weights.push(layerWeights);
        }
        return weights;
    }

    // Activation functions
    relu(x) {
        return Math.max(0, x);
    }

    sigmoid(x) {
        return 1 / (1 + Math.exp(-Math.min(Math.max(x, -500), 500)));
    }

    tanh(x) {
        return Math.tanh(x);
    }

    // Forward pass
    forward(input) {
        let current = input;

        for (let layer = 0; layer < this.weights.length; layer++) {
            const next = [];
            const isLastLayer = layer === this.weights.length - 1;

            for (let j = 0; j < this.layers[layer + 1]; j++) {
                let sum = 0;
                for (let i = 0; i < current.length; i++) {
                    sum += current[i] * this.weights[layer][i][j];
                }
                // Use sigmoid for last layer, tanh for hidden layers
                next.push(isLastLayer ? this.tanh(sum) : this.relu(sum));
            }
            current = next;
        }

        return current[0]; // Single output
    }

    // Prepare input features from price history
    prepareFeatures(prices) {
        if (prices.length < 10) return null;

        const features = [];
        const recent = prices.slice(-50);

        // Normalized returns (5 features)
        for (let i = 1; i <= 5; i++) {
            const idx = recent.length - i - 1;
            if (idx >= 0 && idx < recent.length - 1) {
                const ret = (recent[idx + 1].price - recent[idx].price) / recent[idx].price;
                features.push(ret * 100); // Scale
            } else {
                features.push(0);
            }
        }

        // Moving average crossovers (2 features)
        const ma5 = recent.slice(-5).reduce((s, p) => s + p.price, 0) / 5;
        const ma10 = recent.slice(-10).reduce((s, p) => s + p.price, 0) / Math.min(recent.length, 10);
        features.push((ma5 - ma10) / ma10 * 100);
        features.push(ma5 / recent[recent.length - 1].price - 1);

        // Volatility (1 feature)
        const mean = recent.reduce((s, p) => s + p.price, 0) / recent.length;
        const variance = recent.reduce((s, p) => s + Math.pow(p.price - mean, 2), 0) / recent.length;
        features.push(Math.sqrt(variance) / mean * 100);

        // Momentum (1 feature)
        const momentum = (recent[recent.length - 1].price - recent[0].price) / recent[0].price;
        features.push(momentum * 100);

        // Time-based feature (1 feature)
        const hour = new Date().getHours();
        features.push(Math.sin(hour / 24 * Math.PI * 2));

        return features;
    }

    predict(prices) {
        const features = this.prepareFeatures(prices);
        if (!features) return 0;

        // Normalize features
        const normalized = features.map(f => Math.max(-1, Math.min(1, f / 10)));

        return this.forward(normalized);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// PREDICTION ENGINE
// ══════════════════════════════════════════════════════════════════════════════

class PredictionEngine {
    constructor() {
        this.networks = {
            short: new NeuralNetwork([10, 8, 4, 1]),   // 5 min
            medium: new NeuralNetwork([10, 12, 6, 1]), // 15 min
            long: new NeuralNetwork([10, 16, 8, 1]),   // 60 min
        };
        this.ensembleWeights = { short: 0.4, medium: 0.35, long: 0.25 };
    }

    // Technical analysis features
    calculateFeatures(prices) {
        if (prices.length < 30) return null;

        const recent = prices.slice(-30);
        const current = recent[recent.length - 1].price;

        // RSI
        let gains = 0, losses = 0;
        for (let i = 1; i < recent.length; i++) {
            const change = recent[i].price - recent[i - 1].price;
            if (change > 0) gains += change;
            else losses -= change;
        }
        const rsi = 100 - (100 / (1 + (gains / 14) / (losses / 14 || 0.001)));

        // Trend
        const firstHalf = recent.slice(0, 15).reduce((s, p) => s + p.price, 0) / 15;
        const secondHalf = recent.slice(-15).reduce((s, p) => s + p.price, 0) / 15;
        const trendStrength = (secondHalf - firstHalf) / firstHalf;

        // Volatility
        const mean = recent.reduce((s, p) => s + p.price, 0) / recent.length;
        const volatility = Math.sqrt(recent.reduce((s, p) => s + Math.pow(p.price - mean, 2), 0) / recent.length) / mean;

        return { current, rsi, trendStrength, volatility };
    }

    generatePredictions(prices) {
        if (prices.length < 50) {
            return [{ direction: 'SIDEWAYS', confidence: 30, horizon: 5, reason: 'Insufficient data' }];
        }

        const features = this.calculateFeatures(prices);
        if (!features) return [];

        const results = [];

        for (const horizon of CONFIG.PREDICTION_HORIZONS) {
            // Get network predictions
            const networkKey = horizon <= 5 ? 'short' : horizon <= 15 ? 'medium' : 'long';
            const rawPrediction = this.networks[networkKey].predict(prices);

            // Technical boost
            let technicalBoost = 0;
            if (features.rsi < 30) technicalBoost += 0.2;
            else if (features.rsi > 70) technicalBoost -= 0.2;

            if (features.trendStrength > 0.02) technicalBoost += features.trendStrength * 5;
            else if (features.trendStrength < -0.02) technicalBoost -= Math.abs(features.trendStrength) * 5;

            // Combine
            const combinedPrediction = rawPrediction + technicalBoost;

            // Calculate expected move
            const expectedMove = combinedPrediction * features.volatility * (horizon / 5);
            const expectedPrice = features.current * (1 + expectedMove);

            // Determine direction and confidence
            let direction, confidence;

            if (combinedPrediction > 0.1) {
                direction = 'UP';
                confidence = Math.min(55 + Math.abs(combinedPrediction) * 100, 92);
            } else if (combinedPrediction < -0.1) {
                direction = 'DOWN';
                confidence = Math.min(55 + Math.abs(combinedPrediction) * 100, 92);
            } else {
                direction = 'SIDEWAYS';
                confidence = 50 + Math.random() * 10;
            }

            // Volatility penalty
            if (features.volatility > 0.1) {
                confidence *= 0.85;
            }

            results.push({
                direction,
                confidence: Math.round(confidence),
                horizon,
                currentPrice: features.current,
                expectedPrice,
                expectedMove: (expectedMove * 100).toFixed(2),
                targetTime: Date.now() + horizon * 60 * 1000,
                rsi: features.rsi.toFixed(1),
                trend: features.trendStrength > 0.01 ? 'Bullish' : features.trendStrength < -0.01 ? 'Bearish' : 'Neutral',
                reason: this.generateReason(direction, features),
            });
        }

        return results;
    }

    generateReason(direction, features) {
        const reasons = [];

        if (features.rsi < 30) reasons.push('Oversold RSI');
        else if (features.rsi > 70) reasons.push('Overbought RSI');

        if (features.trendStrength > 0.02) reasons.push('Strong uptrend');
        else if (features.trendStrength < -0.02) reasons.push('Strong downtrend');

        if (features.volatility > 0.05) reasons.push('High volatility');

        return reasons.length > 0 ? reasons.join(', ') : 'Technical analysis signals';
    }
}

const predictionEngine = new PredictionEngine();

// ══════════════════════════════════════════════════════════════════════════════
// PREDICTION VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════

async function verifyPendingPredictions() {
    const now = Date.now();
    const toVerify = performance.pendingPredictions.filter(p => p.targetTime <= now);

    for (const pred of toVerify) {
        const currentData = await fetchPrice();
        const actualPrice = currentData.price;
        const expectedDirection = pred.direction;

        let actualDirection;
        const change = (actualPrice - pred.currentPrice) / pred.currentPrice;

        if (change > 0.005) actualDirection = 'UP';
        else if (change < -0.005) actualDirection = 'DOWN';
        else actualDirection = 'SIDEWAYS';

        const correct = expectedDirection === actualDirection ||
            (expectedDirection === 'SIDEWAYS' && Math.abs(change) < 0.01);

        if (correct) {
            performance.correct++;
            log.success(`✓ Prediction verified: ${pred.direction} was correct! (${(change * 100).toFixed(2)}% move)`);
        } else {
            performance.incorrect++;
            log.warning(`✗ Prediction missed: Expected ${pred.direction}, got ${actualDirection}`);
        }

        pred.verified = true;
        pred.actualPrice = actualPrice;
        pred.correct = correct;
        performance.verifiedPredictions.push(pred);
    }

    // Remove verified from pending
    performance.pendingPredictions = performance.pendingPredictions.filter(p => !p.verified);

    // Update accuracy
    const total = performance.correct + performance.incorrect;
    if (total > 0) {
        performance.accuracy = (performance.correct / total) * 100;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════════════════════

async function runPrediction() {
    const sep = '═'.repeat(60);
    console.log(`\n${sep}`);
    log.info('Generating AI predictions...');

    // Verify past predictions first
    await verifyPendingPredictions();

    // Fetch current price
    const priceData = await fetchPrice();
    priceHistory.push(priceData);
    if (priceHistory.length > CONFIG.HISTORY_SIZE) {
        priceHistory = priceHistory.slice(-CONFIG.HISTORY_SIZE);
    }

    // Generate new predictions
    const newPredictions = predictionEngine.generatePredictions(priceHistory);
    performance.totalPredictions += newPredictions.length;

    // Add to pending
    performance.pendingPredictions.push(...newPredictions);

    // Display
    console.log(sep);
    console.log('  🎯 DUCKMON PREDICTION BOT v2.0 - Forecast Report');
    if (demoMode) console.log('  ⚠️  DEMO MODE');
    console.log(sep);
    console.log(`  💰 Current Price: ${priceData.price.toFixed(8)} MON`);
    console.log(sep);
    console.log('  📊 PREDICTIONS:');
    console.log('  ─────────────────────────────────────────────────────');

    for (const pred of newPredictions) {
        const arrow = pred.direction === 'UP' ? '🟢↑' : pred.direction === 'DOWN' ? '🔴↓' : '🟡→';
        console.log(`  ${arrow} ${pred.horizon}min: ${pred.direction} (${pred.confidence}%)`);
        console.log(`     Expected: ${pred.expectedPrice.toFixed(8)} MON (${pred.expectedMove}%)`);
        console.log(`     Reason: ${pred.reason}`);
        console.log('  ─────────────────────────────────────────────────────');
    }

    console.log(sep);
    const total = performance.correct + performance.incorrect;
    const accDisplay = total > 0 ? performance.accuracy.toFixed(1) : 'N/A';
    console.log(`  📈 Accuracy: ${accDisplay}% (${performance.correct}/${total} verified)`);
    console.log(`  ⏳ Pending: ${performance.pendingPredictions.length} predictions`);
    console.log(`  ⏱️  Uptime: ${formatTime(Date.now() - performance.startTime)}`);
    console.log(sep);

    // Post best prediction to blockchain
    const bestPred = newPredictions.find(p => p.direction !== 'SIDEWAYS' && p.confidence >= CONFIG.MIN_CONFIDENCE);
    if (bestPred) {
        await postPredictionOnChain(bestPred);
    }

    agentState.currentPredictions = newPredictions;
    return newPredictions;
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ██████╗ ██████╗ ███████╗██████╗ ██╗ ██████╗████████╗██╗ ██████╗ ███╗   ██╗ ║
║   ██╔══██╗██╔══██╗██╔════╝██╔══██╗██║██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║ ║
║   ██████╔╝██████╔╝█████╗  ██║  ██║██║██║        ██║   ██║██║   ██║██╔██╗ ██║ ║
║   ██╔═══╝ ██╔══██╗██╔══╝  ██║  ██║██║██║        ██║   ██║██║   ██║██║╚██╗██║ ║
║   ██║     ██║  ██║███████╗██████╔╝██║╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║ ║
║   ╚═╝     ╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ║
║                                                                              ║
║                    🎯 PREDICTION BOT v2.0                                    ║
║              Neural Network Price Forecasting                                ║
║                     Powered by Monad                                         ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);

    console.log('');
    log.info(`Starting ${AGENT_NAME}...`);
    log.info(`Version: ${AGENT_VERSION}`);
    log.info(`Prediction Horizons: ${CONFIG.PREDICTION_HORIZONS.join(', ')} minutes`);
    log.info(`Network: Monad Mainnet`);
    console.log('');

    initWallet();
    await registerAgent();

    // Build history
    log.info('Building price history...');
    for (let i = 0; i < 80; i++) {
        priceHistory.push(await fetchPrice());
        process.stdout.write(`\r  Progress: ${i + 1}/80 data points`);
        await new Promise(r => setTimeout(r, 30));
    }
    console.log('');
    log.success(`Collected ${priceHistory.length} data points`);
    console.log('');

    // First prediction
    await runPrediction();

    // Main loop
    setInterval(async () => {
        if (agentState.isRunning) {
            await runPrediction();
        }
    }, CONFIG.PREDICTION_INTERVAL);

    log.success('Agent running! Press Ctrl+C to stop.');
}

export { runPrediction, agentState, performance, NeuralNetwork };
main().catch(console.error);
