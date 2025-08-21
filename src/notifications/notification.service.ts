import { Injectable, Logger } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';

export enum NotificationType {
  REGISTRATION_SUCCESS = 'registration_success',
  QUEUE_JOINED = 'queue_joined',
  QUEUE_ALMOST_READY = 'queue_almost_ready', // 5 numbers before
  QUEUE_READY = 'queue_ready',
  CONSULTATION_COMPLETED = 'consultation_completed',
  QUEUE_CANCELLED = 'queue_cancelled',
  QUEUE_STATUS_CHANGED = 'queue_status_changed'
}

export interface NotificationData {
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly gatewayService: GatewayService) {}

  async sendRegistrationSuccessNotification(userId: string, userData: any) {
    const notification: NotificationData = {
      type: NotificationType.REGISTRATION_SUCCESS,
      title: '🎉 Registrasi Berhasil!',
      message: `Selamat datang ${userData.nama}! Akun Anda telah berhasil terdaftar di MediQ.`,
      data: {
        userId,
        nama: userData.nama,
        nik: userData.nik
      },
      priority: 'medium'
    };

    await this.sendNotification(userId, notification);
    this.logger.log(`Registration success notification sent to user ${userId}`);
  }

  async sendQueueJoinedNotification(userId: string, queueData: any) {
    const notification: NotificationData = {
      type: NotificationType.QUEUE_JOINED,
      title: '📋 Berhasil Masuk Antrian',
      message: `Anda telah berhasil bergabung dalam antrian di ${queueData.institutionName}. Nomor antrian: ${queueData.queueNumber}`,
      data: {
        queueId: queueData.id,
        queueNumber: queueData.queueNumber,
        institutionId: queueData.institutionId,
        institutionName: queueData.institutionName,
        estimatedWaitTime: queueData.estimatedWaitTime,
        currentPosition: queueData.currentPosition
      },
      priority: 'medium'
    };

    await this.sendNotification(userId, notification);
    this.logger.log(`Queue joined notification sent to user ${userId}`);
  }

  async sendQueueAlmostReadyNotification(userId: string, queueData: any) {
    const notification: NotificationData = {
      type: NotificationType.QUEUE_ALMOST_READY,
      title: '⏰ Antrian Hampir Tiba!',
      message: `Nomor antrian Anda akan dipanggil dalam 5 nomor lagi. Bersiaplah untuk konsultasi di ${queueData.institutionName}.`,
      data: {
        queueId: queueData.id,
        queueNumber: queueData.queueNumber,
        institutionId: queueData.institutionId,
        institutionName: queueData.institutionName,
        remainingQueue: 5,
        estimatedTime: queueData.estimatedTime
      },
      priority: 'high'
    };

    await this.sendNotification(userId, notification);
    this.logger.log(`Queue almost ready notification sent to user ${userId}`);
  }

  async sendQueueReadyNotification(userId: string, queueData: any) {
    const notification: NotificationData = {
      type: NotificationType.QUEUE_READY,
      title: '🔔 Nomor Antrian Dipanggil!',
      message: `Nomor antrian ${queueData.queueNumber} dipanggil! Silakan menuju ke ${queueData.institutionName} untuk konsultasi.`,
      data: {
        queueId: queueData.id,
        queueNumber: queueData.queueNumber,
        institutionId: queueData.institutionId,
        institutionName: queueData.institutionName,
        calledAt: new Date().toISOString()
      },
      priority: 'urgent'
    };

    await this.sendNotification(userId, notification);
    this.logger.log(`Queue ready notification sent to user ${userId}`);
  }

  async sendConsultationCompletedNotification(userId: string, consultationData: any) {
    const notification: NotificationData = {
      type: NotificationType.CONSULTATION_COMPLETED,
      title: '✅ Konsultasi Selesai',
      message: `Konsultasi Anda di ${consultationData.institutionName} telah selesai. Terima kasih telah menggunakan layanan MediQ!`,
      data: {
        queueId: consultationData.queueId,
        institutionId: consultationData.institutionId,
        institutionName: consultationData.institutionName,
        completedAt: new Date().toISOString(),
        duration: consultationData.duration
      },
      priority: 'medium'
    };

    await this.sendNotification(userId, notification);
    this.logger.log(`Consultation completed notification sent to user ${userId}`);
  }

  async sendQueueStatusChangedNotification(userId: string, statusData: any) {
    const statusMessages = {
      'waiting': 'Status antrian Anda: Menunggu',
      'called': 'Nomor antrian Anda telah dipanggil!',
      'in-progress': 'Konsultasi sedang berlangsung',
      'completed': 'Konsultasi telah selesai',
      'cancelled': 'Antrian dibatalkan'
    };

    const notification: NotificationData = {
      type: NotificationType.QUEUE_STATUS_CHANGED,
      title: '📝 Status Antrian Berubah',
      message: statusMessages[statusData.status] || `Status antrian berubah menjadi: ${statusData.status}`,
      data: {
        queueId: statusData.queueId,
        oldStatus: statusData.oldStatus,
        newStatus: statusData.status,
        institutionId: statusData.institutionId,
        institutionName: statusData.institutionName
      },
      priority: statusData.status === 'called' ? 'urgent' : 'medium'
    };

    await this.sendNotification(userId, notification);
    this.logger.log(`Queue status changed notification sent to user ${userId}: ${statusData.status}`);
  }

  private async sendNotification(userId: string, notification: NotificationData) {
    try {
      // Store notification in database/cache if needed
      await this.storeNotification(userId, notification);
      
      // Send via WebSocket if user is connected
      this.broadcastToUser(userId, 'notification', notification);
      
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}:`, error);
    }
  }

  private async storeNotification(userId: string, notification: NotificationData) {
    // TODO: Store in database for notification history
    // For now, just log
    this.logger.debug(`Storing notification for user ${userId}: ${notification.type}`);
  }

  setBroadcastCallback(callback: (userId: string, event: string, data: any) => void) {
    this.broadcastCallback = callback;
  }

  private broadcastCallback: (userId: string, event: string, data: any) => void;

  private broadcastToUser(userId: string, event: string, data: any) {
    if (this.broadcastCallback) {
      this.broadcastCallback(userId, event, data);
    }
  }

  async getQueueStatus(institutionId: string) {
    try {
      // Call queue service to get current status
      const response = await this.gatewayService.sendToUserService('queue.get-status', {
        institutionId
      });
      
      return {
        currentQueue: response.currentQueue,
        totalWaiting: response.totalWaiting,
        estimatedWaitTime: response.estimatedWaitTime,
        activeQueues: response.activeQueues || []
      };
    } catch (error) {
      this.logger.error(`Failed to get queue status for institution ${institutionId}:`, error);
      throw error;
    }
  }

  async checkQueuePosition(userId: string, queueId: string) {
    try {
      const response = await this.gatewayService.sendToUserService('queue.check-position', {
        userId,
        queueId
      });

      // Check if user is almost ready (5 numbers before)
      if (response.position <= 5 && response.position > 1) {
        await this.sendQueueAlmostReadyNotification(userId, {
          id: queueId,
          queueNumber: response.queueNumber,
          institutionId: response.institutionId,
          institutionName: response.institutionName,
          estimatedTime: response.estimatedTime
        });
      }

      return response;
    } catch (error) {
      this.logger.error(`Failed to check queue position for user ${userId}:`, error);
      throw error;
    }
  }

  // Method to trigger notifications from other services
  async triggerNotification(type: string, userId: string, data: any) {
    switch (type) {
      case 'registration_success':
        await this.sendRegistrationSuccessNotification(userId, data);
        break;
      case 'queue_joined':
        await this.sendQueueJoinedNotification(userId, data);
        break;
      case 'queue_ready':
        await this.sendQueueReadyNotification(userId, data);
        break;
      case 'consultation_completed':
        await this.sendConsultationCompletedNotification(userId, data);
        break;
      case 'queue_status_changed':
        await this.sendQueueStatusChangedNotification(userId, data);
        break;
      default:
        this.logger.warn(`Unknown notification type: ${type}`);
    }
  }
}
