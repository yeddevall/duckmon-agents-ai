// Arbitrage Hunter Configuration
export const monadMainnet = {
    id: 143,
    name: 'Monad',
    network: 'monad',
    nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
    rpcUrls: {
        default: { http: ['https://rpc.monad.xyz'] },
        public: { http: ['https://rpc.monad.xyz'] },
    },
    blockExplorers: {
        default: { name: 'MonadVision', url: 'https://monadvision.com' },
    },
};

export const contracts = {
    DUCK_TOKEN: '0x0862F464c8457266b66c58F1D7C1137B72647777',
    WMON: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    DUCK_SIGNALS: process.env.DUCK_SIGNALS_ADDRESS || '0x0000000000000000000000000000000000000000',
};

export const ARB_CONFIG = {
    MIN_PROFIT_PERCENT: 0.5,         // Minimum 0.5% profit
    MAX_SLIPPAGE: 0.3,               // 0.3% max slippage
    SCAN_INTERVAL: 2000,             // Scan every 2 seconds
    MAX_POSITION_SIZE_USD: 5000,     // Max $5K per trade
    GAS_BUFFER: 1.2,                 // 20% gas buffer
};

export const ERC20_ABI = [
    { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
];
