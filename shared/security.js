// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                      🔒 DUCKMON SECURITY UTILITIES                           ║
// ║              Security, Validation & Risk Management Tools                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Validate Ethereum address
 */
export function isValidAddress(address) {
    if (typeof address !== 'string') return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate private key format
 */
export function isValidPrivateKey(key) {
    if (typeof key !== 'string') return false;
    const cleaned = key.startsWith('0x') ? key.slice(2) : key;
    return /^[a-fA-F0-9]{64}$/.test(cleaned);
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>'"]/g, '').trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ══════════════════════════════════════════════════════════════════════════════

class RateLimiter {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map();
    }

    checkLimit(identifier) {
        const now = Date.now();
        const userRequests = this.requests.get(identifier) || [];

        // Remove old requests outside the window
        const validRequests = userRequests.filter(time => now - time < this.windowMs);

        if (validRequests.length >= this.maxRequests) {
            return {
                allowed: false,
                retryAfter: Math.ceil((validRequests[0] + this.windowMs - now) / 1000),
            };
        }

        validRequests.push(now);
        this.requests.set(identifier, validRequests);

        return { allowed: true, remaining: this.maxRequests - validRequests.length };
    }

    reset(identifier) {
        this.requests.delete(identifier);
    }
}

// Default rate limiters
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
export const txRateLimiter = new RateLimiter(10, 60000);   // 10 txs per minute

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTION SECURITY
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate slippage protection
 */
export function calculateMinAmountOut(expectedAmount, slippagePercent) {
    const slippageMultiplier = (100 - slippagePercent) / 100;
    return Math.floor(expectedAmount * slippageMultiplier);
}

/**
 * Validate transaction parameters
 */
export function validateTransaction(tx) {
    const errors = [];

    if (!isValidAddress(tx.to)) {
        errors.push('Invalid recipient address');
    }

    if (tx.value && typeof tx.value !== 'bigint' && tx.value < 0) {
        errors.push('Invalid transaction value');
    }

    if (tx.gasLimit && tx.gasLimit <= 0) {
        errors.push('Invalid gas limit');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Estimate safe gas limit with buffer
 */
export function calculateSafeGasLimit(estimatedGas, bufferPercent = 20) {
    const buffer = (estimatedGas * bufferPercent) / 100;
    return estimatedGas + buffer;
}

// ══════════════════════════════════════════════════════════════════════════════
// RISK MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Risk assessment for trading
 */
export function assessTradingRisk(params) {
    let riskScore = 0;
    const factors = [];

    // Factor 1: Position size
    if (params.positionSizeUSD > 10000) {
        riskScore += 30;
        factors.push('Large position size');
    } else if (params.positionSizeUSD > 5000) {
        riskScore += 15;
        factors.push('Medium position size');
    }

    // Factor 2: Slippage
    if (params.slippage > 2) {
        riskScore += 25;
        factors.push('High slippage');
    } else if (params.slippage > 1) {
        riskScore += 10;
        factors.push('Elevated slippage');
    }

    // Factor 3: Volatility
    if (params.volatility > 10) {
        riskScore += 20;
        factors.push('High market volatility');
    }

    // Factor 4: Liquidity
    if (params.liquidityUSD < 10000) {
        riskScore += 25;
        factors.push('Low liquidity');
    } else if (params.liquidityUSD < 50000) {
        riskScore += 10;
        factors.push('Medium liquidity');
    }

    // Risk level
    let level = 'LOW';
    if (riskScore >= 60) level = 'CRITICAL';
    else if (riskScore >= 40) level = 'HIGH';
    else if (riskScore >= 20) level = 'MEDIUM';

    return {
        score: riskScore,
        level,
        factors,
        recommendation: level === 'CRITICAL' ? 'AVOID' : level === 'HIGH' ? 'CAUTION' : 'PROCEED',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// ENCRYPTION & KEY MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Encrypt sensitive data
 */
export function encrypt(text, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
        iv: iv.toString('hex'),
        data: encrypted,
    };
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encrypted, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = Buffer.from(encrypted.iv, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Hash sensitive data
 */
export function hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// ══════════════════════════════════════════════════════════════════════════════
// HONEYPOT DETECTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Basic honeypot detection checks
 */
export function checkHoneypotIndicators(tokenData) {
    const warnings = [];
    let suspicionScore = 0;

    // Check 1: High owner balance
    if (tokenData.ownerBalancePercent > 50) {
        warnings.push('Owner holds >50% of supply');
        suspicionScore += 40;
    }

    // Check 2: No liquidity lock
    if (!tokenData.liquidityLocked) {
        warnings.push('Liquidity not locked');
        suspicionScore += 30;
    }

    // Check 3: Suspicious functions in contract
    if (tokenData.hasSuspiciousFunctions) {
        warnings.push('Contract has suspicious functions');
        suspicionScore += 30;
    }

    // Check 4: Cannot sell (simulated check)
    if (tokenData.cannotSell) {
        warnings.push('CANNOT SELL - HONEYPOT!');
        suspicionScore = 100;
    }

    return {
        isHoneypot: suspicionScore >= 70,
        suspicionScore,
        warnings,
        safe: suspicionScore < 30,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ══════════════════════════════════════════════════════════════════════════════

class AuditLogger {
    constructor() {
        this.logs = [];
    }

    log(event, data) {
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            data: this.sanitizeLogData(data),
        };

        this.logs.push(entry);

        // Keep last 10000 logs
        if (this.logs.length > 10000) {
            this.logs.shift();
        }
    }

    sanitizeLogData(data) {
        // Remove sensitive fields
        const sanitized = { ...data };
        delete sanitized.privateKey;
        delete sanitized.password;
        delete sanitized.secret;
        return sanitized;
    }

    getLogs(filter = {}) {
        let filtered = this.logs;

        if (filter.event) {
            filtered = filtered.filter(log => log.event === filter.event);
        }

        if (filter.since) {
            filtered = filtered.filter(log => new Date(log.timestamp) >= filter.since);
        }

        return filtered;
    }
}

export const auditLogger = new AuditLogger();

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

export default {
    // Validation
    isValidAddress,
    isValidPrivateKey,
    sanitizeInput,

    // Rate limiting
    apiRateLimiter,
    txRateLimiter,
    RateLimiter,

    // Transaction security
    calculateMinAmountOut,
    validateTransaction,
    calculateSafeGasLimit,

    // Risk management
    assessTradingRisk,

    // Encryption
    encrypt,
    decrypt,
    hashData,

    // Honeypot detection
    checkHoneypotIndicators,

    // Audit logging
    auditLogger,
};
