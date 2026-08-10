import { httpResource } from '@angular/common/http';
import { Injectable, Signal, computed } from '@angular/core';

export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'failed';

/**
 * Shape the pages consume, kept identical to what the previous generated
 * version exposed — only the source of the data changed, not what a
 * component does with it.
 */
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
  // The seed loads a few dozen rows, so one page at the server's ceiling
  // covers all of them and the existing client-side sort/filter keeps
  // working unchanged. Real pagination replaces this once the table needs
  // to handle more rows than fit in one response.
  private readonly resource = httpResource<OrdersApiResponse>(() => '/api/orders?limit=200');

  // hasValue() before value(): a resource in the error state throws from
  // value() rather than returning undefined, so an unguarded read here would
  // crash the table the moment a request fails, instead of leaving it empty
  // under the error banner.
  readonly orders = computed<readonly Order[]>(() =>
    this.resource.hasValue() ? this.resource.value().data.map(toOrder) : []
  );

  readonly isLoading = this.resource.isLoading;

  readonly error: Signal<string | null> = computed(() =>
    this.resource.error() ? 'Could not load orders.' : null
  );
}
