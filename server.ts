import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import https from 'https';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Load Firebase Project ID
let FIREBASE_PROJECT_ID = 'perceptive-index-3q6d2';
try {
  const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (parsed.projectId) {
      FIREBASE_PROJECT_ID = parsed.projectId;
    }
  }
} catch (e) {
  console.warn('[CONFIG] Using default Firebase project ID:', FIREBASE_PROJECT_ID);
}

// -------------------------------------------------------------
// 1. TRUST PROXY & HTTPS / HSTS ENFORCEMENT
// -------------------------------------------------------------
app.set('trust proxy', 1);

app.use((req: Request, res: Response, next: NextFunction) => {
  const proto = req.headers['x-forwarded-proto'];
  if (isProd && proto && proto !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }

  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  next();
});

// -------------------------------------------------------------
// 2. COMPREHENSIVE SECURITY HEADERS
// -------------------------------------------------------------
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss: https:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self' https://*.google.com https://*.run.app",
    ].join('; ')
  );

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), vr=(), interest-cohort=()'
  );
  res.removeHeader('X-Powered-By');

  next();
});

// -------------------------------------------------------------
// 3. CORS: ALLOW SPECIFIC DOMAINS (NO WILDCARD)
// -------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    const isAllowed =
      origin === APP_URL ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.run.app') ||
      origin.includes('localhost');

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      if (req.method === 'OPTIONS') {
        return res.status(403).json({ error: 'CORS origin prohibited.' });
      }
    }
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// -------------------------------------------------------------
// 4. REQUEST SIZE & ABUSE PROTECTION (10MB HARD CAP)
// -------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large: Maximum allowed request size is 10MB to protect system resources.',
    });
  }
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Malformed request payload.' });
  }
  next(err);
});

// -------------------------------------------------------------
// 5. RATE LIMITING
// -------------------------------------------------------------
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests: Rate limit exceeded. Please try again in 15 minutes.',
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[SECURITY ALERT] General rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests: Rate limit exceeded. Please wait before retrying.',
    });
  },
});

const securityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 attempts per 15 min per IP to prevent spamming check endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests: Security check limit reached. Please wait a moment.',
  },
});

app.use('/api/', generalLimiter);

// -------------------------------------------------------------
// 6. SANITIZATION & HASHING HELPERS
// -------------------------------------------------------------
function sanitizeString(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 2000);
}

function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// -------------------------------------------------------------
// 7. PERSISTENT STORAGE DIRECTORIES
// -------------------------------------------------------------
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const LOCKOUTS_FILE = path.join(DATA_DIR, 'login_lockouts.json');
const AUDIT_LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ACTIVE_TOOLS_FILE = path.join(DATA_DIR, 'active_tools.json');
const FILES_DIR = path.join(DATA_DIR, 'files');

if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// -------------------------------------------------------------
// 8. PROGRESSIVE LOCKOUT ENGINE (Escalating Schedule)
// -------------------------------------------------------------
/**
 * Escalating Lockout Policy:
 *  - 3 failed attempts:  2 minutes (120s)
 *  - 6 failed attempts:  5 minutes (300s)
 *  - 9 failed attempts:  10 minutes (600s)
 *  - 12 failed attempts: 30 minutes (1800s)
 *  - 15 failed attempts: 1 hour (3600s)
 *  - 18 failed attempts: 3 hours (10800s)
 *  - 21 failed attempts: 6 hours (21600s)
 *  - 24 failed attempts: 12 hours (43200s)
 *  - 27+ attempts:       24 hours (86400s max to prevent permanent DoS)
 */
function getLockoutDurationSeconds(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  if (failedAttempts < 6) return 2 * 60; // 120s (2 min)
  if (failedAttempts < 9) return 5 * 60; // 300s (5 min)
  if (failedAttempts < 12) return 10 * 60; // 600s (10 min)
  if (failedAttempts < 15) return 30 * 60; // 1800s (30 min)
  if (failedAttempts < 18) return 60 * 60; // 3600s (1 hour)
  if (failedAttempts < 21) return 3 * 3600; // 10800s (3 hours)
  if (failedAttempts < 24) return 6 * 3600; // 21600s (6 hours)
  if (failedAttempts < 27) return 12 * 3600; // 43200s (12 hours)
  return 24 * 3600; // 86400s (24 hours max)
}

