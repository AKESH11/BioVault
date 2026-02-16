const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
require('dotenv').config();

// Sentry MUST be initialised before any other app code to capture all errors
const Sentry = require('./utils/sentry');

const logger = require('./utils/logger');
const web3Routes = require('./routes/web3');
const ipfsRoutes = require('./routes/ipfs');
const mediaRoutes = require('./routes/media');
const zkpRoutes = require('./routes/zkp');
const authRoutes = require('./routes/auth');
const { txQueueMiddleware } = require('./middleware/txQueue');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// HTTPS auto-detection: use HTTPS if cert files exist, else HTTP
// ============================================================================
const CERT_DIR = path.join(__dirname, '../certs');
const certPath = path.join(CERT_DIR, 'server.crt');
const keyPath = path.join(CERT_DIR, 'server.key');
const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath);

let server;
if (useHttps) {
    const sslOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
    };
    server = https.createServer(sslOptions, app);
    logger.info('HTTPS enabled (certs loaded from backend/certs/)');
} else {
    server = http.createServer(app);
    logger.info('HTTP mode (no certs found at backend/certs/server.crt + server.key)');
}

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// CORS
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
app.use(morgan('combined', { stream: logger.stream }));

// Rate limiting (relaxed in development for E2E tests)
const isDev = process.env.NODE_ENV !== 'production';
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDev ? 1000 : 100,  // 1000 in dev, 100 in production
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// ============================================================================
// WebSocket Server — real-time event feed
// ============================================================================

const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set();

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.info(`WebSocket client connected from ${ip}`);
    wsClients.add(ws);

    ws.on('close', () => {
        wsClients.delete(ws);
        logger.info(`WebSocket client disconnected (${ip})`);
    });

    ws.on('error', (err) => {
        logger.error(`WebSocket error (${ip}):`, err.message);
        wsClients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
});

/**
 * Broadcast an event to all connected WebSocket clients.
 * @param {string} type - Event type (e.g. 'media:anchored', 'ipfs:uploaded')
 * @param {object} payload - Event data
 */
function broadcast(type, payload) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const ws of wsClients) {
        if (ws.readyState === ws.OPEN) {
            ws.send(message);
        }
    }
}

// Make broadcast available to route handlers via req.app
app.set('broadcast', broadcast);

// ============================================================================
// Routes
// ============================================================================

app.get('/', (req, res) => {
    res.json({
        name: 'Bio-Vault Protocol API',
        version: '1.0.0',
        status: 'operational',
        endpoints: {
            auth: {
                'POST /api/auth/register': 'Create a new user account',
                'POST /api/auth/login': 'Login and receive JWT tokens',
                'POST /api/auth/refresh': 'Refresh expired access token',
                'GET  /api/auth/me': 'Get current user profile',
            },
            web3: {
                'GET  /api/web3/wallet/status': 'Wallet address, balance, chain info',
                'GET  /api/web3/wallet/balance': 'Wallet POL balance',
                'GET  /api/web3/wallet/nonce': 'Current pending nonce',
                'GET  /api/web3/wallet/gas': 'Gas price estimates (slow/standard/fast)',
                'GET  /api/web3/contracts': 'Deployed contract addresses & status',
                'POST /api/web3/anchor': 'Anchor media to blockchain',
                'GET  /api/web3/verify/:mediaHash': 'Verify media authenticity',
                'GET  /api/web3/record/:mediaHash': 'Get full media record',
                'POST /api/web3/dispute': 'Dispute a media record',
                'POST /api/web3/revoke': 'Revoke a media record',
                'GET  /api/web3/creator/:address': 'Get media by creator',
                'GET  /api/web3/participant/:address': 'Get media by participant',
                'GET  /api/web3/disputes/:mediaHash': 'Get disputes for media',
                'GET  /api/web3/consent/:mediaHash/:address': 'Check consent',
                'POST /api/web3/mint': 'Mint soulbound authenticity token',
                'GET  /api/web3/token/:mediaHash': 'Get token by media hash',
                'GET  /api/web3/balance/:address': 'Get token balance'
            },
            ipfs: '/api/ipfs',
            media: '/api/media',
            zkp: '/api/zkp',
            health: '/health',
            ws: '/ws'
        }
    });
});

app.get('/health', async (req, res) => {
    const checks = {
        server: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
            heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
        },
        websockets: wsClients.size
    };

    // Check IPFS connectivity
    try {
        const axios = require('axios');
        const ipfsUrl = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
        const resp = await axios.post(`${ipfsUrl}/api/v0/version`, null, {
            timeout: 3000,
            headers: { 'Origin': 'http://localhost:3000' }
        });
        checks.ipfs = { status: 'connected', version: resp.data.Version };
    } catch {
        checks.ipfs = 'unavailable';
    }

    // Check blockchain RPC
    try {
        const { ethers } = require('ethers');
        const rpc = process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';
        const provider = new ethers.JsonRpcProvider(rpc);
        const blockNumber = await provider.getBlockNumber();
        checks.blockchain = { status: 'connected', block: blockNumber };
    } catch {
        checks.blockchain = { status: 'unavailable' };
    }

    const overallHealthy = checks.server === 'healthy';
    res.status(overallHealthy ? 200 : 503).json(checks);
});

// Transaction queue stats endpoint
app.get('/api/web3/txqueue/stats', (req, res) => {
    const { txQueue } = require('./middleware/txQueue');
    res.json(txQueue.getStats());
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/web3', txQueueMiddleware, web3Routes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/zkp', zkpRoutes);

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// Sentry error handler (must be before the global error handler)
if (process.env.SENTRY_DSN) {
    app.use(Sentry.expressErrorHandler());
}

// Global error handler
app.use((err, req, res, _next) => {
    logger.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================================================
// Server Startup
// ============================================================================

server.listen(PORT, () => {
    const proto = useHttps ? 'https' : 'http';
    logger.info(`Bio-Vault Backend Server running on ${proto}://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Network: ${process.env.POLYGON_RPC_URL ? 'Polygon Amoy' : 'Local'}`);
    logger.info(`WebSocket: ${useHttps ? 'wss' : 'ws'}://localhost:${PORT}/ws`);
    logger.info(`Health: ${proto}://localhost:${PORT}/health`);

    if (!process.env.DEPLOYER_PRIVATE_KEY) {
        logger.warn('DEPLOYER_PRIVATE_KEY not set — blockchain write operations disabled');
    }
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

function gracefulShutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully`);

    // Close WebSocket connections
    for (const ws of wsClients) {
        ws.close(1001, 'Server shutting down');
    }
    wss.close();

    // Close HTTP server (stop accepting new connections)
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });

    // Force exit after 10s if connections hang
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
});

module.exports = { app, server, broadcast };
