/**
 * SQLite-backed User Store
 *
 * Uses better-sqlite3 for fast synchronous queries.
 * Database file: backend/data/biovault.db
 * Auto-migrates from legacy users.json on first run.
 *
 * API is the same as the previous file-based store so all
 * existing auth routes continue to work without changes.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'biovault.db');
const LEGACY_JSON = path.join(DATA_DIR, 'users.json');
const BCRYPT_ROUNDS = 12;

class UserStore {
    constructor() {
        this._ensureDataDir();
        this.db = new Database(DB_PATH);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this._migrate();
        this._importLegacy();
    }

    _ensureDataDir() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    /** Create tables if they don't exist */
    _migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                email       TEXT UNIQUE NOT NULL COLLATE NOCASE,
                passwordHash TEXT NOT NULL,
                role        TEXT NOT NULL DEFAULT 'user',
                createdAt   TEXT NOT NULL,
                lastLogin   TEXT
            );

            CREATE TABLE IF NOT EXISTS anchor_records (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                mediaHash   TEXT NOT NULL,
                ipfsCid     TEXT,
                txHash      TEXT,
                anchoredAt  TEXT NOT NULL,
                userId      TEXT,
                metadata    TEXT,
                FOREIGN KEY (userId) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_anchors_hash ON anchor_records(mediaHash);
        `);
        logger.info('SQLite: tables ready');
    }

    /** One-time import from legacy users.json, then delete it */
    _importLegacy() {
        try {
            if (!fs.existsSync(LEGACY_JSON)) return;
            const raw = fs.readFileSync(LEGACY_JSON, 'utf-8');
            const { users } = JSON.parse(raw);
            if (!Array.isArray(users) || users.length === 0) return;

            const insert = this.db.prepare(
                `INSERT OR IGNORE INTO users (id, email, passwordHash, role, createdAt, lastLogin)
                 VALUES (?, ?, ?, ?, ?, ?)`
            );
            const txn = this.db.transaction((rows) => {
                for (const u of rows) {
                    insert.run(u.id, u.email, u.passwordHash, u.role || 'user', u.createdAt, u.lastLogin || null);
                }
            });
            txn(users);
            fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated');
            logger.info(`SQLite: migrated ${users.length} user(s) from JSON store`);
        } catch (err) {
            logger.warn('Legacy import skipped:', err.message);
        }
    }

    // ----------------------------------------------------------------
    // Public API (same surface as the old file-based store)
    // ----------------------------------------------------------------

    /**
     * Create a new user
     * @param {string} email
     * @param {string} password - Plain text (will be hashed)
     * @param {string} [role='user']
     * @returns {object} User (without passwordHash)
     */
    async createUser(email, password, role = 'user') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email format');
        if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');

        const normalized = email.toLowerCase().trim();

        // Check duplicate
        const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
        if (existing) throw new Error('Email already registered');

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = {
            id: crypto.randomUUID(),
            email: normalized,
            passwordHash,
            role,
            createdAt: new Date().toISOString(),
            lastLogin: null,
        };

        this.db.prepare(
            `INSERT INTO users (id, email, passwordHash, role, createdAt, lastLogin)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(user.id, user.email, user.passwordHash, user.role, user.createdAt, user.lastLogin);

        logger.info(`User created: ${user.email} (${user.role})`);
        return this._sanitize(user);
    }

    /**
     * Authenticate a user by email + password
     * @returns {object|null}
     */
    async authenticate(email, password) {
        const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        const now = new Date().toISOString();
        this.db.prepare('UPDATE users SET lastLogin = ? WHERE id = ?').run(now, user.id);
        user.lastLogin = now;
        return this._sanitize(user);
    }

    /** Find user by ID */
    findById(id) {
        const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        return user ? this._sanitize(user) : null;
    }

    /** Find user by email */
    findByEmail(email) {
        const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
        return user ? this._sanitize(user) : null;
    }

    // ----------------------------------------------------------------
    // Anchor Records (new — for future use by media routes)
    // ----------------------------------------------------------------

    saveAnchorRecord(record) {
        return this.db.prepare(
            `INSERT INTO anchor_records (mediaHash, ipfsCid, txHash, anchoredAt, userId, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
            record.mediaHash,
            record.ipfsCid || null,
            record.txHash || null,
            record.anchoredAt || new Date().toISOString(),
            record.userId || null,
            record.metadata ? JSON.stringify(record.metadata) : null,
        );
    }

    getAnchorByHash(mediaHash) {
        return this.db.prepare('SELECT * FROM anchor_records WHERE mediaHash = ?').get(mediaHash);
    }

    /** Strip sensitive fields */
    _sanitize(user) {
        const { passwordHash, ...safe } = user;
        return safe;
    }
}

// Singleton
module.exports = new UserStore();
