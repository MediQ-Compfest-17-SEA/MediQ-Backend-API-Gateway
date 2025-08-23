import { QueueService } from 'src/queue/queue.service';

describe('QueueService - unit', () => {
  let svc: QueueService;
  let gatewayService: any;
  let notificationService: any;
  let webSocketGateway: any;

  beforeEach(() => {
    gatewayService = {
      sendToUserService: jest.fn(),
    };

    notificationService = {
      sendQueueJoinedNotification: jest.fn(),
      sendConsultationCompletedNotification: jest.fn(),
      sendQueueStatusChangedNotification: jest.fn(),
      sendQueueReadyNotification: jest.fn(),
      sendQueueAlmostReadyNotification: jest.fn(),
    };

    webSocketGateway = {
      broadcastQueueUpdate: jest.fn(),
    };

    svc = new QueueService(gatewayService as any, notificationService as any, webSocketGateway as any);
  });

  it('addToQueue - emits notification + broadcast on success', async () => {
    gatewayService.sendToUserService.mockResolvedValueOnce({
      id: 'qid-1',
      queueNumber: 12,
      institutionName: 'Clinic',
      estimatedWaitTime: 15,
      currentPosition: 3,
      totalWaiting: 10,
    });

    const payload = { userId: 'u1', institutionId: 'inst-1' };

    const res = await svc.addToQueue(payload);

    expect(gatewayService.sendToUserService).toHaveBeenCalledWith('queue.add', payload);
    expect(notificationService.sendQueueJoinedNotification).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        id: 'qid-1',
        queueNumber: 12,
        institutionId: 'inst-1',
        institutionName: 'Clinic',
      }),
    );
    expect(webSocketGateway.broadcastQueueUpdate).toHaveBeenCalledWith('inst-1', expect.objectContaining({
      action: 'queue_joined',
      newQueue: 12,
      totalWaiting: 10,
      userId: 'u1',
    }));
    expect(res).toBeDefined();
  });

  it('updateStatus - completed triggers notifications and broadcast', async () => {
    gatewayService.sendToUserService.mockResolvedValueOnce({ ok: true }); // queue.updateStatus
    const findOneSpy = jest.spyOn(svc, 'findOne').mockResolvedValueOnce({
      id: 'qid-2',
      queueNumber: 20,
      status: 'in-progress',
      userId: 'u2',
      institutionId: 'inst-2',
      institutionName: 'Hospital',
      duration: 5,
    } as any);

    const res = await svc.updateStatus('qid-2', 'completed', { id: 'operator-1' });

    expect(gatewayService.sendToUserService).toHaveBeenCalledWith('queue.updateStatus', {
      id: 'qid-2',
      status: 'completed',
      user: { id: 'operator-1' },
    });
    expect(findOneSpy).toHaveBeenCalledWith('qid-2');
    expect(notificationService.sendConsultationCompletedNotification).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({
        queueId: 'qid-2',
        institutionId: 'inst-2',
        institutionName: 'Hospital',
        duration: 5,
      }),
    );
    expect(webSocketGateway.broadcastQueueUpdate).toHaveBeenCalledWith(
      'inst-2',
      expect.objectContaining({
        action: 'status_changed',
        queueId: 'qid-2',
        queueNumber: 20,
        oldStatus: 'in-progress',
        newStatus: 'completed',
        userId: 'u2',
      }),
    );
    expect(notificationService.sendQueueStatusChangedNotification).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({
        queueId: 'qid-2',
        oldStatus: 'in-progress',
        status: 'completed',
      }),
    );
    expect(res).toEqual({ ok: true });
  });

  it('callPatient - ready + upcoming notifications and broadcast', async () => {
    // First call result ok
    gatewayService.sendToUserService.mockResolvedValueOnce({ ok: true }); // queue.call

    // findOne result
    jest.spyOn(svc, 'findOne').mockResolvedValueOnce({
      id: 'qid-3',
      queueNumber: 30,
      userId: 'u3',
      institutionId: 'inst-3',
      institutionName: 'Clinic X',
    } as any);

    // upcoming queues for checkAndNotifyUpcomingPatients
    gatewayService.sendToUserService.mockResolvedValueOnce([
      { position: 5, id: 'qid-999', queueNumber: 35, institutionName: 'Clinic X', estimatedTime: 10, userId: 'u9' },
    ]); // queue.get-upcoming

    const res = await svc.callPatient('qid-3', { id: 'op-2' });

    expect(gatewayService.sendToUserService).toHaveBeenNthCalledWith(1, 'queue.call', { id: 'qid-3', user: { id: 'op-2' } });
    expect(notificationService.sendQueueReadyNotification).toHaveBeenCalledWith(
      'u3',
      expect.objectContaining({ id: 'qid-3', queueNumber: 30, institutionId: 'inst-3', institutionName: 'Clinic X' }),
    );
    expect(webSocketGateway.broadcastQueueUpdate).toHaveBeenCalledWith('inst-3', expect.objectContaining({
      action: 'patient_called',
      queueId: 'qid-3',
      queueNumber: 30,
      calledBy: 'op-2',
      userId: 'u3',
    }));
    expect(gatewayService.sendToUserService).toHaveBeenNthCalledWith(2, 'queue.get-upcoming', {
      institutionId: 'inst-3',
      currentNumber: 30,
      limit: 5,
    });
    expect(notificationService.sendQueueAlmostReadyNotification).toHaveBeenCalledWith(
      'u9',
      expect.objectContaining({
        id: 'qid-999',
        queueNumber: 35,
        institutionId: 'inst-3',
        institutionName: 'Clinic X',
        estimatedTime: 10,
      }),
    );
    expect(res).toEqual({ ok: true });
  });

  it('cancel - delegates to gateway service', async () => {
    gatewayService.sendToUserService.mockResolvedValueOnce({ cancelled: true });
    const res = await svc.cancel('qid-4', { id: 'user-1' });
    expect(gatewayService.sendToUserService).toHaveBeenCalledWith('queue.cancel', { id: 'qid-4', user: { id: 'user-1' } });
    expect(res).toEqual({ cancelled: true });
  });

  it('getStats/getMyQueue/findOne/getCurrentQueue/getNextQueue - passthrough', async () => {
    gatewayService.sendToUserService
      .mockResolvedValueOnce({ stats: 1 }) // queue.stats
      .mockResolvedValueOnce([{ id: 'm1' }]) // queue.my-queue
      .mockResolvedValueOnce({ id: 'one' }) // queue.findOne
      .mockResolvedValueOnce({ id: 'current' }) // queue.current
      .mockResolvedValueOnce({ id: 'next' }); // queue.next

    expect(await svc.getStats('inst-4')).toEqual({ stats: 1 });
    expect(await svc.getMyQueue('u1')).toEqual([{ id: 'm1' }]);
    expect(await svc.findOne('qid')).toEqual({ id: 'one' });
    expect(await svc.getCurrentQueue('inst-4')).toEqual({ id: 'current' });
    expect(await svc.getNextQueue('inst-4')).toEqual({ id: 'next' });
  });
});