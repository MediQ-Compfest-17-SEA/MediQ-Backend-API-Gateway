import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
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
    .setDescription('Centralized API Gateway untuk semua MediQ Backend Services dengan advanced authentication, rate limiting, dan circuit breaker patterns')
    .setVersion('2.0')
    .addTag('Authentication', 'Authentication dan authorization endpoints - Login admin/user, refresh token, logout')
    .addTag('Users', 'User management dengan data KTP lengkap - CRUD user, profil, role management')
    .addTag('OCR', 'OCR processing untuk KTP scanning - Upload KTP, konfirmasi hasil OCR')
    .addTag('OCR Engine', 'ML-powered OCR engine dengan YOLO + EasyOCR - Process dokumen, scan KTP/SIM, validasi hasil')
    .addTag('Institutions', 'Institution dan facility management - CRUD institusi, layanan, pencarian')
    .addTag('queue', 'Queue management untuk antrian pasien - Tambah antrian, status, statistik, panggil pasien')
    .addTag('Gateway', 'Basic gateway operations - Health check, service discovery')
    .addTag('advanced-gateway', 'Advanced gateway operations dengan saga patterns - Complex transactions, distributed operations')
    .addTag('monitoring', 'System monitoring dan health checks - Health status, metrics, dashboard, service monitoring')
    .addTag('health', 'Health check endpoints - Service status dan availability checks')
    .addTag('Stats', 'Statistics dan analytics - Queue stats, system metrics, reports')
    .addBearerAuth()
    .setContact(
      'MediQ Support',
      'https://mediq.craftthingy.com',
      'support@mediq.com'
    )
    .setLicense(
      'MIT',
      'https://opensource.org/licenses/MIT'
    )
    .addServer('http://localhost:8601', 'Development Server')
    .addServer('https://mediq-api-gateway.craftthingy.com', 'Production Server')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  
  // Add timestamp to force cache refresh
  const timestamp = Date.now();
  SwaggerModule.setup('api/docs', app, document, {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      tryItOutEnabled: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'MediQ API Gateway v2.0 - Complete Healthcare Platform',
    customfavIcon: '/favicon.ico',
    customCssUrl: [],
    customCss: `
      .swagger-ui .topbar { 
        background-color: #1976d2; 
        border-bottom: 3px solid #0d47a1;
      }
      .swagger-ui .topbar .download-url-wrapper .select-label {
        color: white;
        font-weight: bold;
      }
      .swagger-ui .info .title {
        color: #1976d2;
        font-size: 2em;
        font-weight: bold;
      }
      .swagger-ui .info .description {
        font-size: 1.1em;
        line-height: 1.5;
      }
      .swagger-ui .scheme-container {
        background: #f5f5f5;
        border-radius: 8px;
        padding: 15px;
        margin: 20px 0;
      }
      .swagger-ui .opblock.opblock-post {
        border-color: #49cc90;
        background: rgba(73, 204, 144, 0.1);
      }
      .swagger-ui .opblock.opblock-get {
        border-color: #61affe;
        background: rgba(97, 175, 254, 0.1);
      }
      .swagger-ui .opblock.opblock-patch {
        border-color: #fca130;
        background: rgba(252, 161, 48, 0.1);
      }
      .swagger-ui .opblock.opblock-delete {
        border-color: #f93e3e;
        background: rgba(249, 62, 62, 0.1);
      }
    `,
    customJs: [
      'https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js',
    ],
  });

  // Basic routes
  app.getHttpAdapter().get('/', (req, res) => {
    res.json({
      message: 'MediQ API Gateway - Healthcare Digitalization Platform',
      version: '2.0.0',
      status: 'running',
      features: [
        'Advanced OCR with KTP data extraction',
        'Complete user management with KTP fields',
        'Institution and facility management',
        'Smart queue system with wait time estimation',
        'JWT authentication with role-based access',
        'Real-time monitoring and health checks'
      ],
      services: [
        { name: 'API Gateway', port: 8601, status: 'running', url: 'http://localhost:8601' },
        { name: 'User Service', port: 8602, status: 'running', url: 'https://mediq-user-service.craftthingy.com' },
        { name: 'OCR Service', port: 8603, status: 'running', url: 'https://mediq-ocr-service.craftthingy.com' },
        { name: 'OCR Engine', port: 8604, status: 'running', url: 'https://mediq-ocr-engine-service.craftthingy.com' },
        { name: 'Patient Queue', port: 8605, status: 'running', url: 'https://mediq-patient-queue-service.craftthingy.com' },
        { name: 'Institution', port: 8606, status: 'running', url: 'https://mediq-institution-service.craftthingy.com' },
      ],
      documentation: '/api/docs',
      totalEndpoints: 40,
      endpoints: {
        Authentication: ['/auth/login/admin', '/auth/login/user', '/auth/refresh', '/auth/logout'],
        Users: ['/users', '/users/profile', '/users/check-nik/{nik}', '/users/{id}', '/users/{id}/role'],
        OCR: ['/ocr/upload', '/ocr/confirm'],
        'OCR Engine': ['/ocr-engine/process', '/ocr-engine/scan-ocr', '/ocr-engine/validate-result'],
        Institutions: ['/institutions', '/institutions/search', '/institutions/{id}', '/institutions/{id}/services', '/institutions/{id}/queue/stats'],
        queue: ['/queue', '/queue/my-queue', '/queue/stats', '/queue/{id}', '/queue/{id}/status', '/queue/{id}/call', '/queue/institution/{id}/current', '/queue/institution/{id}/next'],
        Gateway: ['/gateway/health', '/gateway/status'],
        'advanced-gateway': ['/advanced-gateway/saga-transaction', '/advanced-gateway/distributed-operation'],
        monitoring: ['/monitoring/health', '/monitoring/metrics', '/monitoring/services', '/monitoring/dashboard'],
        health: ['/health'],
        Stats: ['/stats/queue', '/stats/system', '/stats/reports']
      }
    });
  });

  // Clear cache route
  app.getHttpAdapter().get('/api/docs/refresh', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect(`/api/docs?nocache=${Date.now()}`);
  });

  const port = process.env.PORT || 8601;
  await app.listen(port);
  console.log(`🚀 MediQ API Gateway running on http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🔄 Clear Cache: http://localhost:${port}/api/docs/refresh`);
  console.log(`💚 Health Check: http://localhost:${port}/health`);
  console.log(`📊 Total Endpoints: 40 (11 categories: Authentication, Users, OCR, OCR Engine, Institutions, queue, Gateway, advanced-gateway, monitoring, health, Stats)`);
}

bootstrap().catch((error) => {
  console.error('Error starting API Gateway:', error);
  process.exit(1);
});
