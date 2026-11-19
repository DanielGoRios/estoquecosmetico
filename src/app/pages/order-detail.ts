import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { CHANNELS, MOVEMENT_LABELS, SALE_TYPES } from '../core/status';
import { parseDecimal } from '../core/util';

@Component({
  selector: 'app-order-detail',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      @if (o(); as o) {
        <div class="page-head">
          <div>
            <a routerLink="/pedidos" class="small">← Pedidos</a>
            <h1>Pedido #{{ o.order_number }} <app-chip kind="order" [value]="o.status" /></h1>
            <div class="sub">Criado em {{ o.created_at | dtbr }} por {{ o.profiles?.name || '—' }}</div>
          </div>
          <div class="row">
            @if (o.status === 'rascunho') {
              <a mat-stroked-button [routerLink]="['/pedidos', o.id, 'editar']"><mat-icon>edit</mat-icon>Editar</a>
              <button mat-stroked-button (click)="removeDraft()"><mat-icon>delete</mat-icon>Excluir</button>
              <button mat-flat-button (click)="confirmDraft()"><mat-icon>check</mat-icon>Confirmar pedido</button>
            }
            <a mat-stroked-button [routerLink]="['/imprimir/pedido', o.id]" target="_blank"><mat-icon>print</mat-icon>Imprimir pedido</a>
            @if (canCancel()) { <button mat-stroked-button (click)="cancel()"><mat-icon>cancel</mat-icon>Cancelar</button> }
          </div>
        </div>

        @if (false) {
          <section class="card" style="border-color:var(--brand)">
            <h2>Conferência e expedição</h2>
            <p>Itens separados e conferidos. Confirme a saída para baixar o estoque físico (isto acontece uma única vez).</p>
            <div class="row">
              <button mat-flat-button (click)="dispatch('expedido')"><mat-icon>local_shipping</mat-icon>Confirmar expedição</button>
              <button mat-stroked-button (click)="dispatch('retirado')"><mat-icon>storefront</mat-icon>Confirmar retirada na loja</button>
            </div>
          </section>
        }

        <div class="grid g2">
          <section class="card">
            <h2>Dados do pedido</h2>
            <dl class="kv">
              <dt>Cliente</dt><dd>{{ o.customers?.name || o.customer_reference || 'Sem identificação' }}@if (o.customers?.whatsapp || o.customers?.phone) { <div class="muted small">{{ o.customers?.whatsapp || o.customers?.phone }}</div> }</dd>
              <dt>Canal</dt><dd>{{ channels[o.channel] }}</dd>
              <dt>Modalidade</dt><dd>{{ saleTypes[o.sale_type] }}</dd>
              <dt>Confirmado</dt><dd>{{ o.confirmed_at | dtbr }}</dd>
              <dt>Saída</dt><dd>{{ o.dispatched_at | dtbr }}</dd>
              @if (o.cancelled_at) { <dt>Cancelado</dt><dd>{{ o.cancelled_at | dtbr }} — {{ o.cancel_reason }}</dd> }
              @if (o.notes) { <dt>Observações</dt><dd>{{ o.notes }}</dd> }
            </dl>
          </section>
          <section class="card">
            <h2>Pagamento</h2>
            <div class="row">
              <mat-form-field style="width:200px"><mat-label>Forma</mat-label><input matInput [(ngModel)]="payMethod"></mat-form-field>
              <mat-form-field style="width:170px"><mat-label>Situação</mat-label><mat-select [(ngModel)]="payStatus"><mat-option value="pendente">Pendente</mat-option><mat-option value="parcial">Parcial</mat-option><mat-option value="pago">Pago</mat-option><mat-option value="estornado">Estornado</mat-option></mat-select></mat-form-field>
              <button mat-stroked-button (click)="savePayment()" [disabled]="o.status === 'cancelado'">Salvar</button>
            </div>
            <dl class="kv" style="margin-top:8px">
              <dt>Subtotal</dt><dd class="mono">{{ o.subtotal | brl }}</dd>
              <dt>Descontos</dt><dd class="mono">− {{ o.discount_total | brl }}</dd>
              <dt>Frete</dt><dd class="mono">{{ o.shipping_amount | brl }}</dd>
              <dt><strong>Total</strong></dt><dd class="mono"><strong style="font-size:18px">{{ o.total | brl }}</strong></dd>
              <dt>Margem bruta est.</dt><dd class="mono">{{ margin() | brl }}</dd>
            </dl>
          </section>
        </div>

        <section class="card">
          <h2>Itens</h2>
          <div class="table-wrap" style="border:0"><table class="t">
            <thead><tr><th>SKU</th><th>Produto</th><th class="r">Qtd.</th><th class="r">Preço unit.</th><th class="r">Desconto</th><th class="r">Total</th><th class="r">Custo unit.</th></tr></thead>
            <tbody>
              @for (i of o.order_items; track i.id) {
                <tr><td>{{ i.sku_snapshot }}</td><td>{{ i.product_name_snapshot }}</td><td class="r mono">{{ i.quantity_ordered | qty }}</td><td class="r mono">{{ i.unit_price | brl }}</td><td class="r mono">{{ i.discount_amount | brl }}</td><td class="r mono">{{ i.line_total | brl }}</td><td class="r mono muted">{{ i.unit_cost_snapshot | brl }}</td></tr>
              }
            </tbody></table></div>
        </section>

        @if (false) {
          <section class="card">
            <h2>Lotes reservados / separados</h2>
            <div class="table-wrap" style="border:0"><table class="t">
              <thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Local</th><th class="r">Solicitado</th><th class="r">Separado</th><th>Conferido</th></tr></thead>
              <tbody>
                @for (p of pickItems(); track p.id) {
                  <tr><td>{{ p.order_items?.product_name_snapshot }}</td><td>{{ p.stock_lots?.lot_code || '—' }}</td><td>{{ p.stock_lots?.expires_at | dbr }}</td><td>{{ p.stock_locations?.code }}</td>
                    <td class="r mono">{{ p.quantity_requested | qty }}</td><td class="r mono">{{ p.quantity_picked | qty }}</td><td>{{ p.checked_at ? (p.checked_at | dtbr) : '—' }}</td></tr>
                }
              </tbody></table></div>
          </section>
        }

        @if (o.status === 'expedido' || o.status === 'retirado') {
          <section class="card">
            <h2>Devolução</h2>
            <p class="muted">Pedido com saída física: registre devoluções aqui. Itens avariados ou de lote vencido entram bloqueados, aguardando inspeção.</p>
            <div class="grid">
              <mat-form-field><mat-label>Item / lote devolvido</mat-label>
                <mat-select [(ngModel)]="ret.key">@for (s of shipped(); track s.key) { <mat-option [value]="s.key">{{ s.label }}</mat-option> }</mat-select></mat-form-field>
              <mat-form-field><mat-label>Quantidade</mat-label><input matInput [(ngModel)]="ret.qty" inputmode="decimal"></mat-form-field>
              <mat-form-field><mat-label>Condição</mat-label><mat-select [(ngModel)]="ret.cond"><mat-option value="bom">Bom estado</mat-option><mat-option value="avariado">Avariado / inspeção</mat-option></mat-select></mat-form-field>
              <mat-form-field class="grow" style="grid-column: span 2"><mat-label>Motivo *</mat-label><input matInput [(ngModel)]="ret.reason"></mat-form-field>
            </div>
            <div class="row end"><button mat-flat-button (click)="doReturn()" [disabled]="busy()">Registrar devolução</button></div>
            @if (returns().length) {
              <h2 style="margin-top:16px">Devoluções registradas</h2>
              <div class="table-wrap" style="border:0"><table class="t"><thead><tr><th>Data</th><th>Produto</th><th>Lote</th><th class="r">Qtd.</th><th>Motivo</th></tr></thead><tbody>
                @for (m of returns(); track m.id) { <tr><td>{{ m.created_at | dtbr }}</td><td>{{ m.products?.name }}</td><td>{{ m.stock_lots?.lot_code || '—' }}</td><td class="r mono">{{ m.quantity | qty }}</td><td>{{ m.reason }}</td></tr> }
              </tbody></table></div>
            }
          </section>
        }

        <section class="card">
          <h2>Movimentações de estoque do pedido</h2>
          <div class="table-wrap" style="border:0"><table class="t">
            <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Lote</th><th class="r">Qtd.</th><th>Usuário</th></tr></thead>
            <tbody>
              @for (m of moves(); track m.id) { <tr><td class="nowrap">{{ m.created_at | dtbr }}</td><td>{{ labels[m.movement_type] }}</td><td>{{ m.products?.name }}</td><td>{{ m.stock_lots?.lot_code || '—' }}</td><td class="r mono">{{ m.quantity | qty }}</td><td>{{ m.profiles?.name || '—' }}</td></tr>
              } @empty { <tr><td colspan="6" class="empty">Sem movimentações.</td></tr> }
            </tbody></table></div>
        </section>
      }
    </div>`,
})
export class OrderDetail implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(Notify);
  id = '';
  o = signal<any>(null); loading = signal(true); error = signal(''); busy = signal(false);
  task = signal<any>(null); pickItems = signal<any[]>([]); moves = signal<any[]>([]);
  payMethod = ''; payStatus = 'pendente';
  channels = CHANNELS; saleTypes = SALE_TYPES; labels = MOVEMENT_LABELS;
  ret: any = { key: '', qty: '', cond: 'bom', reason: '' };

  canCancel = computed(() => ['confirmado', 'em_separacao', 'separado', 'divergencia', 'aguardando_reposicao', 'expedido', 'retirado'].includes(this.o()?.status));
  margin = computed(() => (this.o()?.order_items ?? []).reduce((s: number, i: any) => s + (Number(i.line_total) - Number(i.unit_cost_snapshot ?? 0) * Number(i.quantity_ordered)), 0));
  returns = computed(() => this.moves().filter(m => m.movement_type === 'devolucao'));
  shipped = computed(() => this.moves().filter(m => m.movement_type === 'saida').map(m => ({
    key: `${m.product_id}|${m.lot_id}|${m.location_id}`, product_id: m.product_id, lot_id: m.lot_id, location_id: m.location_id,
    label: `${m.products?.name} — lote ${m.stock_lots?.lot_code || '—'} (${m.stock_locations?.code}) · saiu ${m.quantity}`,
  })));

  ngOnInit() { this.id = this.route.snapshot.paramMap.get('id')!; this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      const o = await this.api.q<any>(this.api.sb.from('orders').select('*, customers(*), order_items(*), profiles(name)').eq('id', this.id).single());
      this.o.set(o); this.payMethod = o.payment_method ?? ''; this.payStatus = o.payment_status;
      const t = await this.api.q<any>(this.api.sb.from('pick_tasks').select('id,status,started_at,completed_at,profiles(name)').eq('order_id', this.id).maybeSingle());
      this.task.set(t);
      if (t) this.pickItems.set(await this.api.q<any[]>(this.api.sb.from('pick_task_items').select('*, order_items(product_name_snapshot), stock_lots(lot_code,expires_at), stock_locations(code)').eq('pick_task_id', t.id)));
      else this.pickItems.set([]);
      this.moves.set(await this.api.q<any[]>(this.api.sb.from('stock_movements').select('*, products(name), stock_lots(lot_code), stock_locations(code), profiles(name)').eq('reference_id', this.id).order('created_at')));
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  async confirmDraft() {
    if (!await this.notify.confirm('Confirmar pedido?', 'O pedido será concluído e a quantidade será abatida do estoque agora.')) return;
    try { await this.api.rpc('confirm_and_deduct', { p_order_id: this.id }); this.notify.ok('Pedido confirmado e estoque abatido.'); await this.load(); } catch (e) { this.notify.err(e); }
  }
  async removeDraft() {
    if (!await this.notify.confirm('Excluir rascunho?', 'Esta ação não pode ser desfeita.', 'Excluir')) return;
    try { await this.api.rpc('delete_draft_order', { p_order_id: this.id }); this.notify.ok('Rascunho excluído.'); this.router.navigateByUrl('/pedidos'); } catch (e) { this.notify.err(e); }
  }
  async cancel() {
    const reason = await this.notify.prompt(`Cancelar pedido #${this.o().order_number}`, 'Motivo do cancelamento', { confirmText: 'Cancelar pedido' });
    if (!reason) return;
    try { await this.api.rpc('cancel_and_restock', { p_order_id: this.id, p_reason: reason }); this.notify.ok('Pedido cancelado e estoque devolvido.'); await this.load(); } catch (e) { this.notify.err(e); }
  }
  async dispatch(mode: 'expedido' | 'retirado') {
    if (!await this.notify.confirm(mode === 'expedido' ? 'Confirmar expedição?' : 'Confirmar retirada?', 'O estoque físico será baixado agora, uma única vez.')) return;
    try { await this.api.rpc('dispatch_order', { p_order_id: this.id, p_mode: mode }); this.notify.ok('Saída confirmada e estoque baixado.'); await this.load(); } catch (e) { this.notify.err(e); }
  }
  async savePayment() {
    try { await this.api.rpc('update_order_payment', { p_order_id: this.id, p_status: this.payStatus, p_method: this.payMethod }); this.notify.ok('Pagamento atualizado.'); await this.load(); } catch (e) { this.notify.err(e); }
  }
  async doReturn() {
    const s = this.shipped().find(x => x.key === this.ret.key);
    const q = parseDecimal(this.ret.qty);
    if (!s) { this.notify.err(new Error('Escolha o item devolvido.')); return; }
    if (!q || q <= 0) { this.notify.err(new Error('Informe a quantidade.')); return; }
    this.busy.set(true);
    try {
      await this.api.rpc('register_return', { p_order_id: this.id, p_product_id: s.product_id, p_lot_id: s.lot_id, p_location_id: s.location_id, p_quantity: q, p_condition: this.ret.cond, p_reason: this.ret.reason });
      this.notify.ok('Devolução registrada.'); this.ret = { key: '', qty: '', cond: 'bom', reason: '' }; await this.load();
    } catch (e) { this.notify.err(e); }
    this.busy.set(false);
  }
}
