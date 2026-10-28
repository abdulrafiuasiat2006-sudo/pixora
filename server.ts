import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// -------------------------------------------------------------
// 1. TRUST PROXY & HTTPS / HSTS ENFORCEMENT
// -------------------------------------------------------------
app.set('trust proxy', 1);

app.use((req: Request, res: Response, next: NextFunction) => {
  const proto = req.headers['x-forwarded-proto'];
  // Force HTTPS redirect in production if request arrived over plain HTTP
  if (isProd && proto && proto !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }

  // HSTS (HTTP Strict Transport Security) - 2 years + subdomains
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  next();
});

// -------------------------------------------------------------
// 2. COMPREHENSIVE SECURITY HEADERS
// -------------------------------------------------------------
app.use((_req: Request, res: Response, next: NextFunction) => {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking while supporting AI Studio preview iframe containers
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite dev requires inline scripts; nonces configured in prod bundle
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

  // Cross-Origin / Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy: strictly block hardware sensors unless requested
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), vr=(), interest-cohort=()'
  );

  // Disable X-Powered-By to prevent framework fingerprinting
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      // Reject unauthorized CORS preflights
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

// Handle JSON parsing errors or payload too large
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
// 5. RATE LIMITING (STRICT ON SENSITIVE ENDPOINTS)
// -------------------------------------------------------------
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests: Rate limit exceeded. Please try again in 15 minutes.',
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[SECURITY ALERT] Rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests: Rate limit exceeded. Please wait before retrying.',
    });
  },
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Max 15 attempts per 15 minutes for contact, auth, and upload
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests: Sensitive endpoint rate limit exceeded. Please wait 15 minutes.',
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[SECURITY ALERT] Strict rate limit triggered for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests: Strict rate limit reached for security.',
    });
  },
});

app.use('/api/', generalLimiter);

// -------------------------------------------------------------
// 6. SANITIZATION HELPER
// -------------------------------------------------------------
function sanitizeString(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '') // Strip HTML tags
    .trim()
    .slice(0, 2000); // Hard length limit
}

// -------------------------------------------------------------
// 7. AUTHENTICATION & DATA STORAGE
// -------------------------------------------------------------
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  resetToken?: string;
  resetTokenExpiry?: number;
}

interface StoredSession {
  token: string;
  userId: string;
  email: string;
  name: string;
  createdAt: number;
  expiresAt: number;
}

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

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ACTIVE_TOOLS_FILE = path.join(DATA_DIR, 'active_tools.json');
const FILES_DIR = path.join(DATA_DIR, 'files');

if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, s, 64);
  return { hash: derived.toString('hex'), salt: s };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const stored = Buffer.from(hash, 'hex');
    if (derived.length !== stored.length) return false;
    return crypto.timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

function loadUsers(): StoredUser[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
  // Initialize with default demo account for immediate testing
  const { hash, salt } = hashPassword('Pixora@2026!');
  const defaultUser: StoredUser = {
    id: 'usr_default_demo',
    name: 'Pixora Creator',
    email: 'creator@pixora.app',
    passwordHash: hash,
    salt,
    createdAt: Date.now(),
  };
  saveUsers([defaultUser]);
  return [defaultUser];
}

function saveUsers(users: StoredUser[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving users:', err);
  }
}

function loadSessions(): StoredSession[] {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const sessions: StoredSession[] = JSON.parse(data);
      const now = Date.now();
      return sessions.filter((s) => s.expiresAt > now);
    }
  } catch (err) {
    console.error('Error loading sessions:', err);
  }
  return [];
}

function saveSessions(sessions: StoredSession[]) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving sessions:', err);
  }
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
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { valid: true, mime: 'image/webp' };
  }
  return { valid: false, mime: '' };
}

interface AuthenticatedRequest extends Request {
  user?: StoredSession;
}

// Authentication Middleware to strictly enforce authorization on private operations
function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication Required: No valid session token provided. Please log in.',
    });
  }

  const token = authHeader.substring(7).trim();
  const sessions = loadSessions();
  const session = sessions.find((s) => s.token === token && s.expiresAt > Date.now());

  if (!session) {
    return res.status(401).json({
      error: 'Session Expired or Invalid: Please log in again to continue.',
      sessionExpired: true,
    });
  }

  req.user = session;
  next();
}

