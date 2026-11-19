import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { Chip } from '../core/shared';
import { BrlPipe, DatePipeBr, QtyPipe, addDaysIso, daysUntil, todayIso } from '../core/util';

interface Card { label: string; value: string; link: string; q?: any; tone?: string; admin?: boolean; }

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatIconModule, MatButtonModule, MatProgressBarModule, Chip, BrlPipe, QtyPipe, DatePipeBr],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Olá, {{ api.profile()?.name?.split(' ')?.[0] }}</h1><div class="sub">Resumo da operação</div></div>
        <div class="row">
          @if (api.isAdmin()) {
            <a mat-flat-button routerLink="/pedidos/novo"><mat-icon>add</mat-icon>Novo pedido</a>
            <a mat-stroked-button routerLink="/estoque/entrada"><mat-icon>move_to_inbox</mat-icon>Entrada de estoque</a>
          }
        </div>
      </div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      @if (d(); as s) {
        <h2 style="margin:8px 0">Estoque</h2>
        <div class="grid">
          @for (c of stockCards(); track c.label) {
            <a class="stat" [class]="'stat ' + (c.tone ?? '')" [routerLink]="c.link" [queryParams]="c.q"><div class="lbl">{{ c.label }}</div><div class="val">{{ c.value }}</div></a>
          }
        </div>
        <h2 style="margin:20px 0 8px">Pedidos</h2>
        <div class="grid">
          @for (c of orderCards(); track c.label) {
            <a class="stat" [routerLink]="c.link" [queryParams]="c.q"><div class="lbl">{{ c.label }}</div><div class="val">{{ c.value }}</div></a>
          }
        </div>
        <div class="grid g2" style="margin-top:20px">
          <section class="card">
            <h2>Estoque baixo ou zerado</h2>
            @if (low().length) {
              <table class="t"><tbody>
                @for (p of low(); track p.product_id) {
                  <tr class="click" [routerLink]="['/produtos', p.product_id]">
                    <td>{{ p.name }}<div class="muted small">{{ p.sku }}</div></td>
                    <td class="r mono">{{ p.available | qty }} <span class="muted small">/ mín. {{ p.min_stock | qty }}</span></td>
                  </tr>
                }
              </tbody></table>
            } @else { <div class="empty">Nenhum produto abaixo do mínimo.</div> }
          </section>
        </div>
        @if (api.isAdmin()) {
          <section class="card">
            <h2>Pedidos recentes</h2>
            @if (recent().length) {
              <div class="table-wrap" style="border:0"><table class="t"><tbody>
                @for (o of recent(); track o.id) {
                  <tr class="click" [routerLink]="['/pedidos', o.id]">
                    <td class="nowrap">#{{ o.order_number }}</td>
                    <td>{{ o.customers?.name || o.customer_reference || 'Sem identificação' }}</td>
                    <td><app-chip kind="order" [value]="o.status" /></td>
                    <td class="r mono">{{ o.total | brl }}</td>
                  </tr>
                }
              </tbody></table></div>
            } @else { <div class="empty">Ainda não há pedidos.</div> }
          </section>
        }
      }
    </div>`,
})
export class Dashboard implements OnInit {
  api = inject(Api);
  private notify = inject(Notify);
  d = signal<any>(null); loading = signal(true); error = signal('');
  low = signal<any[]>([]); exp = signal<any[]>([]); recent = signal<any[]>([]);
  private fmtQ = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

  stockCards = computed<Card[]>(() => {
    const s = this.d(); if (!s) return [];
    const cards: Card[] = [
      { label: 'Produtos cadastrados', value: String(s.products), link: '/produtos' },
      { label: 'Unidades em estoque', value: this.fmtQ(s.on_hand), link: '/estoque/saldos' },
      { label: 'Estoque baixo', value: String(s.low_stock), link: '/estoque/saldos', q: { filtro: 'baixo' }, tone: s.low_stock > 0 ? 'warn' : '' },
      { label: 'Estoque zerado', value: String(s.zero_stock), link: '/estoque/saldos', q: { filtro: 'zerado' }, tone: s.zero_stock > 0 ? 'bad' : '' },
    ];
    return cards;
  });
  expiryCards = computed<Card[]>(() => {
    const s = this.d(); if (!s) return [];
    return [
      { label: 'Lotes vencidos', value: String(s.expired_lots), link: '/estoque/saldos', q: { visao: 'lotes', filtro: 'vencidos' }, tone: s.expired_lots > 0 ? 'bad' : '' },
      { label: `Vencem em até ${s.alert_d1} dias`, value: String(s.expiring_d1), link: '/estoque/saldos', q: { visao: 'lotes', filtro: 'vence1' }, tone: s.expiring_d1 > 0 ? 'warn' : '' },
      { label: `Vencem em ${s.alert_d1 + 1} a ${s.alert_d2} dias`, value: String(s.expiring_d2), link: '/estoque/saldos', q: { visao: 'lotes', filtro: 'vence2' } },
    ];
  });
  orderCards = computed<Card[]>(() => {
    const s = this.d(); if (!s) return [];
    const admin = this.api.isAdmin();
    const cards: Card[] = [
      { label: 'Pedidos concluídos no mês', value: String(s.orders.expedido_mes), link: '/pedidos', q: { status: 'expedido' } },
    ];
    if (admin) {
      const m = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      cards.push({ label: 'Vendas hoje', value: m(s.sales_today), link: '/pedidos', q: {} }, { label: 'Vendas no mês', value: m(s.sales_month), link: '/pedidos', q: {} });
    }
    return cards;
  });

  async ngOnInit() {
    try {
      const s = await this.api.rpc('dashboard_summary');
      this.d.set(s);
      const t = todayIso();
      const [stock, lots] = await Promise.all([
        this.api.q<any[]>(this.api.sb.from('v_product_stock').select('product_id,sku,name,min_stock,available,on_hand').eq('active', true).order('available').limit(300)),
        this.api.q<any[]>(this.api.sb.from('v_balance_detail').select('*').gt('on_hand', 0).not('expires_at', 'is', null).lte('expires_at', addDaysIso(t, s.alert_d2)).order('expires_at').limit(8)),
      ]);
      this.low.set(stock.filter(p => Number(p.available) <= Number(p.min_stock)).slice(0, 8));
      this.exp.set(lots);
      if (this.api.isAdmin()) {
        this.recent.set(await this.api.q<any[]>(this.api.sb.from('orders').select('id,order_number,total,status,customer_reference,customers(name)').order('created_at', { ascending: false }).limit(6)));
      }
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
}
