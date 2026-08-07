import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersComponent } from './orders.component';

describe('OrdersComponent', () => {
  let fixture: ComponentFixture<OrdersComponent>;
  let component: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [OrdersComponent] }).compileComponents();
    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('filters on customer, id and region together', () => {
    // Arrange
    const all = component.rows().length;

    // Act
    component.query.set('apac');

    // Assert
    expect(component.rows().length).toBeLessThan(all);
    expect(component.rows().every((o: any) => o.region === 'APAC')).toBe(true);
  });

  it('narrows to a single status', () => {
    // Arrange & Act
    component.status.set('paid');

    // Assert
    expect(component.rows().every((o: any) => o.status === 'paid')).toBe(true);
  });

  it('flips direction when the same column is clicked twice', () => {
    // Arrange
    component.sortBy('customer');
    const first = component.direction();

    // Act
    component.sortBy('customer');

    // Assert
    expect(component.direction()).not.toBe(first);
  });

  it('sorts numeric columns numerically, not lexically', () => {
    // Arrange & Act — descending puts the largest total first, which a string
    // comparison would not (it would rank "900" above "1000").
    component.sortBy('total');
    const totals = component.rows().map((o: any) => o.total);

    // Assert
    expect(totals).toEqual([...totals].sort((a: number, b: number) => b - a));
  });

  it('reports aria-sort only for the active column', () => {
    // Arrange & Act
    component.sortBy('region');

    // Assert
    expect(component.ariaSort('region')).toBe('ascending');
    expect(component.ariaSort('total')).toBe('none');
  });

  it('resets both filters at once', () => {
    // Arrange
    component.query.set('nord');
    component.status.set('failed');

    // Act
    component.clear();

    // Assert
    expect(component.query()).toBe('');
    expect(component.status()).toBe('all');
  });
});
