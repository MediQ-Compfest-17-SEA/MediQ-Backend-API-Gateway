import { Transport } from '@nestjs/microservices';

export interface RabbitMQConfig {
  transport: Transport;
  options: {
    urls: string[];
    queue: string;
    noAck?: boolean;
    queueOptions?: {
      durable: boolean;
      exclusive?: boolean;
      autoDelete?: boolean;
      arguments?: Record<string, any>;
    };
    socketOptions?: {
      heartbeatIntervalInSeconds?: number;
      reconnectTimeInSeconds?: number;
    };
    prefetchCount?: number;
    isGlobalPrefetch?: boolean;
  };
}

export const getRabbitMQConfig = (): RabbitMQConfig => ({
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
    queue: process.env.RABBITMQ_QUEUE || 'default_queue',
    noAck: false,
    queueOptions: {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        'x-message-ttl': 60000, // 1 minute TTL
        'x-dead-letter-exchange': 'dlx',
        'x-dead-letter-routing-key': 'failed',
      },
    },
    socketOptions: {
      heartbeatIntervalInSeconds: 60,
      reconnectTimeInSeconds: 5,
    },
    prefetchCount: 10,
    isGlobalPrefetch: false,
  },
});

export const getDeadLetterQueueConfig = (): RabbitMQConfig => ({
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
    queue: 'dead_letter_queue',
    queueOptions: {
      durable: true,
      arguments: {
        'x-message-ttl': 86400000, // 24 hours TTL for DLQ
      },
    },
    socketOptions: {
      heartbeatIntervalInSeconds: 60,
      reconnectTimeInSeconds: 5,
    },
  },
});

export const CONNECTION_POOL_CONFIG = {
  max: parseInt(process.env.RABBITMQ_POOL_MAX || '10'),
  min: parseInt(process.env.RABBITMQ_POOL_MIN || '2'),
  acquireTimeoutMillis: parseInt(process.env.RABBITMQ_POOL_TIMEOUT || '30000'),
  idleTimeoutMillis: parseInt(process.env.RABBITMQ_POOL_IDLE_TIMEOUT || '300000'),
};
