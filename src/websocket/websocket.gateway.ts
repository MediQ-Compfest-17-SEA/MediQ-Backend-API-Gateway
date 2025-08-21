import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from '../notifications/notification.service';


@WSGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/api/websocket',
})
export class MediQWebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MediQWebSocketGateway.name);
  private readonly connectedClients = new Map<string, { socket: Socket; userId?: string; institutionId?: string }>();

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (token) {
        const payload = this.jwtService.verify(token);
        this.connectedClients.set(client.id, { 
          socket: client, 
          userId: payload.sub, 
          institutionId: payload.institutionId 
        });
        
        // Join user to their specific rooms
        client.join(`user_${payload.sub}`);
        if (payload.institutionId) {
          client.join(`institution_${payload.institutionId}`);
        }
        
        this.logger.log(`Client connected: ${client.id} (User: ${payload.sub})`);
        
        // Send welcome message with current status
        client.emit('connected', {
          message: 'Connected to MediQ real-time updates',
          userId: payload.sub,
          timestamp: new Date().toISOString()
        });
      } else {
        // Allow anonymous connections for public queue updates
        this.connectedClients.set(client.id, { socket: client });
        this.logger.log(`Anonymous client connected: ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_queue_updates')
  handleSubscribeQueueUpdates(
    @MessageBody() data: { institutionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data.institutionId) {
      client.join(`queue_${data.institutionId}`);
      this.logger.log(`Client ${client.id} subscribed to queue updates for institution ${data.institutionId}`);
      
      client.emit('subscription_confirmed', {
        type: 'queue_updates',
        institutionId: data.institutionId,
        timestamp: new Date().toISOString()
      });
    }
  }

  @SubscribeMessage('subscribe_notifications')
  handleSubscribeNotifications(
    @MessageBody() data: { userId: string; types?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const clientData = this.connectedClients.get(client.id);
    if (clientData?.userId === data.userId) {
      client.join(`notifications_${data.userId}`);
      
      // Subscribe to specific notification types if provided
      if (data.types && Array.isArray(data.types)) {
        data.types.forEach(type => {
          client.join(`notifications_${data.userId}_${type}`);
        });
      }
      
      this.logger.log(`Client ${client.id} subscribed to notifications for user ${data.userId}`);
      
      client.emit('subscription_confirmed', {
        type: 'notifications',
        userId: data.userId,
        notificationTypes: data.types || ['all'],
        timestamp: new Date().toISOString()
      });
    } else {
      client.emit('error', {
        message: 'Unauthorized: Cannot subscribe to notifications for other users',
        timestamp: new Date().toISOString()
      });
    }
  }

  @SubscribeMessage('get_queue_status')
  async handleGetQueueStatus(
    @MessageBody() data: { institutionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Get current queue status from queue service
      const queueStatus = await this.notificationService.getQueueStatus(data.institutionId);
      
      client.emit('queue_status', {
        institutionId: data.institutionId,
        ...queueStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to get queue status',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Methods to broadcast updates (called by services)
  broadcastQueueUpdate(institutionId: string, queueData: any) {
    this.server.to(`queue_${institutionId}`).emit('queue_updated', {
      institutionId,
      ...queueData,
      timestamp: new Date().toISOString()
    });
    
    this.logger.log(`Broadcasting queue update for institution ${institutionId}`);
  }

  sendNotification(userId: string, notification: any) {
    this.server.to(`notifications_${userId}`).emit('notification', {
      userId,
      ...notification,
      timestamp: new Date().toISOString()
    });
    
    // Also send to specific notification type room if applicable
    if (notification.type) {
      this.server.to(`notifications_${userId}_${notification.type}`).emit('notification', {
        userId,
        ...notification,
        timestamp: new Date().toISOString()
      });
    }
    
    this.logger.log(`Sending notification to user ${userId}: ${notification.type}`);
  }

  broadcastToInstitution(institutionId: string, event: string, data: any) {
    this.server.to(`institution_${institutionId}`).emit(event, {
      institutionId,
      ...data,
      timestamp: new Date().toISOString()
    });
    
    this.logger.log(`Broadcasting ${event} to institution ${institutionId}`);
  }

  // Get connected clients count for monitoring
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  getInstitutionClientsCount(institutionId: string): number {
    const room = this.server.sockets.adapter.rooms.get(`queue_${institutionId}`);
    return room ? room.size : 0;
  }
}
