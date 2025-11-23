/**
 * Device Authentication Utilities
 *
 * Handles HMAC-SHA256 signature generation for terminal device authentication.
 * Backend verifies these signatures using DeviceSignatureAuthentication.
 */

/**
 * Recursively sort object keys for canonical JSON
 * Matches Python's json.dumps(sort_keys=True)
 */
function sortKeysDeep(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeysDeep);
  }

  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = sortKeysDeep(obj[key]);
      return result;
    }, {});
}

/**
 * Decode hex string to Uint8Array
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Generate HMAC-SHA256 signature for device authentication
 * Matches backend SignatureService.compute_signature() exactly
 *
 * @param {Object} payload - Request payload object
 * @param {string} nonce - Random nonce for replay protection
 * @param {string} signingSecret - Hex-encoded HMAC secret from terminal pairing
 * @returns {Promise<string>} Hex-encoded HMAC-SHA256 signature
 */
export async function generateDeviceSignature(payload, nonce, signingSecret) {
  // Serialize payload to canonical JSON (matches Python's json.dumps(sort_keys=True, separators=(',', ':')))
  const sortedPayload = sortKeysDeep(payload);
  const payloadJson = JSON.stringify(sortedPayload);

  // Create message: payload + nonce
  const message = payloadJson + nonce;

  // Decode hex secret to bytes (matches Python's bytes.fromhex(secret))
  const keyData = hexToBytes(signingSecret);

  // Encode message as UTF-8
  const encoder = new TextEncoder();
  const messageData = encoder.encode(message);

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Generate signature
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to hex string
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return signatureHex;
}

/**
 * Generate a random nonce for device authentication
 *
 * @returns {string} Random UUID nonce
 */
export function generateNonce() {
  return crypto.randomUUID();
}

/**
 * Get pairing info from offline database
 *
 * @returns {Promise<Object|null>} Pairing info or null if not paired
 */
export async function getPairingInfo() {
  if (window.offlineAPI?.getPairingInfo) {
    try {
      return await window.offlineAPI.getPairingInfo();
    } catch (error) {
      console.error('Failed to get pairing info:', error);
      return null;
    }
  }
  return null;
}

/**
 * Create device authentication for API request
 * Returns both headers and the auth fields to inject into body
 *
 * @param {Object} requestBody - Request body (for POST/PATCH/PUT)
 * @returns {Promise<Object>} { headers, authFields, signature }
 */
export async function createDeviceAuth(requestBody = {}) {
  const pairingInfo = await getPairingInfo();

  if (!pairingInfo || !pairingInfo.signing_secret) {
    console.warn('No pairing info or signing secret available');
    return null;
  }

  const nonce = generateNonce();
  const created_at = new Date().toISOString();

  // Debug: Log timestamp generation
  console.log(`🔐 [DeviceAuth] Generated fresh timestamp: ${created_at}`);
  console.log(`🔐 [DeviceAuth] Client time: ${new Date().toString()}`);

  // Auth fields that must be in request body
  const authFields = {
    device_id: pairingInfo.terminal_id,
    nonce,
    created_at
  };

  // Complete payload = request body + auth fields (auth fields MUST override any user-supplied values)
  const completePayload = {
    ...requestBody,
    ...authFields
  };

  // Generate signature over complete payload
  const signature = await generateDeviceSignature(
    completePayload,
    nonce,
    pairingInfo.signing_secret
  );

  return {
    headers: {
      'X-Device-ID': pairingInfo.terminal_id,
      'X-Device-Nonce': nonce,
      'X-Device-Signature': signature
    },
    authFields, // These need to be injected into request.data
    signature
  };
}
