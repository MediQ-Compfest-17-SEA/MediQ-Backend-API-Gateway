# MediQ Backend - API Gateway

## 🚪 Deskripsi

**API Gateway** adalah pintu masuk terpusat (centralized entry point) untuk semua layanan MediQ Backend. Service ini bertindak sebagai **proxy cerdas** yang mengarahkan semua request HTTP ke microservices yang sesuai menggunakan RabbitMQ message patterns dengan **enterprise-grade resilience patterns**.

## ✨ Fitur Utama

### 🔄 Smart Request Routing
- **HTTP to RabbitMQ Proxy**: Mengubah HTTP requests menjadi RabbitMQ message patterns
- **Service Discovery**: Otomatis routing ke service yang tepat
- **Load Balancing**: Distribusi request yang optimal
- **Request/Response Transformation**: Seamless data mapping

### 🛡️ Enterprise Security
- **JWT Authentication**: Access token dan refresh token validation
- **Role-Based Authorization**: PASIEN, OPERATOR, ADMIN_FASKES permissions
- **Rate Limiting**: Proteksi dari abuse dan DDoS attacks
- **API Key Management**: Secure access untuk external integrations

### ⚡ Advanced Resilience Patterns
- **Circuit Breaker**: Fail-fast ketika downstream services down
- **Retry dengan Exponential Backoff**: Smart retry mechanism untuk transient failures
- **Timeout Management**: Configurable timeouts untuk semua operations
- **Bulkhead Pattern**: Isolasi critical vs non-critical operations

### 📊 Observability & Monitoring
- **Request Logging**: Comprehensive request/response logging
- **Metrics Collection**: Performance dan error rate tracking
- **Health Monitoring**: Real-time service health checks
- **Distributed Tracing**: End-to-end request tracing

## 🚀 Quick Start

### Persyaratan
- **Node.js** 18+
- **RabbitMQ** 3.9+ (untuk service communication)
- **Redis** 6.0+ (untuk session dan cache)
- **All MediQ Services** running (User, OCR, Queue, Institution)

### Instalasi

```bash
# Clone repository
git clone https://github.com/MediQ-Compfest-17-SEA/MediQ-Backend-API-Gateway.git
cd MediQ-Backend-API-Gateway

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env sesuai konfigurasi environment Anda

# Start development server
npm run start:dev
```

### Environment Variables

```env
# Server Configuration
PORT=8601
NODE_ENV=development

# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
USER_SERVICE_QUEUE=user_service_queue
OCR_SERVICE_QUEUE=ocr_service_queue
QUEUE_SERVICE_QUEUE=patient_queue_service_queue
INSTITUTION_SERVICE_QUEUE=institution_service_queue

# JWT Configuration
JWT_SECRET=your-jwt-secret-256-bits-minimum
JWT_REFRESH_SECRET=your-refresh-secret-256-bits-minimum
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Circuit Breaker Configuration
CB_FAILURE_THRESHOLD=5
CB_SUCCESS_THRESHOLD=2
CB_TIMEOUT=60000

# Retry Configuration
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
RETRY_MAX_DELAY=10000

# Rate Limiting
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
```

## 📋 API Endpoints

### Base URL
**Development**: `http://localhost:8601`  
**Production**: `https://api.mediq.com`

### Swagger Documentation
**Interactive API Docs**: `http://localhost:8601/api/docs`

### Proxied Endpoints

#### 👤 User Management (Proxy ke User Service)

**Register User**
```http
POST /users
Content-Type: application/json

{
  "nik": "3171012345678901",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "password123"
}
```

**Login Admin**
```http
POST /auth/login/admin
Content-Type: application/json

{
  "email": "admin@mediq.com",
  "password": "admin123"
}
```

**Login User (NIK + Nama)**
```http
POST /auth/login/user
Content-Type: application/json

{
  "nik": "3171012345678901",
  "name": "John Doe"
}
```

#### 📷 OCR Processing (Proxy ke OCR Service)

