import { MediQWebSocketGateway } from 'src/websocket/websocket.gateway';
import { NotificationService } from 'src/notifications/notification.service';
import { GatewayService } from 'src/gateway/gateway.service';
import { JwtService } from '@nestjs/jwt';

// Lightweight fakes
function createFakeSocket(overrides: Partial<any> = {}) {
  return {
    id: 'sock-1',
    handshake: { auth: {}, headers: {} },
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

describe('WebSocket Gateway and Notification Service', () => {
  let jwtService: jest.Mocked<JwtService>;
  let notificationService: NotificationService;
  let gatewayService: jest.Mocked<GatewayService>;
  let gateway: MediQWebSocketGateway;

  beforeEach(() => {
    jest.clearAllMocks();

    jwtService = {
      verify: jest.fn(),
      sign: jest.fn(),
      decode: jest.fn(),
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      decodeAsync: jest.fn() as any,
    } as any;

    // GatewayService mock for NotificationService
    gatewayService = {
      sendToUserService: jest.fn(),
      sendToInstitutionService: jest.fn(),
      sendToOcrService: jest.fn(),
    } as any;

    // Create real NotificationService with mocked deps
    notificationService = new NotificationService(gatewayService as any, {
      sendNotification: jest.fn(),
      broadcastQueueUpdate: jest.fn(),
    } as any);

    // System under test: gateway
    gateway = new MediQWebSocketGateway(jwtService, notificationService as any);

    // Mock server side of socket.io used by gateway.broadcast*
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
      sockets: {
        adapter: {
          rooms: new Map<string, Set<string>>(),
        },
      },
    };
  });

  describe('handleConnection', () => {
    it('authenticates token and joins rooms', async () => {
      const client = createFakeSocket({
        handshake: { auth: { token: 'valid' }, headers: {} },
      });
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        institutionId: 'inst-1',
      });

      await gateway.handleConnection(client as any);

      expect(jwtService.verify).toHaveBeenCalledWith('valid');
      expect(client.join).toHaveBeenCalledWith('user_user-1');
      expect(client.join).toHaveBeenCalledWith('institution_inst-1');
      expect(client.emit).toHaveBeenCalledWith('connected', expect.objectContaining({ userId: 'user-1' }));
    });

    it('allows anonymous connection when no token', async () => {
      const client = createFakeSocket({
        handshake: { auth: {}, headers: {} },
      });

      await gateway.handleConnection(client as any);

      // No verify call, no join to user room, but no disconnect
      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects on invalid token', async () => {
      const client = createFakeSocket({
        handshake: { auth: { token: 'bad' }, headers: {} },
      });
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('get_queue_status flow', () => {
    it('emits queue_status snapshot back to the requester', async () => {
      const client = createFakeSocket();
      const spyGetQueueStatus = jest
        .spyOn(notificationService, 'getQueueStatus')
        .mockResolvedValue({
          currentQueue: 10,
          totalWaiting: 5,
          estimatedWaitTime: 25,
          activeQueues: [{ id: 'q1' }],
        } as any);

      await gateway.handleGetQueueStatus({ institutionId: 'inst-9' }, client as any);

      expect(spyGetQueueStatus).toHaveBeenCalledWith('inst-9');
      expect(client.emit).toHaveBeenCalledWith(
        'queue_status',
        expect.objectContaining({
          institutionId: 'inst-9',
          currentQueue: 10,
          totalWaiting: 5,
          estimatedWaitTime: 25,
        }),
      );
    });
  });

  describe('broadcastQueueUpdate', () => {
    it('sends queue_updated to institution room', () => {
      gateway.broadcastQueueUpdate('inst-2', { action: 'patient_called', queueNumber: 12 });

      const server = (gateway as any).server;
      expect(server.to).toHaveBeenCalledWith('queue_inst-2');
      const room = server.to.mock.results[0].value;
      expect(room.emit).toHaveBeenCalledWith(
        'queue_updated',
        expect.objectContaining({ institutionId: 'inst-2', action: 'patient_called', queueNumber: 12 }),
      );
    });
  });

  describe('NotificationService.getQueueStatus', () => {
    it('calls user service and maps response', async () => {
      gatewayService.sendToUserService.mockResolvedValueOnce({
        currentQueue: 7,
        totalWaiting: 4,
        estimatedWaitTime: 12,
        activeQueues: [{ id: 'a' }],
      });

      const res = await notificationService.getQueueStatus('inst-x');
      expect(gatewayService.sendToUserService).toHaveBeenCalledWith('queue.get-status', { institutionId: 'inst-x' });
      expect(res).toEqual({
        currentQueue: 7,
        totalWaiting: 4,
        estimatedWaitTime: 12,
        activeQueues: [{ id: 'a' }],
      });
    });
  });
});