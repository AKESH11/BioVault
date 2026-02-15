/**
 * Authentication Routes
 *
 * POST /api/auth/register  — Create a new user account
 * POST /api/auth/login     — Login and receive JWT tokens
 * POST /api/auth/refresh   — Refresh an expired access token
 * GET  /api/auth/me        — Get current user profile (requires auth)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const userStore = require('../models/userStore');

const router = express.Router();

// ============================================================================
// JWT Configuration
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '-refresh';
const ACCESS_TOKEN_EXPIRY = '15m';   // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d';   // Longer-lived refresh token

if (JWT_SECRET === 'dev-secret-change-in-production') {
    logger.warn('JWT_SECRET not set — using insecure default. Set JWT_SECRET in .env for production!');
}

/**
 * Generate access + refresh tokens for a user
 */
function generateTokens(user) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_REFRESH_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRY };
}

// ============================================================================
// POST /register — Create account
// ============================================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await userStore.createUser(email, password);
        const tokens = generateTokens(user);

        logger.info(`User registered: ${user.email}`);
        res.status(201).json({ user, ...tokens });
    } catch (err) {
        if (err.message.includes('already registered') || err.message.includes('Invalid email') || err.message.includes('Password must')) {
            return res.status(400).json({ error: err.message });
        }
        logger.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================================================
// POST /login — Authenticate and receive tokens
// ============================================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await userStore.authenticate(email, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const tokens = generateTokens(user);

        logger.info(`User logged in: ${user.email}`);
        res.json({ user, ...tokens });
    } catch (err) {
        logger.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============================================================================
// POST /refresh — Get fresh access token with a valid refresh token
// ============================================================================
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid token type' });
        }

        const user = userStore.findById(decoded.sub);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const tokens = generateTokens(user);
        res.json(tokens);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Refresh token expired — please login again' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }
        logger.error('Token refresh error:', err);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// ============================================================================
// GET /me — Current user profile (requires JWT)
// ============================================================================
router.get('/me', (req, res) => {
    // This route uses the JWT middleware from auth.js
    // requireJwt should be applied before this in the router
    const { requireJwt } = require('../middleware/auth');
    // Since we can't add middleware inline easily, we manually verify
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = userStore.findById(decoded.sub);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