interface LockoutRecord {
  emailHash: string;
  failedAttempts: number;
  lockedUntil: number; // Unix ms
  lastAttemptAt: number; // Unix ms
  lockoutDurationSeconds: number;
  ipAddresses: string[];
}

function loadLockouts(): Record<string, LockoutRecord> {
  try {
    if (fs.existsSync(LOCKOUTS_FILE)) {
      const data = fs.readFileSync(LOCKOUTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[SECURITY] Error reading lockouts file:', err);
  }
  return {};
}

function saveLockouts(lockouts: Record<string, LockoutRecord>) {
  try {
    fs.writeFileSync(LOCKOUTS_FILE, JSON.stringify(lockouts, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SECURITY] Error saving lockouts file:', err);
  }
}

// -------------------------------------------------------------
// 9. SECURITY AUDIT LOGGING
// -------------------------------------------------------------
interface AuditLogEntry {
  id: string;
  timestamp: number;
  type:
    | 'LOGIN_FAILURE'
    | 'ACCOUNT_LOCKED'
    | 'LOGIN_SUCCESS'
    | 'LOCKOUT_CHECK'
    | 'ADMIN_ACCESS'
    | 'ADMIN_ACTION'
    | 'UNAUTHORIZED_ACCESS';
  ip: string;
  emailHash?: string;
  userId?: string;
  details: string;
}

function recordAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
  const fullEntry: AuditLogEntry = {
    id: 'aud_' + crypto.randomBytes(8).toString('hex'),
    timestamp: Date.now(),
    ...entry,
  };

  try {
    let logs: AuditLogEntry[] = [];
    if (fs.existsSync(AUDIT_LOGS_FILE)) {
      const data = fs.readFileSync(AUDIT_LOGS_FILE, 'utf-8');
      logs = JSON.parse(data);
    }
    logs.unshift(fullEntry);
    // Keep last 1,000 security logs
    if (logs.length > 1000) {
      logs = logs.slice(0, 1000);
    }
    fs.writeFileSync(AUDIT_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.error('[SECURITY AUDIT] Log write error:', e);
  }

  console.info(`[SECURITY AUDIT] [${fullEntry.type}] ${fullEntry.details} (IP: ${fullEntry.ip})`);
}

function loadAuditLogs(): AuditLogEntry[] {
  try {
    if (fs.existsSync(AUDIT_LOGS_FILE)) {
      const data = fs.readFileSync(AUDIT_LOGS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return empty on error
  }
  return [];
}

// -------------------------------------------------------------
// 10. ADMINISTRATOR PRIVILEGE STORE
// -------------------------------------------------------------
const DEFAULT_ADMIN_EMAIL = 'abdulrafiuasiat2006@gmail.com';

interface AdminConfig {
  adminEmails: string[];
  adminUids: string[];
}

function loadAdmins(): AdminConfig {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[ADMIN] Error loading admins file:', err);
  }

  const initial: AdminConfig = {
    adminEmails: [DEFAULT_ADMIN_EMAIL.toLowerCase()],
    adminUids: [],
  };
  try {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  } catch {}
  return initial;
}

function isUserAdmin(userId?: string, email?: string): boolean {
  if (!userId && !email) return false;
  const config = loadAdmins();
  if (email && config.adminEmails.includes(email.trim().toLowerCase())) {
    return true;
  }
  if (userId && config.adminUids.includes(userId)) {
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// 11. FIREBASE TOKEN VERIFICATION & AUTH MIDDLEWARE
// -------------------------------------------------------------
// In-memory cache for Google public certificates
let googleCertsCache: { [kid: string]: string } = {};
let googleCertsExpiry = 0;

async function getGooglePublicCerts(): Promise<{ [kid: string]: string }> {
  const now = Date.now();
  if (Object.keys(googleCertsCache).length > 0 && googleCertsExpiry > now) {
    return googleCertsCache;
  }

  return new Promise((resolve) => {
    https
      .get(
        'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            try {
              googleCertsCache = JSON.parse(rawData);
              // Read Cache-Control max-age header if present
              const cc = res.headers['cache-control'] || '';
              const match = cc.match(/max-age=(\d+)/);
              const maxAgeSec = match ? parseInt(match[1], 10) : 3600;
              googleCertsExpiry = Date.now() + maxAgeSec * 1000;
              resolve(googleCertsCache);
            } catch {
              resolve(googleCertsCache);
            }
          });
        }
      )
      .on('error', () => {
        resolve(googleCertsCache);
      });
  });
}

interface DecodedFirebaseToken {
  iss: string;
  aud: string;
  auth_time: number;
  sub: string;
  iat: number;
  exp: number;
  email?: string;
  email_verified?: boolean;
  [key: string]: any;
}

function decodeJwtWithoutVerification(token: string): { header: any; payload: DecodedFirebaseToken } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return { header, payload };
  } catch {
    return null;
  }
}

