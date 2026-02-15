/**
 * Authentication Middleware
 *
 * Supports two authentication strategies:
 *
 * 1. API Key  — `x-api-key` header (for service-to-service / mobile app)
 * 2. JWT      — `Authorization: Bearer <token>` (for per-user auth)
 *
 * requireAuth() accepts EITHER — useful during migration from API-key-only
 * to JWT.  requireJwt() requires a valid JWT specifically.
 *
 * Configuration (backend/.env):
 *   API_KEY=<your-secret>
 *   JWT_SECRET=<your-jwt-secret>
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-in-production';

let _warnedOnce = false;

// ============================================================================
// API Key middleware (legacy — still works for existing mobile app)
// ============================================================================

function requireApiKey(req, res, next) {
    const configuredKey = process.env.API_KEY;

    // In development without API_KEY set, allow all requests (warn once)
    if (!configuredKey) {
        if (!_warnedOnce) {
            logger.warn('API_KEY not set — authentication disabled. Set API_KEY in .env for production.');
            _warnedOnce = true;
        }
        return next();
    }

    const provided = req.headers['x-api-key'];

    if (!provided) {
        return res.status(401).json({ error: 'Missing x-api-key header' });
    }

    // Constant-time comparison to prevent timing attacks
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(configuredKey, 'utf8');

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        logger.warn(`Rejected invalid API key from ${req.ip}`);
        return res.status(403).json({ error: 'Invalid API key' });
    }

    next();
}

// ============================================================================
// JWT middleware (new per-user authentication)
// ============================================================================

function requireJwt(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET());
        req.user = { id: decoded.sub, email: decoded.email, role: decoded.role };
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        logger.warn(`JWT rejected from ${req.ip}: ${err.message}`);
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// ============================================================================
// Combined middleware — accepts EITHER API key OR JWT (migration bridge)
// ============================================================================

function requireAuth(req, res, next) {
    const configuredKey = process.env.API_KEY;
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    // In development without API_KEY set AND no JWT_SECRET, allow all (warn once)
    if (!configuredKey && JWT_SECRET() === 'dev-secret-change-in-production') {
        if (!_warnedOnce) {
            logger.warn('No API_KEY or JWT_SECRET set — auth disabled. Configure in .env for production.');
            _warnedOnce = true;
        }
        return next();
    }

    // Try JWT first
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET());
            req.user = { id: decoded.sub, email: decoded.email, role: decoded.role };
            return next();
        } catch (err) {
            // JWT provided but invalid — don't fall through to API key
            logger.warn(`JWT rejected from ${req.ip}: ${err.message}`);
            return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' });
        }
    }

    // Try API key
    if (apiKeyHeader && configuredKey) {
        const a = Buffer.from(apiKeyHeader, 'utf8');
        const b = Buffer.from(configuredKey, 'utf8');

        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            return next();
        }

        logger.warn(`Rejected invalid API key from ${req.ip}`);
        return res.status(403).json({ error: 'Invalid API key' });
    }

    // Nothing provided
    return res.status(401).json({ error: 'Authentication required — provide x-api-key or Authorization: Bearer <token>' });
}

// ============================================================================
// Role-based access control (requires JWT)
// ============================================================================

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
        }
        next();
    };
}

module.exports = { requireApiKey, requireJwt, requireAuth, requireRole };
