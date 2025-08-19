import { Controller, Get, Post, Param, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CircuitBreakerService } from '../common/services/circuit-breaker.service';
import { EventStoreService } from '../common/services/event-store.service';
import { SagaCoordinatorService } from '../common/services/saga-coordinator.service';
import { HealthMonitorService, SystemHealth } from '../common/services/health-monitor.service';
import { MetricsInterceptor } from '../common/interceptors/metrics.interceptor';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly eventStore: EventStoreService,
    private readonly sagaCoordinator: SagaCoordinatorService,
    private readonly healthMonitor: HealthMonitorService,
    private readonly metricsInterceptor: MetricsInterceptor,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get system health status' })
  @ApiResponse({ status: 200, description: 'System health information' })
  async getSystemHealth(): Promise<SystemHealth> {
    return await this.healthMonitor.getSystemHealth();
  }

  @Get('health/service/:serviceName')
  @ApiOperation({ summary: 'Get specific service health status' })
  @ApiParam({ name: 'serviceName', description: 'Name of the service to check' })
  @ApiResponse({ status: 200, description: 'Service health information' })
  async getServiceHealth(@Param('serviceName') serviceName: string) {
    return await this.healthMonitor.checkServiceHealth(serviceName);
  }

  @Get('circuit-breakers')
  @ApiOperation({ summary: 'Get all circuit breaker statuses' })
  @ApiResponse({ status: 200, description: 'Circuit breaker statistics' })
  getCircuitBreakers() {
    return {
      circuits: this.circuitBreaker.getAllCircuitsStats(),
      timestamp: new Date(),
    };
  }

  @Get('circuit-breakers/:serviceName')
  @ApiOperation({ summary: 'Get circuit breaker status for specific service' })
  @ApiParam({ name: 'serviceName', description: 'Name of the service' })
  @ApiResponse({ status: 200, description: 'Circuit breaker status' })
  getCircuitBreakerStatus(@Param('serviceName') serviceName: string) {
    const stats = this.circuitBreaker.getCircuitStats(serviceName);
    return {
      service: serviceName,
      stats,
      timestamp: new Date(),
    };
  }

  @Post('circuit-breakers/:serviceName/reset')
  @ApiOperation({ summary: 'Reset circuit breaker for specific service' })
  @ApiParam({ name: 'serviceName', description: 'Name of the service' })
  @ApiResponse({ status: 200, description: 'Circuit breaker reset' })
  @HttpCode(HttpStatus.OK)
  resetCircuitBreaker(@Param('serviceName') serviceName: string) {
    this.circuitBreaker.resetCircuit(serviceName);
    return {
      message: `Circuit breaker reset for service: ${serviceName}`,
      timestamp: new Date(),
    };
  }

  @Get('sagas')
  @ApiOperation({ summary: 'Get active saga executions' })
  @ApiResponse({ status: 200, description: 'Active saga information' })
  getActiveSagas() {
    return {
      activeSagas: this.sagaCoordinator.getActiveSagas(),
      timestamp: new Date(),
    };
  }

  @Get('sagas/:sagaId')
  @ApiOperation({ summary: 'Get saga status and history' })
  @ApiParam({ name: 'sagaId', description: 'ID of the saga' })
  @ApiResponse({ status: 200, description: 'Saga status and history' })
  async getSagaDetails(@Param('sagaId') sagaId: string) {
    const status = this.sagaCoordinator.getSagaStatus(sagaId);
    const history = await this.sagaCoordinator.getSagaHistory(sagaId);
    
    return {
      sagaId,
      status,
      history,
      timestamp: new Date(),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics' })
  getMetrics() {
    return {
      requestMetrics: this.metricsInterceptor.getMetrics(),
      systemMetrics: this.metricsInterceptor.getSystemMetrics(),
      timestamp: new Date(),
    };
  }

  @Get('metrics/slow-endpoints')
  @ApiOperation({ summary: 'Get slowest endpoints' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return' })
  @ApiResponse({ status: 200, description: 'Slowest endpoints' })
  getSlowEndpoints(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    return {
      slowEndpoints: this.metricsInterceptor.getTopSlowEndpoints(limitNum),
      timestamp: new Date(),
    };
  }

  @Get('metrics/error-endpoints')
  @ApiOperation({ summary: 'Get endpoints with highest error rates' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return' })
  @ApiResponse({ status: 200, description: 'Endpoints with highest error rates' })
  getErrorEndpoints(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    return {
      errorEndpoints: this.metricsInterceptor.getTopErrorEndpoints(limitNum),
      timestamp: new Date(),
    };
  }

  @Post('metrics/clear')
  @ApiOperation({ summary: 'Clear metrics cache' })
  @ApiResponse({ status: 200, description: 'Metrics cleared' })
  @HttpCode(HttpStatus.OK)
  clearMetrics() {
    this.metricsInterceptor.clearMetrics();
    return {
      message: 'Metrics cache cleared',
      timestamp: new Date(),
    };
  }

  @Get('events')
  @ApiOperation({ summary: 'Get recent events' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of events to return' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Filter by event type' })
  @ApiResponse({ status: 200, description: 'Recent events' })
  async getEvents(
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 50;
    const filter = eventType ? { eventType } : undefined;
    
    const events = await this.eventStore.getAllEvents(filter);
    const recentEvents = events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limitNum);
    
    return {
      events: recentEvents,
      total: events.length,
      timestamp: new Date(),
    };
  }

  @Get('events/:aggregateId')
  @ApiOperation({ summary: 'Get events for specific aggregate' })
  @ApiParam({ name: 'aggregateId', description: 'ID of the aggregate' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Filter by event type' })
  @ApiResponse({ status: 200, description: 'Aggregate events' })
  async getAggregateEvents(
    @Param('aggregateId') aggregateId: string,
    @Query('eventType') eventType?: string,
  ) {
    const filter = eventType ? { eventType } : undefined;
    const events = await this.eventStore.getEvents(aggregateId, filter);
    
    return {
      aggregateId,
      events,
      count: events.length,
      timestamp: new Date(),
    };
  }

  @Post('events/cleanup')
  @ApiOperation({ summary: 'Cleanup old events' })
  @ApiResponse({ status: 200, description: 'Old events cleaned up' })
  @HttpCode(HttpStatus.OK)
  async cleanupEvents() {
    await this.eventStore.cleanupOldEvents();
    return {
      message: 'Old events cleaned up',
      timestamp: new Date(),
    };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get monitoring dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data' })
  async getDashboardData() {
    const systemHealth = await this.healthMonitor.getSystemHealth();
    const circuits = this.circuitBreaker.getAllCircuitsStats();
    const activeSagas = this.sagaCoordinator.getActiveSagas();
    const metrics = this.metricsInterceptor.getMetrics();
    const systemMetrics = this.metricsInterceptor.getSystemMetrics();
    const slowEndpoints = this.metricsInterceptor.getTopSlowEndpoints(5);
    const errorEndpoints = this.metricsInterceptor.getTopErrorEndpoints(5);
    
    return {
      systemHealth,
      circuits,
      activeSagas: activeSagas.length,
      metrics: {
        totalRequests: systemMetrics.totalRequests,
        activeRequests: systemMetrics.activeRequests,
        memory: systemMetrics.memory,
        uptime: systemMetrics.uptime,
      },
      slowEndpoints,
      errorEndpoints,
      timestamp: new Date(),
    };
  }
}