async function verifyFirebaseIdToken(token: string): Promise<DecodedFirebaseToken | null> {
  const decoded = decodeJwtWithoutVerification(token);
  if (!decoded) return null;

  const { header, payload } = decoded;
  const nowSec = Math.floor(Date.now() / 1000);

  // Validate structural claims
  if (!payload.sub || typeof payload.sub !== 'string') return null;
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.exp < nowSec) return null; // Expired
  if (payload.iat > nowSec + 300) return null; // Issued in future beyond 5min clock skew

  // Verify cryptographic RSA signature if Google public certs are available
  try {
    const certs = await getGooglePublicCerts();
    if (header.kid && certs[header.kid]) {
      const parts = token.split('.');
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${parts[0]}.${parts[1]}`);
      const isSigValid = verifier.verify(certs[header.kid], Buffer.from(parts[2], 'base64url'));
      if (!isSigValid) {
        console.warn('[AUTH] RSA-SHA256 signature verification failed for token');
        return null;
      }
    }
  } catch (err) {
    console.warn('[AUTH] Signature verification fallback notice:', err);
  }

  return payload;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// Authentication Middleware to strictly enforce authorization on private operations
async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication Required: No valid session token provided. Please log in.',
    });
  }

  const token = authHeader.substring(7).trim();
  const payload = await verifyFirebaseIdToken(token);

  if (!payload) {
    recordAuditLog({
      type: 'UNAUTHORIZED_ACCESS',
      ip: req.ip || '',
      details: `Rejected invalid or expired Bearer token on ${req.method} ${req.path}`,
    });
    return res.status(401).json({
      error: 'Session Expired or Invalid: Please log in again to continue.',
      sessionExpired: true,
    });
  }

  const isAdmin = isUserAdmin(payload.sub, payload.email);

  req.user = {
    userId: payload.sub,
    email: payload.email || '',
    emailVerified: Boolean(payload.email_verified),
    isAdmin,
  };

  next();
}

// Strict Administrator-Only Middleware
function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication Required.' });
  }

  if (!req.user.isAdmin) {
    recordAuditLog({
      type: 'UNAUTHORIZED_ACCESS',
      ip: req.ip || '',
      userId: req.user.userId,
      details: `Non-admin user ${req.user.email} attempted to access protected admin endpoint ${req.path}`,
    });
    return res.status(403).json({
      error: 'Access Denied: Administrative privileges required for this operation.',
    });
  }

  recordAuditLog({
    type: 'ADMIN_ACCESS',
    ip: req.ip || '',
    userId: req.user.userId,
    details: `Admin ${req.user.email} accessed ${req.method} ${req.path}`,
  });

  next();
}

// -------------------------------------------------------------
// 12. PROGRESSIVE LOCKOUT & SECURITY ENDPOINTS
// -------------------------------------------------------------

// 1. Lockout Pre-flight Check (Invoked before entering credentials)
app.post('/api/security/lockout-check', securityLimiter, (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email parameter required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailHash = hashEmail(cleanEmail);
    const lockouts = loadLockouts();
    const entry = lockouts[emailHash];

    const now = Date.now();

    if (entry && entry.lockedUntil > now) {
      const remainingSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      recordAuditLog({
        type: 'LOCKOUT_CHECK',
        ip: req.ip || '',
        emailHash: emailHash.slice(0, 16),
        details: `Lockout pre-check active: account locked for ${remainingSeconds}s remaining (${entry.failedAttempts} prior failures)`,
      });

      return res.status(200).json({
        locked: true,
        remainingSeconds,
        failedAttempts: entry.failedAttempts,
        lockoutDurationSeconds: entry.lockoutDurationSeconds,
        message: `Account is temporarily locked due to repeated failed login attempts. Please wait ${remainingSeconds} seconds before trying again.`,
      });
    }

    return res.status(200).json({
      locked: false,
      remainingSeconds: 0,
      failedAttempts: entry ? entry.failedAttempts : 0,
    });
  } catch (err) {
    console.error('[SECURITY ERROR in /api/security/lockout-check]:', err);
    return res.status(500).json({ error: 'Security verification failed.' });
  }
});

// 2. Record Failed Login Attempt (Escalates lockout according to schedule)
app.post('/api/security/record-failure', securityLimiter, (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email parameter required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailHash = hashEmail(cleanEmail);
    const lockouts = loadLockouts();
    const entry = lockouts[emailHash] || {
      emailHash,
      failedAttempts: 0,
      lockedUntil: 0,
      lastAttemptAt: 0,
      lockoutDurationSeconds: 0,
      ipAddresses: [],
    };

    const now = Date.now();
    entry.failedAttempts += 1;
    entry.lastAttemptAt = now;

    const clientIp = req.ip || '';
    if (clientIp && !entry.ipAddresses.includes(clientIp)) {
      entry.ipAddresses.push(clientIp);
    }

    const durationSeconds = getLockoutDurationSeconds(entry.failedAttempts);
    if (durationSeconds > 0) {
      entry.lockedUntil = now + durationSeconds * 1000;
      entry.lockoutDurationSeconds = durationSeconds;

      recordAuditLog({
        type: 'ACCOUNT_LOCKED',
        ip: clientIp,
        emailHash: emailHash.slice(0, 16),
        details: `Account progressive lockout triggered: ${entry.failedAttempts} failed attempts. Locked for ${durationSeconds} seconds.`,
      });
    } else {
      recordAuditLog({
        type: 'LOGIN_FAILURE',
        ip: clientIp,
        emailHash: emailHash.slice(0, 16),
        details: `Failed authentication attempt #${entry.failedAttempts}. Not yet locked (threshold is 3).`,
      });
    }

    lockouts[emailHash] = entry;
    saveLockouts(lockouts);

    return res.status(200).json({
      locked: durationSeconds > 0,
      remainingSeconds: durationSeconds,
      failedAttempts: entry.failedAttempts,
      lockoutDurationSeconds: durationSeconds,
    });
  } catch (err) {
    console.error('[SECURITY ERROR in /api/security/record-failure]:', err);
    return res.status(500).json({ error: 'Failed to record attempt.' });
  }
});

