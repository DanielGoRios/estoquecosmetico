import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { CHANNELS, ORDER_STATUS, ORDER_STATUS_LIST } from '../core/status';
import { dayEnd, dayStart, sanitizeSearch } from '../core/util';

@Component({
  selector: 'app-orders',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Pedidos</h1><div class="sub">Vendas da loja, WhatsApp e internet</div></div>
        <a mat-flat-button routerLink="/pedidos/novo"><mat-icon>add</mat-icon>Novo pedido</a>
      </div>
      <div class="row" style="margin-bottom:12px">
        <mat-form-field class="grow"><mat-label>Nº do pedido ou cliente</mat-label><mat-icon matPrefix>search</mat-icon><input matInput [(ngModel)]="q" (ngModelChange)="onSearch()"></mat-form-field>
        <mat-form-field style="width:210px"><mat-label>Status</mat-label><mat-select [(ngModel)]="status" (ngModelChange)="reload()"><mat-option value="">Todos</mat-option>@for (s of statusList; track s) { <mat-option [value]="s">{{ statuses[s].label }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field style="width:150px"><mat-label>Canal</mat-label><mat-select [(ngModel)]="channel" (ngModelChange)="reload()"><mat-option value="">Todos</mat-option>@for (c of channelKeys; track c) { <mat-option [value]="c">{{ channels[c] }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field style="width:150px"><mat-label>De</mat-label><input matInput type="date" [(ngModel)]="from" (ngModelChange)="reload()"></mat-form-field>
        <mat-form-field style="width:150px"><mat-label>Até</mat-label><input matInput type="date" [(ngModel)]="to" (ngModelChange)="reload()"></mat-form-field>
      </div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Nº</th><th>Cliente</th><th>Data</th><th>Canal</th><th class="r">Total</th><th>Status</th><th>Pagamento</th><th></th></tr></thead>
        <tbody>
          @for (o of rows(); track o.id) {
            <tr class="click" [routerLink]="['/pedidos', o.id]">
              <td class="nowrap"><strong>#{{ o.order_number }}</strong></td>
              <td>{{ o.customers?.name || o.customer_reference || 'Sem identificação' }}</td>
              <td class="nowrap">{{ o.created_at | dtbr }}</td>
              <td>{{ channels[o.channel] }} · {{ o.sale_type === 'atacado' ? 'Atacado' : 'Varejo' }}</td>
              <td class="r mono">{{ o.total | brl }}</td>
              <td><app-chip kind="order" [value]="o.status" /></td>
              <td><app-chip kind="pay" [value]="o.payment_status" /></td>
              <td (click)="$event.stopPropagation()">
                <button mat-icon-button [matMenuTriggerFor]="m" aria-label="Ações"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #m="matMenu">
                  <a mat-menu-item [routerLink]="['/pedidos', o.id]"><mat-icon>open_in_new</mat-icon>Abrir</a>
                  <a mat-menu-item [routerLink]="['/imprimir/pedido', o.id]" target="_blank"><mat-icon>print</mat-icon>Imprimir pedido</a>
                  @if (['confirmado', 'em_separacao', 'separado', 'divergencia', 'aguardando_reposicao', 'expedido', 'retirado'].includes(o.status)) { <button mat-menu-item (click)="cancel(o)"><mat-icon>cancel</mat-icon>Cancelar pedido</button> }
                </mat-menu>
              </td>
            </tr>
          } @empty { <tr><td colspan="8" class="empty">{{ loading() ? 'Carregando…' : 'Nenhum pedido encontrado.' }}</td></tr> }
        </tbody></table>
        <mat-paginator [length]="total()" [pageSize]="size" [pageIndex]="page" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
      </div>
    </div>`,
})
export class Orders implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(Notify);
  rows = signal<any[]>([]); total = signal(0); loading = signal(true); error = signal('');
  q = ''; status = ''; channel = ''; from = ''; to = ''; page = 0; size = 20;
  statuses = ORDER_STATUS; statusList = ORDER_STATUS_LIST; channels = CHANNELS; channelKeys = Object.keys(CHANNELS);
  private timer: any;
  ngOnInit() { this.status = this.route.snapshot.queryParamMap.get('status') ?? ''; this.load(); }
  onSearch() { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 300); }
  reload() { this.page = 0; this.load(); }
  onPage(e: PageEvent) { this.page = e.pageIndex; this.size = e.pageSize; this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      let qb = this.api.sb.from('orders').select('id,order_number,channel,sale_type,status,total,payment_status,created_at,customer_reference,customers(name)', { count: 'exact' });
      if (this.status === 'expedido') qb = qb.in('status', ['expedido', 'retirado']); else if (this.status) qb = qb.eq('status', this.status);
      if (this.channel) qb = qb.eq('channel', this.channel);
      if (this.from) qb = qb.gte('created_at', dayStart(this.from));
      if (this.to) qb = qb.lte('created_at', dayEnd(this.to));
      const s = sanitizeSearch(this.q);
      if (s) {
        if (/^#?\d+$/.test(s)) qb = qb.eq('order_number', Number(s.replace('#', '')));
        else {
          const cs = await this.api.q<any[]>(this.api.sb.from('customers').select('id').ilike('name', `%${s}%`).limit(100));
          const ors = [`customer_reference.ilike.%${s}%`]; if (cs.length) ors.push(`customer_id.in.(${cs.map(c => c.id).join(',')})`);
          qb = qb.or(ors.join(','));
        }
      }
      const { data, count } = await this.api.qc<any[]>(qb.order('created_at', { ascending: false }).range(this.page * this.size, this.page * this.size + this.size - 1));
      this.rows.set(data); this.total.set(count);
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  async printSlip(o: any) {
    try {
      const t = await this.api.q<any>(this.api.sb.from('pick_tasks').select('id').eq('order_id', o.id).maybeSingle());
      if (!t) throw new Error('Este pedido ainda não tem ficha de separação.');
      window.open(this.router.serializeUrl(this.router.createUrlTree(['/imprimir/separacao', t.id])), '_blank');
    } catch (e) { this.notify.err(e); }
  }
  async cancel(o: any) {
    const reason = await this.notify.prompt(`Cancelar pedido #${o.order_number}`, 'Motivo do cancelamento', { confirmText: 'Cancelar pedido' });
    if (!reason) return;
    try { await this.api.rpc('cancel_and_restock', { p_order_id: o.id, p_reason: reason }); this.notify.ok('Pedido cancelado e estoque devolvido.'); await this.load(); }
    catch (e) { this.notify.err(e); }
  }
}
