import { Injectable, Logger } from '@nestjs/common';
import { EVENT_STORE_CONFIG } from 'src/config/resilience.config';

export interface Event {
  id: string;
  aggregateId: string;
  eventType: string;
  eventData: any;
  metadata?: any;
  timestamp: Date;
  version: number;
}

export interface EventFilter {
  aggregateId?: string;
  eventType?: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  fromVersion?: number;
  toVersion?: number;
}

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);
  private readonly events: Map<string, Event[]> = new Map();
  private readonly pendingEvents: Event[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    this.startPeriodicFlush();
  }

  async appendEvent(event: Omit<Event, 'id' | 'timestamp'>): Promise<string> {
    const eventWithMetadata: Event = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date(),
    };

    // Add to pending batch
    this.pendingEvents.push(eventWithMetadata);

    // Store in memory (in production, this would be a database)
    if (!this.events.has(event.aggregateId)) {
      this.events.set(event.aggregateId, []);
    }
    this.events.get(event.aggregateId)!.push(eventWithMetadata);

    this.logger.debug(`Event appended: ${eventWithMetadata.eventType} for aggregate ${event.aggregateId}`);

    // Flush if batch size reached
    if (this.pendingEvents.length >= EVENT_STORE_CONFIG.batchSize) {
      await this.flushEvents();
    }

    return eventWithMetadata.id;
  }

  async getEvents(aggregateId: string, filter?: EventFilter): Promise<Event[]> {
    let events = this.events.get(aggregateId) || [];

    if (filter) {
      events = events.filter(event => {
        if (filter.eventType && event.eventType !== filter.eventType) return false;
        if (filter.fromTimestamp && event.timestamp < filter.fromTimestamp) return false;
        if (filter.toTimestamp && event.timestamp > filter.toTimestamp) return false;
        if (filter.fromVersion && event.version < filter.fromVersion) return false;
        if (filter.toVersion && event.version > filter.toVersion) return false;
        return true;
      });
    }

    return events.sort((a, b) => a.version - b.version);
  }

  async getAllEvents(filter?: EventFilter): Promise<Event[]> {
    const allEvents: Event[] = [];
    
    for (const eventList of this.events.values()) {
      allEvents.push(...eventList);
    }

    let filteredEvents = allEvents;
    
    if (filter) {
      filteredEvents = allEvents.filter(event => {
        if (filter.aggregateId && event.aggregateId !== filter.aggregateId) return false;
        if (filter.eventType && event.eventType !== filter.eventType) return false;
        if (filter.fromTimestamp && event.timestamp < filter.fromTimestamp) return false;
        if (filter.toTimestamp && event.timestamp > filter.toTimestamp) return false;
        if (filter.fromVersion && event.version < filter.fromVersion) return false;
        if (filter.toVersion && event.version > filter.toVersion) return false;
        return true;
      });
    }

    return filteredEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async replayEvents(aggregateId: string, fromVersion?: number): Promise<any> {
    const events = await this.getEvents(aggregateId, { fromVersion });
    
    let state = {};
    for (const event of events) {
      state = this.applyEvent(state, event);
    }

    this.logger.log(`Replayed ${events.length} events for aggregate ${aggregateId}`);
    return state;
  }

  async createSnapshot(aggregateId: string, state: any, version: number): Promise<void> {
    await this.appendEvent({
      aggregateId,
      eventType: 'SNAPSHOT',
      eventData: state,
      version,
      metadata: { isSnapshot: true },
    });

    this.logger.log(`Snapshot created for aggregate ${aggregateId} at version ${version}`);
  }

  async cleanupOldEvents(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - EVENT_STORE_CONFIG.retentionDays);

    let removedCount = 0;

    for (const [aggregateId, events] of this.events.entries()) {
      const filteredEvents = events.filter(event => event.timestamp > cutoffDate);
      
      if (filteredEvents.length < events.length) {
        this.events.set(aggregateId, filteredEvents);
        removedCount += events.length - filteredEvents.length;
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Cleaned up ${removedCount} old events`);
    }
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(async () => {
      if (this.pendingEvents.length > 0) {
        await this.flushEvents();
      }
    }, EVENT_STORE_CONFIG.flushInterval);
  }

  private async flushEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) return;

    const eventsToFlush = [...this.pendingEvents];
    this.pendingEvents.length = 0;

    try {
      // In production, this would persist to database
      this.logger.debug(`Flushed ${eventsToFlush.length} events to persistent storage`);
    } catch (error) {
      this.logger.error(`Failed to flush events: ${error.message}`);
      // Re-add events to pending queue for retry
      this.pendingEvents.unshift(...eventsToFlush);
    }
  }

  private applyEvent(state: any, event: Event): any {
    // This is a simplified event application logic
    // In real implementation, this would be handled by aggregate roots
    switch (event.eventType) {
      case 'USER_CREATED':
        return { ...state, ...event.eventData, id: event.aggregateId };
      case 'USER_UPDATED':
        return { ...state, ...event.eventData };
      case 'SNAPSHOT':
        return event.eventData;
      default:
        this.logger.warn(`Unknown event type: ${event.eventType}`);
        return state;
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }
}