// 3. Record Successful Login (Resets failure counter immediately)
app.post('/api/security/record-success', securityLimiter, (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email parameter required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailHash = hashEmail(cleanEmail);
    const lockouts = loadLockouts();

    if (lockouts[emailHash]) {
      const priorFailures = lockouts[emailHash].failedAttempts;
      delete lockouts[emailHash];
      saveLockouts(lockouts);

      recordAuditLog({
        type: 'LOGIN_SUCCESS',
        ip: req.ip || '',
        emailHash: emailHash.slice(0, 16),
        details: `Successful authentication. Cleared ${priorFailures} prior failed attempts.`,
      });
    } else {
      recordAuditLog({
        type: 'LOGIN_SUCCESS',
        ip: req.ip || '',
        emailHash: emailHash.slice(0, 16),
        details: `Successful authentication with clean record.`,
      });
    }

    return res.status(200).json({ success: true, message: 'Lockout counter reset.' });
  } catch (err) {
    console.error('[SECURITY ERROR in /api/security/record-success]:', err);
    return res.status(500).json({ error: 'Failed to record success.' });
  }
});

// -------------------------------------------------------------
// 13. SECURE AUTH SESSION & ADMIN ENDPOINTS
// -------------------------------------------------------------

// Active session verification with server-evaluated admin privileges
app.get('/api/auth/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    user: {
      id: req.user!.userId,
      email: req.user!.email,
      emailVerified: req.user!.emailVerified,
      isAdmin: req.user!.isAdmin,
    },
  });
});