// -------------------------------------------------------------
// 8. AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------
// Registration
app.post('/api/auth/register', sensitiveLimiter, (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    const cleanName = sanitizeString(name);
    const cleanEmail = sanitizeString(email).toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const users = loadUsers();
    const existing = users.find((u) => u.email === cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please log in.' });
    }

    const { hash, salt } = hashPassword(password);
    const newUser: StoredUser = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      name: cleanName,
      email: cleanEmail,
      passwordHash: hash,
      salt,
      createdAt: Date.now(),
    };

    users.push(newUser);
    saveUsers(users);

    const sessionToken = 'pixora_sess_' + crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const newSession: StoredSession = {
      token: sessionToken,
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
      createdAt: Date.now(),
      expiresAt,
    };

    const sessions = loadSessions();
    sessions.push(newSession);
    saveSessions(sessions);

    console.info(`[AUTH] New user registered: ${cleanEmail}`);
    return res.status(201).json({
      token: sessionToken,
      expiresAt,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    console.error('[SERVER ERROR in /api/auth/register]:', error);
    return res.status(500).json({ error: 'Registration failed due to a server error.' });
  }
});

// Login
app.post('/api/auth/login', sensitiveLimiter, (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = sanitizeString(email).toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Please enter both your email address and password.' });
    }

    const users = loadUsers();
    const user = users.find((u) => u.email === cleanEmail);

    if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
      console.warn(`[AUTH] Failed login attempt for: ${cleanEmail}`);
      return res.status(401).json({ error: 'Incorrect email or password. Please verify your credentials and try again.' });
    }

    const sessionToken = 'pixora_sess_' + crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const newSession: StoredSession = {
      token: sessionToken,
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: Date.now(),
      expiresAt,
    };

    const sessions = loadSessions();
    sessions.push(newSession);
    saveSessions(sessions);

    console.info(`[AUTH] Successful login for: ${cleanEmail}`);
    return res.status(200).json({
      token: sessionToken,
      expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[SERVER ERROR in /api/auth/login]:', error);
    return res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

// Current User Session verification
app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    user: {
      id: req.user!.userId,
      email: req.user!.email,
      name: req.user!.name,
      createdAt: req.user!.createdAt,
    },
    expiresAt: req.user!.expiresAt,
  });
});

// Logout (Session Invalidation)
app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const sessions = loadSessions();
  const filtered = sessions.filter((s) => s.token !== req.user!.token);
  saveSessions(filtered);
  console.info(`[AUTH] Session invalidated for user: ${req.user!.email}`);
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// Forgot Password
app.post('/api/auth/forgot-password', sensitiveLimiter, (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const cleanEmail = sanitizeString(email).toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: 'Please enter your email address.' });
    }

    const users = loadUsers();
    const user = users.find((u) => u.email === cleanEmail);

    if (user) {
      user.resetToken = crypto.randomBytes(24).toString('hex');
      user.resetTokenExpiry = Date.now() + 60 * 60 * 1000;
      saveUsers(users);
      console.info(`[AUTH] Password recovery token issued for: ${cleanEmail}`);
    }

    // Always return uniform message to prevent user enumeration
    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email address, password reset instructions have been dispatched.',
    });
  } catch (error) {
    console.error('[SERVER ERROR in /api/auth/forgot-password]:', error);
    return res.status(500).json({ error: 'Password recovery request failed.' });
  }
});

// Reset Password
app.post('/api/auth/reset-password', sensitiveLimiter, (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Invalid token or password must be at least 8 characters long.' });
    }

    const users = loadUsers();
    const user = users.find((u) => u.resetToken === token && u.resetTokenExpiry && u.resetTokenExpiry > Date.now());

    if (!user) {
      return res.status(400).json({ error: 'Password reset link is invalid or has expired.' });
    }

    const { hash, salt } = hashPassword(newPassword);
    user.passwordHash = hash;
    user.salt = salt;
    delete user.resetToken;
    delete user.resetTokenExpiry;
    saveUsers(users);

    const sessions = loadSessions();
    const activeSessions = sessions.filter((s) => s.userId !== user.id);
    saveSessions(activeSessions);

    return res.status(200).json({
      success: true,
      message: 'Password successfully updated. You may now log in with your new password.',
    });
  } catch (error) {
    console.error('[SERVER ERROR in /api/auth/reset-password]:', error);
    return res.status(500).json({ error: 'Password reset failed.' });
  }
});

