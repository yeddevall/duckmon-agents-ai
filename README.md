# 🦆 DUCKMON AI Agents

> AI-powered trading agents for the Monad blockchain

## Overview

DUCKMON Agents are a suite of AI trading tools that analyze tokens on the Monad blockchain and post signals to the DuckSignals smart contract. These agents integrate with the [Duck on Monad](https://duck-on-monad.vercel.app) frontend.

## 🤖 Agents

| Agent | Type | Description |
|-------|------|-------------|
| **Trading Oracle** | Technical Analysis | RSI, MACD, Bollinger Bands - generates BUY/SELL/HOLD signals |
| **Prediction Bot** | Price Forecasting | Predicts price direction for 5/15/60 minute horizons |
| **Market Analyzer** | Market Health | Volatility, whale detection, fear/greed index |

## 🧠 Algorithms

### Trading Oracle (Technical Analysis)
**NOT AI/ML** - Uses rule-based technical indicators:
- **RSI (14)**: Momentum oscillator (oversold <30, overbought >70)
- **MACD (12,26,9)**: Trend-following momentum
- **Bollinger Bands (20,2)**: Volatility bands around SMA
- **VWAP**: Volume Weighted Average Price
- **ATR**: Average True Range for volatility

### Prediction Bot (Simulated Neural Network)
Simplified ML simulation:
- Xavier weight initialization
- ReLU/Tanh activation functions
- Forward pass only (no training)
- Feature engineering from price history

### Market Analyzer (Statistical Analysis)
- Whale detection: >3% sudden price moves
- Volatility: Standard deviation / mean
- Fear/Greed Index: Custom sentiment calculation

## 📦 Installation

```bash
git clone https://github.com/duckonmonad/duckmon-agents.git
cd duckmon-agents
npm install
```

## ⚙️ Configuration

Create a `.env` file:

```env
# Required
PRIVATE_KEY=your_wallet_private_key

# Smart Contracts (Monad Mainnet)
DUCK_SIGNALS_ADDRESS=0x...
DUCK_TOKEN_ADDRESS=0xabe04b5fee8f70cccfad9634a48a7f21c6acb1ec

# Optional
UPDATE_INTERVAL=30000
```

## 🚀 Usage

### Run All Agents
```bash
npm start
```

### Run Individual Agents
```bash
npm run trading-oracle
npm run prediction-bot
npm run market-analyzer
```

### Run with Custom Token
```bash
TOKEN_ADDRESS=0x... npm start
```

## 🔗 Integration

These agents post signals to the **DuckSignals** smart contract, which the frontend reads via wagmi hooks:

```
Agent → Analyze → Generate Signal → Post to DuckSignals → Frontend Reads
```

## 📁 Structure

```
duckmon-agents/
├── trading-oracle/      # Technical analysis signals
├── prediction-bot/      # Price predictions
├── market-analyzer/     # Market health monitoring
├── shared/              # Common utilities
├── contracts/           # ABI files
└── orchestrator.mjs     # Multi-agent runner
```

## ⚠️ Security

- **NEVER** commit your `.env` file
- Use a dedicated wallet for agent operations
- Start with testnet before mainnet

## 📄 License

MIT - Use at your own risk
