const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const web3Routes = require('./routes/web3');
const ipfsRoutes = require('./routes/ipfs');
const mediaRoutes = require('./routes/media');
const zkpRoutes = require('./routes/zkp');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// ============================================================================
// Routes
// ============================================================================

app.get('/', (req, res) => {
    res.json({
        name: 'Bio-Vault Protocol API',
        version: '1.0.0',
        status: 'operational',
        endpoints: {
            web3: '/api/web3',
            ipfs: '/api/ipfs',
            media: '/api/media',
            zkp: '/api/zkp'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/web3', web3Routes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/zkp', zkpRoutes);

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, () => {
    logger.info(`🚀 Bio-Vault Backend Server running on port ${PORT}`);
    logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔗 Network: ${process.env.POLYGON_RPC_URL ? 'Polygon' : 'Local'}`);
});

module.exports = app;
