import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface Event {
  id: string;
  aggregateId: string;
  eventType: string;
  data: any;
  metadata: {
    timestamp: Date;
    version: number;
    userId?: string;
    correlationId?: string;
  };
}

export interface EventFilter {
  aggregateId?: string;
  eventType?: string;
  fromVersion?: number;
  toVersion?: number;
  fromDate?: Date;
  toDate?: Date;
}

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);
  private events: Event[] = [];
  private eventsByAggregate = new Map<string, Event[]>();
  private snapshotStore = new Map<string, any>();

  async saveEvent(
    aggregateId: string,
    eventType: string,
    data: any,
    metadata: Partial<Event['metadata']> = {},
  ): Promise<void> {
    const event: Event = {
      id: uuidv4(),
      aggregateId,
      eventType,
      data,
      metadata: {
        timestamp: new Date(),
        version: await this.getNextVersion(aggregateId),
        ...metadata,
      },
    };

    this.events.push(event);
    
    if (!this.eventsByAggregate.has(aggregateId)) {
      this.eventsByAggregate.set(aggregateId, []);
    }
    this.eventsByAggregate.get(aggregateId)!.push(event);

    this.logger.debug(`Event saved: ${eventType} for aggregate ${aggregateId}`);
  }

  // Alias for saveEvent for compatibility
  async appendEvent(event: { aggregateId: string; eventType: string; data: any; metadata?: Partial<Event['metadata']> }): Promise<void> {
    return this.saveEvent(event.aggregateId, event.eventType, event.data, event.metadata);
  }

  // Get all events (alias for getEvents)
  async getAllEvents(filter: EventFilter = {}): Promise<Event[]> {
    return this.getEvents(filter);
  }

  async getEvents(filter: EventFilter = {}): Promise<Event[]> {
    let filteredEvents = this.events;

    if (filter.aggregateId) {
      filteredEvents = this.eventsByAggregate.get(filter.aggregateId) || [];
    }

    if (filter.eventType) {
      filteredEvents = filteredEvents.filter(e => e.eventType === filter.eventType);
    }

    if (filter.fromVersion) {
      filteredEvents = filteredEvents.filter(e => e.metadata.version >= filter.fromVersion!);
    }

    if (filter.toVersion) {
      filteredEvents = filteredEvents.filter(e => e.metadata.version <= filter.toVersion!);
    }

    if (filter.fromDate) {
      filteredEvents = filteredEvents.filter(e => e.metadata.timestamp >= filter.fromDate!);
    }

    if (filter.toDate) {
      filteredEvents = filteredEvents.filter(e => e.metadata.timestamp <= filter.toDate!);
    }

    return filteredEvents.sort((a, b) => a.metadata.version - b.metadata.version);
  }

  async replayEvents(aggregateId: string, handler: (event: Event) => void): Promise<void> {
    const events = await this.getEvents({ aggregateId });
    
    this.logger.log(`Replaying ${events.length} events for aggregate ${aggregateId}`);
    
    for (const event of events) {
      await handler(event);
    }
  }

  async saveSnapshot(aggregateId: string, snapshot: any, version: number): Promise<void> {
    this.snapshotStore.set(`${aggregateId}:${version}`, {
      aggregateId,
      data: snapshot,
      version,
      timestamp: new Date(),
    });
    
    this.logger.debug(`Snapshot saved for aggregate ${aggregateId} at version ${version}`);
  }

  async getSnapshot(aggregateId: string, version?: number): Promise<any> {
    if (version) {
      return this.snapshotStore.get(`${aggregateId}:${version}`);
    }

    // Get latest snapshot
    const snapshots = Array.from(this.snapshotStore.entries())
      .filter(([key]) => key.startsWith(`${aggregateId}:`))
      .map(([, snapshot]) => snapshot)
      .sort((a, b) => b.version - a.version);

    return snapshots[0] || null;
  }

  private async getNextVersion(aggregateId: string): Promise<number> {
    const events = this.eventsByAggregate.get(aggregateId) || [];
    return events.length + 1;
  }

  async getAuditTrail(aggregateId: string): Promise<Event[]> {
    return this.getEvents({ aggregateId });
  }

  async searchEvents(query: string): Promise<Event[]> {
    return this.events.filter(event => 
      JSON.stringify(event.data).toLowerCase().includes(query.toLowerCase()) ||
      event.eventType.toLowerCase().includes(query.toLowerCase())
    );
  }

  async cleanupOldEvents(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const initialCount = this.events.length;
    this.events = this.events.filter(event => event.metadata.timestamp > cutoffDate);

    // Rebuild eventsByAggregate map
    this.eventsByAggregate.clear();
    for (const event of this.events) {
      if (!this.eventsByAggregate.has(event.aggregateId)) {
        this.eventsByAggregate.set(event.aggregateId, []);
      }
      this.eventsByAggregate.get(event.aggregateId)!.push(event);
    }

    this.logger.log(`Cleaned up ${initialCount - this.events.length} old events`);
  }
}