**Upload KTP**
```http
POST /ocr/upload
Content-Type: multipart/form-data

Form Data:
- file: [KTP image file]
```

**Confirm OCR Data**
```http
POST /ocr/confirm
Content-Type: application/json

{
  "nik": "3171012345678901",
  "nama": "John Doe",
  "tempat_lahir": "Jakarta",
  // ... other KTP data
}
```

#### 🏥 Queue Management (Proxy ke Queue Service)

**Add to Queue**
```http
POST /queue
Content-Type: application/json

{
  "nik": "3171012345678901",
  "nama": "John Doe",
  "priority": "NORMAL",
  "keterangan": "Kontrol rutin"
}
```

**Get Queue Statistics**
```http
GET /queue/stats
```

#### 🏢 Institution Management (Proxy ke Institution Service)

**Get All Institutions**
```http
GET /institutions
```

**Create Institution**
```http
POST /institutions
Content-Type: application/json

{
  "name": "RS Harapan Bunda",
  "address": "Jl. Sehat No. 123",
  "phone": "021-555-1234"
}
```

## 🧪 Testing

### Unit Testing
```bash
# Run all tests with coverage
npm run test:cov

# Run tests in watch mode
npm run test:watch

# Test specific component
npm run test gateway.service.spec.ts
npm run test retry.interceptor.spec.ts
```

### Integration Testing
```bash
# Test RabbitMQ proxy functionality
npm run test:integration

# Test circuit breaker scenarios
npm run test:circuit-breaker

# Test authentication flows
npm run test:auth-integration
```

### Performance Testing
```bash
# Load testing dengan concurrent requests
npm run test:load

# Circuit breaker stress testing
npm run test:stress
```

## 🏗️ Arsitektur

### Request Flow
```
1. Client HTTP Request → API Gateway (8601)
2. Authentication & Authorization → JWT Validation
3. Rate Limiting → Request throttling
4. Circuit Breaker Check → Service availability
5. RabbitMQ Message → Target Service
6. Response Processing → HTTP Response
```

### Resilience Patterns
```typescript
// Circuit Breaker Pattern
@Injectable()
export class CircuitBreakerService {
  async execute(serviceName, operation, config) {
    if (circuit.state === OPEN) {
      throw new ServiceUnavailableException();
    }
    
    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}

// Retry dengan Exponential Backoff
@Injectable() 
export class RetryInterceptor {
  intercept(context, next) {
    return next.handle().pipe(
      retryWhen(errors => 
        errors.pipe(
          delay(1000),
          take(3),
          concatMap(error => {
            if (this.shouldRetry(error)) {
              return of(error);
            }
            return throwError(error);
          })
        )
      )
    );
  }
}
```

### Service Communication
```typescript
// Message Patterns untuk setiap service
const MESSAGE_PATTERNS = {
  USER_SERVICE: {
    'user.create': CreateUserDto,
    'user.findAll': {},
    'user.profile': { userId: string },
    'auth.login.admin': AdminLoginDto,
    'auth.login.user': UserLoginDto,
  },
  OCR_SERVICE: {
    'ocr.upload': { file: Express.Multer.File },
    'ocr.confirm': OcrDataDto,
  },
  QUEUE_SERVICE: {
    'queue.add-to-queue': CreatePatientQueueDto,
    'queue.get-stats': {},
    'queue.get-next': {},
  },
  INSTITUTION_SERVICE: {
    'institution.findAll': {},
    'institution.create': CreateInstitutionDto,
  }
};
```

## 📦 Production Deployment

### Docker
```bash
# Build production image
docker build -t mediq/api-gateway:latest .

# Run container dengan full configuration
docker run -p 8601:8601 \
  -e RABBITMQ_URL="amqp://rabbitmq:5672" \
  -e JWT_SECRET="your-production-jwt-secret" \
  -e CB_FAILURE_THRESHOLD=3 \
  -e RATE_LIMIT_MAX=1000 \
  mediq/api-gateway:latest
```

