/**
 * Shared Formatting Utilities
 *
 * Common formatting functions used across all Ajeen Fresh applications
 * for consistent data presentation and input formatting.
 */

/**
 * Format phone number for display with US format: (XXX) XXX-XXXX
 * @param value - Phone number string (can contain any characters)
 * @returns Formatted phone number string
 */
export function formatPhoneNumber(value: string): string {
  if (!value || typeof value !== 'string') return '';

  // Remove all non-digit characters
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;

  // Return progressive formatting based on length
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
}

/**
 * Clean phone number by removing all formatting characters
 * @param phoneNumber - Formatted phone number
 * @returns Clean phone number with digits only
 */
export function cleanPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || typeof phoneNumber !== 'string') return '';
  return phoneNumber.replace(/[^\d]/g, '');
}

/**
 * Format email address by trimming and converting to lowercase
 * @param email - Email address to normalize
 * @returns Normalized email address
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Format username by trimming and converting to lowercase
 * @param username - Username to normalize
 * @returns Normalized username
 */
export function normalizeUsername(username: string): string {
  if (!username || typeof username !== 'string') return '';
  return username.trim().toLowerCase();
}

/**
 * Format name fields by trimming and capitalizing first letter of each word
 * @param name - Name to format
 * @returns Formatted name
 */
export function formatName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  return name
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format address field by trimming and capitalizing appropriately
 * @param address - Address to format
 * @returns Formatted address
 */
export function formatAddress(address: string): string {
  if (!address || typeof address !== 'string') return '';

  return address
    .trim()
    .split(' ')
    .map(word => {
      // Keep common abbreviations uppercase
      if (['ST', 'AVE', 'BLVD', 'RD', 'DR', 'LN', 'CT', 'PL', 'APT', 'UNIT', 'STE'].includes(word.toUpperCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Remove extra whitespace and normalize text input
 * @param text - Text to clean
 * @returns Cleaned text
 */
export function cleanText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ');
}