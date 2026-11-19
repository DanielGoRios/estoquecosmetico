import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { filter, map } from 'rxjs';
import { Api } from './core/api';
import { ROLE } from './core/status';

interface NavItem { path: string; label: string; icon: string; admin?: boolean; }

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatIconModule, MatButtonModule, MatMenuModule],
  styles: [`
    .brand { display: flex; align-items: center; gap: 10px; padding: 18px 16px 14px; font-family: Fraunces, serif; font-size: 18px; color: var(--brand); }
    .brand .logo { width: 34px; height: 34px; border-radius: 10px; background: var(--brand); color: #fff; display: grid; place-items: center; }
    nav a { display: flex; align-items: center; gap: 12px; padding: 10px 16px; margin: 2px 10px; border-radius: 10px; text-decoration: none; color: var(--ink); font-weight: 500; }
    nav a:hover { background: var(--brand-soft); }
    nav a.active { background: var(--brand); color: #fff; }
    mat-sidenav { width: 240px; border-right: 1px solid var(--line); background: #fff; }
    .top { display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 12px; background: #fff; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; }
    .who { text-align: right; line-height: 1.2; }
    .who small { color: var(--muted); }
    .wait { min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
    .wait .box { max-width: 420px; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 32px; }
    mat-sidenav-container { min-height: 100vh; background: var(--bg); }
  `],
  template: `
    @if (api.ready()) {
      @if (api.session() && api.profile() && !api.profile()!.active) {
        <div class="wait"><div class="box">
          <mat-icon style="font-size:40px;width:40px;height:40px;color:var(--brand)">hourglass_top</mat-icon>
          <h1 style="margin:8px 0">Acesso aguardando liberação</h1>
          <p class="muted">Seu usuário ainda não foi ativado. Peça a um administrador para liberar seu acesso.</p>
          <button mat-stroked-button (click)="logout()">Sair</button>
        </div></div>
      } @else if (showShell()) {
        <mat-sidenav-container>
          <mat-sidenav [mode]="handset() ? 'over' : 'side'" [opened]="!handset() || open" (closedStart)="open = false" #nav>
            <div class="brand"><span class="logo"><mat-icon>spa</mat-icon></span> Estoque Cosméticos</div>
            <nav>
              @for (n of items(); track n.path) {
                <a [routerLink]="n.path" routerLinkActive="active" (click)="handset() && nav.close()"><mat-icon>{{ n.icon }}</mat-icon>{{ n.label }}</a>
              }
            </nav>
          </mat-sidenav>
          <mat-sidenav-content>
            <div class="top">
              @if (handset()) { <button mat-icon-button (click)="open = true; nav.open()" aria-label="Abrir menu"><mat-icon>menu</mat-icon></button> }
              <span style="flex:1"></span>
              <div class="who"><div>{{ api.profile()?.name }}</div><small>{{ roleLabel() }}</small></div>
              <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Conta"><mat-icon>account_circle</mat-icon></button>
              <mat-menu #menu="matMenu"><button mat-menu-item (click)="logout()"><mat-icon>logout</mat-icon>Sair</button></mat-menu>
            </div>
            <router-outlet />
          </mat-sidenav-content>
        </mat-sidenav-container>
      } @else {
        <router-outlet />
      }
    }
  `,
})
export class App {
  api = inject(Api);
  private router = inject(Router);
  open = false;
  private url = toSignal(this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  handset = toSignal(inject(BreakpointObserver).observe('(max-width: 900px)').pipe(map(r => r.matches)), { initialValue: false });
  showShell = computed(() => !!this.api.session() && !!this.api.profile() && !this.url().startsWith('/login') && !this.url().startsWith('/imprimir'));
  roleLabel = computed(() => ROLE[this.api.profile()?.role ?? '']?.label ?? '');
  private all: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/produtos', label: 'Produtos', icon: 'inventory_2' },
    { path: '/estoque', label: 'Estoque', icon: 'warehouse' },
    { path: '/clientes', label: 'Clientes', icon: 'groups', admin: true },
    { path: '/pedidos', label: 'Pedidos', icon: 'receipt_long', admin: true },
    { path: '/relatorios', label: 'Relatórios', icon: 'bar_chart', admin: true },
    { path: '/configuracoes', label: 'Configurações', icon: 'settings' },
  ];
  items = computed(() => this.all.filter(n => !n.admin || this.api.isAdmin()));
  async logout() { await this.api.signOut(); this.router.navigateByUrl('/login'); }
}
