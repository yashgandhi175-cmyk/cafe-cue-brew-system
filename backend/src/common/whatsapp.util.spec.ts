import {
  normalizeWhatsAppPhone,
  buildWhatsAppUrl,
  buildCreditReminderMessage,
  buildOfferMessage,
} from './whatsapp.util';

describe('WhatsApp Utility Tests', () => {
  describe('normalizeWhatsAppPhone', () => {
    it('should normalize 10-digit number by adding 91 prefix', () => {
      expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210');
    });

    it('should normalize +91 formatted number', () => {
      expect(normalizeWhatsAppPhone('+919876543210')).toBe('919876543210');
    });

    it('should handle already normalized 91 prefix number', () => {
      expect(normalizeWhatsAppPhone('919876543210')).toBe('919876543210');
    });

    it('should handle formatted number with spaces and hyphens (+91 98765-43210)', () => {
      expect(normalizeWhatsAppPhone('+91 98765-43210')).toBe('919876543210');
    });

    it('should return null for missing or invalid phone numbers', () => {
      expect(normalizeWhatsAppPhone('')).toBeNull();
      expect(normalizeWhatsAppPhone(null)).toBeNull();
      expect(normalizeWhatsAppPhone(undefined)).toBeNull();
      expect(normalizeWhatsAppPhone('12345')).toBeNull();
    });
  });

  describe('buildWhatsAppUrl', () => {
    it('should return null if phone is missing or invalid', () => {
      expect(buildWhatsAppUrl('', 'Hello')).toBeNull();
      expect(buildWhatsAppUrl(null, 'Hello')).toBeNull();
    });

    it('should encode spaces, ₹, &, ?, and emojis correctly', () => {
      const message = 'Hello Rahul! Your balance is ₹850 & 10% Off? ☕🎉';
      const url = buildWhatsAppUrl('9876543210', message);

      expect(url).not.toBeNull();
      expect(url).toContain('https://wa.me/919876543210?text=');
      expect(url).toContain(encodeURIComponent('₹850'));
      expect(url).toContain(encodeURIComponent('&'));
      expect(url).toContain(encodeURIComponent('?'));
      expect(url).toContain(encodeURIComponent('☕🎉'));
    });
  });

  describe('Message Builders', () => {
    it('should build credit reminder message with customer name and amount', () => {
      const msg = buildCreditReminderMessage('Rahul', 850);
      expect(msg).toContain('Hello Rahul,');
      expect(msg).toContain('Cafe Cue & Brew');
      expect(msg).toContain('₹850');
      expect(msg).toContain('Please clear your outstanding balance');
    });

    it('should build offer message with customer name and offer title', () => {
      const msg = buildOfferMessage('Ananya', 'Buy 1 Get 1 Free', 'Valid till Sunday');
      expect(msg).toContain('Hello Ananya,');
      expect(msg).toContain('Buy 1 Get 1 Free');
      expect(msg).toContain('Valid till Sunday');
    });
  });
});