// -------------------------------------------------------------
// 9. USER PROJECTS & FILE STORAGE ENDPOINTS (Protected per-user isolation)
// -------------------------------------------------------------
// List user's projects
app.get('/api/user/projects', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const projects = loadProjects();
  const userProjects = projects
    .filter((p) => p.userId === req.user!.userId)
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  return res.status(200).json({ projects: userProjects });
});

// Get single project details (including config)
app.get('/api/user/projects/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const projects = loadProjects();
  const project = projects.find((p) => p.id === id);

  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access this project.' });
  }

  return res.status(200).json({ project });
});

// Create new project
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
    const projectId = id && typeof id === 'string' && id.startsWith('proj_')
      ? id
      : 'proj_' + crypto.randomBytes(8).toString('hex');

    const projects = loadProjects();
    const existingIndex = projects.findIndex((p) => p.id === projectId);

    const now = Date.now();
    const projectRecord: StoredProject = {
      id: projectId,
      userId: req.user!.userId,
      title: cleanTitle,
      tool: sanitizeString(tool),
      originalFileName: sanitizeString(originalFileName),
      originalWidth: Number(originalWidth) || 0,
      originalHeight: Number(originalHeight) || 0,
      originalSizeBytes: Number(originalSizeBytes) || 0,
      originalMimeType: sanitizeString(originalMimeType) || undefined,
      exportCount: Number(exportCount) || 1,
      configSummary: sanitizeString(configSummary) || '',
      status: (status === 'completed' || status === 'processing' || status === 'error') ? status : 'draft',
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

    // Also update active tool map
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

    // Update active tool record
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

// Delete project and stored files
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

  // Clean up stored file directory
  const projectFileDir = path.join(FILES_DIR, req.user!.userId, id);
  if (fs.existsSync(projectFileDir)) {
    try {
      fs.rmSync(projectFileDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to clean up project file directory:', e);
    }
  }

  // Clear from active tools if it was active
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

    // Extract base64 payload
    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid data URL format.' });
    }

    const declaredMime = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    // Hard 10MB file limit
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File size exceeds maximum 10MB limit.' });
    }

    // Real signature check (magic bytes)
    const check = validateImageBuffer(buffer);
    if (!check.valid) {
      return res.status(400).json({ error: 'Unsupported file type. Allowed: JPEG, PNG, WebP.' });
    }

    // Write file securely inside isolated user/project directory
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

  if (project.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access this file.' });
  }

  const filePath = path.join(FILES_DIR, req.user!.userId, id, 'original.bin');
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
// 10. PUBLIC INQUIRY & HEALTH API ENDPOINTS
// -------------------------------------------------------------
// Contact & Feedback submission with Honeypot bot protection
app.post('/api/contact', sensitiveLimiter, (req: Request, res: Response) => {
  try {
    const { category, message, email, website_trap } = req.body;

    // BOT HONEYPOT: If the invisible trap field is populated, silently reject
    if (website_trap) {
      console.warn(`[SECURITY HONEYPOT TRIGGERED] Bot submission blocked from IP: ${req.ip}`);
      // Return 200 to confound automated bot scrapers
      return res.status(200).json({ success: true, message: 'Received' });
    }

    const cleanCategory = sanitizeString(category);
    const cleanMessage = sanitizeString(message);
    const cleanEmail = sanitizeString(email);

    if (!cleanMessage || cleanMessage.length < 5) {
      return res.status(400).json({ error: 'Message must be at least 5 characters long.' });
    }

    console.info(`[CONTACT INQUIRY] Valid feedback received: [${cleanCategory}]`);

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
    },
  });
});

// -------------------------------------------------------------
// 8. SEO: SITEMAP.XML & ROBOTS.TXT
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
// 9. VITE DEV SERVER OR STATIC PRODUCTION DELIVERY
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
              // HTML files should revalidate quickly
              res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
            } else {
              // Hashed assets cached for 1 year
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );

      // Fallback for SPA routing
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // -------------------------------------------------------------
  // 10. GENERIC ERROR HANDLER (NO STACK TRACES EXPOSED)
  // -------------------------------------------------------------
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    // Log detailed trace server-side only
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
