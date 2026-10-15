import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { AzureBlobStorageService } from './azure-blob-storage.service.js';
import {
  credencialCompartilhada,
  exigirConnectionStringAzure,
  minutosSas,
  SAS_LEITURA_MAX_MINUTOS,
  SAS_LEITURA_PADRAO_MINUTOS,
  SAS_UPLOAD_MAX_MINUTOS,
  SAS_UPLOAD_PADRAO_MINUTOS,
} from './azure-storage.config.js';

@Module({
  providers: [
    {
      provide: AzureBlobStorageService,
      inject: [ConfigService],
      useFactory: (configuracao: ConfigService) => {
        const connectionString = exigirConnectionStringAzure(
          configuracao.get<string>('AZURE_STORAGE_CONNECTION_STRING'),
        );
        const credencial = credencialCompartilhada(connectionString);
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
        new Logger('Storage').log(
          `Azure Blob Storage configurado (conta=${credencial.accountName}).`,
        );
        return new AzureBlobStorageService(
          BlobServiceClient.fromConnectionString(connectionString),
          credencial,
          { leituraMinutos, uploadMinutos },
        );
      },
    },
  ],
  exports: [AzureBlobStorageService],
})
export class StorageModule {}
