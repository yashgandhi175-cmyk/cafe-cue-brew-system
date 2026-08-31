/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProviderFactory } from './providers/provider.factory';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { EmailProvider } from './providers/email.provider';
import { SmsProvider } from './providers/sms.provider';
import { PushProvider } from './providers/push.provider';
import { CampaignType } from '@prisma/client';
import { NotImplementedException } from '@nestjs/common';
import {
  ProviderConfigurationException,
  ProviderRequestException,
} from './exceptions/provider.exception';

describe('Marketing Provider Layer Unit Tests', () => {
  let providerFactory: ProviderFactory;
  let whatsappProvider: WhatsAppProvider;
  let emailProvider: EmailProvider;
  let smsProvider: SmsProvider;
  let pushProvider: PushProvider;

  const mockConfig = {
    WHATSAPP_NUMBER: '+919999999999',
  };

  const mockConfigService = {
    get: jest.fn((key: string) => mockConfig[key]),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderFactory,
        WhatsAppProvider,
        EmailProvider,
        SmsProvider,
        PushProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    providerFactory = module.get<ProviderFactory>(ProviderFactory);
    whatsappProvider = module.get<WhatsAppProvider>(WhatsAppProvider);
    emailProvider = module.get<EmailProvider>(EmailProvider);
    smsProvider = module.get<SmsProvider>(SmsProvider);
    pushProvider = module.get<PushProvider>(PushProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ProviderFactory Resolution', () => {
    it('should resolve correct provider for CampaignType', () => {
      expect(providerFactory.getProvider(CampaignType.WHATSAPP)).toBe(
        whatsappProvider,
      );

      expect(providerFactory.getProvider(CampaignType.EMAIL)).toBe(
        emailProvider,
      );

      expect(providerFactory.getProvider(CampaignType.SMS)).toBe(
        smsProvider,
      );

      expect(providerFactory.getProvider(CampaignType.PUSH)).toBe(
        pushProvider,
      );
    });
  });

  describe('WhatsApp Configuration Validation', () => {
    it('should throw ProviderConfigurationException if WHATSAPP_NUMBER is missing', () => {
      const badConfigService = {
        get: jest.fn(() => null),
      };

      expect(
        () => new WhatsAppProvider(badConfigService as any),
      ).toThrow(ProviderConfigurationException);
    });

    it('should throw ProviderConfigurationException if WHATSAPP_NUMBER is invalid', () => {
      const badConfigService = {
        get: jest.fn(() => '+++---'),
      };

      expect(
        () => new WhatsAppProvider(badConfigService as any),
      ).toThrow(ProviderConfigurationException);
    });
  });

  describe('WhatsApp Click-to-WhatsApp', () => {
    it('should generate a WhatsApp link for a plain message', async () => {
      const res = await whatsappProvider.send('+919876543210', {
        message: 'Hello from Cafe Cue & Brew!',
      });

      expect(res.messageSid).toMatch(/^wa-link-/);
      expect(res.deliveredLocally).toBe(false);

      expect(res.rawResponse.type).toBe('CLICK_TO_WHATSAPP');
      expect(res.rawResponse.recipient).toBe('919876543210');
      expect(res.rawResponse.message).toBe(
        'Hello from Cafe Cue & Brew!',
      );

      expect(res.rawResponse.url).toBe(
        'https://wa.me/919876543210?text=Hello%20from%20Cafe%20Cue%20%26%20Brew!',
      );
    });

    it('should generate a WhatsApp link from text payload', async () => {
      const res = await whatsappProvider.send('+91 98765 43210', {
        text: 'Special offer today!',
      });

      expect(res.rawResponse.recipient).toBe('919876543210');
      expect(res.rawResponse.message).toBe('Special offer today!');
      expect(res.rawResponse.url).toContain(
        'https://wa.me/919876543210?text=',
      );
    });

    it('should generate a WhatsApp link from body payload', async () => {
      const res = await whatsappProvider.send('919876543210', {
        body: 'Visit Cafe Cue & Brew today.',
      });

      expect(res.rawResponse.recipient).toBe('919876543210');
      expect(res.rawResponse.message).toBe(
        'Visit Cafe Cue & Brew today.',
      );
    });

    it('should generate a WhatsApp link from template body', async () => {
      const res = await whatsappProvider.send('+919876543210', {
        template: {
          body: 'Your special offer is waiting!',
        },
      });

      expect(res.rawResponse.message).toBe(
        'Your special offer is waiting!',
      );
    });

    it('should generate a WhatsApp link using generateWhatsAppLink()', () => {
      const url = whatsappProvider.generateWhatsAppLink(
        '+91 98765 43210',
        'Hello Cafe Customer!',
      );

      expect(url).toBe(
        'https://wa.me/919876543210?text=Hello%20Cafe%20Customer!',
      );
    });

    it('should reject an invalid recipient phone number', async () => {
      await expect(
        whatsappProvider.send('', {
          message: 'Test message',
        }),
      ).rejects.toThrow(ProviderRequestException);
    });

    it('should reject a recipient containing no digits', async () => {
      await expect(
        whatsappProvider.send('abc-def', {
          message: 'Test message',
        }),
      ).rejects.toThrow(ProviderRequestException);
    });
  });

  describe('WhatsApp Click-to-WhatsApp Webhook Behavior', () => {
    it('should return false because Click-to-WhatsApp has no delivery webhook', () => {
      expect(whatsappProvider.verifyWebhook('', '')).toBe(false);
    });

    it('should return an empty webhook event list', () => {
      expect(whatsappProvider.mapWebhookEvent({})).toEqual([]);
    });
  });

  describe('Stubbed Providers', () => {
    it('should throw NotImplementedException on execution', async () => {
      await expect(
        emailProvider.send('email@test.com', {}),
      ).rejects.toThrow(NotImplementedException);

      await expect(
        smsProvider.send('+919999999999', {}),
      ).rejects.toThrow(NotImplementedException);

      await expect(
        pushProvider.send('push-token', {}),
      ).rejects.toThrow(NotImplementedException);
    });
  });
});
