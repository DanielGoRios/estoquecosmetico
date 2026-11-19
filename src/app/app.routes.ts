import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then(m => m.Login) },
  { path: 'imprimir/pedido/:id', canActivate: [adminGuard], loadComponent: () => import('./pages/print').then(m => m.PrintOrder) },
  { path: 'imprimir/separacao/:id', canActivate: [authGuard], loadComponent: () => import('./pages/print').then(m => m.PrintPicking) },
  {
    path: '', canActivate: [authGuard], children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard').then(m => m.Dashboard) },
      { path: 'produtos', loadComponent: () => import('./pages/products').then(m => m.Products) },
      { path: 'produtos/novo', canActivate: [adminGuard], loadComponent: () => import('./pages/product-form').then(m => m.ProductForm) },
      { path: 'produtos/:id', loadComponent: () => import('./pages/product-form').then(m => m.ProductForm) },
      {
        path: 'estoque', loadComponent: () => import('./pages/stock').then(m => m.StockShell), children: [
          { path: '', pathMatch: 'full', redirectTo: 'saldos' },
          { path: 'saldos', loadComponent: () => import('./pages/stock-simple').then(m => m.StockSimple) },
          { path: 'entrada', canActivate: [adminGuard], loadComponent: () => import('./pages/stock-receive').then(m => m.StockReceive) },
          { path: 'movimentacoes', canActivate: [adminGuard], loadComponent: () => import('./pages/stock-movements').then(m => m.StockMovements) },
          { path: '**', redirectTo: 'saldos' },
        ],
      },
      { path: 'clientes', canActivate: [adminGuard], loadComponent: () => import('./pages/customers').then(m => m.Customers) },
      { path: 'pedidos', canActivate: [adminGuard], loadComponent: () => import('./pages/orders').then(m => m.Orders) },
      { path: 'pedidos/novo', canActivate: [adminGuard], loadComponent: () => import('./pages/order-form').then(m => m.OrderForm) },
      { path: 'pedidos/:id/editar', canActivate: [adminGuard], loadComponent: () => import('./pages/order-form').then(m => m.OrderForm) },
      { path: 'pedidos/:id', canActivate: [adminGuard], loadComponent: () => import('./pages/order-detail').then(m => m.OrderDetail) },
      { path: 'separacao', loadComponent: () => import('./pages/picking').then(m => m.PickingQueue) },
      { path: 'separacao/:id', loadComponent: () => import('./pages/picking').then(m => m.PickingDetail) },
      { path: 'relatorios', canActivate: [adminGuard], loadComponent: () => import('./pages/reports').then(m => m.Reports) },
      {
        path: 'configuracoes', loadComponent: () => import('./pages/settings').then(m => m.SettingsShell), children: [
          { path: '', pathMatch: 'full', redirectTo: 'auditoria' },
          { path: 'usuarios', canActivate: [adminGuard], loadComponent: () => import('./pages/settings').then(m => m.SettingsUsers) },
          { path: 'loja', canActivate: [adminGuard], loadComponent: () => import('./pages/settings').then(m => m.SettingsStore) },
          { path: 'alertas', canActivate: [adminGuard], loadComponent: () => import('./pages/settings').then(m => m.SettingsAlerts) },
          { path: 'localizacoes', canActivate: [adminGuard], loadComponent: () => import('./pages/settings').then(m => m.SettingsLocations) },
          { path: 'catalogo', canActivate: [adminGuard], loadComponent: () => import('./pages/settings').then(m => m.SettingsCatalog) },
          { path: 'permissoes', canActivate: [adminGuard], loadComponent: () => import('./pages/settings').then(m => m.SettingsPermissions) },
          { path: 'auditoria', loadComponent: () => import('./pages/settings').then(m => m.SettingsAudit) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
