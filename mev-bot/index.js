import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadMainnet, contracts, MEV_CONFIG, ERC20_ABI, ROUTER_ABI, DUCK_SIGNALS_ABI } from './config.js';
import AI from '../shared/aiModule.js';
import { sendMEVOpportunity, startHeartbeat } from '../shared/websocketClient.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                      ⚡ DUCKMON MEV BOT v1.0                                  ║
// ║          Maximal Extractable Value Bot for Monad Blockchain                  ║
// ║              Leveraging 10K TPS & 400ms Block Times                          ║
// ║                           Powered by Monad                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const AGENT_NAME = 'MEV Bot v1.0';
const AGENT_VERSION = '1.0.0';

// ══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

const mevState = {
    isRunning: true,
    isRegistered: false,
    pendingTxs: new Map(),
    opportunities: [],
    executedTrades: [],
};

const performance = {
    totalOpportunities: 0,
    executedTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfitUSD: 0,
    totalGasSpent: 0,
    startTime: Date.now(),
};

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN CLIENTS
// ══════════════════════════════════════════════════════════════════════════════

const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(monadMainnet.rpcUrls.default.http[0]),
});

let walletClient = null;
let account = null;

// ══════════════════════════════════════════════════════════════════════════════
// LOGGING UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    mev: (msg) => console.log(`\x1b[35m[⚡ MEV]\x1b[0m ${msg}`),
    profit: (msg) => console.log(`\x1b[32m[💰 PROFIT]\x1b[0m ${msg}`),
};

function formatNumber(num) {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
}

function formatAddress(addr) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLET INITIALIZATION
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
        log.success(`MEV Wallet initialized: ${formatAddress(account.address)}`);
        return true;
    }
    log.warning('No private key found - MEV bot requires a wallet to execute trades');
    return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// MEV OPPORTUNITY DETECTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Detect arbitrage opportunities across DEXes
 */
async function detectArbitrageOpportunity() {
    if (!MEV_CONFIG.STRATEGIES.ARBITRAGE) return null;

    try {
        const tokenPath = [contracts.DUCK_TOKEN, contracts.WMON];

        // Get prices from different DEXes
        // In production, query multiple DEX routers
        const dexPrices = await Promise.allSettled([
            getPrice(contracts.UNISWAP_V2_ROUTER, tokenPath),
            getPrice(contracts.SUSHISWAP_ROUTER, tokenPath),
        ]);

        const prices = dexPrices
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        if (prices.length < 2) return null;

        // Find best buy and sell prices
        const lowestPrice = Math.min(...prices.map(p => p.price));
        const highestPrice = Math.max(...prices.map(p => p.price));
        const spread = ((highestPrice - lowestPrice) / lowestPrice) * 100;

        // Calculate potential profit
        const tradeAmount = 100; // $100 test trade
        const grossProfit = (spread / 100) * tradeAmount;
        const estimatedGas = 0.5; // Estimated gas cost
        const netProfit = grossProfit - estimatedGas;

        if (netProfit >= MEV_CONFIG.MIN_PROFIT_USD) {
            return {
                type: 'ARBITRAGE',
                strategy: 'Multi-DEX',
                buyDex: prices.find(p => p.price === lowestPrice)?.dex || 'DEX1',
                sellDex: prices.find(p => p.price === highestPrice)?.dex || 'DEX2',
                buyPrice: lowestPrice,
                sellPrice: highestPrice,
                spread: spread.toFixed(2),
                estimatedProfit: netProfit,
                gasEstimate: estimatedGas,
                confidence: Math.min(50 + spread * 10, 95),
                timestamp: Date.now(),
            };
        }
    } catch (error) {
        log.error(`Arbitrage detection error: ${error.message}`);
    }

    return null;
}

/**
 * Get token price from a DEX router
 */
async function getPrice(routerAddress, path) {
    try {
        const amountIn = parseEther('1');
        const amounts = await publicClient.readContract({
            address: routerAddress,
            abi: ROUTER_ABI,
            functionName: 'getAmountsOut',
            args: [amountIn, path],
        });

        const amountOut = amounts[amounts.length - 1];
        const price = parseFloat(formatEther(amountOut));

        return {
            dex: formatAddress(routerAddress),
            price,
            path,
        };
    } catch (error) {
        throw new Error(`Price fetch failed: ${error.message}`);
    }
}

/**
 * Detect liquidation opportunities
 */
async function detectLiquidationOpportunity() {
    if (!MEV_CONFIG.STRATEGIES.LIQUIDATION) return null;

    // In production, monitor lending protocols for under-collateralized positions
    // This is a simplified example
    try {
        // Query lending protocol contracts for liquidatable positions
        // Return opportunity if found

        return null; // No opportunities right now
    } catch (error) {
        log.error(`Liquidation detection error: ${error.message}`);
        return null;
    }
}

/**
 * Detect backrun opportunities from recent blocks
 */
