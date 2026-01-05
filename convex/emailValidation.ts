/**
 * Email validation utilities
 */

/**
 * Email validation regex pattern
 * Matches: local-part@domain.tld
 * Example: user@example.com
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates email format
 * @param email - Email address to validate
 * @returns true if email format is valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }

  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0) {
    return false;
  }

  return EMAIL_REGEX.test(trimmedEmail);
}

/**
 * Normalizes email to lowercase and trims whitespace
 * @param email - Email address to normalize
 * @returns normalized email string
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Validates and normalizes email in one step
 * @param email - Email address to process
 * @returns normalized email if valid
 * @throws Error if email format is invalid
 */
export function validateAndNormalizeEmail(email: string): string {
  const normalized = normalizeEmail(email);

  if (!isValidEmail(normalized)) {
    throw new Error("Invalid email format");
  }

  return normalized;
}