### Kubernetes
```bash
# Deploy with auto-scaling
kubectl apply -f k8s/

# Check gateway status
kubectl get pods -l app=api-gateway

# View gateway logs
kubectl logs -f deployment/api-gateway

# Check circuit breaker status
kubectl exec -it api-gateway-pod -- curl localhost:8601/health
```

### Load Balancing
```yaml
# NGINX Ingress configuration
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mediq-ingress
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  rules:
  - host: api.mediq.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 8601
```

## 🔧 Development

### Project Structure
```
src/
├── gateway/
│   ├── gateway.controller.ts  # Health check dan status
│   └── gateway.service.ts     # Core RabbitMQ communication
├── users/
│   ├── users.controller.ts    # User endpoints proxy
│   └── users.service.ts       # User service communication
├── auth/
│   ├── auth.controller.ts     # Auth endpoints proxy
│   ├── auth.service.ts        # Auth service communication
│   ├── guards/               # JWT dan roles guards
│   └── decorators/           # Custom decorators
├── common/
│   ├── services/             # Circuit breaker, saga, event store
│   ├── interceptors/         # Retry, timeout, metrics, logging
│   ├── filters/              # Global exception handling
│   └── patterns/             # Saga dan compensation patterns
└── config/
    ├── rabbitmq.config.ts    # RabbitMQ configuration
    └── resilience.config.ts  # Circuit breaker config
```

### Development Commands
```bash
# Development dengan hot reload
npm run start:dev

# Build production
npm run build

# Linting dan formatting
npm run lint
npm run format

# Testing
npm run test              # Unit tests
npm run test:cov         # With coverage
npm run test:integration # Integration tests
npm run test:e2e         # End-to-end tests
```

## 🚨 Monitoring & Troubleshooting

### Health Checks
```bash
# Gateway health
curl http://localhost:8601/health

# Service connectivity
curl http://localhost:8601/gateway/status

# Circuit breaker status
curl http://localhost:8601/metrics
```

### Common Issues

**RabbitMQ Connection Error**:
```bash
# Check RabbitMQ status
rabbitmqctl status

# Test connection
curl http://localhost:15672  # Management UI

# Check gateway logs
kubectl logs -f deployment/api-gateway
```

**Circuit Breaker OPEN**:
```bash
# Check service health
curl http://localhost:8602/health  # User Service
curl http://localhost:8603/health  # OCR Service

# Reset circuit breaker (if needed)
curl -X POST http://localhost:8601/gateway/reset-circuit-breaker
```

**High Response Time**:
```bash
# Check service metrics
curl http://localhost:8601/metrics

# Monitor RabbitMQ queues
rabbitmqctl list_queues name messages

# Check resource usage
kubectl top pods -l app=api-gateway
```

### Performance Monitoring
```typescript
// Gateway metrics tracking
export interface GatewayMetrics {
  requestsTotal: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  circuitBreakerStatus: {
    userService: CircuitState;
    ocrService: CircuitState;
    queueService: CircuitState;
  };
  activeConnections: number;
}
```

## 🔒 Security Features

### Authentication & Authorization
```typescript
// JWT validation pipeline
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_FASKES)
async getUsers(@CurrentUser() user: User) {
  return this.usersService.findAll(user);
}
```

### Rate Limiting
```typescript
// Configurable rate limiting
@UseGuards(ThrottlerGuard)
@Throttle(100, 60) // 100 requests per minute
async uploadKtp(@UploadedFile() file) {
  return this.ocrService.processImage(file);
}
```

### Request Validation
```typescript
// Comprehensive input validation
@UsePipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validateCustomDecorators: true,
}))
```

## 🎯 Use Cases

### Scenario 1: Patient Registration Flow
```
1. Mobile App → API Gateway (POST /ocr/upload)
2. API Gateway → OCR Service (process KTP)  
3. OCR Service → User Service (create/check user)
4. OCR Service → Queue Service (add to queue)
5. API Gateway → Mobile App (queue number response)
```

