import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { downloadCsv, norm, parseCsv, parseDecimal, sanitizeSearch } from '../core/util';

const COLS: Record<string, string> = {
  sku: 'sku', codigo: 'barcode', codigo_de_barras: 'barcode', codigo_barras: 'barcode', ean: 'barcode', barcode: 'barcode',
  nome: 'name', produto: 'name', marca: 'brand', categoria: 'category', descricao: 'description', unidade: 'unit',
  estoque_minimo: 'min_stock', estoque_min: 'min_stock', localizacao: 'location', local: 'location',
  preco_varejo: 'retail_price', preco: 'retail_price', preco_atacado: 'wholesale_price', qtd_min_atacado: 'wholesale_min_qty',
  quantidade_minima_atacado: 'wholesale_min_qty', qtd_minima_atacado: 'wholesale_min_qty',
  cor: 'a:cor', fragrancia: 'a:fragrância', volume: 'a:volume', tamanho: 'a:tamanho', modelo: 'a:modelo',
};

@Component({
  selector: 'app-products',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Produtos</h1><div class="sub">Catálogo, preços e saldos</div></div>
        @if (api.isAdmin()) {
          <div class="row">
            <button mat-stroked-button (click)="showImport.set(!showImport())"><mat-icon>upload_file</mat-icon>Importar CSV</button>
            <a mat-flat-button routerLink="/produtos/novo"><mat-icon>add</mat-icon>Novo produto</a>
          </div>
        }
      </div>

      @if (showImport()) {
        <section class="card">
          <h2>Importar produtos por planilha (CSV)</h2>
          <p class="muted">Colunas aceitas: sku*, nome*, codigo_de_barras, marca, categoria, descricao, unidade, estoque_minimo, localizacao,
            preco_varejo, preco_atacado, qtd_min_atacado, cor, fragrancia, volume, tamanho, modelo. SKUs já existentes são atualizados, nunca duplicados.
            Para XLSX, salve a planilha como CSV antes de importar.</p>
          <div class="row">
            <input type="file" accept=".csv,text/csv" (change)="onFile($event)">
            <button mat-button (click)="template()"><mat-icon>download</mat-icon>Baixar modelo</button>
          </div>
          @if (importRows().length) {
            <p><strong>{{ importRows().length }}</strong> linha(s) lida(s). Pré-visualização:</p>
            <div class="table-wrap"><table class="t"><thead><tr><th>SKU</th><th>Nome</th><th>Marca</th><th>Categoria</th><th class="r">Varejo</th><th class="r">Atacado</th></tr></thead><tbody>
              @for (r of importRows().slice(0, 5); track $index) { <tr><td>{{ r.sku }}</td><td>{{ r.name }}</td><td>{{ r.brand }}</td><td>{{ r.category }}</td><td class="r">{{ r.retail_price }}</td><td class="r">{{ r.wholesale_price }}</td></tr> }
            </tbody></table></div>
            <div class="row" style="margin-top:12px">
              <button mat-flat-button (click)="runImport()" [disabled]="importing()">Importar {{ importRows().length }} produto(s)</button>
            </div>
          }
          @if (importing()) { <mat-progress-bar mode="determinate" [value]="importPct()" /> }
          @if (importResult(); as r) {
            <div class="hint-box" style="margin-top:12px">Criados: <strong>{{ r.created }}</strong> · Atualizados: <strong>{{ r.updated }}</strong> · Erros: <strong>{{ r.errors.length }}</strong></div>
            @if (r.errors.length) {
              <div class="table-wrap"><table class="t"><thead><tr><th>Linha</th><th>SKU</th><th>Erro</th></tr></thead><tbody>
                @for (e of r.errors; track $index) { <tr><td>{{ e.row }}</td><td>{{ e.sku }}</td><td>{{ e.message }}</td></tr> }
              </tbody></table></div>
            }
          }
        </section>
      }

      <div class="row" style="margin-bottom:12px">
        <mat-form-field class="grow"><mat-label>Buscar por nome, SKU, código de barras, marca ou categoria</mat-label>
          <mat-icon matPrefix>search</mat-icon><input matInput [(ngModel)]="q" (ngModelChange)="onSearch()"></mat-form-field>
        <mat-form-field style="width:180px"><mat-label>Marca</mat-label>
          <mat-select [(ngModel)]="brandId" (ngModelChange)="reload()"><mat-option value="">Todas</mat-option>@for (b of brands(); track b.id) { <mat-option [value]="b.id">{{ b.name }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field style="width:180px"><mat-label>Categoria</mat-label>
          <mat-select [(ngModel)]="categoryId" (ngModelChange)="reload()"><mat-option value="">Todas</mat-option>@for (c of categories(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field style="width:140px"><mat-label>Situação</mat-label>
          <mat-select [(ngModel)]="activeFilter" (ngModelChange)="reload()"><mat-option value="ativos">Ativos</mat-option><mat-option value="inativos">Inativos</mat-option><mat-option value="todos">Todos</mat-option></mat-select></mat-form-field>
      </div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      <div class="table-wrap">
        <table class="t">
          <thead><tr><th></th><th>SKU</th><th>Produto</th><th>Categoria</th>@if (api.isAdmin()) { <th class="r">Varejo</th><th class="r">Atacado</th> }<th class="r">Disponível</th><th class="r">Físico</th><th class="r">Mín.</th><th></th><th></th></tr></thead>
          <tbody>
            @for (p of rows(); track p.id) {
              <tr class="click" [routerLink]="['/produtos', p.id]">
                <td>@if (p.image_url) { <img class="thumb" [src]="p.image_url" alt=""> } @else { <span class="thumb"><mat-icon>spa</mat-icon></span> }</td>
                <td class="nowrap">{{ p.sku }}</td>
                <td>{{ p.name }}<div class="muted small">{{ brandName(p.brand_id) }}@if (p.barcode) { · {{ p.barcode }} }</div></td>
                <td>{{ catName(p.category_id) }}</td>
                @if (api.isAdmin()) {
                  <td class="r mono">{{ prices()[p.id]?.retail_price | brl }}</td>
                  <td class="r mono">{{ prices()[p.id] ? (prices()[p.id].wholesale_price | brl) : '—' }}@if (prices()[p.id]) { <div class="muted small">a partir de {{ prices()[p.id].wholesale_min_qty | qty }}</div> }</td>
                }
                <td class="r mono" [style.color]="stock()[p.id]?.available <= 0 ? 'var(--bad)' : stock()[p.id]?.available <= p.min_stock ? 'var(--warn)' : ''"><strong>{{ stock()[p.id]?.available | qty }}</strong></td>
                <td class="r mono">{{ stock()[p.id]?.on_hand | qty }}</td>
                <td class="r mono muted">{{ p.min_stock | qty }}</td>
                <td>@if (!p.active) { <span class="chip s-gray">Inativo</span> }</td>
                <td class="nowrap" (click)="$event.stopPropagation()">
                  <button mat-icon-button [matMenuTriggerFor]="m" aria-label="Ações"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #m="matMenu">
                    <a mat-menu-item [routerLink]="['/produtos', p.id]"><mat-icon>edit</mat-icon>{{ api.isAdmin() ? 'Editar / ver lotes' : 'Ver lotes' }}</a>
                    @if (api.isAdmin()) {
                      <a mat-menu-item [routerLink]="['/produtos', p.id]" [queryParams]="{aba: 'movimentacoes'}"><mat-icon>swap_vert</mat-icon>Ver movimentações</a>
                      <a mat-menu-item routerLink="/pedidos/novo" [queryParams]="{produto: p.id}"><mat-icon>add_shopping_cart</mat-icon>Criar pedido</a>
                    }
                  </mat-menu>
                </td>
              </tr>
            } @empty { <tr><td colspan="11" class="empty">{{ loading() ? 'Carregando…' : 'Nenhum produto encontrado.' }}</td></tr> }
          </tbody>
        </table>
        <mat-paginator [length]="total()" [pageSize]="size" [pageIndex]="page" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
      </div>
    </div>`,
})
export class Products implements OnInit {
  api = inject(Api);
  private notify = inject(Notify);
  rows = signal<any[]>([]); total = signal(0); loading = signal(true); error = signal('');
  brands = signal<any[]>([]); categories = signal<any[]>([]);
  stock = signal<Record<string, any>>({}); prices = signal<Record<string, any>>({});
  page = 0; size = 20; q = ''; brandId = ''; categoryId = ''; activeFilter = 'ativos';
  private timer: any;
  showImport = signal(false); importRows = signal<any[]>([]); importing = signal(false); importPct = signal(0); importResult = signal<any>(null);

  brandName = (id: string) => this.brands().find(b => b.id === id)?.name ?? '';
  catName = (id: string) => this.categories().find(c => c.id === id)?.name ?? '—';

  async ngOnInit() {
    try {
      const [b, c] = await Promise.all([
        this.api.q<any[]>(this.api.sb.from('brands').select('id,name').order('name')),
        this.api.q<any[]>(this.api.sb.from('categories').select('id,name').order('name')),
      ]);
      this.brands.set(b); this.categories.set(c);
    } catch (e: any) { this.error.set(e.message); }
    await this.load();
  }
  onSearch() { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 300); }
  reload() { this.page = 0; this.load(); }
  onPage(e: PageEvent) { this.page = e.pageIndex; this.size = e.pageSize; this.load(); }

  async load() {
    this.loading.set(true); this.error.set('');
    try {
      let qb = this.api.sb.from('products')
        .select('id,sku,barcode,name,brand_id,category_id,active,unit,min_stock,image_url', { count: 'exact' });
      if (this.activeFilter === 'ativos') qb = qb.eq('active', true);
      if (this.activeFilter === 'inativos') qb = qb.eq('active', false);
      if (this.brandId) qb = qb.eq('brand_id', this.brandId);
      if (this.categoryId) qb = qb.eq('category_id', this.categoryId);
      const s = sanitizeSearch(this.q);
      if (s) {
        const ors = [`name.ilike.%${s}%`, `sku.ilike.%${s}%`, `barcode.ilike.%${s}%`];
        const bids = this.brands().filter(b => norm(b.name).includes(norm(s))).map(b => b.id);
        const cids = this.categories().filter(c => norm(c.name).includes(norm(s))).map(c => c.id);
        if (bids.length) ors.push(`brand_id.in.(${bids.join(',')})`);
        if (cids.length) ors.push(`category_id.in.(${cids.join(',')})`);
        qb = qb.or(ors.join(','));
      }
      const { data, count } = await this.api.qc<any[]>(qb.order('name').range(this.page * this.size, this.page * this.size + this.size - 1));
      this.rows.set(data); this.total.set(count);
      const ids = data.map(r => r.id);
      if (ids.length) {
        const st = await this.api.q<any[]>(this.api.sb.from('v_product_stock').select('product_id,on_hand,available').in('product_id', ids));
        this.stock.set(Object.fromEntries(st.map(x => [x.product_id, x])));
        if (this.api.isAdmin()) {
          const pr = await this.api.q<any[]>(this.api.sb.from('product_prices').select('product_id,retail_price,wholesale_price,wholesale_min_qty').in('product_id', ids).is('valid_to', null));
          this.prices.set(Object.fromEntries(pr.map(x => [x.product_id, x])));
        }
      }
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }

  // ----- importação CSV -----
  template() {
    downloadCsv('modelo-produtos.csv', [
      ['sku', 'nome', 'codigo_de_barras', 'marca', 'categoria', 'descricao', 'unidade', 'estoque_minimo', 'localizacao', 'preco_varejo', 'preco_atacado', 'qtd_min_atacado', 'cor', 'fragrancia', 'volume', 'tamanho', 'modelo'],
      ['BAT-001', 'Batom Matte Rosa', '7890000000011', 'Marca Exemplo', 'Batons', 'Batom de longa duração', 'unidade', 12, 'A1-01', '39,90', '29,90', 12, 'Rosa', '', '', '', ''],
    ]);
  }
  async onFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    this.importResult.set(null); this.importRows.set([]);
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('A planilha está vazia.');
      const head = rows[0].map(h => COLS[norm(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] ?? null);
      if (!head.includes('sku') || !head.includes('name')) throw new Error('A planilha precisa ter as colunas "sku" e "nome".');
      const out = rows.slice(1).map(r => {
        const o: any = { attributes: {} };
        head.forEach((k, i) => {
          const v = (r[i] ?? '').trim();
          if (!k || v === '') return;
          if (k.startsWith('a:')) o.attributes[k.slice(2)] = v;
          else if (['retail_price', 'wholesale_price', 'wholesale_min_qty', 'min_stock'].includes(k)) o[k] = parseDecimal(v);
          else o[k] = v;
        });
        return o;
      });
      this.importRows.set(out);
    } catch (e: any) { this.notify.err(e); }
  }
  async runImport() {
    this.importing.set(true); this.importPct.set(0);
    const total = { created: 0, updated: 0, errors: [] as any[] };
    try {
      const rows = this.importRows();
      for (let i = 0; i < rows.length; i += 100) {
        const r = await this.api.rpc<any>('import_products', { p_rows: rows.slice(i, i + 100) });
        total.created += r.created; total.updated += r.updated;
        total.errors.push(...r.errors.map((e: any) => ({ ...e, row: e.row + i })));
        this.importPct.set(Math.round(((i + 100) / rows.length) * 100));
      }
      this.importResult.set(total);
      this.notify.ok('Importação concluída.');
      const [b, c] = await Promise.all([
        this.api.q<any[]>(this.api.sb.from('brands').select('id,name').order('name')),
        this.api.q<any[]>(this.api.sb.from('categories').select('id,name').order('name')),
      ]);
      this.brands.set(b); this.categories.set(c);
      await this.load();
    } catch (e: any) { this.notify.err(e); }
    this.importing.set(false);
  }
}
