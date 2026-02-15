/**
 * Sentry Error Tracking
 *
 * Initialises Sentry for the backend server.
 * Set SENTRY_DSN in .env to enable. Without a DSN, Sentry is a no-op.
 *
 * Usage:
 *   require('./utils/sentry');           // top of index.js (before Express)
 *   Sentry.captureException(err);        // anywhere
 *   app.use(Sentry.expressErrorHandler()); // after routes
 */

const Sentry = require('@sentry/node');
const logger = require('./logger');

const dsn = process.env.SENTRY_DSN || '';

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        release: `biovault-backend@${process.env.npm_package_version || '1.0.0'}`,
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        // Scrub PII — don't send request bodies that may contain passwords
        beforeSend(event) {
            if (event.request && event.request.data) {
                const body = event.request.data;
                if (typeof body === 'object') {
                    if (body.password) body.password = '[FILTERED]';
                    if (body.refreshToken) body.refreshToken = '[FILTERED]';
                }
            }
            return event;
        },
    });
    logger.info('Sentry: initialized');
} else {
    logger.info('Sentry: disabled (no SENTRY_DSN)');
}

module.exports = Sentry;
