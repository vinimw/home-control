import type { DeviceLayout } from '@home-control/shared';
import { inTransaction, type Database } from './database.js';

export interface DeviceLayoutRepository {
  get(): DeviceLayout;
  /** Compare-and-swap; optional metadata changes participate in the same transaction. */
  save(layout: DeviceLayout, apply?: () => void): DeviceLayout | null;
}

export class SqliteDeviceLayoutRepository implements DeviceLayoutRepository {
  constructor(private readonly db: Database) {}

  get(): DeviceLayout {
    const row = this.db
      .prepare('SELECT revision, card_ids FROM device_layout WHERE id = 1')
      .get() as {
      revision: number;
      card_ids: string;
    };
    return { revision: row.revision, cardIds: JSON.parse(row.card_ids) as string[] };
  }

  save(layout: DeviceLayout, apply?: () => void): DeviceLayout | null {
    return inTransaction(this.db, () => {
      const changed = this.db
        .prepare(
          'UPDATE device_layout SET revision = revision + 1, card_ids = ? WHERE id = 1 AND revision = ?',
        )
        .run(JSON.stringify(layout.cardIds), layout.revision);
      if (changed.changes !== 1) return null;
      apply?.();
      return this.get();
    });
  }
}
