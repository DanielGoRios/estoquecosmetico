import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Api } from '../core/api';
import { CHANNELS, SALE_TYPES } from '../core/status';
import { BrlPipe, DatePipeBr, DateTimePipeBr, QtyPipe, todayIso } from '../core/util';
import { CompanyGroup, CompanyGroupBy, salesByCompany, weekStartIso } from '../core/sales-by-company';

const STORE_HEAD = `
  <div style="display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #000;padding-bottom:8px">
    <div>
      <h1>{{ s()?.store_name }}</h1>
      <div>{{ s()?.store_document }}</div><div>{{ s()?.store_address }}</div>
      <div>{{ s()?.store_phone }} {{ s()?.store_email }}</div>
    </div>`;

@Component({
  selector: 'app-print-order',
  imports: [MatButtonModule, MatIconModule, BrlPipe, QtyPipe, DateTimePipeBr],
  template: `
    <div class="print-bar"><button mat-flat-button (click)="print()"><mat-icon>print</mat-icon>Imprimir / Salvar PDF</button></div>
    @if (error()) { <div class="error-box" style="margin:16px">{{ error() }}</div> }
    @if (o(); as o) {
      <div class="print-sheet">
        ${STORE_HEAD}
        <div style="text-align:right"><div style="font-size:11px">PEDIDO</div><div style="font-size:26px;font-weight:700">#{{ o.order_number }}</div><div>{{ o.created_at | dtbr }}</div></div></div>
        <table style="margin-top:12px"><tbody>
          <tr><th style="width:22%">Cliente</th><td>{{ o.customers?.name || o.customer_reference || 'Sem identificação' }}</td><th style="width:16%">Canal</th><td>{{ channels[o.channel] }}</td></tr>
          <tr><th>Documento</th><td>{{ o.customers?.document || '—' }}</td><th>Modalidade</th><td>{{ saleTypes[o.sale_type] }}</td></tr>
          <tr><th>Contato</th><td>{{ o.customers?.whatsapp || o.customers?.phone || '—' }}</td><th>Pagamento</th><td>{{ o.payment_method || '—' }} ({{ o.payment_status }})</td></tr>
          @if (o.customers?.address) { <tr><th>Entrega</th><td colspan="3">{{ o.customers.address }}</td></tr> }
        </tbody></table>
        <table><thead><tr><th>SKU</th><th>Produto</th><th class="r">Qtd</th><th class="r">Preço unit.</th><th class="r">Desconto</th><th class="r">Subtotal</th></tr></thead>
          <tbody>
            @for (i of items(); track i.id) {
              <tr><td>{{ i.sku_snapshot }}</td><td>{{ i.product_name_snapshot }}</td><td class="r">{{ i.quantity_ordered | qty }}</td>
                <td class="r">{{ i.unit_price | brl }}</td><td class="r">{{ i.discount_amount | brl }}</td><td class="r">{{ i.line_total | brl }}</td></tr>
            }
          </tbody></table>
        <table style="width:55%;margin-left:auto"><tbody>
          <tr><th>Subtotal</th><td class="r">{{ o.subtotal | brl }}</td></tr>
          <tr><th>Descontos</th><td class="r">− {{ o.discount_total | brl }}</td></tr>
          <tr><th>Frete</th><td class="r">{{ o.shipping_amount | brl }}</td></tr>
          <tr><th style="font-size:14px">TOTAL</th><td class="r" style="font-size:14px;font-weight:700">{{ o.total | brl }}</td></tr>
        </tbody></table>
        @if (s()?.payment_terms) { <p><b>Condições de pagamento:</b> {{ s()?.payment_terms }}</p> }
        @if (o.notes) { <p><b>Observações:</b> {{ o.notes }}</p> }
        @if (s()?.print_footer) { <p style="text-align:center;margin-top:20px;font-size:11px">{{ s()?.print_footer }}</p> }
      </div>
    }`,
})
export class PrintOrder implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  o = signal<any>(null); items = signal<any[]>([]); s = signal<any>(null); error = signal('');
  channels = CHANNELS; saleTypes = SALE_TYPES;
  async ngOnInit() {
    try {
      const id = this.route.snapshot.paramMap.get('id')!;
      this.s.set(await this.api.settings());
      this.items.set(await this.api.q(this.api.sb.from('order_items').select('*').eq('order_id', id).order('product_name_snapshot')));
      this.o.set(await this.api.q(this.api.sb.from('orders').select('*, customers(name,document,phone,whatsapp,address)').eq('id', id).single()));
      document.title = `Pedido ${this.o().order_number}`;
    } catch (e: any) { this.error.set(e.message); }
  }
  print() { window.print(); }
}