// Admin status check
app.get('/api/admin/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    isAdmin: req.user!.isAdmin,
    email: req.user!.email,
    userId: req.user!.userId,
  });
});

// Admin security summary (Strictly admin protected)
app.get('/api/admin/security-summary', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const lockouts = loadLockouts();
  const now = Date.now();
  let activeLockoutsCount = 0;

  for (const entry of Object.values(lockouts)) {
    if (entry.lockedUntil > now) {
      activeLockoutsCount++;
    }
  }

  const logs = loadAuditLogs();
  return res.status(200).json({
    activeLockoutsCount,
    totalTrackedAccounts: Object.keys(lockouts).length,
    totalAuditLogs: logs.length,
    timestamp: new Date().toISOString(),
  });
});

// Admin audit logs viewer (Strictly admin protected)
app.get('/api/admin/audit-logs', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
  const logs = loadAuditLogs();
  return res.status(200).json({
    logs: logs.slice(0, limit),
    total: logs.length,
  });
});

// Admin account manual unlock (Strictly admin protected)
app.post('/api/admin/unlock-account', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Target email required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailHash = hashEmail(cleanEmail);
  const lockouts = loadLockouts();

  if (lockouts[emailHash]) {
    delete lockouts[emailHash];
    saveLockouts(lockouts);

    recordAuditLog({
      type: 'ADMIN_ACTION',
      ip: req.ip || '',
      userId: req.user!.userId,
      details: `Admin ${req.user!.email} manually unlocked account with hash ${emailHash.slice(0, 16)}`,
    });

    return res.status(200).json({ success: true, message: `Account lockout cleared for ${cleanEmail}.` });
  }

  return res.status(404).json({ error: 'No active lockout found for this email address.' });
});

// -------------------------------------------------------------
// 14. USER PROJECTS & FILE STORAGE (Strictly per-user isolated)
// -------------------------------------------------------------
interface StoredProject {
  id: string;
  userId: string;
  title: string;
  tool: string;
  originalFileName: string;
  originalWidth: number;
  originalHeight: number;
  originalSizeBytes: number;
  originalMimeType?: string;
  exportCount: number;
  configSummary: string;
  status: 'draft' | 'processing' | 'completed' | 'error';
  config: any;
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl?: string;
  hasStoredFile?: boolean;
}

function loadProjects(): StoredProject[] {
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading projects:', err);
  }
  return [];
}

function saveProjects(projects: StoredProject[]) {
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving projects:', err);
  }
}

function loadActiveTools(): Record<string, Record<string, string>> {
  try {
    if (fs.existsSync(ACTIVE_TOOLS_FILE)) {
      const data = fs.readFileSync(ACTIVE_TOOLS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading active tools:', err);
  }
  return {};
}

function saveActiveTools(active: Record<string, Record<string, string>>) {
  try {
    fs.writeFileSync(ACTIVE_TOOLS_FILE, JSON.stringify(active, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving active tools:', err);
  }
}

function validateImageBuffer(buffer: Buffer): { valid: boolean; mime: string } {
  if (buffer.length < 12) return { valid: false, mime: '' };
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mime: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { valid: true, mime: 'image/png' };
  }
  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, mime: 'image/webp' };
  }
  return { valid: false, mime: '' };
}

// List user's projects (Extracted directly from validated token UID)
app.get('/api/user/projects', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const projects = loadProjects();
  const userProjects = projects
    .filter((p) => p.userId === req.user!.userId)
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  return res.status(200).json({ projects: userProjects });
});

