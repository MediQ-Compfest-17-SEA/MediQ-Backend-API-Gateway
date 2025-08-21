import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService } from './notification.service';
import { MediQWebSocketGateway } from '../websocket/websocket.gateway';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly webSocketGateway: MediQWebSocketGateway,
  ) {}

  @Post('subscribe')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Subscribe to push notifications', 
    description: 'Subscribe user untuk menerima notifikasi real-time via WebSocket' 
  })
  @ApiBody({
    description: 'Subscription preferences',
    schema: {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Jenis notifikasi yang ingin diterima',
          example: ['registration_success', 'queue_joined', 'queue_ready', 'consultation_completed']
        },
        institutionId: {
          type: 'string',
          description: 'ID institusi untuk notifikasi antrian (optional)'
        }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Subscription berhasil' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async subscribeNotifications(
    @Body() subscriptionData: { types?: string[]; institutionId?: string },
    @CurrentUser() user: any,
  ) {
    // Auto-join rooms by emitting to the user's websocket room via system notification
    if (subscriptionData.institutionId) {
      this.webSocketGateway.broadcastToInstitution(subscriptionData.institutionId, 'subscription_event', {
        type: 'queue_subscription',
        userId: user.id,
      });
    }

    return {
      message: 'Subscription preferences updated',
      userId: user.id,
      types: subscriptionData.types || ['all'],
      institutionId: subscriptionData.institutionId,
      websocketEndpoint: '/api/websocket',
      instructions: {
        connect: 'Connect to WebSocket dengan Bearer token di auth header',
        subscribe: 'Send "subscribe_notifications" event dengan userId dan types',
        queueUpdates: 'Send "subscribe_queue_updates" dengan institutionId untuk live queue updates'
      }
    };
  }

  @Post('trigger/:type')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Trigger notification manually (Testing only)', 
    description: 'Trigger notifikasi secara manual untuk testing purpose' 
  })
  @ApiParam({ name: 'type', description: 'Jenis notifikasi', enum: ['registration_success', 'queue_joined', 'queue_ready', 'consultation_completed'] })
  @ApiBody({
    description: 'Notification data',
    schema: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'User ID target' },
        data: { type: 'object', description: 'Data tambahan untuk notifikasi' }
      },
      required: ['targetUserId']
    }
  })
  @ApiResponse({ status: 200, description: 'Notifikasi berhasil dikirim' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async triggerNotification(
    @Param('type') type: string,
    @Body() triggerData: { targetUserId: string; data?: any },
    @CurrentUser() user: any,
  ) {
    await this.notificationService.triggerNotification(type, triggerData.targetUserId, triggerData.data || {});
    
    return {
      message: 'Notification triggered successfully',
      type,
      targetUserId: triggerData.targetUserId,
      triggeredBy: user.id,
      timestamp: new Date().toISOString()
    };
  }

  @Get('status/websocket')
  @ApiOperation({ 
    summary: 'Get WebSocket connection status', 
    description: 'Dapatkan informasi status koneksi WebSocket dan connected clients' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'WebSocket status information',
    schema: {
      type: 'object',
      properties: {
        connectedClients: { type: 'number', description: 'Jumlah client yang terhubung' },
        endpoint: { type: 'string', description: 'WebSocket endpoint' },
        status: { type: 'string', description: 'Status WebSocket server' },
        events: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  async getWebSocketStatus() {
    return {
      connectedClients: this.webSocketGateway.getConnectedClientsCount(),
      endpoint: '/api/websocket',
      status: 'running',
      events: [
        'subscribe_queue_updates',
        'subscribe_notifications', 
        'get_queue_status',
        'queue_updated',
        'notification',
        'connected'
      ]
    };
  }

  @Get('queue/:institutionId/status')
  @ApiOperation({ 
    summary: 'Get real-time queue status for institution', 
    description: 'Dapatkan status antrian real-time untuk institusi tertentu' 
  })
  @ApiParam({ name: 'institutionId', description: 'ID institusi kesehatan' })
  @ApiResponse({ 
    status: 200, 
    description: 'Queue status information',
    schema: {
      type: 'object',
      properties: {
        institutionId: { type: 'string' },
        currentQueue: { type: 'number', description: 'Nomor antrian saat ini' },
        totalWaiting: { type: 'number', description: 'Total yang menunggu' },
        estimatedWaitTime: { type: 'number', description: 'Estimasi waktu tunggu (menit)' },
        connectedClients: { type: 'number', description: 'Client yang subscribe ke institusi ini' }
      }
    }
  })
  async getQueueStatus(@Param('institutionId') institutionId: string) {
    const queueStatus = await this.notificationService.getQueueStatus(institutionId);
    const connectedClients = this.webSocketGateway.getInstitutionClientsCount(institutionId);
    
    return {
      ...queueStatus,
      institutionId,
      connectedClients,
      lastUpdated: new Date().toISOString()
    };
  }

  @Post('queue/:institutionId/broadcast')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Broadcast queue update to all subscribers', 
    description: 'Broadcast update antrian ke semua client yang subscribe ke institusi tertentu' 
  })
  @ApiParam({ name: 'institutionId', description: 'ID institusi kesehatan' })
  @ApiBody({
    description: 'Queue update data',
    schema: {
      type: 'object',
      properties: {
        currentQueue: { type: 'number', description: 'Nomor antrian saat ini' },
        action: { type: 'string', enum: ['next', 'call', 'complete'], description: 'Aksi yang dilakukan' },
        queueNumber: { type: 'number', description: 'Nomor antrian yang di-update' },
        message: { type: 'string', description: 'Pesan tambahan' }
      },
      required: ['currentQueue', 'action']
    }
  })
  @ApiResponse({ status: 200, description: 'Broadcast berhasil' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async broadcastQueueUpdate(
    @Param('institutionId') institutionId: string,
    @Body() updateData: any,
    @CurrentUser() user: any,
  ) {
    // Broadcast to all subscribers
    this.webSocketGateway.broadcastQueueUpdate(institutionId, {
      action: updateData.action,
      currentQueue: updateData.currentQueue,
      queueNumber: updateData.queueNumber,
      message: updateData.message || `Queue ${updateData.action}`,
      updatedBy: user.id
    });
    
    return {
      message: 'Queue update broadcasted successfully',
      institutionId,
      action: updateData.action,
      broadcastedBy: user.id,
      timestamp: new Date().toISOString()
    };
  }
}
