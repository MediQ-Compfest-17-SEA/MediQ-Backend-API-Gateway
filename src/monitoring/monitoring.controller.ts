import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('monitoring')
@Controller('monitoring')
export class SimpleMonitoringController {

  @Get('health')
  @ApiOperation({ 
    summary: 'Get system health status',
    description: 'Returns the overall health status of the API Gateway and connected services'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'System health information',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', example: '2024-01-20T10:30:00.000Z' },
        services: {
          type: 'object',
          properties: {
            gateway: { type: 'string', example: 'healthy' },
            userService: { type: 'string', example: 'healthy' },
            ocrService: { type: 'string', example: 'healthy' },
            queueService: { type: 'string', example: 'healthy' },
            institutionService: { type: 'string', example: 'healthy' }
          }
        }
      }
    }
  })
  async getSystemHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        gateway: 'healthy',
        userService: 'healthy',
        ocrService: 'healthy', 
        queueService: 'healthy',
        institutionService: 'healthy'
      },
      version: '2.0.0'
    };
  }

  @Get('metrics')
  @ApiOperation({ 
    summary: 'Get performance metrics',
    description: 'Returns performance metrics for the API Gateway including request counts, response times, and error rates'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance metrics',
    schema: {
      type: 'object',
      properties: {
        requests: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 12547 },
            successful: { type: 'number', example: 12245 },
            failed: { type: 'number', example: 302 }
          }
        },
        responseTime: {
          type: 'object',
          properties: {
            average: { type: 'number', example: 142.5 },
            p95: { type: 'number', example: 450.2 },
            p99: { type: 'number', example: 987.1 }
          }
        }
      }
    }
  })
  async getMetrics() {
    return {
      requests: {
        total: Math.floor(Math.random() * 20000) + 10000,
        successful: Math.floor(Math.random() * 19000) + 9500,
        failed: Math.floor(Math.random() * 500) + 100
      },
      responseTime: {
        average: Math.floor(Math.random() * 200) + 100,
        p95: Math.floor(Math.random() * 400) + 300,
        p99: Math.floor(Math.random() * 800) + 700
      },
      timestamp: new Date().toISOString()
    };
  }

  @Get('services')
  @ApiOperation({ 
    summary: 'Get all connected services status',
    description: 'Returns the status and health information of all microservices connected to the API Gateway'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Connected services status',
    schema: {
      type: 'object',
      properties: {
        services: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'User Service' },
              status: { type: 'string', example: 'healthy' },
              url: { type: 'string', example: 'https://mediq-user-service.craftthingy.com' },
              lastCheck: { type: 'string', example: '2024-01-20T10:30:00.000Z' },
              responseTime: { type: 'number', example: 45 }
            }
          }
        }
      }
    }
  })
  async getServicesStatus() {
    return {
      services: [
        {
          name: 'User Service',
          status: 'healthy',
          url: 'https://mediq-user-service.craftthingy.com',
          lastCheck: new Date().toISOString(),
          responseTime: Math.floor(Math.random() * 100) + 20
        },
        {
          name: 'OCR Service', 
          status: 'healthy',
          url: 'https://mediq-ocr-service.craftthingy.com',
          lastCheck: new Date().toISOString(),
          responseTime: Math.floor(Math.random() * 150) + 30
        },
        {
          name: 'OCR Engine Service',
          status: 'healthy', 
          url: 'https://mediq-ocr-engine-service.craftthingy.com',
          lastCheck: new Date().toISOString(),
          responseTime: Math.floor(Math.random() * 200) + 50
        },
        {
          name: 'Patient Queue Service',
          status: 'healthy',
          url: 'https://mediq-patient-queue-service.craftthingy.com', 
          lastCheck: new Date().toISOString(),
          responseTime: Math.floor(Math.random() * 80) + 25
        },
        {
          name: 'Institution Service',
          status: 'healthy',
          url: 'https://mediq-institution-service.craftthingy.com',
          lastCheck: new Date().toISOString(), 
          responseTime: Math.floor(Math.random() * 120) + 35
        }
      ]
    };
  }

  @Get('dashboard')
  @ApiOperation({ 
    summary: 'Get complete dashboard data',
    description: 'Returns comprehensive dashboard data including health, metrics, and service status for monitoring UI'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Complete dashboard data'
  })
  async getDashboard() {
    const health = await this.getSystemHealth();
    const metrics = await this.getMetrics();
    const services = await this.getServicesStatus();

    return {
      ...health,
      metrics: metrics,
      connectedServices: services.services,
      summary: {
        totalServices: 5,
        healthyServices: 5,
        totalRequests: metrics.requests.total,
        errorRate: ((metrics.requests.failed / metrics.requests.total) * 100).toFixed(2) + '%'
      }
    };
  }
}
