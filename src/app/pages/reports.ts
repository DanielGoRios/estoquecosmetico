import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { CHANNELS, MOVEMENT_LABELS, ORDER_STATUS, ORDER_STATUS_LIST, SALE_TYPES } from '../core/status';
import { CompanyGroup, CompanyGroupBy, salesByCompany, weekEndIso, weekStartIso } from '../core/sales-by-company';
import { RouterLink } from '@angular/router';
import { addDaysIso, brlFmt, dateFmt, dateTimeFmt, dayEnd, dayStart, downloadCsv, norm, qtyFmt, todayIso } from '../core/util';

type Fmt = 'text' | 'brl' | 'qty' | 'date' | 'dt' | 'pct';
interface Col { k: string; label: string; fmt?: Fmt; }
interface Result { cols: Col[]; rows: any[]; totals?: Record<string, any>; }

const REPORTS: { id: string; label: string; filters: string[] }[] = [
  { id: 'posicao', label: 'Posição de estoque (produto, lote, local)', filters: ['categoria', 'produto'] },
  { id: 'validade', label: 'Lotes vencidos e próximos do vencimento', filters: ['categoria', 'produto'] },
  { id: 'minimo', label: 'Produtos abaixo do estoque mínimo', filters: ['categoria', 'produto'] },
  { id: 'empresa', label: 'Produtos vendidos por empresa (cliente ou marca)', filters: ['periodo', 'semana', 'agrupar', 'canal', 'produto'] },
  { id: 'maisvendidos', label: 'Produtos mais vendidos', filters: ['periodo', 'categoria', 'canal', 'produto'] },
  { id: 'vendas', label: 'Vendas por período, canal e modalidade', filters: ['periodo', 'canal', 'usuario'] },
  { id: 'margem', label: 'Margem bruta estimada', filters: ['periodo', 'categoria', 'canal', 'produto'] },
  { id: 'movimentacoes', label: 'Movimentações de estoque', filters: ['periodo', 'produto', 'usuario', 'tipo'] },
  { id: 'cancelados', label: 'Cancelados, devoluções e divergências', filters: ['periodo', 'canal', 'usuario'] },
];

