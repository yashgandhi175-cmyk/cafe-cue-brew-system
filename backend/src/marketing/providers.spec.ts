/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProviderFactory } from './providers/provider.factory';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { EmailProvider } from './providers/email.provider';
import { SmsProvider } from './providers/sms.provider';
import { PushProvider } from './providers/push.provider';
import { CampaignType } from '@prisma/client';
import {
  ProviderConfigurationException,
  ProviderRequestException,
  ProviderWebhookException,
  ProviderAuthenticationException,
} from './exceptions/provider.exception';
import { NotImplementedException } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Marketing Provider Layer Unit Tests', () => {
  let providerFactory: ProviderFactory;
  let whatsappProvider: WhatsAppProvider;
  let emailProvider: EmailProvider;
  let smsProvider: SmsProvider;
  let pushProvider: PushProvider;

  const mockConfig = {
    WHATSAPP_API_URL: 'https://graph.facebook.com/v17.0',
    WHATSAPP_ACCESS_TOKEN: 'token-123',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-456',
    WHATSAPP_VERIFY_TOKEN: 'verify-789',
    WHATSAPP_APP_SECRET: 'secret-abc',
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
      expect(providerFactory.getProvider(CampaignType.SMS)).toBe(smsProvider);
      expect(providerFactory.getProvider(CampaignType.PUSH)).toBe(pushProvider);
    });
  });

  describe('WhatsApp Configuration Validation', () => {
    it('should throw ProviderConfigurationException if any required config is missing', () => {
      const badConfigService = {
        get: jest.fn(() => null),
      };

      expect(() => new WhatsAppProvider(badConfigService as any)).toThrow(
        ProviderConfigurationException,
      );
    });
  });

  describe('WhatsApp Message Dispatch', () => {
    it('should successfully dispatch template message and return messageSid', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          messages: [{ id: 'wamid.HBg...' }],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const res = await whatsappProvider.send('+919999999999', {
        template: { name: 'hello_world' },
      });

      expect(res.messageSid).toBe('wamid.HBg...');
      expect(res.deliveredLocally).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalled();
    });

    it('should throw ProviderAuthenticationException on 401/403 errors', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: { error: { message: 'Invalid credentials' } },
        },
        isAxiosError: true,
      };
      mockedAxios.post.mockRejectedValue(errorResponse);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        whatsappProvider.send('+919999999999', { template: { name: 'hello' } }),
      ).rejects.toThrow(ProviderAuthenticationException);
    });

    it('should throw ProviderRequestException on other provider errors', async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: { error: { message: 'Invalid phone number' } },
        },
        isAxiosError: true,
      };
      mockedAxios.post.mockRejectedValue(errorResponse);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        whatsappProvider.send('+919999999999', { template: { name: 'hello' } }),
      ).rejects.toThrow(ProviderRequestException);
    });
  });

  describe('WhatsApp Webhook & Signature Verification', () => {
    const rawBody = JSON.stringify({ event: 'test' });
    const appSecret = 'secret-abc';

    it('should verify signature successfully for valid payloads', () => {
      const signature =
        'sha256=' +
        crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const verified = whatsappProvider.verifyWebhook(signature, rawBody);
      expect(verified).toBe(true);
    });

    it('should fail verification if signature or body does not match', () => {
      const signature = 'sha256=invalid-signature-hash';
      const verified = whatsappProvider.verifyWebhook(signature, rawBody);
      expect(verified).toBe(false);
    });

    it('should throw ProviderWebhookException if signature or rawBody are missing', () => {
      expect(() => whatsappProvider.verifyWebhook('', null)).toThrow(
        ProviderWebhookException,
      );
    });
  });

  describe('WhatsApp Webhook Mapping & Normalization', () => {
    it('should normalize Meta status update webhook payload correctly', () => {
      const webhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: 'wamid.HBg...',
                      status: 'delivered',
                      timestamp: '1603412543',
                      recipient_id: '+919999999999',
                    },
                    {
                      id: 'wamid.HBg2...',
                      status: 'failed',
                      timestamp: '1603412544',
                      recipient_id: '+919999999999',
                      errors: [{ code: 131042, message: 'Payment required' }],
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const normalized = whatsappProvider.mapWebhookEvent(webhookPayload);
      expect(normalized.length).toBe(2);

      expect(normalized[0].messageSid).toBe('wamid.HBg...');
      expect(normalized[0].status).toBe('DELIVERED');
      expect(normalized[0].errorCode).toBeUndefined();

      expect(normalized[1].messageSid).toBe('wamid.HBg2...');
      expect(normalized[1].status).toBe('FAILED');
      expect(normalized[1].errorCode).toBe('131042');
    });
  });

  describe('Stubbed Providers', () => {
    it('should throw NotImplementedException on execution', async () => {
      await expect(emailProvider.send('email@test.com', {})).rejects.toThrow(
        NotImplementedException,
      );
      await expect(smsProvider.send('+919999999999', {})).rejects.toThrow(
        NotImplementedException,
      );
      await expect(pushProvider.send('push-token', {})).rejects.toThrow(
        NotImplementedException,
      );
    });
  });
});