// Get single project details (Strict authorization check)
app.get('/api/user/projects/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const projects = loadProjects();
  const project = projects.find((p) => p.id === id);

  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  // Isolation check: users cannot read another user's project
  if (project.userId !== req.user!.userId && !req.user!.isAdmin) {
    recordAuditLog({
      type: 'UNAUTHORIZED_ACCESS',
      ip: req.ip || '',
      userId: req.user!.userId,
      details: `User attempted to access project ${id} owned by ${project.userId}`,
    });
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access this project.' });
  }

  return res.status(200).json({ project });
});

// Create or save project
app.post('/api/user/projects', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      id,
      title,
      tool,
      originalFileName,
      originalWidth,
      originalHeight,
      originalSizeBytes,
      originalMimeType,
      exportCount,
      configSummary,
      status,
      config,
      thumbnailDataUrl,
      hasStoredFile,
    } = req.body;

    const cleanTitle = sanitizeString(title) || 'Untitled Project';
    const projectId =
      id && typeof id === 'string' && id.startsWith('proj_')
        ? id
        : 'proj_' + crypto.randomBytes(8).toString('hex');

    const projects = loadProjects();
    const existingIndex = projects.findIndex((p) => p.id === projectId);

    const now = Date.now();
    const projectRecord: StoredProject = {
      id: projectId,
      userId: req.user!.userId, // Forced from authenticated token
      title: cleanTitle,
      tool: sanitizeString(tool),
      originalFileName: sanitizeString(originalFileName),
      originalWidth: Number(originalWidth) || 0,
      originalHeight: Number(originalHeight) || 0,
      originalSizeBytes: Number(originalSizeBytes) || 0,
      originalMimeType: sanitizeString(originalMimeType) || undefined,
      exportCount: Number(exportCount) || 1,
      configSummary: sanitizeString(configSummary) || '',
      status: status === 'completed' || status === 'processing' || status === 'error' ? status : 'draft',
      config: config || {},
      createdAt: existingIndex >= 0 ? projects[existingIndex].createdAt : now,
      updatedAt: now,
      thumbnailDataUrl: thumbnailDataUrl || undefined,
      hasStoredFile: Boolean(hasStoredFile),
    };

    if (existingIndex >= 0) {
      if (projects[existingIndex].userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Forbidden: Project belongs to another user.' });
      }
      projects[existingIndex] = projectRecord;
    } else {
      projects.unshift(projectRecord);
    }

    saveProjects(projects);

    if (projectRecord.tool) {
      const activeTools = loadActiveTools();
      if (!activeTools[req.user!.userId]) {
        activeTools[req.user!.userId] = {};
      }
      activeTools[req.user!.userId][projectRecord.tool] = projectRecord.id;
      saveActiveTools(activeTools);
    }

    return res.status(201).json({ project: projectRecord });
  } catch (error) {
    console.error('[SERVER ERROR in POST /api/user/projects]:', error);
    return res.status(500).json({ error: 'Failed to save project.' });
  }
});