@Component({
  selector: 'app-print-picking',
  imports: [MatButtonModule, MatIconModule, DatePipeBr, DateTimePipeBr, QtyPipe],
  template: `
    <div class="print-bar"><button mat-flat-button (click)="print()"><mat-icon>print</mat-icon>Imprimir / Salvar PDF</button></div>
    @if (error()) { <div class="error-box" style="margin:16px">{{ error() }}</div> }
    @if (d(); as d) {
      <div class="print-sheet">
        ${STORE_HEAD}
        <div style="text-align:right"><div style="font-size:11px">FICHA DE SEPARAÇÃO — PEDIDO</div><div style="font-size:40px;font-weight:800;line-height:1">#{{ d.order_number }}</div><div>{{ d.confirmed_at | dtbr }}</div></div></div>
        <table style="margin-top:12px"><tbody>
          <tr><th style="width:22%">Cliente / referência</th><td>{{ d.reference }}</td><th style="width:16%">Separador</th><td>{{ d.assigned_name || '________________' }}</td></tr>
        </tbody></table>
        <table>
          <thead><tr><th>SKU</th><th>Produto / características</th><th class="r">Qtd</th><th style="width:34px">Conf.</th><th>Local</th><th>Lote</th><th>Validade</th><th>Obs.</th></tr></thead>
          <tbody>
            @for (i of d.items; track i.id) {
              <tr><td>{{ i.sku }}</td>
                <td><b>{{ i.name }}</b>@if (attrs(i.attributes)) { <div style="font-size:11px">{{ attrs(i.attributes) }}</div> }</td>
                <td class="r" style="font-size:14px;font-weight:700">{{ i.quantity_requested | qty }} <span style="font-weight:400;font-size:10px">{{ i.unit }}</span></td>
                <td style="text-align:center;font-size:16px">☐</td>
                <td style="font-weight:700">{{ i.location || '—' }}</td><td>{{ i.lot_code || '—' }}</td>
                <td>{{ i.expires_at ? (i.expires_at | dbr) : '—' }}</td><td>{{ i.notes }}</td></tr>
            }
          </tbody></table>
        <div style="display:flex;gap:40px;margin-top:48px">
          <div style="flex:1;border-top:1px solid #000;padding-top:4px;text-align:center">Assinatura do separador</div>
          <div style="flex:1;border-top:1px solid #000;padding-top:4px;text-align:center">Assinatura do conferente</div>
        </div>
      </div>
    }`,
})
export class PrintPicking implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  d = signal<any>(null); s = signal<any>(null); error = signal('');
  async ngOnInit() {
    try {
      this.s.set(await this.api.settings());
      const d = await this.api.rpc('get_pick_detail', { p_task_id: this.route.snapshot.paramMap.get('id') });
      this.d.set(d);
      document.title = `Separação ${d.order_number}`;
    } catch (e: any) { this.error.set(e.message); }
  }
  attrs(a: any): string {
    if (!a || typeof a !== 'object') return '';
    return Object.entries(a).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ');
  }
  print() { window.print(); }
}

@Component({
  selector: 'app-print-sales-company',
  imports: [MatButtonModule, MatIconModule, BrlPipe, QtyPipe, DatePipeBr],
  template: `
    <div class="print-bar"><button mat-flat-button (click)="print()" [disabled]="loading()"><mat-icon>print</mat-icon>Imprimir / Salvar PDF</button></div>
    @if (error()) { <div class="error-box" style="margin:16px">{{ error() }}</div> }
    @if (loading()) { <p style="text-align:center;padding:24px">Carregando…</p> }
    @if (!loading() && !error()) {
      <div class="print-sheet">
        ${STORE_HEAD}
        <div style="text-align:right"><div style="font-size:11px">PRODUTOS VENDIDOS POR {{ by === 'cliente' ? 'CLIENTE' : 'MARCA' }}</div>
          <div style="font-size:16px;font-weight:700">{{ from | dbr }} a {{ to | dbr }}</div>
          <div>{{ groups().length }} {{ by === 'cliente' ? 'cliente(s)' : 'marca(s)' }} · {{ totalPedidos() }} pedido(s)</div></div></div>
        @for (g of groups(); track g.key) {
          <h2 style="font-size:14px;margin:16px 0 0">{{ g.empresa }}</h2>
          <table style="margin-top:4px"><thead><tr><th style="width:18%">SKU</th><th>Produto</th><th class="r" style="width:13%">Quantidade</th><th class="r" style="width:16%">Valor</th></tr></thead>
            <tbody>
              @for (l of g.itens; track l.product_id) { <tr><td>{{ l.sku }}</td><td>{{ l.name }}</td><td class="r" style="font-weight:700">{{ l.qtd | qty }}</td><td class="r">{{ l.receita | brl }}</td></tr> }
              <tr><th colspan="2">Total {{ g.empresa }} ({{ g.pedidos }} pedido(s))</th><th class="r">{{ g.qtd | qty }}</th><th class="r">{{ g.receita | brl }}</th></tr>
            </tbody></table>
        } @empty { <p style="margin-top:16px">Nenhum pedido confirmado no período.</p> }
        @if (groups().length) {
          <table style="width:55%;margin-left:auto;margin-top:16px"><tbody>
            <tr><th>Unidades vendidas</th><td class="r" style="font-weight:700">{{ totalQtd() | qty }}</td></tr>
            <tr><th style="font-size:14px">VALOR TOTAL</th><td class="r" style="font-size:14px;font-weight:700">{{ totalValor() | brl }}</td></tr>
          </tbody></table>
        }
      </div>
    }`,
})
export class PrintSalesByCompany implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  s = signal<any>(null); error = signal(''); loading = signal(true);
  groups = signal<CompanyGroup[]>([]); totalPedidos = signal(0);
  totalQtd = () => this.groups().reduce((a, g) => a + g.qtd, 0);
  totalValor = () => this.groups().reduce((a, g) => a + g.receita, 0);
  from = ''; to = ''; by: CompanyGroupBy = 'cliente';
  async ngOnInit() {
    try {
      const qp = this.route.snapshot.queryParamMap;
      this.from = qp.get('de') || weekStartIso(); this.to = qp.get('ate') || todayIso();
      this.by = qp.get('por') === 'marca' ? 'marca' : 'cliente';
      this.s.set(await this.api.settings());
      const r = await salesByCompany(this.api, { from: this.from, to: this.to, by: this.by, channel: qp.get('canal') || '', product: qp.get('produto') || '' });
      this.groups.set(r.groups); this.totalPedidos.set(r.totalPedidos);
      document.title = `Vendas por ${this.by} ${this.from} a ${this.to}`;
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  print() { window.print(); }
}
