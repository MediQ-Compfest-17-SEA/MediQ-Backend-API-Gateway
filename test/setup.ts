import 'reflect-metadata';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
  process.env.RABBITMQ_URL = 'amqp://localhost:5672';
  process.env.USER_SERVICE_URL = 'amqp://localhost:5672';
  process.env.OCR_SERVICE_URL = 'amqp://localhost:5672';
  process.env.QUEUE_SERVICE_URL = 'amqp://localhost:5672';
});

// Global test cleanup
afterEach(() => {
  jest.clearAllMocks();
  jest.resetAllMocks();
});

// Silence console warnings in tests
console.warn = jest.fn();
console.error = jest.fn();
