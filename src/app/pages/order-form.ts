import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { ProductPicker, PickerProduct } from '../core/product-picker';
import { CHANNELS } from '../core/status';
import { parseDecimal, sanitizeSearch } from '../core/util';

interface Line { product: PickerProduct; qty: string; discount: string; retail: number; wholesale: number; minQty: number; available: number; }

@Component({
  selector: 'app-order-form',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink, ProductPicker],
  template: `
    <div class="page">
      <div class="page-head">
        <div><a routerLink="/pedidos" class="small">← Pedidos</a><h1>{{ editId ? 'Editar rascunho' : 'Novo pedido' }}</h1></div>
      </div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }

      <section class="card">
        <h2>Origem e cliente</h2>
        <div class="grid">
          <mat-form-field><mat-label>Canal de venda</mat-label><mat-select [(ngModel)]="channel">@for (c of channelKeys; track c) { <mat-option [value]="c">{{ channels[c] }}</mat-option> }</mat-select></mat-form-field>
          <mat-form-field><mat-label>Modalidade</mat-label><mat-select [(ngModel)]="saleType" (ngModelChange)="tick.update(n => n + 1)"><mat-option value="varejo">Varejo</mat-option><mat-option value="atacado">Atacado</mat-option></mat-select></mat-form-field>
          <mat-form-field style="grid-column: span 2"><mat-label>Cliente (opcional)</mat-label>
            <input matInput [(ngModel)]="custText" (ngModelChange)="onCust($event)" [matAutocomplete]="ca" placeholder="Busque por nome, telefone ou documento">
            <mat-autocomplete #ca="matAutocomplete" (optionSelected)="pickCust($event.option.value)" [displayWith]="showCust">
              @for (c of custOptions(); track c.id) { <mat-option [value]="c">{{ c.name }} @if (c.whatsapp || c.phone) { · {{ c.whatsapp || c.phone }} }</mat-option> }
            </mat-autocomplete>
            @if (customer()) { <button matSuffix mat-icon-button type="button" (click)="clearCust()" aria-label="Limpar"><mat-icon>close</mat-icon></button> }
          </mat-form-field>
          @if (!customer()) { <mat-form-field style="grid-column: span 2"><mat-label>Referência (venda sem cliente cadastrado)</mat-label><input matInput [(ngModel)]="reference" placeholder="Ex.: Maria – balcão"></mat-form-field> }
        </div>
      </section>

      <section class="card">
        <h2>Produtos</h2>
        <app-product-picker label="Adicionar produto" (picked)="addProduct($event)" />
        @if (lines().length) {
          <div class="table-wrap" style="margin-top:12px"><table class="t">
            <thead><tr><th>Produto</th><th class="r">Disponível</th><th>Qtd.</th><th class="r">Preço unit.</th><th>Desconto (R$)</th><th class="r">Subtotal</th><th></th></tr></thead>
            <tbody>
              @for (l of lines(); track l.product.id) {
                <tr>
                  <td>{{ l.product.name }}<div class="muted small">{{ l.product.sku }}</div></td>
                  <td class="r mono" [style.color]="qtyOf(l) > l.available ? 'var(--bad)' : ''">{{ l.available | qty }}@if (qtyOf(l) > l.available) { <div class="small">acima do disponível</div> }</td>
                  <td><input class="cell" inputmode="decimal" [(ngModel)]="l.qty" (ngModelChange)="tick.update(n => n + 1)"></td>
                  <td class="r mono">{{ unit(l) | brl }}@if (isWholesale(l)) { <div class="small" style="color:var(--ok)">preço de atacado</div> } @else if (saleType === 'atacado') { <div class="small muted">atacado a partir de {{ l.minQty | qty }}</div> }</td>
                  <td><input class="cell" inputmode="decimal" [(ngModel)]="l.discount" (ngModelChange)="tick.update(n => n + 1)"></td>
                  <td class="r mono">{{ lineTotal(l) | brl }}</td>
                  <td><button mat-icon-button (click)="remove(l)" aria-label="Remover"><mat-icon>delete</mat-icon></button></td>
                </tr>
              }
            </tbody></table></div>
        } @else { <div class="empty">Busque e adicione os produtos do pedido.</div> }
      </section>

      <section class="card">
        <h2>Fechamento</h2>
        <div class="grid">
          <mat-form-field><mat-label>Frete (R$)</mat-label><input matInput inputmode="decimal" [(ngModel)]="shipping" (ngModelChange)="tick.update(n => n + 1)"></mat-form-field>
          <mat-form-field><mat-label>Forma de pagamento</mat-label><input matInput [(ngModel)]="payMethod" list="pm"><datalist id="pm"><option value="Pix"><option value="Dinheiro"><option value="Cartão de crédito"><option value="Cartão de débito"><option value="Boleto"><option value="Transferência"></datalist></mat-form-field>
          <mat-form-field><mat-label>Situação do pagamento</mat-label><mat-select [(ngModel)]="payStatus"><mat-option value="pendente">Pendente</mat-option><mat-option value="parcial">Parcial</mat-option><mat-option value="pago">Pago</mat-option></mat-select></mat-form-field>
        </div>
        <mat-form-field class="w100" style="margin-top:12px"><mat-label>Observações</mat-label><textarea matInput rows="2" [(ngModel)]="notes"></textarea></mat-form-field>
        <dl class="kv" style="max-width:360px;margin-left:auto;margin-top:8px">
          <dt>Subtotal</dt><dd class="right mono">{{ totals().sub | brl }}</dd>
          <dt>Descontos</dt><dd class="right mono">− {{ totals().disc | brl }}</dd>
          <dt>Frete</dt><dd class="right mono">{{ totals().ship | brl }}</dd>
          <dt><strong>Total</strong></dt><dd class="right mono"><strong style="font-size:18px">{{ totals().total | brl }}</strong></dd>
        </dl>
        <p class="muted small">Os preços são recalculados e conferidos pelo sistema ao salvar. Ao confirmar, o estoque é reservado pelos lotes de vencimento mais próximo (FEFO).</p>
        <div class="row end">
          <a mat-button routerLink="/pedidos">Cancelar</a>
          <button mat-stroked-button (click)="save(false)" [disabled]="saving() || !lines().length">Salvar rascunho</button>
          <button mat-flat-button (click)="save(true)" [disabled]="saving() || !lines().length"><mat-icon>check</mat-icon>Confirmar pedido</button>
        </div>
      </section>
    </div>`,
})
export class OrderForm implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(Notify);
  editId = '';
  channel = 'loja_fisica'; saleType = 'varejo'; reference = ''; shipping = '0'; payMethod = ''; payStatus = 'pendente'; notes = '';
  lines = signal<Line[]>([]); tick = signal(0);
  customer = signal<any>(null); custText: any = ''; custOptions = signal<any[]>([]);
  loading = signal(false); saving = signal(false); error = signal('');
  channels = CHANNELS; channelKeys = Object.keys(CHANNELS);
  private timer: any;

  qtyOf = (l: Line) => parseDecimal(l.qty) ?? 0;
  isWholesale = (l: Line) => { this.tick(); return this.saleType === 'atacado' && this.qtyOf(l) >= l.minQty; };
  unit = (l: Line) => { this.tick(); return this.isWholesale(l) ? l.wholesale : l.retail; };
  lineTotal = (l: Line) => { this.tick(); return Math.max(0, Math.round(this.qtyOf(l) * this.unit(l) * 100) / 100 - (parseDecimal(l.discount) ?? 0)); };
  totals = computed(() => {
    this.tick();
    let sub = 0, disc = 0;
    for (const l of this.lines()) { sub += Math.round(this.qtyOf(l) * this.unit(l) * 100) / 100; disc += parseDecimal(l.discount) ?? 0; }
    const ship = parseDecimal(this.shipping) ?? 0;
    return { sub, disc, ship, total: sub - disc + ship };
  });
  showCust = (c: any) => (c && typeof c === 'object' ? c.name : c ?? '');

  async ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    this.editId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loading.set(true);
    try {
      if (this.editId) {
        const o = await this.api.q<any>(this.api.sb.from('orders').select('*, customers(*), order_items(*)').eq('id', this.editId).single());
        if (o.status !== 'rascunho') throw new Error('Somente rascunhos podem ser editados.');
        this.channel = o.channel; this.saleType = o.sale_type; this.reference = o.customer_reference ?? ''; this.shipping = String(o.shipping_amount).replace('.', ',');
        this.payMethod = o.payment_method ?? ''; this.payStatus = o.payment_status; this.notes = o.notes ?? '';
        if (o.customers) { this.customer.set(o.customers); this.custText = o.customers; }
        for (const it of o.order_items) {
          const p = await this.api.q<any>(this.api.sb.from('products').select('id,sku,name,unit,barcode,active,default_location_id').eq('id', it.product_id).single());
          await this.addProduct(p, String(it.quantity_ordered).replace('.', ','), String(it.discount_amount).replace('.', ','));
        }
      } else {
        const cid = qp.get('cliente');
        if (cid) { const c = await this.api.q<any>(this.api.sb.from('customers').select('*').eq('id', cid).maybeSingle()); if (c) { this.customer.set(c); this.custText = c; } }
        const pid = qp.get('produto');
        if (pid) { const p = await this.api.q<any>(this.api.sb.from('products').select('id,sku,name,unit,barcode,active,default_location_id').eq('id', pid).maybeSingle()); if (p) await this.addProduct(p); }
      }
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  onCust(v: any) {
    clearTimeout(this.timer);
    if (typeof v !== 'string') return;
    if (this.customer()) this.customer.set(null);
    const s = sanitizeSearch(v); if (s.length < 2) { this.custOptions.set([]); return; }
    this.timer = setTimeout(async () => {
      try { this.custOptions.set(await this.api.q<any[]>(this.api.sb.from('customers').select('id,name,phone,whatsapp').or(`name.ilike.%${s}%,phone.ilike.%${s}%,whatsapp.ilike.%${s}%,document.ilike.%${s}%`).order('name').limit(10))); } catch { /* ignora */ }
    }, 250);
  }
  pickCust(c: any) { this.customer.set(c); }
  clearCust() { this.customer.set(null); this.custText = ''; }

  async addProduct(p: PickerProduct, qty = '1', discount = '') {
    const existing = this.lines().find(l => l.product.id === p.id);
    if (existing) { existing.qty = String((parseDecimal(existing.qty) ?? 0) + 1).replace('.', ','); this.tick.update(n => n + 1); return; }
    try {
      const [price, st] = await Promise.all([
        this.api.q<any>(this.api.sb.from('product_prices').select('retail_price,wholesale_price,wholesale_min_qty').eq('product_id', p.id).is('valid_to', null).maybeSingle()),
        this.api.q<any>(this.api.sb.from('v_product_stock').select('available').eq('product_id', p.id).maybeSingle()),
      ]);
      if (!price) { this.notify.err(new Error(`O produto ${p.sku} não tem preço cadastrado.`)); return; }
      this.lines.update(l => [...l, { product: p, qty, discount, retail: Number(price.retail_price), wholesale: Number(price.wholesale_price), minQty: Number(price.wholesale_min_qty), available: Number(st?.available ?? 0) }]);
    } catch (e) { this.notify.err(e); }
  }
  remove(l: Line) { this.lines.update(arr => arr.filter(x => x !== l)); }

  async save(confirm: boolean) {
    this.error.set('');
    const items = [];
    for (const l of this.lines()) {
      const q = this.qtyOf(l);
      if (q <= 0) { this.error.set(`Informe a quantidade de ${l.product.name}.`); return; }
      items.push({ product_id: l.product.id, quantity: q, discount: parseDecimal(l.discount) ?? 0 });
    }
    if (confirm && !await this.notify.confirm('Confirmar pedido?', 'O pedido será concluído e a quantidade será abatida do estoque agora.')) return;
    this.saving.set(true);
    try {
      const id = await this.api.rpc<string>('save_order', {
        p_order_id: this.editId || null, p_customer_id: this.customer()?.id ?? null, p_customer_reference: this.customer() ? null : this.reference,
        p_channel: this.channel, p_sale_type: this.saleType, p_items: items, p_shipping: parseDecimal(this.shipping) ?? 0,
        p_payment_method: this.payMethod, p_payment_status: this.payStatus, p_notes: this.notes, p_confirm: false,
      });
      if (confirm) await this.api.rpc('confirm_and_deduct', { p_order_id: id });
      this.notify.ok(confirm ? 'Pedido confirmado e estoque abatido.' : 'Rascunho salvo.');
      this.router.navigate(['/pedidos', id]);
    } catch (e: any) { this.error.set(e.message); this.notify.err(e); }
    this.saving.set(false);
  }
}
