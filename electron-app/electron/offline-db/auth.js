/**
 * Offline authentication utilities
 *
 * Verifies PINs against Django's hashed password format (PBKDF2-SHA256)
 */

import crypto from 'crypto';

/**
 * Verify a raw PIN against a Django-hashed PIN
 *
 * Django password format: algorithm$iterations$salt$hash
 * Example: pbkdf2_sha256$720000$salt$base64hash
 *
 * @param {string} rawPin - The plain text PIN entered by user
 * @param {string} hashedPin - The Django-hashed PIN from database
 * @returns {boolean} True if PIN matches
 */
export function verifyPin(rawPin, hashedPin) {
  if (!rawPin || !hashedPin) {
    return false;
  }

  try {
    // Parse Django password format: algorithm$iterations$salt$hash
    const parts = hashedPin.split('$');
    if (parts.length !== 4) {
      console.error('[OfflineAuth] Invalid hash format - expected 4 parts, got', parts.length);
      return false;
    }

    const [algorithm, iterationsStr, salt, storedHash] = parts;
    const iterations = parseInt(iterationsStr, 10);

    // Verify it's PBKDF2-SHA256 (Django's default)
    if (algorithm !== 'pbkdf2_sha256') {
      console.error('[OfflineAuth] Unsupported algorithm:', algorithm);
      return false;
    }

    // Compute hash of input PIN using same parameters
    // Django uses PBKDF2 with SHA256, 32-byte output (256 bits)
    const derivedKey = crypto.pbkdf2Sync(
      rawPin.toString(),
      salt,
      iterations,
      32, // 256 bits = 32 bytes
      'sha256'
    );

    // Django stores the hash as base64
    const computedHash = derivedKey.toString('base64');

    // Timing-safe comparison to prevent timing attacks
    const storedBuffer = Buffer.from(storedHash, 'utf-8');
    const computedBuffer = Buffer.from(computedHash, 'utf-8');

    if (storedBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedBuffer, computedBuffer);
  } catch (error) {
    console.error('[OfflineAuth] Error verifying PIN:', error);
    return false;
  }
}

/**
 * Authenticate a user offline using cached credentials
 *
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {string} username - Username to authenticate
 * @param {Function} getUserByUsernameFn - Function to get user by username (passed to avoid circular deps)
 * @param {string} pin - Raw PIN entered by user
 * @returns {{success: boolean, user?: Object, error?: string}}
 */
export function authenticateOffline(db, username, pin, getUserByUsernameFn) {
  try {
    // Find user by username
    const user = getUserByUsernameFn(db, username);

    if (!user) {
      return {
        success: false,
        error: 'User not found or not authorized for POS'
      };
    }

    if (!user.pin) {
      return {
        success: false,
        error: 'User has no PIN configured'
      };
    }

    // Verify PIN
    const pinValid = verifyPin(pin, user.pin);

    if (!pinValid) {
      return {
        success: false,
        error: 'Invalid PIN'
      };
    }

    // Return user data (without sensitive fields)
    const { pin: _, ...safeUser } = user;
    return {
      success: true,
      user: safeUser
    };
  } catch (error) {
    console.error('[OfflineAuth] Authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
}
