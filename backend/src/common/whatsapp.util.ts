/**
 * Reusable WhatsApp Utility Functions for Phone Normalization and Message Link Construction.
 */

export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // 10 digits (e.g. 9876543210) -> default to India prefix 91
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // 12 digits starting with 91 (e.g. 919876543210) -> valid
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }

  // International phone numbers with 10 or more digits
  if (digits.length >= 10) {
    return digits;
  }

  return null;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encodedMessage}`;
}

export function buildCreditReminderMessage(name: string, outstandingAmount: number): string {
  const formattedAmount = Number(outstandingAmount).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });

  return `Hello ${name},

This is Cafe Cue & Brew.

Your current pending credit balance is ₹${formattedAmount}.

Please clear your outstanding balance at your convenience.

Thank you,
Cafe Cue & Brew`;
}

export function buildOfferMessage(name: string, offerTitle: string, offerDetails?: string): string {
  const detailsText = offerDetails ? ` - ${offerDetails}` : '';

  return `Hello ${name},

This is Cafe Cue & Brew!

We have a special offer for you: ${offerTitle}${detailsText}

Visit us today to redeem your offer!

Thank you,
Cafe Cue & Brew`;
}
