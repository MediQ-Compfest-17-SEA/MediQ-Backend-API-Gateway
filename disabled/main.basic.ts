import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.basic.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('MediQ API Gateway')
    .setDescription('API Gateway for MediQ Backend Services')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Basic routes
  app.getHttpAdapter().get('/', (req, res) => {
    res.json({
      message: 'MediQ API Gateway',
      version: '1.0.0',
      status: 'running',
      services: [
        { name: 'User Service', port: 8602, status: 'running' },
        { name: 'OCR Service', port: 8603, status: 'running' },
        { name: 'OCR Engine', port: 8604, status: 'running' },
        { name: 'Patient Queue', port: 8605, status: 'running' },
        { name: 'Institution', port: 8606, status: 'running' },
      ],
      documentation: '/api/docs'
    });
  });

  const port = process.env.PORT || 8601;
  await app.listen(port);
  console.log(`🚀 MediQ API Gateway running on http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`💚 Health Check: http://localhost:${port}/health`);
}

bootstrap().catch((error) => {
  console.error('Error starting API Gateway:', error);
  process.exit(1);
});
