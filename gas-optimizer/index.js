import { createPublicClient, http, formatGwei } from 'viem';
import { monadMainnet, GAS_CONFIG } from './config.js';
import { sendGasPrice, startHeartbeat } from '../shared/websocketClient.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                      ⛽ DUCKMON GAS OPTIMIZER v1.0                           ║
// ║              Real-time Gas Price Monitoring & Optimization                   ║
// ║                  Leveraging Monad's 400ms Block Times                        ║
// ║                           Powered by Monad                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const AGENT_NAME = 'Gas Optimizer v1.0';
const AGENT_VERSION = '1.0.0';

const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(monadMainnet.rpcUrls.default.http[0]),
});

const gasState = {
    isRunning: true,
    currentGasPrice: 0n,
    history: [],
    predictions: [],
};

const statistics = {
    minGas: Infinity,
    maxGas: 0,
    avgGas: 0,
    medianGas: 0,
    volatility: 0,
};

const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    gas: (msg) => console.log(`\x1b[35m[⛽ GAS]\x1b[0m ${msg}`),
};

// ══════════════════════════════════════════════════════════════════════════════
// GAS MONITORING
// ══════════════════════════════════════════════════════════════════════════════

async function updateGasPrice() {
    try {
        const gasPrice = await publicClient.getGasPrice();
        const gasPriceGwei = parseFloat(formatGwei(gasPrice));

        gasState.currentGasPrice = gasPrice;
        gasState.history.push({
            price: gasPriceGwei,
            timestamp: Date.now(),
        });

        // Keep history size limited
        if (gasState.history.length > GAS_CONFIG.HISTORY_SIZE) {
            gasState.history.shift();
        }

        // Update statistics
        updateStatistics();

        // Generate recommendation
        const recommendation = generateRecommendation(gasPriceGwei);

        // Broadcast to WebSocket server
        await sendGasPrice({
            current: gasPriceGwei,
            avg: statistics.avgGas,
            min: statistics.minGas,
            max: statistics.maxGas,
            recommendation: recommendation.action,
            prediction: recommendation.prediction,
        }).catch(err => console.error(`WebSocket broadcast failed: ${err.message}`));

        // Display
        displayGasInfo(gasPriceGwei, recommendation);

    } catch (error) {
        log.error(`Gas price update failed: ${error.message}`);
    }
}

function updateStatistics() {
    if (gasState.history.length === 0) return;

    const prices = gasState.history.map(h => h.price);

    statistics.minGas = Math.min(...prices);
    statistics.maxGas = Math.max(...prices);
    statistics.avgGas = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Median
    const sorted = [...prices].sort((a, b) => a - b);
    statistics.medianGas = sorted[Math.floor(sorted.length / 2)];

    // Volatility (standard deviation)
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - statistics.avgGas, 2), 0) / prices.length;
    statistics.volatility = Math.sqrt(variance);
}

function generateRecommendation(currentGas) {
    let recommendation = 'NORMAL';
    let action = 'TRADE NOW';
    let confidence = 50;

    if (currentGas < GAS_CONFIG.LOW_GAS_THRESHOLD) {
        recommendation = 'EXCELLENT';
        action = '✅ OPTIMAL TIME TO TRADE';
        confidence = 90;
    } else if (currentGas < statistics.avgGas * 0.8) {
        recommendation = 'GOOD';
        action = '👍 GOOD TIME TO TRADE';
        confidence = 75;
    } else if (currentGas > GAS_CONFIG.HIGH_GAS_THRESHOLD) {
        recommendation = 'HIGH';
        action = '⚠️  WAIT FOR LOWER GAS';
        confidence = 85;
    } else if (currentGas > statistics.avgGas * 1.2) {
        recommendation = 'ELEVATED';
        action = '⏳ CONSIDER WAITING';
        confidence = 70;
    }

    // Predict next block gas
    const prediction = predictNextBlockGas();

    return {
        recommendation,
        action,
        confidence,
        prediction,
    };
}

function predictNextBlockGas() {
    if (gasState.history.length < 10) return null;

    // Simple moving average prediction
    const recent = gasState.history.slice(-10).map(h => h.price);
    const trend = recent[recent.length - 1] - recent[0];
    const predicted = recent[recent.length - 1] + (trend / 10);

    return {
        price: predicted.toFixed(2),
        direction: trend > 0 ? '📈 RISING' : trend < 0 ? '📉 FALLING' : '➡️ STABLE',
    };
}

function displayGasInfo(currentGas, recommendation) {
    const sep = '═'.repeat(60);

    console.log(`\n${sep}`);
    console.log('  ⛽ MONAD GAS PRICE MONITOR');
    console.log(sep);
    console.log(`  Current Gas:   ${currentGas.toFixed(2)} gwei`);
    console.log(`  Avg Gas:       ${statistics.avgGas.toFixed(2)} gwei`);
    console.log(`  Min Gas:       ${statistics.minGas.toFixed(2)} gwei`);
    console.log(`  Max Gas:       ${statistics.maxGas.toFixed(2)} gwei`);
    console.log(`  Volatility:    ${statistics.volatility.toFixed(2)} gwei`);
    console.log(sep);
    console.log(`  Status:        ${recommendation.recommendation}`);
    console.log(`  Action:        ${recommendation.action}`);
    if (recommendation.prediction) {
        console.log(`  Next Block:    ${recommendation.prediction.price} gwei ${recommendation.prediction.direction}`);
    }
    console.log(sep);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║            ⛽ DUCKMON GAS OPTIMIZER v${AGENT_VERSION}                      ║
║         Real-time Gas Price Monitoring & Optimization            ║
║            Leveraging Monad's 400ms Block Times                  ║
║                      Powered by Monad                             ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
    `);

    log.info('Initializing Gas Optimizer...');
    log.info(`Update interval: ${GAS_CONFIG.UPDATE_INTERVAL}ms`);

    // Start WebSocket heartbeat
    const stopHeartbeat = startHeartbeat('gas-optimizer');
    log.success('WebSocket heartbeat started');

    log.info('Starting gas price monitoring...');
    console.log('');

    // Initial update
    await updateGasPrice();

    // Schedule recurring updates
    setInterval(updateGasPrice, GAS_CONFIG.UPDATE_INTERVAL);

    log.success('Gas Optimizer is now active!');
}

main().catch(console.error);
