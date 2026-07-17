export interface ProviderResponse {
  messageSid: string;
  deliveredLocally: boolean;
  rawResponse?: any;
}

export interface NormalizedWebhookEvent {
  messageSid: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'BOUNCED';
  errorCode?: string;
  eventTimestamp: Date;
}

export interface IMarketingProvider {
  /**
   * Dispatches message template payloads to target address/number.
   */
  send(to: string, payload: any): Promise<ProviderResponse>;

  /**
   * Cryptographically verifies incoming webhook payload.
   */
  verifyWebhook(signature: string, rawBody: any): boolean;

  /**
   * Maps incoming raw events to unified NormalizedWebhookEvent structure.
   */
  mapWebhookEvent(payload: any): NormalizedWebhookEvent[];
}
