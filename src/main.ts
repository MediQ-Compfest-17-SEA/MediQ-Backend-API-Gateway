import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Removed global prefix to simplify endpoint paths
  // app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  // Enable CORS for all origins
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
  });

  // Resolve example and server base URLs for Swagger (prefer env var/public domain)
  const exampleBaseUrl =
    process.env.SWAGGER_EXAMPLE_BASE_URL ||
    process.env.SWAGGER_SERVER_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://mediq-api-gateway.craftthingy.com'
      : 'http://localhost:8601');
  const wsExampleBaseUrl = exampleBaseUrl.replace(/^http/, 'ws');

  // Swagger documentation
  const builder = new DocumentBuilder()
    .setTitle('MediQ API Gateway v3.0')
    .setDescription(`
# MediQ Healthcare Platform API Gateway

Centralized API Gateway untuk semua MediQ Backend Services dengan advanced authentication, rate limiting, circuit breaker patterns, real-time WebSocket, dan comprehensive notification system.

## 🚀 Key Features
- **Real-time WebSocket**: Live queue updates dan notifications
- **Gemini AI OCR**: 95%+ akurasi untuk KTP processing
- **Smart Notifications**: 5 jenis notifikasi otomatis
- **Advanced Authentication**: JWT dengan role-based access
- **Microservice Integration**: 6 backend services terintegrasi

## 🔐 Authentication Guide

### 1. Admin Login
\`\`\`bash
curl -X POST ${exampleBaseUrl}/auth/login/admin \\
  -H "Content-Type: application/json" \\
  -d '{"email": "admin@mediq.com", "password": "admin123"}'
\`\`\`

### 2. User Login  
\`\`\`bash
curl -X POST ${exampleBaseUrl}/auth/login/user \\
  -H "Content-Type: application/json" \\
  -d "{\\\"nik\\\": \\\"3204123456780001\\\", \\\"nama\\\": \\\"Budi Santoso\\\"}"
\`\`\`

### 3. Using Bearer Token
\`\`\`bash
curl -X GET ${exampleBaseUrl}/users/profile \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
\`\`\`

## 🔗 WebSocket Connection
\`\`\`javascript
const socket = io('${wsExampleBaseUrl}/api/websocket', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});

// Subscribe to notifications
socket.emit('subscribe_notifications', {
  userId: 'user-id',
  types: ['queue_ready', 'queue_almost_ready']
});
\`\`\`

## 📋 Queue Management Example
\`\`\`bash
# Add to queue
curl -X POST ${exampleBaseUrl}/queue \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "user-123",
    "institutionId": "inst-456",
    "serviceType": "konsultasi",
    "priority": "normal"
  }'
\`\`\`
    `)
    .setVersion('3.0')
    .addTag('Authentication', 'Authentication dan authorization endpoints - Login admin/user, refresh token, logout dengan contoh lengkap')
    .addTag('Users', 'User management dengan data KTP lengkap - CRUD user, profil, role management, check NIK')
    .addTag('OCR', 'OCR processing: upload KTP, kelola data sementara (temp), patch data user/institusi, confirm-temp untuk registrasi & antrian')
    .addTag('OCR Engine', 'Gemini AI-powered OCR engine - Process dokumen KTP dengan akurasi 95%+ menggunakan Google Gemini')
    .addTag('Institutions', 'Institution dan facility management - CRUD institusi, layanan, pencarian dengan filtering')
    .addTag('queue', 'Queue management untuk antrian pasien - Tambah antrian, status, statistik, panggil pasien dengan notifications')
    .addTag('Notifications', 'Real-time notifications dan WebSocket - Subscribe notifikasi, WebSocket events, queue updates dengan 5 jenis notifikasi')
    .addTag('Gateway', 'Basic gateway operations - Health check, service discovery, load balancing')
    .addTag('advanced-gateway', 'Advanced gateway operations dengan saga patterns - Complex transactions, distributed operations')
    .addTag('monitoring', 'System monitoring dan health checks - Health status, metrics, dashboard, service monitoring dengan alerts')
    .addTag('health', 'Health check endpoints - Service status dan availability checks untuk semua microservices')
    .addTag('Stats', 'Statistics dan analytics - Queue stats, system metrics, reports dengan real-time data')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: `
## Bearer Token Usage

Dapatkan token dari login endpoint, kemudian gunakan dalam format:
\`Authorization: Bearer YOUR_ACCESS_TOKEN\`

**Token Types:**
- **Access Token**: Berlaku 15 menit untuk API calls
- **Refresh Token**: Berlaku 7 hari untuk refresh access token

**Example:**
\`\`\`
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`
      `
    })
    .addSecurity('apiKey', {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-KEY',
      description: 'Public API key for external integrations (OCR upload)'
    } as any)
    .addSecurityRequirements('bearer')
    .setContact(
      'MediQ Support',
      'https://mediq.craftthingy.com',
      'support@mediq.com'
    )
    .setLicense(
      'MIT License',
      'https://opensource.org/licenses/MIT'
    )
    .setTermsOfService('https://mediq.craftthingy.com/terms');

  // Prefer explicit server URL from env; fall back by environment
  if (process.env.SWAGGER_SERVER_URL) {
    builder.addServer(process.env.SWAGGER_SERVER_URL, 'Primary Server');
  } else if (process.env.NODE_ENV === 'production') {
    builder.addServer('https://mediq-api-gateway.craftthingy.com', 'Primary Server');
  } else {
    builder.addServer('http://localhost:8601', 'Development Server - Local development dengan hot reload');
  }

  // Optional: when not production, offer production URL as an alternative in the dropdown
  if (process.env.NODE_ENV !== 'production') {
    builder.addServer('https://mediq-api-gateway.craftthingy.com', 'Production Server - Live production environment');
  }

  builder.setExternalDoc('Complete MediQ Documentation', 'https://mediq.craftthingy.com/docs');

  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);

  // Serve raw JSON spec for tooling and to avoid UI cache confusion
  app.getHttpAdapter().get('/api-json', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json(document);
  });
  
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
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      tryItOutEnabled: true,
      tagsSorter: 'alpha', 
      operationsSorter: 'alpha',
      deepLinking: true,
      displayOperationId: false,
      showMutatedRequest: true,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
      requestInterceptor: (request) => {
        // Log requests for debugging
        console.log('Swagger Request:', request.method, request.url);
        return request;
      },
      onComplete: () => {
        console.log('Swagger UI loaded successfully');
      }
    },
    customSiteTitle: 'MediQ API Gateway v3.0 - Real-time Healthcare Platform with WebSocket & Gemini AI',
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
      .swagger-ui .markdown code {
        background: #f8f9fa;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      }
      .swagger-ui .markdown pre {
        background: #2d3748;
        color: #e2e8f0;
        padding: 16px;
        border-radius: 8px;
        overflow-x: auto;
        margin: 16px 0;
      }
      .swagger-ui .opblock-summary-description {
        font-size: 14px;
        color: #666;
        margin-top: 8px;
      }
      .swagger-ui .auth-container .auth-btn-wrapper {
        margin: 16px 0;
        padding: 12px;
        background: #f8f9fa;
        border-radius: 6px;
      }
      .swagger-ui .btn.authorize {
        background: #1976d2;
        color: white;
        font-weight: bold;
        padding: 8px 16px;
        border-radius: 4px;
      }
    `,
    customJs: [
      'https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js',
    ],
  });

  // Basic routes
  app.getHttpAdapter().get('/', (req, res) => {
    res.json({
      message: 'MediQ API Gateway v3.0 - Real-time Healthcare Platform',
      version: '3.0.0',
      status: 'running',
      features: [
        '🤖 Gemini AI OCR with 95%+ accuracy for KTP extraction',
        '👥 Complete user management with 17+ KTP fields',
        '🏥 Institution and facility management with search',
        '📋 Smart queue system dengan real-time notifications',
        '🔐 JWT authentication dengan role-based access control',
        '🔔 Real-time WebSocket notifications (5 types)',
        '📊 Advanced monitoring dengan health checks',
        '⚡ High-performance microservice architecture'
      ],
      services: [
        { name: 'API Gateway', port: 8601, status: 'running', url: exampleBaseUrl },
        { name: 'User Service', port: 8602, status: 'running', url: 'https://mediq-user-service.craftthingy.com' },
        { name: 'OCR Service', port: 8603, status: 'running', url: 'https://mediq-ocr-service.craftthingy.com' },
        { name: 'OCR Engine', port: 8604, status: 'running', url: 'https://mediq-ocr-engine-service.craftthingy.com' },
        { name: 'Patient Queue', port: 8605, status: 'running', url: 'https://mediq-patient-queue-service.craftthingy.com' },
        { name: 'Institution', port: 8606, status: 'running', url: 'https://mediq-institution-service.craftthingy.com' },
      ],
      documentation: '/api/docs',
      totalEndpoints: 48,
      endpoints: {
        Authentication: ['/auth/login/admin', '/auth/login/user', '/auth/refresh', '/auth/logout'],
        Users: ['/users', '/users/profile', '/users/check-nik/{nik}', '/users/{id}', '/users/{id}/role'],
        OCR: [
          '/ocr/upload',
          '/ocr/confirm',
          '/ocr/temp/{tempId}',
          '/ocr/confirm-temp/{tempId}'
        ],
        'OCR Engine': ['/ocr-engine/process', '/ocr-engine/scan-ocr', '/ocr-engine/validate-result'],
        Institutions: ['/institutions', '/institutions/search', '/institutions/{id}', '/institutions/{id}/services', '/institutions/{id}/queue/stats'],
        queue: ['/queue', '/queue/my-queue', '/queue/stats', '/queue/{id}', '/queue/{id}/status', '/queue/{id}/call', '/queue/institution/{id}/current', '/queue/institution/{id}/next'],
        Notifications: ['/notifications/subscribe', '/notifications/trigger/{type}', '/notifications/status/websocket', '/notifications/queue/{institutionId}/status', '/notifications/queue/{institutionId}/broadcast'],
        WebSocket: ['/api/websocket - Real-time updates'],
        Gateway: ['/gateway/health', '/gateway/status'],
        'advanced-gateway': ['/advanced-gateway/saga-transaction', '/advanced-gateway/distributed-operation'],
        monitoring: ['/monitoring/health', '/monitoring/metrics', '/monitoring/services', '/monitoring/dashboard'],
        health: ['/health'],
        Stats: ['/stats/queue', '/stats/system', '/stats/reports']
      },
      realTimeFeatures: {
        websocket: '/api/websocket',
        notifications: ['registration_success', 'queue_joined', 'queue_almost_ready', 'queue_ready', 'consultation_completed'],
        queueUpdates: 'Real-time queue status dari semua institusi',
        subscriptions: 'User dapat subscribe ke notifikasi spesifik'
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
  console.log(`📊 Total Endpoints: 48 (13 categories: Authentication, Users, OCR, OCR Engine, Institutions, queue, Notifications, WebSocket, Gateway, advanced-gateway, monitoring, health, Stats)`);
  console.log(`🔗 WebSocket Endpoint: ws://localhost:${port}/api/websocket`);
  console.log(`🔔 Real-time Notifications: registration, queue updates, consultation events`);
}

bootstrap().catch((error) => {
  console.error('Error starting API Gateway:', error);
  process.exit(1);
});
