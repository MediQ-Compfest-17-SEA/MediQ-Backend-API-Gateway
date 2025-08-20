export const mockCircuitBreakerService = {
  execute: jest.fn(),
  isOpen: jest.fn(),
  reset: jest.fn(),
  getState: jest.fn(),
  getFailureCount: jest.fn(),
  getSuccessCount: jest.fn(),
};

export const mockMetricsInterceptor = {
  intercept: jest.fn(),
};

export const mockHealthMonitorService = {
  checkHealth: jest.fn(),
  getHealthStatus: jest.fn(),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
};

// Default mock implementations
mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
  return await fn();
});

mockCircuitBreakerService.isOpen.mockReturnValue(false);
mockCircuitBreakerService.getState.mockReturnValue('CLOSED');
mockCircuitBreakerService.getFailureCount.mockReturnValue(0);
mockCircuitBreakerService.getSuccessCount.mockReturnValue(10);

mockHealthMonitorService.checkHealth.mockResolvedValue({
  status: 'healthy',
  timestamp: new Date(),
  services: {},
});

mockHealthMonitorService.getHealthStatus.mockReturnValue('healthy');
