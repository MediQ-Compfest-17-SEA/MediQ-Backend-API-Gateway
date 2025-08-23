import { HttpException } from '@nestjs/common';
import axios from 'axios';
import { QueueController } from 'src/queue/queue.controller';
import { QueueService } from 'src/queue/queue.service';
import { AuthService } from 'src/auth/auth.service';
import { GatewayService } from 'src/gateway/gateway.service';

// Mocks
// Support both ESM default import and named methods to avoid undefined axios.get/post
jest.mock('axios', () => {
  const get = jest.fn();
  const post = jest.fn();
  return {
    __esModule: true,
    default: { get, post },
    get,
    post,
  };
});

describe('API Gateway - QueueController + AuthService unit', () => {
  let controller: QueueController;
  let queueService: jest.Mocked<QueueService>;
  let gatewayService: jest.Mocked<GatewayService>;
  let authService: AuthService;

  beforeAll(() => {
    process.env.QUEUE_HTTP_URL = 'http://127.0.0.1:8605';
    process.env.USER_HTTP_URL = 'http://127.0.0.1:8602';
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Minimal mocked QueueService
    queueService = {
      addToQueue: jest.fn(),
      findAll: jest.fn(),
      getMyQueue: jest.fn(),
      getStats: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
      callPatient: jest.fn(),
      cancel: jest.fn(),
      getCurrentQueue: jest.fn(),
      getNextQueue: jest.fn(),
    } as any;

    controller = new QueueController(queueService);

    gatewayService = {
      sendToUserService: jest.fn(),
      sendToOcrService: jest.fn(),
      sendToInstitutionService: jest.fn(),
    } as any;

    authService = new AuthService(gatewayService);
  });

  describe('QueueController.getAllQueues', () => {
    it('returns data from QueueService.findAll when internal transport succeeds', async () => {
      const expected = [{ id: 'q1' }];
      queueService.findAll.mockResolvedValue(expected);

      const result = await controller.getAllQueues('inst-1', 'waiting', '2025-08-22', {
        headers: { authorization: 'Bearer token' },
      } as any);

      expect(queueService.findAll).toHaveBeenCalledWith({
        institutionId: 'inst-1',
        status: 'waiting',
        date: '2025-08-22',
      });
      expect(result).toBe(expected);
    });

    it('falls back to HTTP when internal transport fails and returns upstream payload', async () => {
      queueService.findAll.mockRejectedValue(new Error('transport down'));
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'fallback-q1' }],
      });

      const result = await controller.getAllQueues('inst-2', 'waiting', '2025-08-23', {
        headers: { authorization: 'Bearer admin' },
      } as any);

      expect(axios.get).toHaveBeenCalledWith(
        'http://127.0.0.1:8605/queue',
        expect.objectContaining({
          params: { institutionId: 'inst-2', status: 'waiting', date: '2025-08-23' },
          headers: { Authorization: 'Bearer admin' },
          timeout: 8000,
        }),
      );
      expect(result).toEqual([{ id: 'fallback-q1' }]);
    });

    it('maps upstream HTTP error to HttpException with preserved status', async () => {
      queueService.findAll.mockRejectedValue(new Error('transport down'));
      (axios.get as jest.Mock).mockRejectedValueOnce({
        response: { status: 503, data: { message: 'Upstream Queue unavailable' } },
      });

      await expect(
        controller.getAllQueues('inst-3', 'waiting', '2025-08-24', {
          headers: { authorization: 'Bearer admin' },
        } as any),
      ).rejects.toMatchObject({
        response: { message: 'Upstream Queue unavailable' },
        status: 503,
      });
    });
  });

  describe('AuthService.loginAdmin', () => {
    it('uses internal transport when available', async () => {
      gatewayService.sendToUserService.mockResolvedValueOnce({ accessToken: 'internal-abc' });

      const result = await authService.loginAdmin({ email: 'a@b.c', password: 'pw' });

      expect(gatewayService.sendToUserService).toHaveBeenCalledWith('auth.login.admin', {
        email: 'a@b.c',
        password: 'pw',
      });
      expect(result).toEqual({ accessToken: 'internal-abc' });
    });

    it('falls back to HTTP and returns upstream payload', async () => {
      gatewayService.sendToUserService.mockRejectedValueOnce(new Error('no transport'));
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { accessToken: 'http-xyz' },
      });

      const result = await authService.loginAdmin({ email: 'admin@x.y', password: 'pw' });
 
      expect(axios.post).toHaveBeenCalledWith(
        `${process.env.USER_HTTP_URL || 'http://localhost:8602'}/auth/login/admin`,
        { email: 'admin@x.y', password: 'pw' },
        { timeout: 8000 },
      );
      expect(result).toEqual({ accessToken: 'http-xyz' });
    });

    it('maps upstream HTTP error to HttpException with preserved status', async () => {
      gatewayService.sendToUserService.mockRejectedValueOnce(new Error('no transport'));
      (axios.post as jest.Mock).mockRejectedValueOnce({
        response: { status: 401, data: { message: 'invalid_credentials' } },
      });

      await expect(authService.loginAdmin({ email: 'x@y.z', password: 'bad' })).rejects.toBeInstanceOf(HttpException);

      try {
        await authService.loginAdmin({ email: 'x@y.z', password: 'bad' });
      } catch (e: any) {
        expect(e.getStatus()).toBe(401);
        expect(e.getResponse()).toEqual({ message: 'invalid_credentials' });
      }
    });
  });
});