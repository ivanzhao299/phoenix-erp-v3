import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { REQUIRE_MENU_KEY } from '../../../common/guards/menu.guard';
import type { MenuRequirement } from '../../../common/guards/menu.guard';
import { SalesPriceBooksController } from '../controllers/sales-price-books.controller';
import { PriceBooksService } from './price-books.service';

describe('PriceBooksService lifecycle recovery', () => {
  const activeBook = {
    id: '362',
    price_book_no: 'PB-MENGSE-2026-STD',
    price_book_name: '孟赛标准价格册（试运行版）',
    company_code: 'COMP-MENGSE',
    status: 'CANCELLED',
  };

  function makeService(rows: any[]) {
    const query = jest.fn(async () => rows.shift());
    const mgrQuery = jest.fn(async () => undefined);
    const transaction = jest.fn(async (cb: (mgr: { query: typeof mgrQuery }) => Promise<void>) => {
      await cb({ query: mgrQuery });
    });
    const ds = { query, transaction } as unknown as DataSource;
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'dataScope') return { isGlobal: true, allowedCompanyCodes: [] };
        if (key === 'user') return { userId: '1', username: 'admin', roles: ['ROLE_ADMIN'] };
        return undefined;
      }),
    } as unknown as ClsService;
    const service = new PriceBooksService(ds, cls, {} as any);
    return { service, query, mgrQuery, transaction };
  }

  it('restores a cancelled price book with active items directly to ACTIVE', async () => {
    const restored = { ...activeBook, status: 'ACTIVE' };
    const { service, query } = makeService([[activeBook], [{ c: '3' }], [restored]]);

    await expect(service.restoreBook('362')).resolves.toEqual(restored);

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`FROM sal_price_items WHERE price_book_id = $1 AND status = 'ACTIVE'`),
      ['362'],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(`SET status = 'ACTIVE', wf_instance_id = NULL`),
      ['362'],
    );
  });

  it('blocks restore when the cancelled price book has no active items', async () => {
    const { service } = makeService([[activeBook], [{ c: '0' }]]);

    await expect(service.restoreBook('362')).rejects.toThrow(BadRequestException);
  });

  it('deletes only draft price books and removes their details in one transaction', async () => {
    const draftBook = {
      id: '363',
      price_book_no: 'PB-20260708-00001',
      price_book_name: '孟赛标准价格册（试运行版）重建',
      company_code: 'COMP-MENGSE',
      status: 'DRAFT',
    };
    const { service, query, mgrQuery, transaction } = makeService([
      [draftBook],
      [{ item_count: '2', order_count: '0', order_item_count: '0' }],
    ]);

    await expect(service.deleteBook('363')).resolves.toEqual({
      deleted: true,
      id: '363',
      priceBookNo: 'PB-20260708-00001',
      priceBookName: '孟赛标准价格册（试运行版）重建',
    });

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM sal_sales_orders WHERE price_book_id = $1'),
      ['363'],
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mgrQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('DELETE FROM sal_price_items WHERE price_book_id = $1'),
      ['363'],
    );
    expect(mgrQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM sal_price_books WHERE id = $1'),
      ['363'],
    );
  });

  it('deletes an empty cancelled price book when it has no business references', async () => {
    const cancelledEmpty = { ...activeBook, id: '363', status: 'CANCELLED' };
    const { service, transaction } = makeService([
      [cancelledEmpty],
      [{ item_count: '0', order_count: '0', order_item_count: '0' }],
    ]);

    await expect(service.deleteBook('363')).resolves.toMatchObject({ deleted: true, id: '363' });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps a cancelled price book that still has price details', async () => {
    const { service, transaction } = makeService([
      [activeBook],
      [{ item_count: '3', order_count: '0', order_item_count: '0' }],
    ]);

    await expect(service.deleteBook('362')).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks deleting an active price book', async () => {
    const { service, transaction } = makeService([[{ ...activeBook, status: 'ACTIVE' }]]);

    await expect(service.deleteBook('362')).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('SalesPriceBooksController lifecycle RBAC metadata', () => {
  it('requires approve permission to restore cancelled price books', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      SalesPriceBooksController.prototype.restoreBook,
    ) as MenuRequirement | undefined;

    expect(requirement).toEqual({
      menu: 'MENU_SALES2_PRICE',
      perm: 'A',
      altMenus: undefined,
      denialMessage: undefined,
    });
  });

  it('requires delete permission to delete eligible price books', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      SalesPriceBooksController.prototype.deleteBook,
    ) as MenuRequirement | undefined;

    expect(requirement).toEqual({
      menu: 'MENU_SALES2_PRICE',
      perm: 'D',
      altMenus: undefined,
      denialMessage: undefined,
    });
  });
});