@Component({
  selector: 'app-reports',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Relatórios</h1><div class="sub">Filtre, consulte e exporte em CSV</div></div>
        <div class="row">
          @if (rid === 'empresa' && groups().length) {
            <a mat-stroked-button target="_blank" [routerLink]="['/imprimir/vendas-empresa']" [queryParams]="{ de: from, ate: to, por: groupBy, canal: channel || null, produto: product || null }"><mat-icon>print</mat-icon>Imprimir / PDF</a>
          }
          <button mat-stroked-button (click)="exportCsv()" [disabled]="!result()?.rows?.length"><mat-icon>download</mat-icon>Exportar CSV</button>
        </div></div>
      <section class="card">
        <div class="row">
          <mat-form-field style="min-width:320px" class="grow"><mat-label>Relatório</mat-label>
            <mat-select [(ngModel)]="rid" (ngModelChange)="run()">@for (r of reports; track r.id) { <mat-option [value]="r.id">{{ r.label }}</mat-option> }</mat-select></mat-form-field>
          @if (has('periodo')) {
            <mat-form-field style="width:160px"><mat-label>De</mat-label><input matInput type="date" [(ngModel)]="from"></mat-form-field>
            <mat-form-field style="width:160px"><mat-label>Até</mat-label><input matInput type="date" [(ngModel)]="to"></mat-form-field>
          }
          @if (has('agrupar')) {
            <mat-form-field style="width:210px"><mat-label>Agrupar por</mat-label><mat-select [(ngModel)]="groupBy" (ngModelChange)="run()">
              <mat-option value="cliente">Cliente (quem comprou)</mat-option><mat-option value="marca">Marca (fornecedor)</mat-option></mat-select></mat-form-field>
          }
          @if (has('categoria')) {
            <mat-form-field style="width:200px"><mat-label>Categoria</mat-label><mat-select [(ngModel)]="category"><mat-option value="">Todas</mat-option>
              @for (c of categories(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }</mat-select></mat-form-field>
          }
          @if (has('canal')) {
            <mat-form-field style="width:170px"><mat-label>Canal</mat-label><mat-select [(ngModel)]="channel"><mat-option value="">Todos</mat-option>
              @for (c of channelList; track c[0]) { <mat-option [value]="c[0]">{{ c[1] }}</mat-option> }</mat-select></mat-form-field>
          }
          @if (has('usuario')) {
            <mat-form-field style="width:190px"><mat-label>Usuário</mat-label><mat-select [(ngModel)]="user"><mat-option value="">Todos</mat-option>
              @for (u of users(); track u.id) { <mat-option [value]="u.id">{{ u.name }}</mat-option> }</mat-select></mat-form-field>
          }
          @if (has('tipo')) {
            <mat-form-field style="width:190px"><mat-label>Tipo</mat-label><mat-select [(ngModel)]="mtype"><mat-option value="">Todos</mat-option>
              @for (m of movTypes; track m[0]) { <mat-option [value]="m[0]">{{ m[1] }}</mat-option> }</mat-select></mat-form-field>
          }
          @if (has('produto')) {
            <mat-form-field style="width:200px"><mat-label>Produto (nome/SKU)</mat-label><input matInput [(ngModel)]="product" (keyup.enter)="run()"></mat-form-field>
          }
          <button mat-flat-button (click)="run()"><mat-icon>filter_alt</mat-icon>Aplicar</button>
        </div>
        @if (has('semana')) {
          <div class="row" style="margin-top:4px">
            <button mat-button (click)="setWeek(0)"><mat-icon>date_range</mat-icon>Esta semana</button>
            <button mat-button (click)="setWeek(-7)">Semana passada</button>
            <span class="muted small">Semana de segunda a domingo · considera pedidos confirmados (exceto cancelados)</span>
          </div>
        }
      </section>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      @if (result(); as r) {
        @if (r.totals) {
          <div class="grid" style="margin-bottom:16px">
            @for (t of totalList(); track t.label) { <div class="stat"><div class="lbl">{{ t.label }}</div><div class="val">{{ t.value }}</div></div> }
          </div>
        }
        @if (rid === 'empresa') {
          @for (g of groups(); track g.key) {
            <section class="card">
              <div class="row" style="justify-content:space-between;align-items:baseline">
                <h2 style="margin:0">{{ g.empresa }}</h2>
                <span class="muted small">{{ g.itens.length }} produto(s) · {{ fmt(g.qtd, 'qty') }} un. · {{ g.pedidos }} pedido(s) · {{ fmt(g.receita, 'brl') }}</span>
              </div>
              <div class="table-wrap" style="margin-top:10px"><table class="t">
                <thead><tr><th>SKU</th><th>Produto</th><th class="r">Quantidade</th><th class="r">Pedidos</th><th class="r">Valor</th></tr></thead>
                <tbody>
                  @for (l of g.itens; track l.product_id) {
                    <tr><td>{{ l.sku }}</td><td>{{ l.name }}</td><td class="r mono"><b>{{ fmt(l.qtd, 'qty') }}</b></td><td class="r mono">{{ l.pedidos }}</td><td class="r mono">{{ fmt(l.receita, 'brl') }}</td></tr>
                  }
                  <tr><td colspan="2"><b>Total {{ g.empresa }}</b></td><td class="r mono"><b>{{ fmt(g.qtd, 'qty') }}</b></td><td class="r mono">{{ g.pedidos }}</td><td class="r mono"><b>{{ fmt(g.receita, 'brl') }}</b></td></tr>
                </tbody></table></div>
            </section>
          } @empty { <section class="card empty">Nenhum pedido confirmado no período selecionado.</section> }
        } @else {
        <div class="table-wrap"><table class="t">
          <thead><tr>@for (c of r.cols; track c.k) { <th [class.r]="isNum(c)">{{ c.label }}</th> }</tr></thead>
          <tbody>
            @for (row of shown(); track $index) {
              <tr>@for (c of r.cols; track c.k) { <td [class.r]="isNum(c)" [class.mono]="isNum(c)">{{ fmt(row[c.k], c.fmt) }}</td> }</tr>
            } @empty { <tr><td [attr.colspan]="r.cols.length" class="empty">Nenhum registro para os filtros selecionados.</td></tr> }
          </tbody></table>
          @if (r.rows.length > limit()) {
            <div class="row end" style="padding:10px"><span class="muted small">Mostrando {{ limit() }} de {{ r.rows.length }} linhas (o CSV exporta todas).</span>
              <button mat-button (click)="limit.set(limit() + 200)">Mostrar mais</button></div>
          }
        </div>
        }
      }
    </div>`,
})
export class Reports implements OnInit {
  private api = inject(Api);
  private notify = inject(Notify);
  reports = REPORTS; channelList = Object.entries(CHANNELS); movTypes = Object.entries(MOVEMENT_LABELS);
  rid = 'posicao'; from = addDaysIso(todayIso(), -30); to = todayIso();
  category = ''; groupBy: CompanyGroupBy = 'cliente'; groups = signal<CompanyGroup[]>([]); channel = ''; user = ''; mtype = ''; product = '';
  categories = signal<any[]>([]); users = signal<any[]>([]);
  loading = signal(false); error = signal(''); result = signal<Result | null>(null); limit = signal(200);
  shown = computed(() => (this.result()?.rows ?? []).slice(0, this.limit()));
  totalList = computed(() => Object.entries(this.result()?.totals ?? {}).map(([label, value]) => ({ label, value })));

  setWeek(offsetDays: number) {
    const ref = addDaysIso(todayIso(), offsetDays);
    this.from = weekStartIso(ref); this.to = offsetDays === 0 ? todayIso() : weekEndIso(ref);
    this.run();
  }
  has(f: string) { return REPORTS.find(r => r.id === this.rid)?.filters.includes(f) ?? false; }
  isNum(c: Col) { return c.fmt === 'brl' || c.fmt === 'qty' || c.fmt === 'pct'; }
  fmt(v: any, f?: Fmt): string {
    if (v === null || v === undefined || v === '') return '—';
    switch (f) { case 'brl': return brlFmt(v); case 'qty': return qtyFmt(v); case 'date': return dateFmt(v); case 'dt': return dateTimeFmt(v);
      case 'pct': return (Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; default: return String(v); }
  }
  async ngOnInit() {
    try {
      this.categories.set(await this.api.q(this.api.sb.from('categories').select('id,name').order('name')));
      this.users.set(await this.api.q(this.api.sb.from('profiles').select('id,name').order('name')));
    } catch (e) { this.notify.err(e); }
    this.run();
  }

  private match(p: { sku?: string; name?: string }): boolean {
    const t = norm(this.product);
    return !t || norm(`${p.sku ?? ''} ${p.name ?? ''}`).includes(t);
  }

  async run() {
    this.loading.set(true); this.error.set(''); this.limit.set(200);
    try { this.result.set(await this.build()); } catch (e: any) { this.error.set(e.message); this.result.set(null); }
    this.loading.set(false);
  }

  private async prodCategories(): Promise<Map<string, string>> {
    const prods = await this.api.fetchAll(f => this.api.sb.from('products').select('id,category_id').range(f, f + 999));
    return new Map(prods.map((p: any) => [p.id, p.category_id]));
  }

  private async build(): Promise<Result> {
    const sb = this.api.sb;
    this.groups.set([]);
    switch (this.rid) {
      case 'empresa': {
        const { groups, totalPedidos } = await salesByCompany(this.api, { from: this.from, to: this.to, by: this.groupBy, channel: this.channel, product: this.product });
        this.groups.set(groups);
        const rows = groups.flatMap(g => g.itens.map(l => ({ empresa: g.empresa, ...l })));
        const label = this.groupBy === 'cliente' ? 'Cliente' : 'Marca';
        return { rows, totals: { [this.groupBy === 'cliente' ? 'Clientes' : 'Marcas']: String(groups.length), 'Unidades vendidas': qtyFmt(sum(groups, 'qtd')),
            'Pedidos': String(totalPedidos), 'Valor': brlFmt(sum(groups, 'receita')) },
          cols: [{ k: 'empresa', label }, { k: 'sku', label: 'SKU' }, { k: 'name', label: 'Produto' }, { k: 'qtd', label: 'Quantidade', fmt: 'qty' }, { k: 'pedidos', label: 'Pedidos' }, { k: 'receita', label: 'Valor', fmt: 'brl' }] };
      }
      case 'posicao': {
        const [rows, costs, cats] = await Promise.all([
          this.api.fetchAll(f => sb.from('v_balance_detail').select('*').gt('on_hand', 0).order('product_name').range(f, f + 999)),
          this.api.rpc<any[]>('admin_lot_costs'), this.prodCategories()]);
        const cost = new Map(costs.map(c => [c.lot_id, Number(c.unit_cost)]));
        const out = rows.filter((r: any) => this.match({ sku: r.sku, name: r.product_name }) && (!this.category || cats.get(r.product_id) === this.category))
          .map((r: any) => ({ ...r, custo: cost.get(r.lot_id) ?? 0, valor: Number(r.on_hand) * (cost.get(r.lot_id) ?? 0) }));
        return { rows: out, totals: { 'Unidades físicas': qtyFmt(sum(out, 'on_hand')), 'Disponível': qtyFmt(sum(out, 'available')), 'Valor a custo': brlFmt(sum(out, 'valor')) },
          cols: [{ k: 'sku', label: 'SKU' }, { k: 'product_name', label: 'Produto' }, { k: 'lot_code', label: 'Lote' }, { k: 'expires_at', label: 'Validade', fmt: 'date' }, { k: 'location_code', label: 'Local' },
            { k: 'lot_status', label: 'Status' }, { k: 'on_hand', label: 'Físico', fmt: 'qty' }, { k: 'reserved', label: 'Reservado', fmt: 'qty' }, { k: 'blocked', label: 'Bloqueado', fmt: 'qty' },
            { k: 'available', label: 'Disponível', fmt: 'qty' }, { k: 'custo', label: 'Custo unit.', fmt: 'brl' }, { k: 'valor', label: 'Valor', fmt: 'brl' }] };
      }
      case 'validade': {
        const s = await this.api.settings(); const d2 = s.expiry_alert_days?.[1] ?? 60;
        const limit = addDaysIso(todayIso(), d2);
        const [rows, cats] = await Promise.all([
          this.api.fetchAll(f => sb.from('v_balance_detail').select('*').gt('on_hand', 0).not('expires_at', 'is', null).lte('expires_at', limit).order('expires_at').range(f, f + 999)), this.prodCategories()]);
        const out = rows.filter((r: any) => r.lot_status !== 'encerrado' && this.match({ sku: r.sku, name: r.product_name }) && (!this.category || cats.get(r.product_id) === this.category))
          .map((r: any) => ({ ...r, dias: Math.round((new Date(r.expires_at + 'T12:00:00').getTime() - new Date(todayIso() + 'T12:00:00').getTime()) / 86400000) }));
        return { rows: out, totals: { 'Lotes': String(out.length), 'Já vencidos': String(out.filter((r: any) => r.dias < 0).length) },
          cols: [{ k: 'sku', label: 'SKU' }, { k: 'product_name', label: 'Produto' }, { k: 'lot_code', label: 'Lote' }, { k: 'expires_at', label: 'Validade', fmt: 'date' }, { k: 'dias', label: 'Dias p/ vencer' },
            { k: 'lot_status', label: 'Status' }, { k: 'location_code', label: 'Local' }, { k: 'on_hand', label: 'Físico', fmt: 'qty' }, { k: 'available', label: 'Disponível', fmt: 'qty' }] };
      }
      case 'minimo': {
        const [rows, cats] = await Promise.all([this.api.fetchAll(f => sb.from('v_product_stock').select('*').eq('active', true).order('name').range(f, f + 999)), this.prodCategories()]);
        const out = rows.filter((r: any) => Number(r.available) <= Number(r.min_stock) && this.match(r) && (!this.category || cats.get(r.product_id) === this.category))
          .map((r: any) => ({ ...r, falta: Math.max(Number(r.min_stock) - Number(r.available), 0) }));
        return { rows: out, totals: { 'Produtos': String(out.length), 'Zerados': String(out.filter((r: any) => Number(r.available) <= 0).length) },
          cols: [{ k: 'sku', label: 'SKU' }, { k: 'name', label: 'Produto' }, { k: 'on_hand', label: 'Físico', fmt: 'qty' }, { k: 'reserved', label: 'Reservado', fmt: 'qty' }, { k: 'blocked', label: 'Bloqueado', fmt: 'qty' },
            { k: 'available', label: 'Disponível', fmt: 'qty' }, { k: 'min_stock', label: 'Mínimo', fmt: 'qty' }, { k: 'falta', label: 'Repor', fmt: 'qty' }] };
      }
      case 'maisvendidos':
      case 'margem': {
        const items = await this.salesItems();
        const by = new Map<string, any>();
        for (const i of items) {
          const k = i.product_id; const cur = by.get(k) ?? { sku: i.sku_snapshot, name: i.product_name_snapshot, qtd: 0, receita: 0, custo: 0, pedidos: new Set<string>() };
          cur.qtd += Number(i.quantity_ordered); cur.receita += Number(i.line_total); cur.custo += Number(i.unit_cost_snapshot ?? 0) * Number(i.quantity_ordered); cur.pedidos.add(i.orders.order_number);
          by.set(k, cur);
        }
        const out = [...by.values()].map(v => ({ ...v, pedidos: v.pedidos.size, margem: v.receita - v.custo, pct: v.receita ? (v.receita - v.custo) / v.receita : 0 }))
          .sort((a, b) => this.rid === 'margem' ? b.margem - a.margem : b.qtd - a.qtd);
        const rec = sum(out, 'receita'), cus = sum(out, 'custo');
        return { rows: out, totals: { 'Receita': brlFmt(rec), ...(this.rid === 'margem' ? { 'Custo estimado': brlFmt(cus), 'Margem bruta': brlFmt(rec - cus), 'Margem %': rec ? ((rec - cus) / rec * 100).toFixed(1) + '%' : '—' } : { 'Unidades': qtyFmt(sum(out, 'qtd')) }) },
          cols: this.rid === 'margem'
            ? [{ k: 'sku', label: 'SKU' }, { k: 'name', label: 'Produto' }, { k: 'qtd', label: 'Qtd', fmt: 'qty' }, { k: 'receita', label: 'Receita', fmt: 'brl' }, { k: 'custo', label: 'Custo', fmt: 'brl' }, { k: 'margem', label: 'Margem', fmt: 'brl' }, { k: 'pct', label: 'Margem %', fmt: 'pct' }]
            : [{ k: 'sku', label: 'SKU' }, { k: 'name', label: 'Produto' }, { k: 'qtd', label: 'Qtd vendida', fmt: 'qty' }, { k: 'pedidos', label: 'Pedidos' }, { k: 'receita', label: 'Receita', fmt: 'brl' }] };
      }
      case 'vendas': {
        let qb = (b: number, e: number) => {
          let q = sb.from('orders').select('order_number,confirmed_at,channel,sale_type,status,total,discount_total,shipping_amount,payment_status')
            .not('status', 'in', '(rascunho,cancelado)').gte('confirmed_at', dayStart(this.from)).lte('confirmed_at', dayEnd(this.to)).order('confirmed_at', { ascending: false });
          if (this.channel) q = q.eq('channel', this.channel);
          if (this.user) q = q.eq('created_by', this.user);
          return q.range(b, e);
        };
        const rows = await this.api.fetchAll(qb);
        const by = new Map<string, any>();
        for (const o of rows) {
          const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(o.confirmed_at));
          const k = `${day}|${o.channel}|${o.sale_type}`;
          const cur = by.get(k) ?? { dia: day, canal: CHANNELS[o.channel], modalidade: SALE_TYPES[o.sale_type], pedidos: 0, desconto: 0, frete: 0, total: 0 };
          cur.pedidos++; cur.desconto += Number(o.discount_total); cur.frete += Number(o.shipping_amount); cur.total += Number(o.total); by.set(k, cur);
        }
        const out = [...by.values()].sort((a, b) => b.dia.localeCompare(a.dia));
        const tot = sum(out, 'total');
        return { rows: out, totals: { 'Pedidos': String(rows.length), 'Total vendido': brlFmt(tot), 'Ticket médio': rows.length ? brlFmt(tot / rows.length) : '—' },
          cols: [{ k: 'dia', label: 'Dia', fmt: 'date' }, { k: 'canal', label: 'Canal' }, { k: 'modalidade', label: 'Modalidade' }, { k: 'pedidos', label: 'Pedidos' }, { k: 'desconto', label: 'Descontos', fmt: 'brl' }, { k: 'frete', label: 'Frete', fmt: 'brl' }, { k: 'total', label: 'Total', fmt: 'brl' }] };
      }
      case 'movimentacoes': {
        const rows = await this.api.fetchAll(f => {
          let q = sb.from('stock_movements').select('created_at,movement_type,quantity,unit_cost,reason,reference_type,products(sku,name),stock_lots(lot_code),stock_locations(code),profiles(name)')
            .gte('created_at', dayStart(this.from)).lte('created_at', dayEnd(this.to)).order('created_at', { ascending: false });
          if (this.user) q = q.eq('created_by', this.user);
          if (this.mtype) q = q.eq('movement_type', this.mtype);
          return q.range(f, f + 999);
        }, 10000);
        const out = rows.filter((r: any) => this.match(r.products ?? {})).map((r: any) => ({ ...r, sku: r.products?.sku, produto: r.products?.name, lote: r.stock_lots?.lot_code, local: r.stock_locations?.code,
          usuario: r.profiles?.name, tipo: MOVEMENT_LABELS[r.movement_type] ?? r.movement_type }));
        return { rows: out, cols: [{ k: 'created_at', label: 'Data', fmt: 'dt' }, { k: 'tipo', label: 'Tipo' }, { k: 'sku', label: 'SKU' }, { k: 'produto', label: 'Produto' }, { k: 'lote', label: 'Lote' }, { k: 'local', label: 'Local' },
          { k: 'quantity', label: 'Qtd', fmt: 'qty' }, { k: 'usuario', label: 'Usuário' }, { k: 'reason', label: 'Motivo' }] };
      }
      case 'cancelados': {
        const orders = await this.api.fetchAll(f => {
          let q = sb.from('orders').select('order_number,created_at,channel,status,total,cancel_reason,cancelled_at,customers(name),customer_reference')
            .in('status', ['cancelado', 'divergencia', 'aguardando_reposicao']).gte('created_at', dayStart(this.from)).lte('created_at', dayEnd(this.to)).order('created_at', { ascending: false });
          if (this.channel) q = q.eq('channel', this.channel);
          if (this.user) q = q.eq('created_by', this.user);
          return q.range(f, f + 999);
        });
        const rets = await this.api.fetchAll(f => sb.from('stock_movements').select('created_at,quantity,reason,reference_id,products(sku,name)').eq('movement_type', 'devolucao')
          .gte('created_at', dayStart(this.from)).lte('created_at', dayEnd(this.to)).order('created_at', { ascending: false }).range(f, f + 999));
        const rows = [
          ...orders.map((o: any) => ({ tipo: ORDER_STATUS[o.status]?.label, data: o.created_at, ref: `#${o.order_number}`, cliente: o.customers?.name ?? o.customer_reference, detalhe: o.cancel_reason, valor: o.total })),
          ...rets.map((m: any) => ({ tipo: 'Devolução', data: m.created_at, ref: m.products?.sku, cliente: m.products?.name, detalhe: `${qtyFmt(m.quantity)} un. — ${m.reason ?? ''}`, valor: null }))];
        return { rows, cols: [{ k: 'tipo', label: 'Tipo' }, { k: 'data', label: 'Data', fmt: 'dt' }, { k: 'ref', label: 'Pedido / SKU' }, { k: 'cliente', label: 'Cliente / produto' }, { k: 'detalhe', label: 'Detalhe / motivo' }, { k: 'valor', label: 'Valor', fmt: 'brl' }] };
      }
    }
    return { cols: [], rows: [] };
  }

  private async salesItems(): Promise<any[]> {
    const cats = this.category ? await this.prodCategories() : null;
    const rows = await this.api.fetchAll(f => {
      let q = this.api.sb.from('order_items').select('product_id,sku_snapshot,product_name_snapshot,quantity_ordered,line_total,unit_cost_snapshot,orders!inner(order_number,confirmed_at,channel,status)')
        .not('orders.status', 'in', '(rascunho,cancelado)').gte('orders.confirmed_at', dayStart(this.from)).lte('orders.confirmed_at', dayEnd(this.to));
      if (this.channel) q = q.eq('orders.channel', this.channel);
      return q.range(f, f + 999);
    });
    return rows.filter((i: any) => this.match({ sku: i.sku_snapshot, name: i.product_name_snapshot }) && (!cats || cats.get(i.product_id) === this.category));
  }

  exportCsv() {
    const r = this.result(); if (!r) return;
    downloadCsv(this.rid === 'empresa' ? `vendas-por-${this.groupBy}-${this.from}-a-${this.to}.csv` : `relatorio-${this.rid}-${todayIso()}.csv`, [r.cols.map(c => c.label), ...r.rows.map(row => r.cols.map(c => c.fmt === 'pct' && row[c.k] != null ? (Number(row[c.k]) * 100).toFixed(1) : row[c.k]))]);
  }
}

function sum(rows: any[], k: string): number { return rows.reduce((a, r) => a + Number(r[k] ?? 0), 0); }