### Scenario 2: Admin Dashboard Access
```
1. Admin Web → API Gateway (POST /auth/login/admin)
2. API Gateway → User Service (validate credentials)
3. User Service → API Gateway (JWT tokens)
4. API Gateway → Admin Web (authenticated session)
5. Subsequent requests with JWT validation
```

### Scenario 3: Queue Management
```
1. Staff Interface → API Gateway (GET /queue/stats)
2. API Gateway → Queue Service (get statistics)
3. Queue Service → API Gateway (real-time data)
4. API Gateway → Staff Interface (dashboard data)
```

## 🔧 Configuration

### Circuit Breaker Settings
```typescript
// Service-specific circuit breaker config
export const CIRCUIT_BREAKER_CONFIG = {
  USER_SERVICE: {
    failureThreshold: 5,      // Open after 5 failures
    successThreshold: 2,      // Close after 2 successes  
    timeout: 60000,          // 1 minute timeout
  },
  OCR_SERVICE: {
    failureThreshold: 3,      // More sensitive untuk OCR
    successThreshold: 2,
    timeout: 30000,          // 30 seconds timeout
  },
};
```

### Retry Configuration
```typescript
// Retry policy per operation type
export const RETRY_CONFIG = {
  CRITICAL: {
    attempts: 5,
    delay: 2000,
    exponentialBackoff: true,
    maxDelay: 30000,
  },
  DEFAULT: {
    attempts: 3,
    delay: 1000,
    exponentialBackoff: true,
    maxDelay: 10000,
  },
};
```

## 🤝 Contributing

1. **Fork** repository
2. **Create feature branch** (`git checkout -b feature/gateway-enhancement`)
3. **Write comprehensive tests** dengan 100% coverage
4. **Update documentation** jika menambah endpoints
5. **Test dengan all scenarios** (success, failure, timeout)
6. **Commit changes** (`git commit -m 'Add gateway enhancement'`)
7. **Push branch** (`git push origin feature/gateway-enhancement`)
8. **Create Pull Request**

### Development Guidelines
- **Resilience First**: Always implement error handling dan retry logic
- **Security Conscious**: Validate semua inputs dan secure semua endpoints
- **Performance Aware**: Monitor response times dan resource usage
- **Observable**: Add logging dan metrics untuk all operations
- **Testable**: Write tests untuk semua scenarios including failures

## 📊 Monitoring & Alerts

### Key Metrics
```typescript
// Gateway dashboard metrics
{
  "requests_per_second": 150,
  "average_response_time": "45ms", 
  "error_rate": "0.1%",
  "circuit_breaker_status": {
    "user_service": "CLOSED",
    "ocr_service": "HALF_OPEN", 
    "queue_service": "CLOSED"
  },
  "active_connections": 25,
  "memory_usage": "512MB",
  "cpu_usage": "15%"
}
```

### Alerting Rules
```yaml
# Prometheus alerting rules
groups:
  - name: mediq-gateway-alerts
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
      for: 2m
      labels:
        severity: warning
      annotations:
        summary: "High error rate pada API Gateway"
        
    - alert: CircuitBreakerOpen
      expr: circuit_breaker_state{state="OPEN"} == 1
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Circuit breaker terbuka untuk {{ $labels.service }}"
```

## 📄 License

Copyright (c) 2024 MediQ Team. All rights reserved.

---

**💡 Tips Pengembangan**:
- Monitor circuit breaker status via `/metrics` endpoint
- Use correlation IDs untuk debugging cross-service calls  
- Test failure scenarios dengan controlled service shutdowns
- Implement gradual rollout untuk production deployments
- Monitor RabbitMQ queue depths untuk early warning

**🔗 Integration Points**:
- **Frontend Applications**: Primary access point untuk all client apps
- **User Service**: Authentication dan user management
- **OCR Service**: KTP processing workflows
- **Queue Service**: Patient queue management
- **Institution Service**: Healthcare facility management
- **Monitoring Stack**: Prometheus, Grafana, alerting systems
