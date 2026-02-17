// Shared Wallet & Blockchain Operations for all DUCKMON Agents
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadMainnet, contracts, DUCK_SIGNALS_ABI } from './config.js';

let _publicClient = null;
let _walletClient = null;
let _account = null;

export function getPublicClient() {
    if (!_publicClient) {
        _publicClient = createPublicClient({
            chain: monadMainnet,
            transport: http(monadMainnet.rpcUrls.default.http[0]),
        });
    }
    return _publicClient;
}

export function createClients() {
    const publicClient = getPublicClient();
    const privateKey = process.env.PRIVATE_KEY;

    if (privateKey) {
        const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
        _account = privateKeyToAccount(formattedKey);
        _walletClient = createWalletClient({
            account: _account,
            chain: monadMainnet,
            transport: http(monadMainnet.rpcUrls.default.http[0]),
        });
        return { publicClient, walletClient: _walletClient, account: _account };
    }

    return { publicClient, walletClient: null, account: null };
}

export function getAccount() {
    return _account;
}

export function getWalletClient() {
    return _walletClient;
}

export async function registerAgent(name, log) {
    const publicClient = getPublicClient();
    const walletClient = _walletClient;
    const account = _account;

    if (!walletClient || contracts.DUCK_SIGNALS === '0x0000000000000000000000000000000000000000') {
        if (log) log.warning('Contract not deployed or no wallet - skipping registration');
        return false;
    }

    try {
        const agentData = await publicClient.readContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'agents',
            args: [account.address],
        });

        if (agentData[5]) {
            if (log) log.success(`Agent already registered: ${agentData[0]}`);
            return true;
        }

        if (log) log.info('Registering agent on blockchain...');
        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'registerAgent',
            args: [name],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        if (log) log.success(`Agent registered: ${hash.slice(0, 16)}...`);
        return true;
    } catch (error) {
        if (log) log.error(`Registration failed: ${error.message}`);
        return false;
    }
}

export async function postSignal(signalType, confidence, price, reason, log) {
    const walletClient = _walletClient;
    const publicClient = getPublicClient();

    if (!walletClient) return false;

    try {
        const priceWei = parseEther(price.toFixed(18));
        if (log) log.info('Broadcasting signal to blockchain...');

        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'postSignal',
            args: [signalType, BigInt(Math.round(confidence)), priceWei, reason],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        if (log) log.success(`Signal posted: ${hash.slice(0, 16)}...`);
        return hash;
    } catch (error) {
        if (log) log.error(`Signal post failed: ${error.message}`);
        return false;
    }
}

export async function postPrediction(direction, confidence, referencePrice, targetTime, log) {
    const walletClient = _walletClient;
    const publicClient = getPublicClient();

    if (!walletClient) return false;

    try {
        const priceWei = parseEther(referencePrice.toFixed(18));
        const targetTimestamp = BigInt(Math.floor(targetTime / 1000));

        if (log) log.info('Broadcasting prediction to blockchain...');

        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'postPrediction',
            args: [direction, BigInt(Math.round(confidence)), priceWei, targetTimestamp],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        if (log) log.success(`Prediction posted: ${hash.slice(0, 16)}...`);
        return hash;
    } catch (error) {
        if (log) log.error(`Prediction post failed: ${error.message}`);
        return false;
    }
}
