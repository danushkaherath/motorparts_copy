import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun } from '../db/database';
import { generateToken, verifyAdminRequester, hashPin, verifyPin } from '../middleware/auth';

export const authRouter = Router();

// PIN Login for Cashier or Admin
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pin, username } = req.body;
    if (!pin) {
      res.status(400).json({ error: 'PIN is required' });
      return;
    }

    let user: any = null;
    const cleanPin = String(pin).trim();

    if (username && String(username).trim()) {
      const candidate = await dbGet<any>(
        'SELECT id, username, pin, role, permissions FROM users WHERE LOWER(username) = LOWER(?)',
        [String(username).trim()]
      );
      if (candidate && verifyPin(cleanPin, candidate.pin)) {
        user = candidate;
      }
    } else {
      // Find matching user by PIN across staff accounts
      const allUsers = await dbAll<any>('SELECT id, username, pin, role, permissions FROM users');
      for (const u of allUsers) {
        if (verifyPin(cleanPin, u.pin)) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid PIN or username' });
      return;
    }

    // Auto-upgrade legacy plaintext PIN to salted scrypt hash
    if (!user.pin.includes(':')) {
      const secureHash = hashPin(cleanPin);
      await dbRun('UPDATE users SET pin = ? WHERE id = ?', [secureHash, user.id]);
    }

    let parsedPermissions: string[] = [];
    try {
      if (user.permissions) {
        parsedPermissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
      }
    } catch {}

    if (!parsedPermissions.length) {
      if (user.role === 'admin') parsedPermissions = ['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'];
      else if (user.role === 'supervisor') parsedPermissions = ['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'reports'];
      else parsedPermissions = ['pos', 'wholesale'];
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: parsedPermissions,
    };
    const token = generateToken(tokenPayload);

    res.json({
      success: true,
      token,
      user: {
        ...tokenPayload,
        token,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all active staff users
authRouter.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await dbAll<any>('SELECT id, username, role, permissions, created_at FROM users ORDER BY created_at ASC');
    const formatted = users.map((u) => {
      let perms: string[] = [];
      try {
        if (u.permissions) perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
      } catch {}
      if (!perms.length) {
        if (u.role === 'admin') perms = ['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'];
        else if (u.role === 'supervisor') perms = ['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'reports'];
        else perms = ['pos', 'wholesale'];
      }
      return {
        ...u,
        permissions: perms,
      };
    });
    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user (Admin Only)
authRouter.post('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const isAuthorized = await verifyAdminRequester(req);
    if (!isAuthorized) {
      res.status(403).json({ error: 'Access Denied: Only administrators can create staff accounts.' });
      return;
    }

    const { username, pin, role = 'cashier', permissions } = req.body;
    if (!username || !pin) {
      res.status(400).json({ error: 'Username and PIN are required' });
      return;
    }

    if (!['admin', 'supervisor', 'cashier'].includes(role)) {
      res.status(400).json({ error: 'Role must be admin, supervisor, or cashier' });
      return;
    }

    if (String(pin).length < 4) {
      res.status(400).json({ error: 'PIN must be at least 4 digits' });
      return;
    }

    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }

    let finalPerms: string[] = Array.isArray(permissions) ? permissions : [];
    if (!finalPerms.length) {
      if (role === 'admin') finalPerms = ['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'];
      else if (role === 'supervisor') finalPerms = ['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'reports'];
      else finalPerms = ['pos', 'wholesale'];
    }

    const id = 'usr_' + uuidv4().slice(0, 8);
    const hashedPin = hashPin(String(pin).trim());
    await dbRun('INSERT INTO users (id, username, pin, role, permissions) VALUES (?, ?, ?, ?, ?)', [
      id,
      username.trim(),
      hashedPin,
      role,
      JSON.stringify(finalPerms),
    ]);

    const created = await dbGet<any>('SELECT id, username, role, permissions, created_at FROM users WHERE id = ?', [id]);
    res.status(201).json({
      ...created,
      permissions: finalPerms,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update user details or PIN (Admin Only)
authRouter.put('/users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const isAuthorized = await verifyAdminRequester(req);
    if (!isAuthorized) {
      res.status(403).json({ error: 'Access Denied: Only administrators can update staff accounts.' });
      return;
    }

    const { id } = req.params;
    const { username, pin, role, permissions } = req.body;

    const user = await dbGet<any>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const newUsername = username ? username.trim() : user.username;
    let newPin = user.pin;
    if (pin && String(pin).trim().length >= 4) {
      newPin = hashPin(String(pin).trim());
    }
    const newRole = role && ['admin', 'supervisor', 'cashier'].includes(role) ? role : user.role;

    let finalPerms = user.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : [];
    if (Array.isArray(permissions)) {
      finalPerms = permissions;
    }
    // Main admin safety: ensure usr_admin / admin always retains admin role, staff and settings
    let enforcedRole = newRole;
    if (user.id === 'usr_admin' || user.username === 'admin') {
      enforcedRole = 'admin';
      if (!finalPerms.includes('staff')) finalPerms.push('staff');
      if (!finalPerms.includes('settings')) finalPerms.push('settings');
    }

    await dbRun(
      'UPDATE users SET username = ?, pin = ?, role = ?, permissions = ? WHERE id = ?',
      [newUsername, newPin, enforcedRole, JSON.stringify(finalPerms), id]
    );

    const updated = await dbGet<any>('SELECT id, username, role, permissions, created_at FROM users WHERE id = ?', [id]);
    res.json({
      ...updated,
      permissions: finalPerms,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (Admin Only)
authRouter.delete('/users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const isAuthorized = await verifyAdminRequester(req);
    if (!isAuthorized) {
      res.status(403).json({ error: 'Access Denied: Only administrators can delete staff accounts.' });
      return;
    }

    const { id } = req.params;
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if this is the last admin
    if (user.role === 'admin') {
      const adminCount = await dbGet<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
      );
      if (adminCount && adminCount.count <= 1) {
        res.status(400).json({ error: 'Cannot delete the only remaining Admin account.' });
        return;
      }
    }

    await dbRun('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List cashiers for dropdowns
authRouter.get('/cashiers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await dbAll('SELECT id, username, role FROM users ORDER BY username ASC');
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
