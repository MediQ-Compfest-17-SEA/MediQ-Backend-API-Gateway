import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.simple.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Basic CORS setup
  app.enableCors();
  
  // Health endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // Basic route
  app.getHttpAdapter().get('/', (req, res) => {
    res.json({
      message: 'MediQ API Gateway',
      version: '1.0.0',
      services: [
        { name: 'User Service', port: 8602, status: 'running' },
        { name: 'OCR Service', port: 8603, status: 'running' },
        { name: 'OCR Engine', port: 8604, status: 'running' },
        { name: 'Patient Queue', port: 8605, status: 'running' },
        { name: 'Institution', port: 8606, status: 'running' },
      ]
    });
  });

  const port = process.env.PORT || 8601;
  await app.listen(port);
  console.log(`🚀 API Gateway running on http://localhost:${port}`);
  console.log(`📚 Health check: http://localhost:${port}/health`);
}

bootstrap();
