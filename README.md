# MediQ Backend - API Gateway

API Gateway service untuk MediQ Backend yang menggunakan arsitektur microservices dengan RabbitMQ sebagai message broker.

## Fitur Utama

- **HTTP to RabbitMQ Proxy**: Mengubah HTTP requests menjadi RabbitMQ messages
- **Authentication**: JWT-based authentication dengan role-based access control
- **Circuit Breaker**: Retry mechanism dan timeout handling
- **Swagger Documentation**: Comprehensive API documentation
- **Error Handling**: Centralized error handling dengan custom filters
- **Logging**: Structured logging untuk monitoring

## Arsitektur

```
HTTP Client -> API Gateway -> RabbitMQ -> User Service
                     ^
                     |
            JWT Authentication
            Role-based Authorization
```

## Endpoints

### Authentication (`/auth`)
- `POST /auth/login/admin` - Login admin dengan email/password
- `POST /auth/login/user` - Login user dengan NIK/nama
- `GET /auth/refresh` - Refresh access token
- `GET /auth/logout` - Logout user

### Users (`/users`)
- `POST /users` - Buat user baru
- `GET /users/check-nik/:nik` - Cek apakah NIK sudah terdaftar
- `GET /users/profile` - Dapatkan profil user (requires JWT)
- `GET /users` - Dapatkan semua users (Admin only)
- `PATCH /users/:id/role` - Update role user (Admin only)
- `DELETE /users/:id` - Hapus user (Admin only)

### Gateway (`/`)
- `GET /` - Health check

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development
npm run start:dev
```

## Environment Variables

```env
PORT=3001
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
RABBITMQ_URL=amqp://localhost:5672
```

## API Documentation

Swagger UI tersedia di: `http://localhost:3001/api/docs`

## Message Patterns

### User Service Patterns
- `user.create` - Buat user baru
- `user.check-nik` - Cek NIK
- `user.profile` - Dapatkan profil
- `user.findAll` - Dapatkan semua users
- `user.updateRole` - Update role
- `user.delete` - Hapus user
- `auth.login.admin` - Login admin
- `auth.login.user` - Login user
- `auth.refresh` - Refresh token
- `auth.logout` - Logout
- `health.check` - Health check

## Error Handling

- **Timeout**: 5 detik timeout untuk setiap RabbitMQ call
- **Retry**: 2x retry dengan delay 1 detik
- **Circuit Breaker**: Error mapping dari service responses
- **Logging**: Semua requests dan errors di-log

## Scripts

```bash
npm run build        # Build aplikasi
npm run start        # Start production
npm run start:dev    # Start development dengan watch
npm run test         # Run unit tests
npm run test:e2e     # Run e2e tests
npm run lint         # ESLint dengan auto-fix
npm run format       # Prettier formatting
```
