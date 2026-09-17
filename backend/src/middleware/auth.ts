import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { dbAll, dbGet } from '../db/database';

let activeJwtSecret: string | null = null;

export function setJwtSecret(secret: string): void {
  if (secret && secret.trim()) {
    activeJwtSecret = secret.trim();
  }
}

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    return process.env.JWT_SECRET.trim();
  }
  if (activeJwtSecret) {
    return activeJwtSecret;
  }
  // Cryptographically secure ephemeral fallback if accessed prior to database initialization
  activeJwtSecret = crypto.randomBytes(32).toString('hex');
  return activeJwtSecret;
}

export const JWT_SECRET = {
  toString() {
    return getJwtSecret();
  },
  valueOf() {
    return getJwtSecret();
  },
  [Symbol.toPrimitive]() {
    return getJwtSecret();
  }
} as any as string;

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

/**
 * Hash a user PIN using cryptographically secure salted scrypt.
 * Stored format: `<16-byte-salt-hex>:<64-byte-derived-key-hex>`
 */
export function hashPin(pin: string): string {
  const cleanPin = String(pin).trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(cleanPin, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Securely verify a candidate PIN against a stored hash (or legacy plaintext for seamless upgrade).
 */
export function verifyPin(candidatePin: string, storedHashOrPlain: string): boolean {
  if (!candidatePin || !storedHashOrPlain) return false;
  const cleanCandidate = String(candidatePin).trim();

  // Salted scrypt hash format
  if (storedHashOrPlain.includes(':')) {
    const [salt, keyHex] = storedHashOrPlain.split(':');
    if (!salt || !keyHex) return false;
    try {
      const derivedKey = crypto.scryptSync(cleanCandidate, salt, 64);
      const keyBuffer = Buffer.from(keyHex, 'hex');
      if (keyBuffer.length !== derivedKey.length) return false;
      return crypto.timingSafeEqual(keyBuffer, derivedKey);
    } catch {
      return false;
    }
  }

  // Graceful fallback for legacy plaintext PIN
  return cleanCandidate === storedHashOrPlain.trim();
}

/**
 * Generate a signed JWT token for a logged-in user
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

/**
 * Extract and verify JWT token from Authorization header
 */
export function extractTokenUser(req: Request): TokenPayload | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  try {
    const decoded = jwt.verify(parts[1], getJwtSecret()) as TokenPayload;
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Verify whether the requester has admin/staff management privileges.
 * Validates either:
 * 1. A cryptographically verified JWT with admin/supervisor role or relevant permission.
 * 2. An admin/supervisor PIN verified against the database.
 * Explicitly rejects unverified header spoofing (x-user-role / x-user-id without verified token/PIN).
 */
export async function verifyAdminRequester(req: Request, requiredPermission: string = 'staff'): Promise<boolean> {
  // 1. Verify via signed JWT token
  const tokenUser = extractTokenUser(req);
  if (tokenUser) {
    if (tokenUser.role === 'admin' || tokenUser.role === 'supervisor') return true;
    if (tokenUser.permissions && tokenUser.permissions.includes(requiredPermission)) {
      return true;
    }
  }

  // 2. Verify via admin PIN if supplied
  const adminPin = (req.headers['x-admin-pin'] as string) || req.body?.admin_pin;
  if (adminPin && String(adminPin).trim()) {
    const users = await dbAll<{ id: string; role: string; pin: string; permissions: string }>(
      "SELECT id, role, pin, permissions FROM users WHERE role IN ('admin', 'supervisor')"
    );
    for (const u of users) {
      if (verifyPin(adminPin, u.pin)) {
        if (u.role === 'admin') return true;
        try {
          const perms: string[] = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
          if (Array.isArray(perms) && perms.includes(requiredPermission)) return true;
        } catch {}
        if (requiredPermission === 'pos') return true;
      }
    }
  }

  return false;
}

/**
 * Express middleware to enforce authentication via valid JWT
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const tokenUser = extractTokenUser(req);
  if (!tokenUser) {
    res.status(401).json({ error: 'Unauthorized: Valid authentication token required' });
    return;
  }
  req.user = tokenUser;
  next();
}

/**
 * Express middleware to enforce admin privileges
 */
export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const isAuthorized = await verifyAdminRequester(req, 'settings');
  if (!isAuthorized) {
    res.status(403).json({ error: 'Access Denied: Administrator privileges required' });
    return;
  }
  next();
}
