/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  IMarketingProvider,
  ProviderResponse,
  NormalizedWebhookEvent,
} from '../interfaces/marketing-provider.interface';

@Injectable()
export class PushProvider implements IMarketingProvider {
  async send(_to: string, _payload: any): Promise<ProviderResponse> {
    await Promise.resolve();
    throw new NotImplementedException('Push provider is not implemented yet.');
  }

  verifyWebhook(_signature: string, _rawBody: any): boolean {
    throw new NotImplementedException(
      'Push webhook verification is not implemented yet.',
    );
  }

  mapWebhookEvent(_payload: any): NormalizedWebhookEvent[] {
    throw new NotImplementedException(
      'Push webhook mapping is not implemented yet.',
    );
  }
}
