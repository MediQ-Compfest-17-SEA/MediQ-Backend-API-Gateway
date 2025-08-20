import { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';

export const mockRabbitMQClient: jest.Mocked<ClientProxy> = {
  send: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

export const createMockRabbitMQResponse = <T>(data: T) => of(data);

export const mockRabbitMQProvider = {
  provide: 'RABBITMQ_SERVICE',
  useValue: mockRabbitMQClient,
};

// Message patterns used in API Gateway
export const MessagePatterns = {
  // User Service patterns
  USER_CREATE: 'user.create',
  USER_FIND_ALL: 'user.findAll',
  USER_UPDATE_ROLE: 'user.updateRole',
  USER_DELETE: 'user.delete',
  USER_PROFILE: 'user.profile',
  USER_CHECK_NIK: 'user.check-nik',
  
  // Auth patterns
  AUTH_LOGIN_ADMIN: 'auth.login.admin',
  AUTH_LOGIN_USER: 'auth.login.user',
  AUTH_REFRESH: 'auth.refresh',
  AUTH_LOGOUT: 'auth.logout',
  
  // OCR patterns
  OCR_PROCESS_KTP: 'ocr.process-ktp',
  
  // Queue patterns
  QUEUE_ADD: 'queue.add-to-queue',
  QUEUE_CALL_NEXT: 'queue.call-next',
  QUEUE_GET_ALL: 'queue.get-all',
  QUEUE_DELETE: 'queue.delete',
} as const;

// Setup default mock responses
mockRabbitMQClient.send.mockImplementation((pattern, data) => {
  switch (pattern) {
    case MessagePatterns.USER_CREATE:
      return createMockRabbitMQResponse({ id: 'mock-user-id', ...data });
    case MessagePatterns.AUTH_LOGIN_ADMIN:
    case MessagePatterns.AUTH_LOGIN_USER:
      return createMockRabbitMQResponse({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    case MessagePatterns.USER_FIND_ALL:
      return createMockRabbitMQResponse([]);
    default:
      return createMockRabbitMQResponse({ success: true });
  }
});
