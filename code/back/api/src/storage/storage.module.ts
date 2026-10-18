import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { AzureBlobStorageService } from './azure-blob-storage.service.js';
import {
  credencialCompartilhada,
  minutosSas,
  resolverConnectionStringAzure,
  SAS_LEITURA_MAX_MINUTOS,
  SAS_LEITURA_PADRAO_MINUTOS,
  SAS_UPLOAD_MAX_MINUTOS,
  SAS_UPLOAD_PADRAO_MINUTOS,
} from './azure-storage.config.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AzureBlobStorageService,
      inject: [ConfigService],
      useFactory: (configuracao: ConfigService) => {
        const resolvida = resolverConnectionStringAzure(
          configuracao.get<string>('AZURE_STORAGE_CONNECTION_STRING'),
          configuracao.get<string>('NODE_ENV'),
        );
        const leituraMinutos = minutosSas(
          configuracao.get<string>('AZURE_STORAGE_SAS_LEITURA_MINUTOS'),
          SAS_LEITURA_PADRAO_MINUTOS,
          SAS_LEITURA_MAX_MINUTOS,
          'AZURE_STORAGE_SAS_LEITURA_MINUTOS',
        );
        const uploadMinutos = minutosSas(
          configuracao.get<string>('AZURE_STORAGE_SAS_UPLOAD_MINUTOS'),
          SAS_UPLOAD_PADRAO_MINUTOS,
          SAS_UPLOAD_MAX_MINUTOS,
          'AZURE_STORAGE_SAS_UPLOAD_MINUTOS',
        );
        if ('aviso' in resolvida) {
          new Logger('Storage').warn(resolvida.aviso);
          return new AzureBlobStorageService(null, null, {
            leituraMinutos,
            uploadMinutos,
          });
        }
        const credencial = credencialCompartilhada(resolvida.connectionString);
        new Logger('Storage').log(
          `Azure Blob Storage configurado (conta=${credencial.accountName}).`,
        );
        return new AzureBlobStorageService(
          BlobServiceClient.fromConnectionString(resolvida.connectionString),
          credencial,
          { leituraMinutos, uploadMinutos },
        );
      },
    },
  ],
  exports: [AzureBlobStorageService],
})
export class StorageModule {}
