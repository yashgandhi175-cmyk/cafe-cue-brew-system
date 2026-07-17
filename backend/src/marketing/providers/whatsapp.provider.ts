/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IMarketingProvider,
  ProviderResponse,
  NormalizedWebhookEvent,
} from '../interfaces/marketing-provider.interface';
import {
  ProviderConfigurationException,
  ProviderAuthenticationException,
  ProviderRequestException,
  ProviderWebhookException,
} from '../exceptions/provider.exception';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class WhatsAppProvider implements IMarketingProvider {
  private apiUrl: string;
  private accessToken: string;
  private phoneNumberId: string;
  private verifyToken: string;
  private appSecret: string;

  constructor(private configService: ConfigService) {
    this.validateAndLoadConfig();
  }

  private validateAndLoadConfig() {
    this.apiUrl =
      this.configService.get<string>('WHATSAPP_API_URL') ||
      'https://graph.facebook.com/v17.0';
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');

    if (!accessToken) {
      throw new ProviderConfigurationException(
        'WHATSAPP_ACCESS_TOKEN is missing',
      );
    }
    if (!phoneNumberId) {
      throw new ProviderConfigurationException(
        'WHATSAPP_PHONE_NUMBER_ID is missing',
      );
    }
    if (!verifyToken) {
      throw new ProviderConfigurationException(
        'WHATSAPP_VERIFY_TOKEN is missing',
      );
    }
    if (!appSecret) {
      throw new ProviderConfigurationException(
        'WHATSAPP_APP_SECRET is missing',
      );
    }

    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
  }

  async send(to: string, payload: any): Promise<ProviderResponse> {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;

    // Build outbound body targeting standard WhatsApp Cloud API templates format
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: payload.template,
    };

    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      if (!messageId) {
        throw new ProviderRequestException(
          'Message sent but no message ID returned from provider.',
          response.data,
        );
      }

      return {
        messageSid: messageId,
        deliveredLocally: true,
        rawResponse: response.data,
      };
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const data = error.response.data;
        if (status === 401 || status === 403) {
          throw new ProviderAuthenticationException(
            data?.error?.message || 'Authentication failed.',
          );
        }
        throw new ProviderRequestException(
          data?.error?.message || 'Provider request failed.',
          data,
        );
      }
      throw new ProviderRequestException(
        error.message || 'Request execution error.',
      );
    }
  }

  verifyWebhook(signature: string, rawBody: any): boolean {
    if (!signature || !rawBody) {
      throw new ProviderWebhookException(
        'Missing webhook signature or raw body.',
      );
    }
    try {
      const cleanSignature = signature.replace('sha256=', '');
      const bodyStr =
        typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
      const computed = crypto
        .createHmac('sha256', this.appSecret)
        .update(bodyStr)
        .digest('hex');

      const sigBuf = Buffer.from(cleanSignature, 'hex');
      const compBuf = Buffer.from(computed, 'hex');

      if (sigBuf.length !== compBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(sigBuf, compBuf);
    } catch (e: any) {
      throw new ProviderWebhookException(
        e.message || 'Webhook signature verification failed.',
      );
    }
  }

  mapWebhookEvent(payload: any): NormalizedWebhookEvent[] {
    const events: NormalizedWebhookEvent[] = [];
    if (!payload || !payload.entry) {
      return events;
    }

    for (const entry of payload.entry) {
      if (!entry.changes) continue;
      for (const change of entry.changes) {
        if (!change.value || !change.value.statuses) continue;
        for (const status of change.value.statuses) {
          const messageSid = status.id;
          const rawStatus = status.status;
          const timestamp = status.timestamp
            ? new Date(parseInt(status.timestamp) * 1000)
            : new Date();

          let normalizedStatus: NormalizedWebhookEvent['status'] = 'FAILED';
          if (rawStatus === 'sent') {
            normalizedStatus = 'SENT';
          } else if (rawStatus === 'delivered') {
            normalizedStatus = 'DELIVERED';
          } else if (rawStatus === 'read') {
            normalizedStatus = 'READ';
          } else if (rawStatus === 'failed') {
            normalizedStatus = 'FAILED';
          }

          let errorCode: string | undefined;
          if (status.errors && status.errors.length > 0) {
            errorCode = status.errors[0].code?.toString();
          }

          events.push({
            messageSid,
            status: normalizedStatus,
            errorCode,
            eventTimestamp: timestamp,
          });
        }
      }
    }

    return events;
  }
}
