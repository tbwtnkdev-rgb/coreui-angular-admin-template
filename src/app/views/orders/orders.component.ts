import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AnalyticsService, Order, OrderStatus } from '../../core/analytics.service';

type SortKey = 'id' | 'customer' | 'region' | 'placed' | 'total' | 'status';
type Direction = 'asc' | 'desc';

interface Column {
  readonly key: SortKey;
  readonly label: string;
  readonly numeric?: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: 'id', label: 'Order' },
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

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule]
})
export class OrdersComponent {
  readonly #analytics = inject(AnalyticsService);

  protected readonly columns = COLUMNS;
  protected readonly statuses = STATUSES;
  protected readonly glyph = STATUS_GLYPH;

  protected readonly query = signal('');
  protected readonly status = signal<OrderStatus | 'all'>('all');
  protected readonly sortKey = signal<SortKey>('placed');
  protected readonly direction = signal<Direction>('desc');

  protected readonly rows = computed<Order[]>(() => {
    const needle = this.query().trim().toLowerCase();
    const status = this.status();
    const key = this.sortKey();
    const factor = this.direction() === 'asc' ? 1 : -1;

    const filtered = this.#analytics.recentOrders().filter((order) => {
      if (status !== 'all' && order.status !== status) return false;
      if (!needle) return true;
      return (
        order.id.toLowerCase().includes(needle) ||
        order.customer.toLowerCase().includes(needle) ||
        order.region.toLowerCase().includes(needle)
      );
    });

    // Sorting a copy: the service's array is shared with other consumers.
    return [...filtered].sort((a, b) => {
      const left = a[key];
      const right = b[key];
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * factor;
      }
      return String(left).localeCompare(String(right)) * factor;
    });
  });

  protected readonly total = computed(() =>
    this.rows().reduce((sum, order) => sum + order.total, 0)
  );

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.direction.update((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    this.sortKey.set(key);
    // Numbers and dates are most useful largest-first; names read A-Z.
    this.direction.set(key === 'total' || key === 'placed' ? 'desc' : 'asc');
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.direction() === 'asc' ? 'ascending' : 'descending';
  }

  protected clear(): void {
    this.query.set('');
    this.status.set('all');
  }
}
