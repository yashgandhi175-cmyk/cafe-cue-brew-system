import { BadRequestException } from '@nestjs/common';

/**
 * Normalizes any Indian phone number format into canonical E.164 (+91XXXXXXXXXX).
 *
 * Rules:
 * 1. Strip all non-digit characters.
 * 2. If exactly 10 digits, prepend "+91".
 * 3. If exactly 12 digits starting with "91", prepend "+".
 * 4. If exactly 11 digits starting with "0", remove leading "0" and prepend "+91".
 * 5. Any other formats are rejected.
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) {
    throw new BadRequestException('Phone number is required.');
  }

  const digits = rawPhone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }

  throw new BadRequestException(
    `Invalid phone number format: "${rawPhone}". Must be a valid 10-digit Indian number.`,
  );
}

/**
 * Formats a canonical normalized phone number (+91XXXXXXXXXX) to standard display format (+91 XXXXX XXXXX).
 */
export function formatPhoneDisplay(normalizedPhone: string): string {
  if (!normalizedPhone) return '';
  if (normalizedPhone.startsWith('+91') && normalizedPhone.length === 13) {
    return `+91 ${normalizedPhone.slice(3, 8)} ${normalizedPhone.slice(8)}`;
  }
  return normalizedPhone;
}
