/**
 * DuckSignals Contract ABI
 * Simplified for agent interactions
 */

export const DUCK_SIGNALS_ABI = [
    // Agent Registration
    {
        "inputs": [],
        "name": "registerAgent",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    // Post Trading Signal
    {
        "inputs": [
            { "name": "signalType", "type": "uint8" },
            { "name": "confidence", "type": "uint8" },
            { "name": "reason", "type": "string" }
        ],
        "name": "postSignal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    // Post Prediction
    {
        "inputs": [
            { "name": "direction", "type": "uint8" },
            { "name": "confidence", "type": "uint8" },
            { "name": "horizon", "type": "uint16" }
        ],
        "name": "postPrediction",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    // View Functions
    {
        "inputs": [],
        "name": "getAgentCount",
        "outputs": [{ "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getTotalSignals",
        "outputs": [{ "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "name": "count", "type": "uint256" }],
        "name": "getRecentSignals",
        "outputs": [
            {
                "components": [
                    { "name": "agent", "type": "address" },
                    { "name": "signalType", "type": "uint8" },
                    { "name": "confidence", "type": "uint8" },
                    { "name": "reason", "type": "string" },
                    { "name": "timestamp", "type": "uint256" }
                ],
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

export default DUCK_SIGNALS_ABI;
