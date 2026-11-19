import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { CHANNELS } from '../core/status';
import { parseDecimal } from '../core/util';

@Component({
  selector: 'app-picking-queue',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Fila de separação</h1><div class="sub">Pedidos confirmados aguardando separação</div></div>
        <div class="row"><mat-slide-toggle [(ngModel)]="onlyMine" (ngModelChange)="tick.update(n => n + 1)">Somente meus</mat-slide-toggle>
          <mat-form-field style="width:200px"><mat-label>Status</mat-label><mat-select [(ngModel)]="statusF" (ngModelChange)="tick.update(n => n + 1)"><mat-option value="">Em aberto</mat-option><mat-option value="separado">Separados</mat-option><mat-option value="todos">Todos</mat-option></mat-select></mat-form-field></div></div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Prior.</th><th>Pedido</th><th>Confirmado</th><th>Cliente / referência</th><th class="r">Itens</th><th>Status</th><th>Responsável</th><th></th></tr></thead>
        <tbody>
          @for (r of view(); track r.task_id) {
            <tr class="click" [routerLink]="['/separacao', r.task_id]">
              <td>@if (r.priority > 0) { <span class="chip s-red">Urgente</span> }</td>
              <td class="nowrap"><strong>#{{ r.order_number }}</strong></td><td class="nowrap">{{ r.confirmed_at | dtbr }}</td><td>{{ r.reference }}</td>
              <td class="r mono">{{ r.items_count }}</td><td><app-chip kind="order" [value]="r.order_status" /></td><td>{{ r.assigned_name || '—' }}</td>
              <td class="nowrap" (click)="$event.stopPropagation()">
                <button mat-icon-button [matMenuTriggerFor]="m" aria-label="Ações"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #m="matMenu">
                  <a mat-menu-item [routerLink]="['/separacao', r.task_id]"><mat-icon>open_in_new</mat-icon>Abrir ficha</a>
                  <a mat-menu-item [routerLink]="['/imprimir/separacao', r.task_id]" target="_blank"><mat-icon>print</mat-icon>Imprimir A4</a>
                  @if (api.isAdmin()) {
                    <button mat-menu-item (click)="assign(r)"><mat-icon>person_add</mat-icon>Atribuir a mim / trocar responsável</button>
                    <button mat-menu-item (click)="priority(r)"><mat-icon>priority_high</mat-icon>{{ r.priority > 0 ? 'Remover urgência' : 'Marcar como urgente' }}</button>
                  }
                </mat-menu>
              </td>
            </tr>
          } @empty { <tr><td colspan="8" class="empty">{{ loading() ? 'Carregando…' : 'Nenhum pedido na fila.' }}</td></tr> }
        </tbody></table></div>
    </div>`,
})
export class PickingQueue implements OnInit {
  api = inject(Api);
  private notify = inject(Notify);
  rows = signal<any[]>([]); loading = signal(true); error = signal(''); tick = signal(0);
  onlyMine = false; statusF = '';
  view = computed(() => {
    this.tick(); const me = this.api.userId();
    return this.rows().filter(r => (!this.onlyMine || r.assigned_to === me) &&
      (this.statusF === 'todos' ? true : this.statusF === 'separado' ? r.order_status === 'separado' : r.order_status !== 'separado'));
  });
  ngOnInit() { this.load(); }
  async load() {
    this.loading.set(true);
    try { this.rows.set(await this.api.rpc<any[]>('get_pick_queue')); } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  async assign(r: any) {
    try {
      const users = await this.api.q<any[]>(this.api.sb.from('profiles').select('id,name').eq('active', true).order('name'));
      const me = this.api.userId();
      await this.api.rpc('assign_pick_task', { p_task_id: r.task_id, p_user_id: me }); void users;
      this.notify.ok('Pedido atribuído a você.'); await this.load();
    } catch (e) { this.notify.err(e); }
  }
  async priority(r: any) {
    try { await this.api.rpc('set_pick_priority', { p_task_id: r.task_id, p_priority: r.priority > 0 ? 0 : 1 }); await this.load(); } catch (e) { this.notify.err(e); }
  }
}

@Component({
  selector: 'app-picking-detail',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      @if (d(); as d) {
        <div class="page-head">
          <div><a routerLink="/separacao" class="small">← Fila de separação</a>
            <h1>Pedido #{{ d.order_number }} <app-chip kind="order" [value]="d.order_status" /></h1>
            <div class="sub">{{ d.reference }} · {{ channels[d.channel] }} · confirmado em {{ d.confirmed_at | dtbr }}@if (d.assigned_name) { · responsável: {{ d.assigned_name }} }</div></div>
          <div class="row">
            <a mat-stroked-button [routerLink]="['/imprimir/separacao', d.task_id]" target="_blank"><mat-icon>print</mat-icon>Imprimir A4</a>
            @if (d.order_status === 'confirmado') { <button mat-flat-button (click)="start()"><mat-icon>play_arrow</mat-icon>Iniciar separação</button> }
          </div>
        </div>
        @if (d.order_status === 'divergencia') { <div class="hint-box" style="background:var(--orange-bg)">Há divergência registrada. Resolva os itens ou peça a um administrador para autorizar a conclusão.</div> }
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Local</th><th>SKU</th><th>Produto</th><th>Lote</th><th>Validade</th><th class="r">Pedido</th><th>Separado</th><th>Conferido</th><th>Obs.</th></tr></thead>
          <tbody>
            @for (i of d.items; track i.id) {
              <tr [style.background]="i.lot_status !== 'ativo' ? 'var(--bad-bg)' : ''">
                <td class="nowrap"><strong>{{ i.location }}</strong></td><td>{{ i.sku }}</td>
                <td>{{ i.name }}<div class="muted small">{{ attrs(i.attributes) }}</div></td>
                <td>{{ i.lot_code || '—' }}</td>
                <td class="nowrap">{{ i.expires_at | dbr }} @if (i.lot_status !== 'ativo') { <app-chip kind="lot" [value]="i.lot_status" /> }</td>
                <td class="r mono"><strong>{{ i.quantity_requested | qty }}</strong> {{ i.unit }}</td>
                <td><input class="cell" inputmode="decimal" [disabled]="!editable()" [ngModel]="picked[i.id] ?? i.quantity_picked" (ngModelChange)="picked[i.id] = $event"></td>
                <td><mat-checkbox [disabled]="!editable()" [checked]="i.checked" (change)="check(i, $event.checked)" aria-label="Conferido" /></td>
                <td class="nowrap">
                  @if (editable()) { <button mat-icon-button (click)="diverge(i)" matTooltip="Registrar divergência (falta, avaria…)"><mat-icon>report</mat-icon></button> }
                  <span class="small" style="color:var(--orange)">{{ i.notes }}</span>
                </td>
              </tr>
            }
          </tbody></table></div>
        <div class="row end" style="margin-top:12px">
          @if (editable()) {
            <button mat-flat-button (click)="finish(false)" [disabled]="busy()"><mat-icon>done_all</mat-icon>Finalizar separação</button>
            @if (api.isAdmin()) { <button mat-stroked-button (click)="finish(true)" [disabled]="busy()">Autorizar divergência e finalizar</button> }
          }
          @if (d.order_status === 'separado') {
            @if (api.isAdmin()) { <a mat-flat-button [routerLink]="['/pedidos', d.order_id]"><mat-icon>local_shipping</mat-icon>Conferência e expedição</a> }
            @else { <span class="muted">Separação concluída. A saída será confirmada por um administrador.</span> }
          }
        </div>
      }
    </div>`,
})
export class PickingDetail implements OnInit {
  api = inject(Api);
  private route = inject(ActivatedRoute);
  private notify = inject(Notify);
  id = '';
  d = signal<any>(null); loading = signal(true); error = signal(''); busy = signal(false);
  picked: Record<string, string> = {}; channels = CHANNELS;
  editable = computed(() => ['em_andamento', 'divergencia'].includes(this.d()?.task_status));
  attrs = (a: any) => Object.entries(a ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
  ngOnInit() { this.id = this.route.snapshot.paramMap.get('id')!; this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try { this.d.set(await this.api.rpc('get_pick_detail', { p_task_id: this.id })); this.picked = {}; } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  async start() { try { await this.api.rpc('start_picking', { p_order_id: this.d().order_id }); this.notify.ok('Separação iniciada.'); await this.load(); } catch (e) { this.notify.err(e); } }
  async check(i: any, checked: boolean) {
    const raw = this.picked[i.id];
    const qty = checked ? (raw !== undefined && raw !== '' ? parseDecimal(raw) : i.quantity_requested) : (parseDecimal(raw ?? String(i.quantity_picked)) ?? 0);
    try { await this.api.rpc('update_pick_item', { p_item_id: i.id, p_picked: qty, p_checked: checked, p_notes: null }); await this.load(); }
    catch (e) { this.notify.err(e); await this.load(); }
  }
  async diverge(i: any) {
    const note = await this.notify.prompt(`Divergência — ${i.name}`, 'Descreva a falta, avaria ou outro problema');
    if (!note) return;
    try {
      const raw = this.picked[i.id];
      if (raw !== undefined && raw !== '') await this.api.rpc('update_pick_item', { p_item_id: i.id, p_picked: parseDecimal(raw) ?? 0, p_checked: false, p_notes: null });
      await this.api.rpc('report_divergence', { p_item_id: i.id, p_notes: note }); this.notify.ok('Divergência registrada.'); await this.load();
    } catch (e) { this.notify.err(e); }
  }
  async finish(override: boolean) {
    let note: string | null = null;
    if (override) { note = await this.notify.prompt('Autorizar divergência', 'Justificativa da autorização', { confirmText: 'Autorizar e finalizar' }); if (!note) return; }
    this.busy.set(true);
    try { await this.api.rpc('complete_picking', { p_task_id: this.id, p_override: override, p_note: note }); this.notify.ok('Separação concluída.'); await this.load(); }
    catch (e) { this.notify.err(e); }
    this.busy.set(false);
  }
}
