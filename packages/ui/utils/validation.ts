/**
 * Shared Validation Utilities
 *
 * Common validation functions used across all Ajeen Fresh applications
 * for consistent validation rules and error messages.
 */

/**
 * Email validation using a robust regex pattern
 * @param email - Email address to validate
 * @returns True if email is valid
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;

  // Enhanced email regex that covers most valid email formats
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email.trim());
}

/**
 * Username validation - allows letters, numbers, underscores, and hyphens
 * @param username - Username to validate
 * @returns True if username is valid
 */
export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') return false;

  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  return usernameRegex.test(username.trim()) && username.trim().length >= 3;
}

/**
 * Phone number validation - accepts various US phone number formats
 * @param phone - Phone number to validate
 * @returns True if phone number is valid
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;

  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');

  // Check for valid US phone number (10 or 11 digits)
  return digitsOnly.length === 10 || (digitsOnly.length === 11 && digitsOnly.startsWith('1'));
}

/**
 * Password strength validation requirements
 */
export interface PasswordRequirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (password: string) => password.length >= 8,
  },
  {
    id: "uppercase",
    label: "At least one uppercase letter",
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter",
    test: (password: string) => /[a-z]/.test(password),
  },
  {
    id: "number",
    label: "At least one number",
    test: (password: string) => /[0-9]/.test(password),
  },
  {
    id: "special",
    label: "At least one special character",
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
];

/**
 * Password strength validation
 * @param password - Password to validate
 * @param minStrengthPercent - Minimum strength percentage required (default: 60)
 * @returns Object with strength percentage and whether it meets requirements
 */
export function validatePasswordStrength(
  password: string,
  minStrengthPercent: number = 60
): { isValid: boolean; strength: number; failedRequirements: string[] } {
  if (!password || typeof password !== 'string') {
    return { isValid: false, strength: 0, failedRequirements: PASSWORD_REQUIREMENTS.map(r => r.id) };
  }

  const passedTests = PASSWORD_REQUIREMENTS.filter(req => req.test(password));
  const strength = (passedTests.length / PASSWORD_REQUIREMENTS.length) * 100;
  const failedRequirements = PASSWORD_REQUIREMENTS
    .filter(req => !req.test(password))
    .map(req => req.id);

  return {
    isValid: strength >= minStrengthPercent,
    strength,
    failedRequirements
  };
}

/**
 * Validate that two passwords match
 * @param password - Original password
 * @param confirmPassword - Confirmation password
 * @returns True if passwords match
 */
export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password === confirmPassword;
}

/**
 * Format validation error messages consistently
 * @param field - Field name
 * @param message - Error message
 * @returns Formatted error message
 */
export function formatValidationError(field: string, message: string): string {
  const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return `${fieldLabel}: ${message}`;
}

/**
 * Validate required fields
 * @param data - Object with field values
 * @param requiredFields - Array of required field names
 * @returns Object with validation errors
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: string[]
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of requiredFields) {
    const value = data[field];
    if (!value || (typeof value === 'string' && !value.trim())) {
      errors[field] = `${field.replace('_', ' ')} is required`;
    }
  }

  return errors;
}