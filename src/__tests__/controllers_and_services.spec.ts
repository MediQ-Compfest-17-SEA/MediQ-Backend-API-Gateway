import axios from 'axios';
import { Request } from 'express';
import { UsersController } from 'src/users/users.controller';
import { UsersService } from 'src/users/users.service';
import { InstitutionsService } from 'src/institutions/institutions.service';
import { GatewayService } from 'src/gateway/gateway.service';
import { QueueController } from 'src/queue/queue.controller';
import { QueueService } from 'src/queue/queue.service';

// Axios mock supporting both default and named import signatures
jest.mock('axios', () => {
  const get = jest.fn();
  const post = jest.fn();
  const put = jest.fn();
  const patch = jest.fn();
  const del = jest.fn();
  return {
    __esModule: true,
    default: { get, post, put, patch, delete: del },
    get,
    post,
    put,
    patch,
    delete: del,
  };
});

describe('Controllers and Services - unit coverage', () => {
  describe('UsersController HTTP fallback paths', () => {
    let controller: UsersController;
    let usersService: jest.Mocked<UsersService>;

    beforeAll(() => {
      process.env.USER_HTTP_URL = 'http://127.0.0.1:8602';
    });

    beforeEach(() => {
      jest.clearAllMocks();

      usersService = {
        create: jest.fn(),
        checkNik: jest.fn(),
        getProfile: jest.fn(),
        getMeFromJwt: jest.fn(),
        getUserById: jest.fn(),
        findAll: jest.fn(),
        updateRole: jest.fn(),
        delete: jest.fn(),
      } as any;

      controller = new UsersController(usersService as any);
    });

    it('findAll - uses internal service when available', async () => {
      const expected = [{ id: 'u1' }];
      usersService.findAll.mockResolvedValueOnce(expected);

      const result = await controller.findAll({ headers: { authorization: 'Bearer x' } } as unknown as Request);

      expect(usersService.findAll).toHaveBeenCalled();
      expect(result).toBe(expected);
    });

    it('findAll - falls back to HTTP with Authorization header and returns upstream data', async () => {
      usersService.findAll.mockRejectedValueOnce(new Error('no transport'));
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'u-http' }] });

      const req = { headers: { authorization: 'Bearer admin' } } as unknown as Request;
      const result = await controller.findAll(req);

      expect(axios.get).toHaveBeenCalledWith(
        'http://127.0.0.1:8602/users',
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin' },
          timeout: 8000,
        }),
      );
      expect(result).toEqual([{ id: 'u-http' }]);
    });

    it('updateRole - internal ok', async () => {
      usersService.updateRole.mockResolvedValueOnce({ id: 'u1', role: 'ADMIN_FASKES' } as any);

      const result = await controller.updateRole('u1', { role: 'ADMIN_FASKES' } as any, { headers: {} } as any);

      expect(usersService.updateRole).toHaveBeenCalledWith('u1', { role: 'ADMIN_FASKES' });
      expect(result).toEqual({ id: 'u1', role: 'ADMIN_FASKES' });
    });

    it('updateRole - fallback to HTTP PATCH when internal fails', async () => {
      usersService.updateRole.mockRejectedValueOnce(new Error('no transport'));
      (axios.patch as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

      const req = { headers: { authorization: 'Bearer admin' } } as unknown as Request;
      const result = await controller.updateRole('u2', { role: 'OPERATOR' } as any, req);

      expect(axios.patch).toHaveBeenCalledWith(
        'http://127.0.0.1:8602/users/u2/role',
        { role: 'OPERATOR' },
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin' },
          timeout: 8000,
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it('updateUser (PUT) - direct HTTP path returns upstream data', async () => {
      (axios.put as jest.Mock).mockResolvedValueOnce({ data: { id: 'u3', name: 'John' } });

      const req = { headers: { authorization: 'Bearer admin' } } as unknown as Request;
      const result = await controller.updateUser('u3', { name: 'John' }, req);

      expect(axios.put).toHaveBeenCalledWith(
        'http://127.0.0.1:8602/users/u3',
        { name: 'John' },
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin' },
          timeout: 8000,
        }),
      );
      expect(result).toEqual({ id: 'u3', name: 'John' });
    });

    it('remove - fallback to HTTP DELETE when internal fails', async () => {
      usersService.delete.mockRejectedValueOnce(new Error('no transport'));
      (axios.delete as jest.Mock).mockResolvedValueOnce({ data: { deleted: true } });

      const req = { headers: { authorization: 'Bearer admin' } } as unknown as Request;
      const result = await controller.remove('u4', req);

      expect(axios.delete).toHaveBeenCalledWith(
        'http://127.0.0.1:8602/users/u4',
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin' },
          timeout: 8000,
        }),
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('InstitutionsService findAll fallback + default list', () => {
    let institutions: InstitutionsService;
    let gatewayService: jest.Mocked<GatewayService>;

    beforeAll(() => {
      process.env.INSTITUTION_HTTP_URL = 'http://localhost:8606';
    });

    beforeEach(() => {
      jest.clearAllMocks();
      gatewayService = {
        sendToUserService: jest.fn(),
        sendToOcrService: jest.fn(),
        sendToInstitutionService: jest.fn(),
      } as any;

      institutions = new InstitutionsService(gatewayService as any);
    });

    it('uses internal transport when available', async () => {
      gatewayService.sendToInstitutionService.mockResolvedValueOnce([{ id: 'i1' }]);

      const res = await institutions.findAll({ location: 'city' });

      expect(gatewayService.sendToInstitutionService).toHaveBeenCalledWith('institution.findAll', { location: 'city' });
      expect(res).toEqual([{ id: 'i1' }]);
    });

    it('falls back to HTTP when internal fails and returns upstream list', async () => {
      gatewayService.sendToInstitutionService.mockRejectedValueOnce(new Error('down'));
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'http-i1' }] });

      const res = await institutions.findAll({ type: 'clinic' });

      expect(axios.get).toHaveBeenCalledWith(
        'http://localhost:8606/institutions',
        expect.objectContaining({ params: { type: 'clinic' }, timeout: 8000 }),
      );
      expect(res).toEqual([{ id: 'http-i1' }]);
    });

    it('returns minimal default list when HTTP fallback also fails', async () => {
      gatewayService.sendToInstitutionService.mockRejectedValueOnce(new Error('down'));
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('http error'));

      const res = await institutions.findAll();

      expect(Array.isArray(res)).toBe(true);
      expect(res[0]).toEqual(
        expect.objectContaining({ id: 'default-inst', name: 'Default Clinic', code: 'DEF' }),
      );
    });
  });

  describe('QueueController passthrough methods', () => {
    let controller: QueueController;
    let queueService: jest.Mocked<QueueService>;

    beforeEach(() => {
      jest.clearAllMocks();
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

      controller = new QueueController(queueService as any);
    });

    it('updateQueueStatus delegates to service with user context', async () => {
      queueService.updateStatus.mockResolvedValueOnce({ ok: true } as any);

      const result = await controller.updateQueueStatus('qid-1', { status: 'called' } as any, { id: 'u1' });

      expect(queueService.updateStatus).toHaveBeenCalledWith('qid-1', 'called', { id: 'u1' });
      expect(result).toEqual({ ok: true });
    });

    it('callPatient delegates to service with user context', async () => {
      queueService.callPatient.mockResolvedValueOnce({ ok: true } as any);

      const result = await controller.callPatient('qid-2', { id: 'op-1' });

      expect(queueService.callPatient).toHaveBeenCalledWith('qid-2', { id: 'op-1' });
      expect(result).toEqual({ ok: true });
    });

    it('getQueueStats delegates to service', async () => {
      queueService.getStats.mockResolvedValueOnce({ total: 5 } as any);

      const result = await controller.getQueueStats('inst-xyz');

      expect(queueService.getStats).toHaveBeenCalledWith('inst-xyz');
      expect(result).toEqual({ total: 5 });
    });
  });
});