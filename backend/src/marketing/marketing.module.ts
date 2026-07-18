import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { AudienceService } from './audience.service';
import { CampaignExecutionService } from './campaign-execution.service';
import { CampaignAnalyticsService } from './campaign-analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../common/prisma.module';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { EmailProvider } from './providers/email.provider';
import { SmsProvider } from './providers/sms.provider';
import { PushProvider } from './providers/push.provider';
import { ProviderFactory } from './providers/provider.factory';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [PrismaModule],
  controllers: [
    CampaignController,
    TemplateController,
    QueueController,
    AnalyticsController,
  ],
  providers: [
    CampaignService,
    TemplateService,
    QueueService,
    AudienceService,
    CampaignExecutionService,
    CampaignAnalyticsService,
    ConfigService,
    WhatsAppProvider,
    EmailProvider,
    SmsProvider,
    PushProvider,
    ProviderFactory,
    ApiKeyGuard,
  ],
  exports: [
    CampaignService,
    TemplateService,
    QueueService,
    AudienceService,
    CampaignExecutionService,
    CampaignAnalyticsService,
    ProviderFactory,
    WhatsAppProvider,
    EmailProvider,
    SmsProvider,
    PushProvider,
  ],
})
export class MarketingModule {}
