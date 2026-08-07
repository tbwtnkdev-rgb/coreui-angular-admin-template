import { INavData } from '@coreui/angular';

// Navigation lists the screens this product actually has. The upstream
// template listed the component gallery here, which is documentation rather
// than product, and buried the one real page among forty demos.
export const navItems: INavData[] = [
  {
    name: 'Dashboard',
    url: '/dashboard',
    iconComponent: { name: 'cil-speedometer' }
  }
];
