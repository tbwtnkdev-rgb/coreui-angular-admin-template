import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { OrderSortKey, OrderStatus, OrdersService, PAGE_SIZE } from '../../core/orders.service';

interface Column {
  readonly key: OrderSortKey;
  readonly label: string;
  readonly numeric?: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: 'reference', label: 'Order' },
  { key: 'customer', label: 'Customer' },
  { key: 'region', label: 'Region' },
  { key: 'placed', label: 'Placed' },
  { key: 'total', label: 'Total', numeric: true },
  { key: 'status', label: 'Status' }
];

/** Status carries an icon and a label, so meaning never rests on colour. */
const STATUS_GLYPH: Record<OrderStatus, string> = {
  paid: '●',
  pending: '◐',
  refunded: '↩',
  failed: '✕'
};

const STATUSES: readonly OrderStatus[] = ['paid', 'pending', 'refunded', 'failed'];

/** Debounce so typing a search term does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule]
})
export class OrdersComponent {
  readonly #orders = inject(OrdersService);
  readonly #destroyRef = inject(DestroyRef);
  #searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly columns = COLUMNS;
  protected readonly statuses = STATUSES;
  protected readonly glyph = STATUS_GLYPH;

  protected readonly rows = this.#orders.orders;
  protected readonly total = this.#orders.total;
  protected readonly status = this.#orders.status;
  protected readonly isLoading = this.#orders.isLoading;
  protected readonly loadError = this.#orders.error;

  // Bound to the input immediately so typing feels responsive; only pushed to
  // the service — and the network — after the debounce settles.
  protected readonly searchText = signal('');

  protected readonly page = this.#orders.page;
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.page() * PAGE_SIZE, this.total())
  );

  constructor() {
    this.#destroyRef.onDestroy(() => clearTimeout(this.#searchTimer));
  }

  protected onSearchInput(value: string): void {
    this.searchText.set(value);
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(() => this.#orders.setSearch(value), SEARCH_DEBOUNCE_MS);
  }

  protected setStatus(status: OrderStatus | 'all'): void {
    this.#orders.setStatus(status);
  }

  protected sortBy(key: OrderSortKey): void {
    this.#orders.sortBy(key);
  }

  protected ariaSort(key: OrderSortKey): 'ascending' | 'descending' | 'none' {
    if (this.#orders.sort() !== key) return 'none';
    return this.#orders.direction() === 'asc' ? 'ascending' : 'descending';
  }

  protected previousPage(): void {
    this.#orders.goToPage(this.page() - 1);
  }

  protected nextPage(): void {
    this.#orders.goToPage(this.page() + 1);
  }

  protected clear(): void {
    clearTimeout(this.#searchTimer);
    this.searchText.set('');
    this.#orders.reset();
  }
}
