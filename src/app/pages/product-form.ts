import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { MOVEMENT_LABELS } from '../core/status';
import { parseDecimal } from '../core/util';

const SUGGESTED = ['cor', 'fragrância', 'volume', 'tamanho', 'modelo'];

@Component({
  selector: 'app-product-form',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <a routerLink="/produtos" class="small">← Produtos</a>
          <h1>{{ isNew ? 'Novo produto' : (f.name || 'Produto') }}</h1>
          @if (!isNew) { <div class="sub">SKU {{ f.sku }}</div> }
        </div>
        @if (!isNew && api.isAdmin()) { <a mat-stroked-button routerLink="/pedidos/novo" [queryParams]="{produto: id}"><mat-icon>add_shopping_cart</mat-icon>Criar pedido</a> }
      </div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      @if (!api.isAdmin()) { <div class="hint-box">Visualização limitada: apenas administradores podem editar produtos e ver preços e custos.</div> }

      @if (!isNew) {
        <div class="subnav">
          @for (t of tabs(); track t.id) { <a href="javascript:void(0)" [class.active]="tab() === t.id" (click)="setTab(t.id)">{{ t.label }}</a> }
        </div>
      }

      @if (tab() === 'dados') {
        <form (ngSubmit)="save()" #form="ngForm">
          <fieldset [disabled]="!api.isAdmin()" style="border:0;padding:0;margin:0">
          <section class="card">
            <h2>Dados gerais</h2>
            <div class="grid">
              <mat-form-field><mat-label>SKU interno *</mat-label><input matInput name="sku" [(ngModel)]="f.sku" required [disabled]="!api.isAdmin()"></mat-form-field>
              <mat-form-field><mat-label>Código de barras</mat-label><input matInput name="barcode" [(ngModel)]="f.barcode" [disabled]="!api.isAdmin()"></mat-form-field>
              <mat-form-field style="grid-column: span 2"><mat-label>Nome *</mat-label><input matInput name="name" [(ngModel)]="f.name" required [disabled]="!api.isAdmin()"></mat-form-field>
              <mat-form-field><mat-label>Marca</mat-label>
                <mat-select name="brand" [(ngModel)]="f.brand_id" [disabled]="!api.isAdmin()" (selectionChange)="f.brand_id === '__new' && newBrand()">
                  <mat-option [value]="null">Sem marca</mat-option>@for (b of brands(); track b.id) { <mat-option [value]="b.id">{{ b.name }}</mat-option> }
                  <mat-option value="__new"><mat-icon>add</mat-icon> Nova marca…</mat-option></mat-select></mat-form-field>
              <mat-form-field><mat-label>Categoria</mat-label>
                <mat-select name="cat" [(ngModel)]="f.category_id" [disabled]="!api.isAdmin()" (selectionChange)="f.category_id === '__new' && newCategory()">
                  <mat-option [value]="null">Sem categoria</mat-option>@for (c of categories(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }
                  <mat-option value="__new"><mat-icon>add</mat-icon> Nova categoria…</mat-option></mat-select></mat-form-field>
              <mat-form-field><mat-label>Unidade de medida</mat-label><input matInput name="unit" [(ngModel)]="f.unit" [disabled]="!api.isAdmin()" list="units">
                <datalist id="units"><option value="unidade"><option value="caixa"><option value="kit"><option value="ml"><option value="g"></datalist></mat-form-field>
            </div>
            <mat-form-field class="w100" style="margin-top:12px"><mat-label>Descrição</mat-label><textarea matInput rows="3" name="desc" [(ngModel)]="f.description" [disabled]="!api.isAdmin()"></textarea></mat-form-field>
            <div class="row" style="margin-top:8px">
              @if (f.image_url) { <img class="thumb" style="width:72px;height:72px" [src]="f.image_url" alt="Imagem do produto"> } @else { <span class="thumb" style="width:72px;height:72px"><mat-icon>image</mat-icon></span> }
              @if (api.isAdmin()) {
                <div><input type="file" accept="image/*" (change)="onImage($event)"><div class="muted small">PNG ou JPG, até 2 MB.</div></div>
                @if (f.image_url) { <button mat-button type="button" (click)="f.image_url = null">Remover imagem</button> }
              }
            </div>
            @if (api.isAdmin()) { <mat-slide-toggle name="active" [(ngModel)]="f.active" style="margin-top:12px">Produto ativo</mat-slide-toggle> }
          </section>

          <section class="card">
            <h2>Características e variações</h2>
            <p class="muted small" style="margin-top:-6px">Ex.: cor, fragrância, volume, tamanho, modelo.</p>
            @for (a of attrs; track $index) {
              <div class="row" style="margin-bottom:8px">
                <mat-form-field style="width:200px"><mat-label>Característica</mat-label><input matInput [name]="'ak'+$index" [(ngModel)]="a.k" [attr.list]="'sug'" [disabled]="!api.isAdmin()"></mat-form-field>
                <mat-form-field class="grow"><mat-label>Valor</mat-label><input matInput [name]="'av'+$index" [(ngModel)]="a.v" [disabled]="!api.isAdmin()"></mat-form-field>
                @if (api.isAdmin()) { <button mat-icon-button type="button" (click)="attrs.splice($index, 1)" aria-label="Remover"><mat-icon>delete</mat-icon></button> }
              </div>
            }
            <datalist id="sug">@for (s of suggested; track s) { <option [value]="s"> }</datalist>
            @if (api.isAdmin()) { <button mat-stroked-button type="button" (click)="attrs.push({k:'',v:''})"><mat-icon>add</mat-icon>Adicionar característica</button> }
          </section>

          @if (api.isAdmin()) {
            <section class="card">
              <h2>Preços</h2>
              <div class="grid">
                <mat-form-field><mat-label>Preço de varejo (R$) *</mat-label><input matInput name="retail" [(ngModel)]="price.retail" inputmode="decimal" required></mat-form-field>
                <mat-form-field><mat-label>Preço unitário de atacado (R$) *</mat-label><input matInput name="whole" [(ngModel)]="price.wholesale" inputmode="decimal" required></mat-form-field>
                <mat-form-field><mat-label>Qtd. mínima para atacado *</mat-label><input matInput name="minq" [(ngModel)]="price.minQty" inputmode="decimal" required></mat-form-field>
              </div>
              <p class="muted small">Em pedidos de atacado, quando a quantidade deste produto atingir o mínimo, o preço de atacado vale para todas as unidades dele. A alteração de preço fica registrada no histórico.</p>
            </section>
          }

          <section class="card">
            <h2>Estoque mínimo e localização</h2>
            <div class="grid">
              <mat-form-field><mat-label>Estoque mínimo</mat-label><input matInput name="min" [(ngModel)]="f.min_stock" inputmode="decimal" [disabled]="!api.isAdmin()"></mat-form-field>
              <mat-form-field><mat-label>Localização padrão</mat-label>
                <mat-select name="loc" [(ngModel)]="f.default_location_id" [disabled]="!api.isAdmin()"><mat-option [value]="null">—</mat-option>@for (l of locations(); track l.id) { <mat-option [value]="l.id">{{ l.code }}</mat-option> }</mat-select></mat-form-field>
            </div>
          </section>
          </fieldset>
          @if (api.isAdmin()) {
            <div class="row end"><a mat-button routerLink="/produtos">Cancelar</a><button mat-flat-button type="submit" [disabled]="saving() || !form.valid">{{ saving() ? 'Salvando…' : 'Salvar produto' }}</button></div>
          }
        </form>
      }

      @if (tab() === 'lotes') {
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Lote</th><th>Validade</th><th>Local</th><th class="r">Físico</th><th class="r">Reservado</th><th class="r">Bloqueado</th><th class="r">Disponível</th>@if (api.isAdmin()) { <th class="r">Custo unit.</th> }<th>Situação</th></tr></thead>
          <tbody>
            @for (l of lots(); track l.balance_id) {
              <tr><td>{{ l.lot_code || '—' }}</td><td>{{ l.expires_at | dbr }}</td><td>{{ l.location_code }}</td>
                <td class="r mono">{{ l.on_hand | qty }}</td><td class="r mono">{{ l.reserved | qty }}</td><td class="r mono">{{ l.blocked | qty }}</td><td class="r mono"><strong>{{ l.available | qty }}</strong></td>
                @if (api.isAdmin()) { <td class="r mono">{{ costs()[l.lot_id] | brl }}</td> }
                <td><app-chip kind="lot" [value]="l.lot_status" /></td></tr>
            } @empty { <tr><td colspan="9" class="empty">Este produto ainda não tem lotes em estoque.</td></tr> }
          </tbody></table></div>
      }

      @if (tab() === 'movimentacoes' && api.isAdmin()) {
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Data</th><th>Tipo</th><th>Lote</th><th>Local</th><th class="r">Qtd.</th><th class="r">Custo</th><th>Usuário</th><th>Motivo / origem</th></tr></thead>
          <tbody>
            @for (m of moves(); track m.id) {
              <tr><td class="nowrap">{{ m.created_at | dtbr }}</td><td>{{ labels[m.movement_type] }}</td><td>{{ m.stock_lots?.lot_code || '—' }}</td><td>{{ m.stock_locations?.code || '—' }}</td>
                <td class="r mono">{{ m.quantity | qty }}</td><td class="r mono">{{ m.unit_cost | brl }}</td><td>{{ m.profiles?.name || '—' }}</td><td>{{ m.reason || '' }}</td></tr>
            } @empty { <tr><td colspan="8" class="empty">Sem movimentações.</td></tr> }
          </tbody></table></div>
      }

      @if (tab() === 'custos' && api.isAdmin()) {
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Data</th><th>Origem</th><th>Lote</th><th class="r">Qtd.</th><th class="r">Custo unitário</th><th>Fornecedor / ref.</th></tr></thead>
          <tbody>
            @for (m of costHist(); track m.id) {
              <tr><td>{{ m.created_at | dtbr }}</td><td>{{ labels[m.movement_type] }}</td><td>{{ m.stock_lots?.lot_code || '—' }}</td><td class="r mono">{{ m.quantity | qty }}</td><td class="r mono">{{ m.unit_cost | brl }}</td><td>{{ m.reason || '' }}</td></tr>
            } @empty { <tr><td colspan="6" class="empty">Sem entradas registradas.</td></tr> }
          </tbody></table></div>
      }

      @if (tab() === 'precos' && api.isAdmin()) {
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Vigência</th><th class="r">Varejo</th><th class="r">Atacado</th><th class="r">Qtd. mín.</th></tr></thead>
          <tbody>
            @for (p of priceHist(); track p.id) {
              <tr><td>{{ p.valid_from | dtbr }} → {{ p.valid_to ? (p.valid_to | dtbr) : 'atual' }}</td><td class="r mono">{{ p.retail_price | brl }}</td><td class="r mono">{{ p.wholesale_price | brl }}</td><td class="r mono">{{ p.wholesale_min_qty | qty }}</td></tr>
            } @empty { <tr><td colspan="4" class="empty">Sem preços cadastrados.</td></tr> }
          </tbody></table></div>
      }
    </div>`,
})
export class ProductForm implements OnInit {
  api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(Notify);
  id = ''; isNew = true;
  loading = signal(true); saving = signal(false); error = signal('');
  tab = signal('dados');
  brands = signal<any[]>([]); categories = signal<any[]>([]); locations = signal<any[]>([]);
  lots = signal<any[]>([]); costs = signal<Record<string, number>>({}); moves = signal<any[]>([]); costHist = signal<any[]>([]); priceHist = signal<any[]>([]);
  f: any = { sku: '', barcode: '', name: '', brand_id: null, category_id: null, description: '', unit: 'unidade', min_stock: 0, default_location_id: null, active: true, image_url: null };
  attrs: { k: string; v: string }[] = [];
  price: any = { retail: '', wholesale: '', minQty: '1' };
  pendingFile: File | null = null;
  suggested = SUGGESTED; labels = MOVEMENT_LABELS;

  tabs = () => [
    { id: 'dados', label: 'Dados' },
    ...(this.api.isAdmin() ? [{ id: 'movimentacoes', label: 'Movimentações' }, { id: 'custos', label: 'Histórico de custos' }, { id: 'precos', label: 'Histórico de preços' }] : []),
  ];

  async ngOnInit() {
    const rid = this.route.snapshot.paramMap.get('id');
    this.isNew = !rid; this.id = rid ?? '';
    try {
      const [b, c, l] = await Promise.all([
        this.api.q<any[]>(this.api.sb.from('brands').select('id,name').eq('active', true).order('name')),
        this.api.q<any[]>(this.api.sb.from('categories').select('id,name').eq('active', true).order('name')),
        this.api.q<any[]>(this.api.sb.from('stock_locations').select('id,code').eq('active', true).order('code')),
      ]);
      this.brands.set(b); this.categories.set(c); this.locations.set(l);
      if (!this.isNew) {
        const p = await this.api.q<any>(this.api.sb.from('products').select('*').eq('id', this.id).single());
        this.f = { ...p };
        this.attrs = Object.entries(p.attributes ?? {}).map(([k, v]) => ({ k, v: String(v) }));
        if (this.api.isAdmin()) {
          const pr = await this.api.q<any>(this.api.sb.from('product_prices').select('*').eq('product_id', this.id).is('valid_to', null).maybeSingle());
          if (pr) this.price = { retail: String(pr.retail_price).replace('.', ','), wholesale: String(pr.wholesale_price).replace('.', ','), minQty: String(pr.wholesale_min_qty).replace('.', ',') };
        }
        const t = this.route.snapshot.queryParamMap.get('aba');
        if (t) this.tab.set(t);
        await this.loadTabs();
      } else {
        const pid = this.route.snapshot.queryParamMap.get('produto'); void pid;
      }
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  setTab(t: string) { this.tab.set(t); }

  async loadTabs() {
    this.lots.set(await this.api.q<any[]>(this.api.sb.from('v_balance_detail').select('*').eq('product_id', this.id).order('expires_at', { nullsFirst: false })));
    if (!this.api.isAdmin()) return;
    const [costs, moves, hist, prices] = await Promise.all([
      this.api.rpc<any[]>('admin_lot_costs', { p_product_id: this.id }),
      this.api.q<any[]>(this.api.sb.from('stock_movements').select('*, stock_lots(lot_code), stock_locations(code), profiles(name)').eq('product_id', this.id).order('created_at', { ascending: false }).limit(150)),
      this.api.q<any[]>(this.api.sb.from('stock_movements').select('id,created_at,movement_type,quantity,unit_cost,reason, stock_lots(lot_code)').eq('product_id', this.id).in('movement_type', ['entrada', 'saldo_inicial']).order('created_at', { ascending: false }).limit(100)),
      this.api.q<any[]>(this.api.sb.from('product_prices').select('*').eq('product_id', this.id).order('valid_from', { ascending: false })),
    ]);
    this.costs.set(Object.fromEntries(costs.map(c => [c.lot_id, c.unit_cost])));
    this.moves.set(moves); this.costHist.set(hist); this.priceHist.set(prices);
  }

  async newBrand() {
    this.f.brand_id = null;
    const name = await this.notify.prompt('Nova marca', 'Nome da marca', { minLen: 2 });
    if (!name) return;
    try { const r = await this.api.q<any>(this.api.sb.from('brands').insert({ name }).select('id,name').single()); this.brands.update(l => [...l, r].sort((a, b) => a.name.localeCompare(b.name))); this.f.brand_id = r.id; } catch (e) { this.notify.err(e); }
  }
  async newCategory() {
    this.f.category_id = null;
    const name = await this.notify.prompt('Nova categoria', 'Nome da categoria', { minLen: 2 });
    if (!name) return;
    try { const r = await this.api.q<any>(this.api.sb.from('categories').insert({ name }).select('id,name').single()); this.categories.update(l => [...l, r].sort((a, b) => a.name.localeCompare(b.name))); this.f.category_id = r.id; } catch (e) { this.notify.err(e); }
  }
  onImage(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.notify.err(new Error('A imagem deve ter no máximo 2 MB.')); return; }
    this.pendingFile = file;
    this.f.image_url = URL.createObjectURL(file);
  }

  async save() {
    this.saving.set(true); this.error.set('');
    try {
      const retail = parseDecimal(this.price.retail), whole = parseDecimal(this.price.wholesale), minq = parseDecimal(this.price.minQty);
      if (retail === null || whole === null || minq === null || minq <= 0) throw new Error('Informe preço de varejo, preço de atacado e quantidade mínima válidos.');
      const attributes: Record<string, string> = {};
      for (const a of this.attrs) if (a.k.trim() && a.v.trim()) attributes[a.k.trim()] = a.v.trim();
      const body: any = {
        sku: this.f.sku.trim(), barcode: (this.f.barcode ?? '').trim() || null, name: this.f.name.trim(),
        brand_id: this.f.brand_id, category_id: this.f.category_id, description: (this.f.description ?? '').trim() || null,
        attributes, unit: (this.f.unit ?? '').trim() || 'unidade', min_stock: parseDecimal(this.f.min_stock) ?? 0,
        default_location_id: this.f.default_location_id, active: this.f.active,
        image_url: this.pendingFile ? undefined : (this.f.image_url ?? null),
      };
      if (body.image_url === undefined) delete body.image_url;
      let pid = this.id;
      if (this.isNew) {
        const r = await this.api.q<any>(this.api.sb.from('products').insert(body).select('id').single());
        pid = r.id;
      } else {
        await this.api.q(this.api.sb.from('products').update(body).eq('id', pid));
      }
      if (this.pendingFile) {
        const ext = (this.pendingFile.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${pid}/${Date.now()}.${ext}`;
        const up = await this.api.sb.storage.from('product-images').upload(path, this.pendingFile, { upsert: true });
        if (up.error) throw new Error('O produto foi salvo, mas a imagem falhou: ' + up.error.message);
        const url = this.api.sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
        await this.api.q(this.api.sb.from('products').update({ image_url: url }).eq('id', pid));
        this.pendingFile = null;
      }
      await this.api.rpc('set_product_price', { p_product_id: pid, p_retail: retail, p_wholesale: whole, p_min_qty: minq });
      this.notify.ok('Produto salvo.');
      if (this.isNew) this.router.navigate(['/produtos', pid]);
      else { this.f.image_url = (await this.api.q<any>(this.api.sb.from('products').select('image_url').eq('id', pid).single())).image_url; await this.loadTabs(); }
    } catch (e: any) { this.error.set(e.message); this.notify.err(e); }
    this.saving.set(false);
  }
}