async function detectBackrunOpportunity() {
    if (!MEV_CONFIG.STRATEGIES.BACKRUN) return null;

    try {
        const latestBlock = await publicClient.getBlockNumber();
        const block = await publicClient.getBlock({ blockNumber: latestBlock });

        // Analyze recent transactions for backrun opportunities
        // Look for large swaps that moved the price
        const recentTxs = block.transactions.slice(-10);

        // In production, decode and analyze each transaction
        // For now, return null

        return null;
    } catch (error) {
        log.error(`Backrun detection error: ${error.message}`);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MEV EXECUTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Execute MEV opportunity
 */
async function executeMEV(opportunity) {
    if (!walletClient || !account) {
        log.warning('Cannot execute MEV - no wallet configured');
        return false;
    }

    log.mev(`Executing ${opportunity.type} opportunity...`);
    console.log(`  Expected profit: $${opportunity.estimatedProfit.toFixed(2)}`);
    console.log(`  Strategy: ${opportunity.strategy}`);

    try {
        // Check pending transaction limit
        if (mevState.pendingTxs.size >= MEV_CONFIG.MAX_PENDING_TXS) {
            log.warning('Max pending transactions reached, skipping...');
            return false;
        }

        // Execute based on opportunity type
        let txHash;
        switch (opportunity.type) {
            case 'ARBITRAGE':
                txHash = await executeArbitrage(opportunity);
                break;
            case 'LIQUIDATION':
                txHash = await executeLiquidation(opportunity);
                break;
            case 'BACKRUN':
                txHash = await executeBackrun(opportunity);
                break;
            default:
                log.warning(`Unknown opportunity type: ${opportunity.type}`);
                return false;
        }

        if (txHash) {
            mevState.pendingTxs.set(txHash, {
                opportunity,
                timestamp: Date.now(),
            });

            performance.executedTrades++;
            log.success(`Transaction submitted: ${txHash.slice(0, 10)}...`);

            // Wait for confirmation (non-blocking)
            waitForConfirmation(txHash, opportunity);
            return true;
        }
    } catch (error) {
        log.error(`MEV execution failed: ${error.message}`);
        performance.failedTrades++;
    }

    return false;
}

/**
 * Execute arbitrage trade
 */
async function executeArbitrage(opportunity) {
    // In production:
    // 1. Buy on lower-priced DEX
    // 2. Sell on higher-priced DEX
    // 3. All in one transaction (atomic)

    log.info('Arbitrage execution simulated (requires real DEX contracts)');

    // Simulate transaction
    return `0x${Math.random().toString(16).slice(2)}`;
}

/**
 * Execute liquidation
 */
async function executeLiquidation(opportunity) {
    log.info('Liquidation execution simulated');
    return `0x${Math.random().toString(16).slice(2)}`;
}

/**
 * Execute backrun
 */
async function executeBackrun(opportunity) {
    log.info('Backrun execution simulated');
    return `0x${Math.random().toString(16).slice(2)}`;
}

/**
 * Wait for transaction confirmation
 */
async function waitForConfirmation(txHash, opportunity) {
    try {
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: MEV_CONFIG.TX_TIMEOUT,
        });

        mevState.pendingTxs.delete(txHash);

        if (receipt.status === 'success') {
            performance.successfulTrades++;
            performance.totalProfitUSD += opportunity.estimatedProfit;

            const gasUsed = Number(receipt.gasUsed);
            const gasPrice = Number(receipt.effectiveGasPrice);
            const gasCost = parseFloat(formatEther(BigInt(gasUsed) * BigInt(gasPrice)));
            performance.totalGasSpent += gasCost;

            log.profit(`Trade successful! Profit: $${opportunity.estimatedProfit.toFixed(2)}`);

            // Post success signal
            await postMEVSignal(opportunity, true);
        } else {
            performance.failedTrades++;
            log.error('Transaction reverted');
        }
    } catch (error) {
        mevState.pendingTxs.delete(txHash);
        performance.failedTrades++;
        log.error(`Transaction failed: ${error.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN POSTING
// ══════════════════════════════════════════════════════════════════════════════

async function registerAgent() {
    if (!walletClient || !account) return false;
    if (contracts.DUCK_SIGNALS === '0x0000000000000000000000000000000000000000') {
        log.warning('DuckSignals contract not configured');
        return false;
    }

    try {
        const agentInfo = await publicClient.readContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'agents',
            args: [account.address],
        });

        if (agentInfo[5]) {
            log.success(`Agent already registered: ${agentInfo[0]}`);
            mevState.isRegistered = true;
            return true;
        }

        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'registerAgent',
            args: [AGENT_NAME],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        log.success(`Agent registered on-chain: ${AGENT_NAME}`);
        mevState.isRegistered = true;
        return true;
    } catch (error) {
        log.error(`Registration failed: ${error.message}`);
        return false;
    }
}

async function postMEVSignal(opportunity, success) {
    if (!walletClient || !mevState.isRegistered) return;

    try {
        const reason = `⚡ MEV ${opportunity.type} | ${opportunity.strategy} | Profit: $${opportunity.estimatedProfit.toFixed(2)} | Status: ${success ? 'SUCCESS ✅' : 'FAILED ❌'}`;

        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'postSignal',
            args: ['HOLD', BigInt(opportunity.confidence), parseEther('0'), reason],
        });

        log.success(`MEV signal posted: ${hash.slice(0, 10)}...`);
    } catch (error) {
        log.error(`Failed to post signal: ${error.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════════════════════

async function scanForOpportunities() {
    log.info('Scanning for MEV opportunities...');

    // Run all detection strategies in parallel
    const [arbitrage, liquidation, backrun] = await Promise.allSettled([
        detectArbitrageOpportunity(),
        detectLiquidationOpportunity(),
        detectBackrunOpportunity(),
    ]);

    const opportunities = [arbitrage, liquidation, backrun]
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

    if (opportunities.length > 0) {
        log.mev(`Found ${opportunities.length} opportunities!`);

        // Sort by estimated profit (highest first)
        opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit);

        // Execute best opportunity
        const best = opportunities[0];
        performance.totalOpportunities++;

        // Broadcast to WebSocket server
        await sendMEVOpportunity({
            type: best.type,
            profit: best.estimatedProfit,
            dex1: best.buyDex,
            dex2: best.sellDex,
            spread: best.spread,
            status: 'DETECTED',
        }).catch(err => log.warning(`WebSocket broadcast failed: ${err.message}`));

        await executeMEV(best);
    } else {
        log.info('No profitable opportunities found');
    }
}

async function printStatus() {
    const uptime = formatUptime(Date.now() - performance.startTime);
    const successRate = performance.executedTrades > 0
        ? ((performance.successfulTrades / performance.executedTrades) * 100).toFixed(1)
        : 0;
    const netProfit = performance.totalProfitUSD - performance.totalGasSpent;

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    ⚡ MEV BOT STATUS                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Agent:            ${AGENT_NAME.padEnd(44)}║
║  Status:           ${(mevState.isRunning ? '🟢 ACTIVE' : '🔴 STOPPED').padEnd(44)}║
║  Registered:       ${(mevState.isRegistered ? '✅ YES' : '❌ NO').padEnd(44)}║
║  Uptime:           ${uptime.padEnd(44)}║
╠══════════════════════════════════════════════════════════════════╣
║  Opportunities:    ${String(performance.totalOpportunities).padEnd(44)}║
║  Executed Trades:  ${String(performance.executedTrades).padEnd(44)}║
║  Success Rate:     ${(successRate + '%').padEnd(44)}║
║  Pending TXs:      ${String(mevState.pendingTxs.size).padEnd(44)}║
╠══════════════════════════════════════════════════════════════════╣
║  Total Profit:     ${('$' + formatNumber(performance.totalProfitUSD)).padEnd(44)}║
║  Gas Spent:        ${('$' + formatNumber(performance.totalGasSpent)).padEnd(44)}║
║  Net Profit:       ${('$' + formatNumber(netProfit)).padEnd(44)}║
╚══════════════════════════════════════════════════════════════════╝
    `);
}

// ══════════════════════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║               ⚡ DUCKMON MEV BOT v${AGENT_VERSION}                         ║
║       Maximal Extractable Value Bot for Monad Blockchain         ║
║          Leveraging 10K TPS & 400ms Block Times                  ║
║                      Powered by Monad                             ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
    `);

    // Initialize
    const hasWallet = initWallet();
    if (!hasWallet) {
        log.error('MEV Bot requires a wallet to operate. Exiting...');
        process.exit(1);
    }

    await registerAgent();

    // Start WebSocket heartbeat
    const stopHeartbeat = startHeartbeat('mev-bot');
    log.success('WebSocket heartbeat started');

    log.info('MEV strategies enabled:');
    Object.entries(MEV_CONFIG.STRATEGIES).forEach(([strategy, enabled]) => {
        console.log(`  ${enabled ? '✅' : '❌'} ${strategy}`);
    });

    log.info(`Minimum profit threshold: $${MEV_CONFIG.MIN_PROFIT_USD}`);
    log.info(`Max gas price: ${MEV_CONFIG.MAX_GAS_PRICE} gwei`);
    console.log('');

    // Initial scan
    await scanForOpportunities();
    await printStatus();

    // Schedule recurring scans
    setInterval(scanForOpportunities, MEV_CONFIG.OPPORTUNITY_CHECK_INTERVAL);
    setInterval(printStatus, 60000); // Every 1 minute

    log.success('MEV Bot is now hunting for opportunities!');
    log.warning('⚠️  MEV trading involves significant risks. Trade responsibly.');
}

main().catch(console.error);
