import { Component, OnInit, inject, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { MOVEMENT_LABELS } from '../core/status';
import { dayEnd, dayStart, sanitizeSearch } from '../core/util';

@Component({
  selector: 'app-stock-movements',
  imports: [...SHARED, MatProgressBarModule],
  template: `
    <div class="row" style="margin-bottom:12px">
      <mat-form-field class="grow"><mat-label>Produto (nome ou SKU)</mat-label><input matInput [(ngModel)]="prod" (ngModelChange)="onSearch()"></mat-form-field>
      <mat-form-field style="width:200px"><mat-label>Tipo</mat-label><mat-select [(ngModel)]="type" (ngModelChange)="reload()"><mat-option value="">Todos</mat-option>@for (k of types; track k) { <mat-option [value]="k">{{ labels[k] }}</mat-option> }</mat-select></mat-form-field>
      <mat-form-field style="width:200px"><mat-label>Usuário</mat-label><mat-select [(ngModel)]="user" (ngModelChange)="reload()"><mat-option value="">Todos</mat-option>@for (u of users(); track u.id) { <mat-option [value]="u.id">{{ u.name }}</mat-option> }</mat-select></mat-form-field>
      <mat-form-field style="width:160px"><mat-label>De</mat-label><input matInput type="date" [(ngModel)]="from" (ngModelChange)="reload()"></mat-form-field>
      <mat-form-field style="width:160px"><mat-label>Até</mat-label><input matInput type="date" [(ngModel)]="to" (ngModelChange)="reload()"></mat-form-field>
    </div>
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <div class="error-box">{{ error() }}</div> }
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Lote</th><th>Local</th><th class="r">Qtd.</th><th class="r">Custo</th><th>Usuário</th><th>Motivo / origem</th></tr></thead>
      <tbody>
        @for (m of rows(); track m.id) {
          <tr><td class="nowrap">{{ m.created_at | dtbr }}</td><td>{{ labels[m.movement_type] }}</td><td>{{ m.products?.name }}<div class="muted small">{{ m.products?.sku }}</div></td>
            <td>{{ m.stock_lots?.lot_code || '—' }}</td><td>{{ m.stock_locations?.code || '—' }}</td><td class="r mono">{{ m.quantity | qty }}</td><td class="r mono">{{ m.unit_cost | brl }}</td><td>{{ m.profiles?.name || '—' }}</td><td>{{ m.reason || '' }}</td></tr>
        } @empty { <tr><td colspan="9" class="empty">Nenhuma movimentação encontrada.</td></tr> }
      </tbody></table>
      <mat-paginator [length]="total()" [pageSize]="size" [pageIndex]="page" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
    </div>`,
})
export class StockMovements implements OnInit {
  private api = inject(Api);
  rows = signal<any[]>([]); total = signal(0); loading = signal(true); error = signal(''); users = signal<any[]>([]);
  prod = ''; type = ''; user = ''; from = ''; to = ''; page = 0; size = 25;
  labels = MOVEMENT_LABELS; types = Object.keys(MOVEMENT_LABELS);
  private timer: any;
  async ngOnInit() {
    try { this.users.set(await this.api.q<any[]>(this.api.sb.from('profiles').select('id,name').order('name'))); } catch { /* ignora */ }
    await this.load();
  }
  onSearch() { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 350); }
  reload() { this.page = 0; this.load(); }
  onPage(e: PageEvent) { this.page = e.pageIndex; this.size = e.pageSize; this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      let qb = this.api.sb.from('stock_movements').select('*, products(sku,name), stock_lots(lot_code), stock_locations(code), profiles(name)', { count: 'exact' });
      const s = sanitizeSearch(this.prod);
      if (s) {
        const ids = await this.api.q<any[]>(this.api.sb.from('products').select('id').or(`name.ilike.%${s}%,sku.ilike.%${s}%`).limit(200));
        qb = qb.in('product_id', ids.length ? ids.map(i => i.id) : ['00000000-0000-0000-0000-000000000000']);
      }
      if (this.type) qb = qb.eq('movement_type', this.type);
      if (this.user) qb = qb.eq('created_by', this.user);
      if (this.from) qb = qb.gte('created_at', dayStart(this.from));
      if (this.to) qb = qb.lte('created_at', dayEnd(this.to));
      const { data, count } = await this.api.qc<any[]>(qb.order('created_at', { ascending: false }).range(this.page * this.size, this.page * this.size + this.size - 1));
      this.rows.set(data); this.total.set(count);
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
}
