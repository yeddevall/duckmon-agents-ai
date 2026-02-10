// Gas Optimizer Configuration
export const monadMainnet = {
    id: 143,
    name: 'Monad',
    network: 'monad',
    nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
    rpcUrls: {
        default: { http: ['https://rpc.monad.xyz'] },
        public: { http: ['https://rpc.monad.xyz'] },
    },
};

export const GAS_CONFIG = {
    UPDATE_INTERVAL: 10000,          // Update every 10 seconds
    HISTORY_SIZE: 1000,              // Keep last 1000 gas prices
    LOW_GAS_THRESHOLD: 20,           // Below 20 gwei = low
    HIGH_GAS_THRESHOLD: 100,         // Above 100 gwei = high
    PREDICT_BLOCKS_AHEAD: 10,        // Predict gas for next 10 blocks
};
