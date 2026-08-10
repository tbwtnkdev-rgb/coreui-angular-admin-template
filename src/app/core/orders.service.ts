import { httpResource } from '@angular/common/http';
import { Injectable, Signal, computed, signal } from '@angular/core';

export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'failed';
export type OrderSortKey = 'reference' | 'customer' | 'region' | 'placed' | 'total' | 'status';
export type SortDirection = 'asc' | 'desc';

/** Shape the pages consume — flat fields, independent of the API's nesting. */
export interface Order {
  readonly id: string;
  readonly customer: string;
  readonly region: string;
  readonly placed: string;
  readonly total: number;
  readonly status: OrderStatus;
}

interface OrderApi {
  readonly reference: string;
  readonly customerName: string;
  readonly region: { readonly code: string; readonly name: string };
  readonly placedOn: string;
  readonly status: OrderStatus;
  readonly totalMinor: number;
}

interface OrdersApiResponse {
  readonly data: readonly OrderApi[];
  readonly meta: { readonly total: number };
}

interface Query {
  readonly status: OrderStatus | 'all';
  readonly search: string;
  readonly sort: OrderSortKey;
  readonly direction: SortDirection;
  readonly page: number;
}

/** Fixed rather than caller-adjustable — the API enforces its own ceiling regardless. */
export const PAGE_SIZE = 10;

const DEFAULT_QUERY: Query = { status: 'all', search: '', sort: 'placed', direction: 'desc', page: 1 };

/** Minor units (satang) to major units (baht). */
const toMajorUnits = (minor: number): number => minor / 100;

const toOrder = (row: OrderApi): Order => ({
  id: row.reference,
  customer: row.customerName,
  region: row.region.name,
  placed: row.placedOn,
  total: toMajorUnits(row.totalMinor),
  status: row.status
});

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly query = signal<Query>(DEFAULT_QUERY);

  // Sorting, filtering and paging all happen in this one request — the table
  // never holds more than a page of rows to sort or filter itself, which is
  // the point: an in-memory approach only works while every row fits in
  // memory, and that stops being true well before 200 orders.
  private readonly resource = httpResource<OrdersApiResponse>(() => {
    const q = this.query();
    const params = new URLSearchParams({
      sort: q.sort,
      direction: q.direction,
      limit: String(PAGE_SIZE),
      offset: String((q.page - 1) * PAGE_SIZE)
    });
    if (q.status !== 'all') params.set('status', q.status);
    if (q.search) params.set('search', q.search);

    return `/api/orders?${params.toString()}`;
  });

  // hasValue() before value(): a resource in the error state throws from
  // value() rather than returning undefined, so an unguarded read here would
  // crash the table the moment a request fails, instead of leaving it empty
  // under the error banner.
  readonly orders = computed<readonly Order[]>(() =>
    this.resource.hasValue() ? this.resource.value().data.map(toOrder) : []
  );

  readonly total = computed(() => (this.resource.hasValue() ? this.resource.value().meta.total : 0));

  readonly page = computed(() => this.query().page);
  readonly status = computed(() => this.query().status);
  readonly sort = computed(() => this.query().sort);
  readonly direction = computed(() => this.query().direction);
  readonly isLoading = this.resource.isLoading;

  readonly error: Signal<string | null> = computed(() =>
    this.resource.error() ? 'Could not load orders.' : null
  );

  setStatus(status: OrderStatus | 'all'): void {
    this.query.update((q) => ({ ...q, status, page: 1 }));
  }

  setSearch(search: string): void {
    this.query.update((q) => ({ ...q, search, page: 1 }));
  }

  sortBy(key: OrderSortKey): void {
    this.query.update((q) => {
      if (q.sort === key) {
        return { ...q, direction: q.direction === 'asc' ? 'desc' : 'asc', page: 1 };
      }
      // Numbers and dates are most useful largest-first; names read A-Z.
      const direction: SortDirection = key === 'total' || key === 'placed' ? 'desc' : 'asc';
      return { ...q, sort: key, direction, page: 1 };
    });
  }

  goToPage(page: number): void {
    this.query.update((q) => ({ ...q, page: Math.max(1, page) }));
  }

  reset(): void {
    this.query.set(DEFAULT_QUERY);
  }
}