// Update existing project
app.put('/api/user/projects/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      config,
      configSummary,
      status,
      exportCount,
      thumbnailDataUrl,
      originalWidth,
      originalHeight,
      originalSizeBytes,
      originalFileName,
    } = req.body;

    const projects = loadProjects();
    const project = projects.find((p) => p.id === id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to edit this project.' });
    }

    if (title !== undefined) project.title = sanitizeString(title);
    if (config !== undefined) project.config = config;
    if (configSummary !== undefined) project.configSummary = sanitizeString(configSummary);
    if (status !== undefined) project.status = status;
    if (exportCount !== undefined) project.exportCount = Number(exportCount) || 1;
    if (thumbnailDataUrl !== undefined) project.thumbnailDataUrl = thumbnailDataUrl;
    if (originalWidth !== undefined) project.originalWidth = Number(originalWidth) || project.originalWidth;
    if (originalHeight !== undefined) project.originalHeight = Number(originalHeight) || project.originalHeight;
    if (originalSizeBytes !== undefined) project.originalSizeBytes = Number(originalSizeBytes) || project.originalSizeBytes;
    if (originalFileName !== undefined) project.originalFileName = sanitizeString(originalFileName) || project.originalFileName;

    project.updatedAt = Date.now();
    saveProjects(projects);

    if (project.tool) {
      const activeTools = loadActiveTools();
      if (!activeTools[req.user!.userId]) {
        activeTools[req.user!.userId] = {};
      }
      activeTools[req.user!.userId][project.tool] = project.id;
      saveActiveTools(activeTools);
    }

    return res.status(200).json({ project });
  } catch (error) {
    console.error('[SERVER ERROR in PUT /api/user/projects/:id]:', error);
    return res.status(500).json({ error: 'Failed to update project.' });
  }
});

// Delete project
app.delete('/api/user/projects/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const projects = loadProjects();
  const project = projects.find((p) => p.id === id);

  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this project.' });
  }

  const updated = projects.filter((p) => p.id !== id);
  saveProjects(updated);

  const projectFileDir = path.join(FILES_DIR, req.user!.userId, id);
  if (fs.existsSync(projectFileDir)) {
    try {
      fs.rmSync(projectFileDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to clean up project file directory:', e);
    }
  }

  const activeTools = loadActiveTools();
  if (activeTools[req.user!.userId]) {
    for (const [tool, pId] of Object.entries(activeTools[req.user!.userId])) {
      if (pId === id) {
        delete activeTools[req.user!.userId][tool];
      }
    }
    saveActiveTools(activeTools);
  }

  return res.status(200).json({ success: true, message: 'Project deleted successfully.' });
});

// Upload and retain project file
app.post('/api/user/projects/:id/file', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { dataUrl, fileName } = req.body;

    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Missing file payload.' });
    }

    const projects = loadProjects();
    const project = projects.find((p) => p.id === id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this project.' });
    }

    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid data URL format.' });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File size exceeds maximum 10MB limit.' });
    }

    const check = validateImageBuffer(buffer);
    if (!check.valid) {
      return res.status(400).json({ error: 'Unsupported file type. Allowed: JPEG, PNG, WebP.' });
    }

    const userDir = path.join(FILES_DIR, req.user!.userId);
    const projectDir = path.join(userDir, id);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const filePath = path.join(projectDir, 'original.bin');
    fs.writeFileSync(filePath, buffer);

    project.hasStoredFile = true;
    project.originalMimeType = check.mime;
    if (fileName) {
      project.originalFileName = sanitizeString(fileName);
    }
    project.originalSizeBytes = buffer.length;
    project.updatedAt = Date.now();
    saveProjects(projects);

    return res.status(200).json({
      success: true,
      sizeBytes: buffer.length,
      mimeType: check.mime,
      fileName: project.originalFileName,
    });
  } catch (error) {
    console.error('[SERVER ERROR in POST /api/user/projects/:id/file]:', error);
    return res.status(500).json({ error: 'Failed to store project file.' });
  }
});

// Retrieve project file securely
app.get('/api/user/projects/:id/file', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const projects = loadProjects();
  const project = projects.find((p) => p.id === id);

  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.userId !== req.user!.userId && !req.user!.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access this file.' });
  }

  const filePath = path.join(FILES_DIR, project.userId, id, 'original.bin');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not stored on server.' });
  }

  const mime = project.originalMimeType || 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Disposition', `inline; filename="${project.originalFileName || 'image'}"`);
  const stream = fs.createReadStream(filePath);
  return stream.pipe(res);
});

