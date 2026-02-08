#!/usr/bin/env node

/**
 * DUCKMON Agent - Single File Runner for Railway
 * Runs the Trading Oracle agent directly
 */

import 'dotenv/config';
import { ethers } from 'ethers';

// Configuration
const config = {
    rpcUrl: process.env.RPC_URL || 'https://rpc.monad.xyz',
    privateKey: process.env.PRIVATE_KEY,
    contractAddress: process.env.DUCK_SIGNALS_ADDRESS || '0x9386CA8FC92A342E3c9DFD9E913Fa860d5761687',
    updateInterval: parseInt(process.env.UPDATE_INTERVAL || '60000'), // 1 minute default
};

// Contract ABI (simplified)
const CONTRACT_ABI = [
    "function registerAgent(string name) external",
    "function postSignal(string signalType, uint256 confidence, uint256 price, string reason) external",
    "function agents(address) view returns (string name, uint256 totalSignals, uint256 totalPredictions, uint256 correctPredictions, uint256 lastActive, bool isRegistered)",
];

// Technical Analysis Functions
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

function calculateSMA(prices, period) {
    if (prices.length < period) return prices[0] || 0;
    return prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
}

function generateSignal(prices) {
    const rsi = calculateRSI(prices);
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);
    const currentPrice = prices[0];

    let type = 'HOLD';
    let confidence = 50;
    const reasons = [];

    // RSI Analysis
    if (rsi < 30) {
        type = 'BUY';
        confidence = 70 + (30 - rsi);
        reasons.push('RSI oversold');
    } else if (rsi > 70) {
        type = 'SELL';
        confidence = 70 + (rsi - 70);
        reasons.push('RSI overbought');
    }

    // SMA Crossover
    if (sma20 > sma50 && type !== 'SELL') {
        if (type === 'HOLD') type = 'BUY';
        confidence += 10;
        reasons.push('SMA20 > SMA50');
    } else if (sma20 < sma50 && type !== 'BUY') {
        if (type === 'HOLD') type = 'SELL';
        confidence += 10;
        reasons.push('SMA20 < SMA50');
    }

    return {
        type,
        confidence: Math.min(95, Math.round(confidence)),
        reason: reasons.join(' | ') || 'Market neutral',
        rsi: Math.round(rsi),
        price: currentPrice
    };
}

// Simulate price data (in production, fetch from DEX/API)
function simulatePriceHistory() {
    const basePrice = 0.00001; // Example base price
    const prices = [];
    for (let i = 0; i < 50; i++) {
        const randomChange = (Math.random() - 0.5) * 0.1;
        prices.push(basePrice * (1 + randomChange * (50 - i) / 50));
    }
    return prices;
}

// Main Agent Class
class TradingOracleAgent {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
        this.wallet = config.privateKey
            ? new ethers.Wallet(config.privateKey, this.provider)
            : null;
        this.contract = this.wallet
            ? new ethers.Contract(config.contractAddress, CONTRACT_ABI, this.wallet)
            : null;
        this.isRegistered = false;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📊';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async checkRegistration() {
        if (!this.wallet) {
            this.log('No wallet configured - read-only mode', 'info');
            return false;
        }

        try {
            const readContract = new ethers.Contract(
                config.contractAddress,
                CONTRACT_ABI,
                this.provider
            );
            const stats = await readContract.agents(this.wallet.address);
            this.isRegistered = stats.isRegistered;

            if (!this.isRegistered) {
                this.log('Registering agent on-chain...', 'info');
                const tx = await this.contract.registerAgent('Trading Oracle v2.0');
                await tx.wait();
                this.isRegistered = true;
                this.log('Agent registered successfully!', 'success');
            } else {
                this.log('Agent already registered', 'success');
            }
            return true;
        } catch (error) {
            this.log(`Registration check failed: ${error.message}`, 'error');
            return false;
        }
    }

    async postSignal(signal) {
        if (!this.contract || !this.isRegistered) {
            this.log(`Signal (not posted): ${signal.type} ${signal.confidence}% - ${signal.reason}`, 'info');
            return;
        }

        try {
            const priceWei = ethers.parseEther(signal.price.toFixed(18));
            const tx = await this.contract.postSignal(
                signal.type,
                signal.confidence,
                priceWei,
                signal.reason
            );
            await tx.wait();
            this.log(`Signal posted on-chain: ${signal.type} ${signal.confidence}%`, 'success');
        } catch (error) {
            this.log(`Failed to post signal: ${error.message}`, 'error');
        }
    }

    async runAnalysis() {
        const prices = simulatePriceHistory();
        const signal = generateSignal(prices);

        this.log(`Analysis: RSI=${signal.rsi} | Signal=${signal.type} | Confidence=${signal.confidence}%`);

        await this.postSignal(signal);
    }

    async start() {
        console.log('');
        console.log('╔═══════════════════════════════════════╗');
        console.log('║  🦆 DUCKMON Trading Oracle Agent      ║');
        console.log('║  Running on Monad Blockchain          ║');
        console.log('╚═══════════════════════════════════════╝');
        console.log('');

        this.log(`RPC: ${config.rpcUrl}`);
        this.log(`Contract: ${config.contractAddress}`);
        this.log(`Wallet: ${this.wallet?.address || 'Not configured'}`);
        this.log(`Update Interval: ${config.updateInterval / 1000}s`);
        console.log('');

        // Check balance if wallet exists
        if (this.wallet) {
            const balance = await this.provider.getBalance(this.wallet.address);
            this.log(`Balance: ${ethers.formatEther(balance)} MON`);
        }

        // Register agent
        await this.checkRegistration();
        console.log('');

        // Run first analysis
        await this.runAnalysis();

        // Start interval
        this.log(`Starting analysis loop (every ${config.updateInterval / 1000}s)...`);
        setInterval(() => this.runAnalysis(), config.updateInterval);
    }
}

// Start the agent
const agent = new TradingOracleAgent();
agent.start().catch(console.error);
