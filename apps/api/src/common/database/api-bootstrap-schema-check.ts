import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { API_BOOTSTRAP_SCHEMA_CONTRACT, schemaMismatch } from './schema-compatibility';

/** TypeORM's automatic extension installation is disabled on the runtime connection. */
@Injectable()
export class ApiBootstrapSchemaCheck implements OnModuleInit {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.ds.query(`SELECT extname FROM pg_catalog.pg_extension WHERE extname = ANY($1::text[])`, [API_BOOTSTRAP_SCHEMA_CONTRACT.extensions]);
    for (const name of API_BOOTSTRAP_SCHEMA_CONTRACT.extensions) {
      if (!rows.some((row: { extname: string }) => row.extname === name)) throw schemaMismatch('pg_extension', name);
    }
  }
}
