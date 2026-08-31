import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IMarketingProvider,
  ProviderResponse,
  NormalizedWebhookEvent,
} from '../interfaces/marketing-provider.interface';
import {
  ProviderConfigurationException,
  ProviderRequestException,
} from '../exceptions/provider.exception';

@Injectable()
export class WhatsAppProvider implements IMarketingProvider {
  private whatsappNumber: string;

  constructor(private configService: ConfigService) {
    this.validateAndLoadConfig();
  }

  private validateAndLoadConfig(): void {
    const number = this.configService.get<string>('WHATSAPP_NUMBER');

    if (!number) {
      throw new ProviderConfigurationException(
        'WHATSAPP_NUMBER is missing',
      );
    }

    // Keep digits only.
    // Example:
    // +91 98765 43210 -> 919876543210
    this.whatsappNumber = number.replace(/\D/g, '');

    if (!this.whatsappNumber) {
      throw new ProviderConfigurationException(
        'WHATSAPP_NUMBER is invalid',
      );
    }
  }

  /**
   * Generates a Click-to-WhatsApp link.
   *
   * The message is NOT sent automatically.
   * The returned URL opens WhatsApp with the message pre-filled.
   */
  async send(to: string, payload: any): Promise<ProviderResponse> {
    try {
      const recipient = this.normalizePhoneNumber(to);

      const message = this.buildMessage(payload);

      const whatsappUrl =
        `https://wa.me/${recipient}` +
        `?text=${encodeURIComponent(message)}`;

      return {
        messageSid: `wa-link-${Date.now()}`,
        deliveredLocally: false,
        rawResponse: {
          type: 'CLICK_TO_WHATSAPP',
          url: whatsappUrl,
          recipient,
          message,
        },
      };
    } catch (error: any) {
      throw new ProviderRequestException(
        error.message || 'Unable to generate WhatsApp link.',
      );
    }
  }

  /**
   * Returns the WhatsApp link directly.
   */
  generateWhatsAppLink(to: string, message: string): string {
    const recipient = this.normalizePhoneNumber(to);

    return (
      `https://wa.me/${recipient}` +
      `?text=${encodeURIComponent(message)}`
    );
  }

  /**
   * Converts a phone number into WhatsApp international format.
   *
   * Example:
   * +91 98765 43210
   * ->
   * 919876543210
   */
  private normalizePhoneNumber(phone: string): string {
    if (!phone) {
      throw new ProviderRequestException(
        'Recipient phone number is required.',
      );
    }

    const normalized = phone.replace(/\D/g, '');

    if (!normalized) {
      throw new ProviderRequestException(
        'Recipient phone number is invalid.',
      );
    }

    return normalized;
  }

  /**
   * Converts marketing payload into plain text.
   *
   * Supports:
   * payload.message
   * payload.text
   * payload.body
   * payload.template.body
   * payload.template.text
   */
  private buildMessage(payload: any): string {
    if (!payload) {
      return '';
    }

    if (typeof payload === 'string') {
      return payload;
    }

    if (typeof payload.message === 'string') {
      return payload.message;
    }

    if (typeof payload.text === 'string') {
      return payload.text;
    }

    if (typeof payload.body === 'string') {
      return payload.body;
    }

    if (payload.template) {
      if (typeof payload.template.body === 'string') {
        return payload.template.body;
      }

      if (typeof payload.template.text === 'string') {
        return payload.template.text;
      }
    }

    return '';
  }

  /**
   * Click-to-WhatsApp does not provide webhook delivery status.
   */
  verifyWebhook(): boolean {
    return false;
  }

  /**
   * No WhatsApp Cloud API webhooks are used.
   */
  mapWebhookEvent(): NormalizedWebhookEvent[] {
    return [];
  }
}