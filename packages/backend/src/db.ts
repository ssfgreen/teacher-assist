import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "./typeorm/options";

let dataSource: DataSource | null = null;
let initializing: Promise<DataSource> | null = null;

export async function getDataSource(): Promise<DataSource> {
  if (dataSource?.isInitialized) {
    return dataSource;
  }

  if (!initializing) {
    dataSource = new DataSource(buildTypeOrmOptions());
    initializing = dataSource.initialize();
  }

  return initializing;
}

export async function closeDataSource(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  dataSource = null;
  initializing = null;
}
