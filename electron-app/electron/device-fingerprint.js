/**
 * Hardware-Based Device Fingerprint Service
 *
 * Generates stable fingerprint from hardware characteristics.
 * Persists across app reinstalls (as long as hardware doesn't change).
 *
 * Used for:
 * - Terminal identity persistence
 * - Location context retrieval from server
 * - Preventing duplicate terminal registrations
 */

import nodeMachineId from 'node-machine-id';
const { machineIdSync } = nodeMachineId;
import crypto from 'crypto';
import os from 'os';

class DeviceFingerprintService {
  constructor() {
    this._cachedFingerprint = null;
  }

  /**
   * Get hardware-based device fingerprint
   *
   * This fingerprint is stable across:
   * - App reinstalls ✅
   * - App updates ✅
   * - OS updates ✅
   *
   * Changes only when:
   * - Different physical machine (correct behavior)
   * - Major hardware replacement (motherboard, etc.)
   *
   * @returns {string} UUID-format fingerprint (e.g., "f47ac10b-58cc-4372-a567-0e02b2c3d479")
   */
  getDeviceFingerprint() {
    // Return cached if available
    if (this._cachedFingerprint) {
      return this._cachedFingerprint;
    }

    try {
      // Get machine ID (OS-level, hardware-based)
      // Windows: MachineGuid from Registry
      // macOS: IOPlatformUUID
      // Linux: /etc/machine-id
      const machineId = machineIdSync();

      // Add hostname for additional uniqueness
      const hostname = os.hostname();

      // Combine and hash
      const combined = `${machineId}-${hostname}`;
      const hash = crypto.createHash('sha256').update(combined).digest('hex');

      // Format as UUID (compatible with existing backend UUID field)
      const fingerprint = [
        hash.substr(0, 8),
        hash.substr(8, 4),
        hash.substr(12, 4),
        hash.substr(16, 4),
        hash.substr(20, 12)
      ].join('-');

      this._cachedFingerprint = fingerprint;

      console.log('🔐 Hardware fingerprint generated:', fingerprint);
      console.log('📌 Machine ID:', machineId.substring(0, 8) + '...');
      console.log('🖥️  Hostname:', hostname);

      return fingerprint;

    } catch (error) {
      console.error('❌ Failed to generate hardware fingerprint:', error);
      throw new Error('Unable to generate device fingerprint');
    }
  }

  /**
   * Get hardware info for debugging/support
   *
   * @returns {Object} Hardware and system information
   */
  getHardwareInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      release: os.release(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
    };
  }
}

// Export singleton instance
const deviceFingerprintService = new DeviceFingerprintService();

export default deviceFingerprintService;