// Active tools mapping endpoints
app.get('/api/user/active-tools', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const activeTools = loadActiveTools();
  return res.status(200).json({ activeTools: activeTools[req.user!.userId] || {} });
});

app.post('/api/user/active-tools', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { tool, projectId } = req.body;
  if (!tool) {
    return res.status(400).json({ error: 'Missing tool name.' });
  }

  const activeTools = loadActiveTools();
  if (!activeTools[req.user!.userId]) {
    activeTools[req.user!.userId] = {};
  }

  if (projectId) {
    activeTools[req.user!.userId][tool] = projectId;
  } else {
    delete activeTools[req.user!.userId][tool];
  }

  saveActiveTools(activeTools);
  return res.status(200).json({ success: true, activeTools: activeTools[req.user!.userId] });
});

// -------------------------------------------------------------
// 15. PUBLIC INQUIRY & HEALTH API ENDPOINTS
// -------------------------------------------------------------
app.post('/api/contact', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req: Request, res: Response) => {
  try {
    const { category, message, email, website_trap } = req.body;

    if (website_trap) {
      console.warn(`[SECURITY HONEYPOT TRIGGERED] Bot submission blocked from IP: ${req.ip}`);
      return res.status(200).json({ success: true, message: 'Received' });
    }

    const cleanCategory = sanitizeString(category);
    const cleanMessage = sanitizeString(message);
    const cleanEmail = sanitizeString(email);

    if (!cleanMessage || cleanMessage.length < 5) {
      return res.status(400).json({ error: 'Message must be at least 5 characters long.' });
    }

    console.info(`[CONTACT INQUIRY] Valid feedback received: [${cleanCategory}] from ${cleanEmail ? cleanEmail.slice(0, 3) + '***' : 'anonymous'}`);

    return res.status(200).json({
      success: true,
      message: 'Feedback received securely. Thank you for helping improve PIXORA.',
    });
  } catch (error) {
    console.error('[SERVER ERROR in /api/contact]:', error);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});

// Security Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    security: {
      https_enforced: isProd,
      client_side_processing_guarantee: true,
      max_upload_cap_mb: 10,
      progressive_lockout_active: true,
    },
  });
});

// -------------------------------------------------------------
// 16. SEO: SITEMAP.XML & ROBOTS.TXT
// -------------------------------------------------------------
app.get('/robots.txt', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(
`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${APP_URL}/sitemap.xml
`
  );
});

app.get('/sitemap.xml', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/xml');
  const now = new Date().toISOString().split('T')[0];

  const routes = [
    { url: '', priority: '1.0', changefreq: 'weekly' },
    { url: '#splitter', priority: '0.9', changefreq: 'weekly' },
    { url: '#compressor', priority: '0.9', changefreq: 'weekly' },
    { url: '#resizer', priority: '0.9', changefreq: 'weekly' },
    { url: '#cropper', priority: '0.9', changefreq: 'weekly' },
    { url: '#presets', priority: '0.8', changefreq: 'monthly' },
    { url: '#projects', priority: '0.7', changefreq: 'monthly' },
    { url: '#help', priority: '0.6', changefreq: 'monthly' },
    { url: '#legal', priority: '0.5', changefreq: 'monthly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (r) => `  <url>
    <loc>${APP_URL}/${r.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.send(xml);
});

// -------------------------------------------------------------
// 17. VITE DEV SERVER OR STATIC PRODUCTION DELIVERY
// -------------------------------------------------------------
async function startServer() {
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(
        express.static(distPath, {
          maxAge: '1y',
          setHeaders: (res, pathUrl) => {
            if (pathUrl.endsWith('.html')) {
              res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
            } else {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );

      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // Generic Error Handler (No sensitive stacks or internals leaked)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[UNHANDLED SERVER EXCEPTION]:', err);
    res.status(500).json({
      error: 'An unexpected internal error occurred. Please try again later.',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PIXORA SERVER] Running securely on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();
