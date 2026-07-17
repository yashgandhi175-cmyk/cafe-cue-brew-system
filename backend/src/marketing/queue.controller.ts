import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { ApiKeyGuard } from './guards/api-key.guard';

@Controller('marketing/queue')
@UseGuards(ApiKeyGuard)
export class QueueController {
  constructor(private queueService: QueueService) {}

  @Post('process')
  async processQueue(
    @Query('batchSize', new DefaultValuePipe(50), ParseIntPipe)
    batchSize: number,
    @Query('executionTimeout', new DefaultValuePipe(25), ParseIntPipe)
    executionTimeout: number,
  ) {
    // Convert executionTimeout from seconds to milliseconds
    const timeoutMs = executionTimeout * 1000;
    return this.queueService.processBatch(batchSize, timeoutMs);
  }

  @Post('recover')
  async recoverQueue(
    @Query('timeout', new DefaultValuePipe(10), ParseIntPipe) timeout: number,
  ) {
    return this.queueService.recoverStaleJobs(timeout);
  }

  @Get('status')
  async getQueueStatus() {
    return this.queueService.getQueueStatus();
  }
}
