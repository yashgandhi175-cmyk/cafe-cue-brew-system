import { Injectable, BadRequestException } from '@nestjs/common';
import { CampaignType } from '@prisma/client';
import { IMarketingProvider } from '../interfaces/marketing-provider.interface';
import { WhatsAppProvider } from './whatsapp.provider';
import { EmailProvider } from './email.provider';
import { SmsProvider } from './sms.provider';
import { PushProvider } from './push.provider';

@Injectable()
export class ProviderFactory {
  constructor(
    private whatsappProvider: WhatsAppProvider,
    private emailProvider: EmailProvider,
    private smsProvider: SmsProvider,
    private pushProvider: PushProvider,
  ) {}

  getProvider(type: CampaignType): IMarketingProvider {
    switch (type) {
      case CampaignType.WHATSAPP:
        return this.whatsappProvider;
      case CampaignType.EMAIL:
        return this.emailProvider;
      case CampaignType.SMS:
        return this.smsProvider;
      case CampaignType.PUSH:
        return this.pushProvider;
      default:
        throw new BadRequestException(
          `Unsupported campaign type: ${type as string}`,
        );
    }
  }
}
