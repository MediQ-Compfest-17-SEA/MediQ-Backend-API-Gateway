import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';
import { NotificationService } from '../notifications/notification.service';
import { MediQWebSocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class QueueService {
  constructor(
    private readonly gatewayService: GatewayService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => MediQWebSocketGateway))
    private readonly webSocketGateway: MediQWebSocketGateway,
  ) {}

  async addToQueue(queueData: any) {
    const result = await this.gatewayService.sendToUserService('queue.add', queueData);
    
    // Trigger queue joined notification
    if (result && !result.error) {
      try {
        await this.notificationService.sendQueueJoinedNotification(queueData.userId, {
          id: result.id,
          queueNumber: result.queueNumber,
          institutionId: queueData.institutionId,
          institutionName: result.institutionName || 'Healthcare Institution',
          estimatedWaitTime: result.estimatedWaitTime,
          currentPosition: result.currentPosition
        });

        // Broadcast queue update to institution subscribers
        this.webSocketGateway.broadcastQueueUpdate(queueData.institutionId, {
          action: 'queue_joined',
          newQueue: result.queueNumber,
          totalWaiting: result.totalWaiting,
          userId: queueData.userId
        });
      } catch (error) {
        console.log('Failed to send queue notification:', error.message);
      }
    }
    
    return result;
  }

  async findAll(filters: any) {
    return this.gatewayService.sendToUserService('queue.findAll', filters);
  }

  async getMyQueue(userId: string) {
    return this.gatewayService.sendToUserService('queue.my-queue', { userId });
  }

  async getStats(institutionId?: string) {
    return this.gatewayService.sendToUserService('queue.stats', { institutionId });
  }

  async findOne(id: string) {
    return this.gatewayService.sendToUserService('queue.findOne', { id });
  }

  async updateStatus(id: string, status: string, user: any) {
    const result = await this.gatewayService.sendToUserService('queue.updateStatus', { id, status, user });
    
    // Trigger notifications based on status change
    if (result && !result.error) {
      try {
        const queueData = await this.findOne(id);
        
        if (status === 'completed') {
          // Consultation completed notification
          await this.notificationService.sendConsultationCompletedNotification(queueData.userId, {
            queueId: id,
            institutionId: queueData.institutionId,
            institutionName: queueData.institutionName,
            duration: queueData.duration
          });
        }

        // Broadcast status change to institution
        this.webSocketGateway.broadcastQueueUpdate(queueData.institutionId, {
          action: 'status_changed',
          queueId: id,
          queueNumber: queueData.queueNumber,
          oldStatus: queueData.status,
          newStatus: status,
          userId: queueData.userId
        });

        // Send status change notification
        await this.notificationService.sendQueueStatusChangedNotification(queueData.userId, {
          queueId: id,
          oldStatus: queueData.status,
          status: status,
          institutionId: queueData.institutionId,
          institutionName: queueData.institutionName
        });
      } catch (error) {
        console.log('Failed to send status change notification:', error.message);
      }
    }
    
    return result;
  }

  async callPatient(id: string, user: any) {
    const result = await this.gatewayService.sendToUserService('queue.call', { id, user });
    
    // Trigger queue ready notification
    if (result && !result.error) {
      try {
        const queueData = await this.findOne(id);
        
        await this.notificationService.sendQueueReadyNotification(queueData.userId, {
          id: id,
          queueNumber: queueData.queueNumber,
          institutionId: queueData.institutionId,
          institutionName: queueData.institutionName
        });

        // Broadcast call to institution
        this.webSocketGateway.broadcastQueueUpdate(queueData.institutionId, {
          action: 'patient_called',
          queueId: id,
          queueNumber: queueData.queueNumber,
          calledBy: user.id,
          userId: queueData.userId
        });

        // Check next 5 patients and send almost ready notifications
        await this.checkAndNotifyUpcomingPatients(queueData.institutionId, queueData.queueNumber);
      } catch (error) {
        console.log('Failed to send call notification:', error.message);
      }
    }
    
    return result;
  }

  private async checkAndNotifyUpcomingPatients(institutionId: string, currentQueueNumber: number) {
    try {
      // Get next 5 patients in queue
      const upcomingQueues = await this.gatewayService.sendToUserService('queue.get-upcoming', {
        institutionId,
        currentNumber: currentQueueNumber,
        limit: 5
      });

      if (upcomingQueues && upcomingQueues.length > 0) {
        // Notify the 5th patient (5 numbers away)
        const fifthPatient = upcomingQueues.find(q => q.position === 5);
        if (fifthPatient) {
          await this.notificationService.sendQueueAlmostReadyNotification(fifthPatient.userId, {
            id: fifthPatient.id,
            queueNumber: fifthPatient.queueNumber,
            institutionId: institutionId,
            institutionName: fifthPatient.institutionName,
            estimatedTime: fifthPatient.estimatedTime
          });
        }
      }
    } catch (error) {
      console.log('Failed to check upcoming patients:', error.message);
    }
  }

  async cancel(id: string, user: any) {
    return this.gatewayService.sendToUserService('queue.cancel', { id, user });
  }

  async getCurrentQueue(institutionId: string) {
    return this.gatewayService.sendToUserService('queue.current', { institutionId });
  }

  async getNextQueue(institutionId: string) {
    return this.gatewayService.sendToUserService('queue.next', { institutionId });
  }
}
