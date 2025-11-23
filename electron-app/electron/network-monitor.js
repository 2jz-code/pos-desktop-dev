/**
 * Network Monitor Service
 *
 * Monitors network connectivity and emits events when status changes.
 * Uses periodic health checks to backend API to determine online/offline state.
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import https from 'https';
import { getDatabase, updateNetworkStatus, updateSyncTimestamp } from './offline-db/index.js';

// HTTPS agent that allows self-signed certificates in development
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

class NetworkMonitor extends EventEmitter {
  constructor() {
    super();

    this.isOnline = true;
    this.checkInterval = null;
    this.checkIntervalMs = 30000; // Check every 30 seconds
    this.backendUrl = null;
    this.lastCheckTime = null;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 3; // Consider offline after 3 failures
  }

  /**
   * Start monitoring network status
   * @param {string} backendUrl - Backend API URL (e.g., https://api.example.com)
   * @param {number} intervalMs - Check interval in milliseconds
   */
  start(backendUrl, intervalMs = 30000) {
    this.backendUrl = backendUrl;
    this.checkIntervalMs = intervalMs;

    console.log(`Starting network monitor (checking ${backendUrl} every ${intervalMs}ms)`);

    // Initial check
    this.checkConnection();

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkConnection();
    }, this.checkIntervalMs);

    // Also listen to browser online/offline events as backup
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleBrowserEvent(true));
      window.addEventListener('offline', () => this.handleBrowserEvent(false));
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log('Network monitor stopped');
  }

  /**
   * Check backend connectivity
   */
  async checkConnection() {
    if (!this.backendUrl) {
      console.warn('No backend URL configured for network monitor');
      return;
    }

    this.lastCheckTime = new Date().toISOString();

    try {
      // Ping backend health endpoint with short timeout
      const response = await axios.get(`${this.backendUrl}/health/`, {
        timeout: 5000, // 5 second timeout
        headers: {
          'Cache-Control': 'no-cache'
        },
        httpsAgent: httpsAgent // Allow self-signed certificates in development
      });

      if (response.status === 200) {
        this.handleSuccess();
      } else {
        this.handleFailure();
      }
    } catch (error) {
      this.handleFailure(error);
    }
  }

  /**
   * Handle successful connection check
   */
  handleSuccess() {
    this.consecutiveFailures = 0;

    // Was offline, now online
    if (!this.isOnline) {
      console.log('Network connection restored');
      this.isOnline = true;

      // Update database
      try {
        const db = getDatabase();
        updateNetworkStatus(db, true);
        updateSyncTimestamp(db, true);
      } catch (error) {
        console.error('Failed to update network status in DB:', error);
      }

      // Emit online event
      this.emit('status-changed', {
        is_online: true,
        timestamp: new Date().toISOString()
      });

      this.emit('online', {
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle failed connection check
   */
  handleFailure(error = null) {
    this.consecutiveFailures++;

    // Only consider offline after multiple consecutive failures
    if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.isOnline) {
      console.warn(`Network connection lost (${this.consecutiveFailures} consecutive failures)`);

      if (error) {
        console.error('Connection error:', error.message);
      }

      this.isOnline = false;

      // Update database
      try {
        const db = getDatabase();
        updateNetworkStatus(db, false);
      } catch (error) {
        console.error('Failed to update network status in DB:', error);
      }

      // Emit offline event
      this.emit('status-changed', {
        is_online: false,
        timestamp: new Date().toISOString(),
        error: error?.message
      });

      this.emit('offline', {
        timestamp: new Date().toISOString(),
        error: error?.message
      });
    }
  }

  /**
   * Handle browser online/offline events
   */
  handleBrowserEvent(isOnline) {
    console.log(`Browser reported network ${isOnline ? 'online' : 'offline'}`);

    // Browser events are less reliable, so we still check backend
    // But if browser says offline, we can immediately mark as offline
    if (!isOnline && this.isOnline) {
      this.handleFailure(new Error('Browser reported offline'));
    }

    // If browser says online, verify with backend check
    if (isOnline && !this.isOnline) {
      this.checkConnection();
    }
  }

  /**
   * Force a connection check
   */
  async forceCheck() {
    await this.checkConnection();
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      is_online: this.isOnline,
      last_check: this.lastCheckTime,
      consecutive_failures: this.consecutiveFailures,
      backend_url: this.backendUrl
    };
  }

  /**
   * Manually set online status (for testing)
   */
  setOnline(isOnline) {
    if (isOnline) {
      this.handleSuccess();
    } else {
      this.consecutiveFailures = this.maxConsecutiveFailures;
      this.handleFailure(new Error('Manually set offline'));
    }
  }
}

// Singleton instance
let monitorInstance = null;

/**
 * Get network monitor instance
 */
export function getNetworkMonitor() {
  if (!monitorInstance) {
    monitorInstance = new NetworkMonitor();
  }
  return monitorInstance;
}

export default getNetworkMonitor;
