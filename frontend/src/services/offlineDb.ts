import Dexie, { type Table } from 'dexie';
import type { Product, OrderReceipt } from '../types';

export interface OfflineOrder {
  id?: number;
  payload: any;
  created_at: string;
  synced: number; // 0 = pending, 1 = synced
}

export class PosDatabase extends Dexie {
  products!: Table<Product, string>;
  offlineOrders!: Table<OfflineOrder, number>;

  constructor() {
    super('GroceryPosLocalDb');
    this.version(1).stores({
      products: 'id, barcode, sku, name, is_quick_pick',
      offlineOrders: '++id, created_at, synced',
    });
  }
}

export const localDb = new PosDatabase();
