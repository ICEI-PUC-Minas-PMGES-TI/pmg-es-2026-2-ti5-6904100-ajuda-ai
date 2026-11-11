import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ChatService } from '../chat/chat.service.js';
import { MatchingModule } from './matching.module.js';
import { MatchingService } from './matching.service.js';

describe('MatchingModule dependency injection', () => {
  it('resolves MatchingService and ChatService without a module cycle', async () => {
    const dataSource = {
      isInitialized: true,
      manager: {},
      options: { type: 'postgres' },
      entityMetadatas: [],
      getRepository: () => ({}),
      destroy: async () => undefined,
    } as unknown as DataSource;
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            type: 'postgres',
            host: 'localhost',
            username: 'test',
            password: 'test',
            database: 'test',
            entities: [],
          }),
          dataSourceFactory: async () => dataSource,
        }),
        MatchingModule,
      ],
    })
      .compile();

    expect(moduleRef.get(MatchingService)).toBeInstanceOf(MatchingService);
    expect(moduleRef.get(ChatService)).toBeInstanceOf(ChatService);
    await moduleRef.close();
  });
});
