import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller()
export class SimpleGatewayController {
  constructor(
    @Inject('USER_SERVICE') private userService: ClientProxy,
    @Inject('PATIENT_QUEUE_SERVICE') private queueService: ClientProxy,
  ) {}

  @Get()
  getInfo() {
    return {
      message: 'MediQ API Gateway',
      version: '1.0.0',
      status: 'running',
      services: [
        { name: 'User Service', port: 8602, endpoint: '/users' },
        { name: 'OCR Service', port: 8603, endpoint: '/ocr' },
        { name: 'OCR Engine', port: 8604, endpoint: '/process' },
        { name: 'Patient Queue', port: 8605, endpoint: '/queue' },
        { name: 'Institution', port: 8606, endpoint: '/institutions' },
      ]
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  // Simple proxy routes to other services
  @Post('users')
  async createUser(@Body() userData: any) {
    try {
      return await this.userService.send('user.create', userData).toPromise();
    } catch (error) {
      return { error: 'User service unavailable', message: error.message };
    }
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    try {
      return await this.userService.send('user.findOne', { id }).toPromise();
    } catch (error) {
      return { error: 'User service unavailable', message: error.message };
    }
  }

  @Post('queue')
  async addToQueue(@Body() queueData: any) {
    try {
      return await this.queueService.send('queue.add', queueData).toPromise();
    } catch (error) {
      return { error: 'Queue service unavailable', message: error.message };
    }
  }

  @Get('queue/stats')
  async getQueueStats() {
    try {
      return await this.queueService.send('queue.stats', {}).toPromise();
    } catch (error) {
      return { error: 'Queue service unavailable', message: error.message };
    }
  }
}
