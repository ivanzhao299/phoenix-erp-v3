import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { REQUIRE_MENU_KEY } from '../../../common/guards/menu.guard';
import type { MenuRequirement } from '../../../common/guards/menu.guard';
import { SalesPriceBooksController } from '../controllers/sales-price-books.controller';
import { CreatePriceBookDto } from '../dto/price-book.dto';
import { PriceBooksService } from './price-books.service';

describe('PriceBooksService lifecycle recovery', () => {
  const activeBook = {
    id: '362',
    price_book_no: 'PB-MENGSE-2026-STD',
    price_book_name: '孟赛标准价格册（试运行版）',
    company_code: 'COMP-MENGSE',
    status: 'CANCELLED',
  };

  function makeService(rows: any[], approvalEngine: any = {}) {
    const query = jest.fn(async () => rows.shift());
    const mgrQuery = jest.fn(async (): Promise<any> => undefined);
    const transaction = jest.fn(async (cb: (mgr: { query: typeof mgrQuery }) => Promise<unknown>) => {
      return cb({ query: mgrQuery });
    });
    const ds = { query, transaction, manager: { query: mgrQuery } } as unknown as DataSource;
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'dataScope') return { isGlobal: true, allowedCompanyCodes: [] };
        if (key === 'user') return { userId: '1', username: 'admin', roles: ['ROLE_ADMIN'] };
        return undefined;
      }),
    } as unknown as ClsService;
    const service = new PriceBooksService(ds, cls, approvalEngine);
    return { service, query, mgrQuery, transaction };
  }

  it('normalizes blank optional dates to SQL NULL when creating a price book', async () => {
    const created = { id: '367', price_book_no: 'PB-20260901-00001', status: 'DRAFT' };
    const { service, mgrQuery, transaction } = makeService([]);
    mgrQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ max_no: '0' }])
      .mockResolvedValueOnce([created]);

    await expect(service.createBook({
      priceBookName: '门店零售价',
      companyCode: 'COMP-MENGSE',
      effectiveFrom: '',
      effectiveTo: '',
    })).resolves.toEqual(created);

    expect(mgrQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO sal_price_books'),
      expect.arrayContaining([null, null]),
    );
    const insertParams = (mgrQuery.mock.calls as unknown as Array<[string, unknown[]]>)[2][1];
    expect(insertParams[8]).toBeNull();
    expect(insertParams[9]).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a store price book only when the store is ACTIVE and belongs to the company', async () => {
    const created = { id: '368', store_code: 'STORE-01', status: 'DRAFT' };
    const { service, mgrQuery } = makeService([]);
    mgrQuery
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ max_no: '7' }])
      .mockResolvedValueOnce([created]);

    await expect(service.createBook({
      priceBookName: '一号店零售价',
      companyCode: 'COMP-MENGSE',
      storeCode: ' STORE-01 ',
    })).resolves.toEqual(created);

    expect(mgrQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`status = 'ACTIVE'`),
      ['STORE-01', 'COMP-MENGSE'],
    );
    expect(mgrQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('pg_advisory_xact_lock'),
      [expect.stringMatching(/^price-book-no:/)],
    );
    expect(mgrQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('MAX(RIGHT(price_book_no, 5)::integer)'),
      [expect.stringMatching(/^PB-\d{8}-%$/)],
    );
    const insertParams = (mgrQuery.mock.calls as unknown as Array<[string, unknown[]]>)[3][1];
    expect(insertParams[0]).toMatch(/^PB-\d{8}-00008$/);
    expect(insertParams[4]).toBe('STORE-01');
  });

  it('rejects a missing, inactive, or cross-company store before allocating a number', async () => {
    const { service, mgrQuery } = makeService([]);
    mgrQuery.mockResolvedValueOnce([]);

    await expect(service.createBook({
      priceBookName: '非法门店价',
      companyCode: 'COMP-MENGSE',
      storeCode: 'STORE-OTHER',
    })).rejects.toThrow('所选门店不存在、已停用或不属于所选公司');

    expect(mgrQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects changing an existing price book to an inactive or cross-company store', async () => {
    const draftBook = { ...activeBook, status: 'DRAFT' };
    const { service, query, mgrQuery } = makeService([[draftBook]]);
    mgrQuery.mockResolvedValueOnce([]);

    await expect(service.updateBook('362', { storeCode: 'STORE-OTHER' }))
      .rejects.toThrow('所选门店不存在、已停用或不属于所选公司');

    expect(mgrQuery).toHaveBeenCalledWith(
      expect.stringContaining(`status = 'ACTIVE'`),
      ['STORE-OTHER', 'COMP-MENGSE'],
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

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

  it('starts a dynamic price-book approval with the selected next approver', async () => {
    const draftBook = {
      id: '365',
      price_book_no: 'PB-20260723-00001',
      price_book_name: '销售标准价格',
      company_code: 'COMP-LAO-AGRI',
      company_name: '老挝农业',
      status: 'DRAFT',
    };
    const pendingBook = { ...draftBook, status: 'PENDING_APPROVAL', wf_instance_id: 'wf-1' };
    const startApproval = jest.fn(async () => ({ id: 'wf-1' }));
    const { service, mgrQuery } = makeService(
      [[draftBook], [{ c: '1' }]],
      { startApproval },
    );
    mgrQuery.mockResolvedValueOnce([pendingBook]);

    await expect(
      service.submitBook('365', { approverUserId: 'approver-7' }),
    ).resolves.toEqual(pendingBook);

    expect(startApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleCode: 'MENU_SALES2_PRICE',
        bizType: 'PRICE_BOOK_APPROVAL',
        bizId: '365',
        pickedApproverId: 'approver-7',
      }),
      expect.any(Object),
    );
    expect(mgrQuery).toHaveBeenCalledWith(
      expect.stringContaining(`SET status = 'PENDING_APPROVAL', wf_instance_id = $1`),
      ['wf-1', '365'],
    );
  });
});

describe('CreatePriceBookDto date contract', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const metadata = { type: 'body' as const, metatype: CreatePriceBookDto, data: '' };

  it('accepts browser blank dates and transforms them to null before SQL', async () => {
    const dto = await pipe.transform({
      priceBookName: '门店零售价',
      companyCode: 'COMP-MENGSE',
      effectiveFrom: '',
      effectiveTo: '',
    }, metadata);

    expect(dto.effectiveFrom).toBeNull();
    expect(dto.effectiveTo).toBeNull();
  });

  it('returns a safe HTTP 400 validation response for a malformed nonblank date', async () => {
    await expect(pipe.transform({
      priceBookName: '门店零售价',
      companyCode: 'COMP-MENGSE',
      effectiveFrom: 'not-a-date',
    }, metadata)).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        statusCode: 400,
        message: expect.arrayContaining([expect.stringContaining('effectiveFrom')]),
      }),
    });
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
