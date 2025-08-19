import { Test, TestingModule } from '@nestjs/testing';
import { GatewayService } from './gateway.service';
import { ClientProxy } from '@nestjs/microservices';

describe('GatewayService', () => {
  let service: GatewayService;
  let clientProxy: ClientProxy;

  const mockClientProxy = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayService,
        {
          provide: 'USER_SERVICE',
          useValue: mockClientProxy,
        },
      ],
    }).compile();

    service = module.get<GatewayService>(GatewayService);
    clientProxy = module.get<ClientProxy>('USER_SERVICE');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
