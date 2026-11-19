import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { addDaysIso, daysUntil, norm, parseDecimal, todayIso } from '../core/util';

@Component({
  selector: 'app-stock-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Estoque</h1><div class="sub">Saldos por produto, lote e localização</div></div></div>
      <nav class="subnav">
        <a routerLink="saldos" routerLinkActive="active">Saldos</a>
        @if (api.isAdmin()) {
          <a routerLink="entrada" routerLinkActive="active">Entrada</a>
          <a routerLink="movimentacoes" routerLinkActive="active">Histórico</a>
        }
      </nav>
      <router-outlet />
    </div>`,
})
export class StockShell { api = inject(Api); }

@Component({
  selector: 'app-stock-balances',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="row" style="margin-bottom:12px">
      <div class="row">
        <button mat-stroked-button [class.active-btn]="visao() === 'produtos'" (click)="setVisao('produtos')" [disabled]="visao() === 'produtos'">Por produto</button>
        <button mat-stroked-button (click)="setVisao('lotes')" [disabled]="visao() === 'lotes'">Por lote e local</button>
      </div>
      <mat-form-field class="grow"><mat-label>Buscar produto, SKU ou lote</mat-label><mat-icon matPrefix>search</mat-icon><input matInput [(ngModel)]="q" (ngModelChange)="page = 0; apply()"></mat-form-field>
      <mat-form-field style="width:210px"><mat-label>Filtro</mat-label>
        <mat-select [(ngModel)]="filtro" (ngModelChange)="page = 0; apply()">
          <mat-option value="">Todos</mat-option>
          <mat-option value="baixo">Estoque baixo</mat-option><mat-option value="zerado">Estoque zerado</mat-option>
          @if (visao() === 'lotes') {
            <mat-option value="vencidos">Lotes vencidos</mat-option><mat-option value="vence1">Vencem em até {{ d1 }} dias</mat-option><mat-option value="vence2">Vencem em {{ d1 + 1 }} a {{ d2 }} dias</mat-option>
            <mat-option value="bloqueado">Com bloqueio</mat-option><mat-option value="reservado">Com reserva</mat-option>
          }
        </mat-select></mat-form-field>
    </div>
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <div class="error-box">{{ error() }}</div> }

    @if (act(); as a) {
      <section class="card">
        <h2>{{ actLabel[a.type] }} — {{ a.row.product_name }} <span class="muted small">(lote {{ a.row.lot_code || '—' }} · {{ a.row.location_code }})</span></h2>
        <div class="row">
          @if (a.type === 'ajuste') {
            <mat-form-field style="width:200px"><mat-label>Novo saldo físico</mat-label><input matInput [(ngModel)]="actQty" inputmode="decimal"><mat-hint>Atual: {{ a.row.on_hand | qty }}</mat-hint></mat-form-field>
          }
          @if (a.type === 'bloq_qtd' || a.type === 'desbloq_qtd') {
            <mat-form-field style="width:200px"><mat-label>Quantidade</mat-label><input matInput [(ngModel)]="actQty" inputmode="decimal"></mat-form-field>
          }
          <mat-form-field class="grow"><mat-label>Justificativa *</mat-label><input matInput [(ngModel)]="actReason"></mat-form-field>
          <button mat-flat-button (click)="confirmAct()" [disabled]="busy()">Confirmar</button>
          <button mat-button (click)="act.set(null)">Cancelar</button>
        </div>
      </section>
    }

    <div class="table-wrap">
      @if (visao() === 'produtos') {
        <table class="t">
          <thead><tr><th>SKU</th><th>Produto</th><th class="r">Físico</th><th class="r">Reservado</th><th class="r">Bloqueado</th><th class="r">Disponível</th><th class="r">Mín.</th><th></th></tr></thead>
          <tbody>
            @for (p of pageRows(); track p.product_id) {
              <tr class="click" [routerLink]="['/produtos', p.product_id]">
                <td class="nowrap">{{ p.sku }}</td><td>{{ p.name }}</td>
                <td class="r mono">{{ p.on_hand | qty }}</td><td class="r mono">{{ p.reserved | qty }}</td><td class="r mono">{{ p.blocked | qty }}</td>
                <td class="r mono"><strong [style.color]="p.available <= 0 ? 'var(--bad)' : p.available <= p.min_stock ? 'var(--warn)' : ''">{{ p.available | qty }}</strong></td>
                <td class="r mono muted">{{ p.min_stock | qty }}</td>
                <td>@if (p.available <= 0) { <span class="chip s-red">Zerado</span> } @else if (p.available <= p.min_stock) { <span class="chip s-amber">Baixo</span> }</td>
              </tr>
            } @empty { <tr><td colspan="8" class="empty">Nada encontrado.</td></tr> }
          </tbody>
        </table>
      } @else {
        <table class="t">
          <thead><tr><th>SKU</th><th>Produto</th><th>Lote</th><th>Validade</th><th>Local</th><th class="r">Físico</th><th class="r">Reserv.</th><th class="r">Bloq.</th><th class="r">Disp.</th><th>Situação</th>@if (api.isAdmin()) { <th></th> }</tr></thead>
          <tbody>
            @for (l of pageRows(); track l.balance_id) {
              <tr>
                <td class="nowrap">{{ l.sku }}</td><td>{{ l.product_name }}</td><td>{{ l.lot_code || '—' }}</td>
                <td class="nowrap">{{ l.expires_at | dbr }}@if (l.expires_at && days(l.expires_at) !== null) { <div class="muted small">{{ days(l.expires_at)! < 0 ? 'venceu há ' + (-days(l.expires_at)!) + ' d' : 'em ' + days(l.expires_at) + ' d' }}</div> }</td>
                <td>{{ l.location_code }}</td>
                <td class="r mono">{{ l.on_hand | qty }}</td><td class="r mono">{{ l.reserved | qty }}</td><td class="r mono">{{ l.blocked | qty }}</td><td class="r mono"><strong>{{ l.available | qty }}</strong></td>
                <td><app-chip kind="lot" [value]="l.lot_status" /></td>
                @if (api.isAdmin()) {
                  <td>
                    <button mat-icon-button [matMenuTriggerFor]="m" aria-label="Ações"><mat-icon>more_vert</mat-icon></button>
                    <mat-menu #m="matMenu">
                      <button mat-menu-item (click)="start('ajuste', l)"><mat-icon>tune</mat-icon>Ajustar saldo</button>
                      @if (l.lot_status === 'ativo') { <button mat-menu-item (click)="start('bloq_lote', l)"><mat-icon>block</mat-icon>Bloquear lote</button> }
                      @if (l.lot_status === 'bloqueado') { <button mat-menu-item (click)="start('desbloq_lote', l)"><mat-icon>lock_open</mat-icon>Desbloquear lote</button> }
                      <button mat-menu-item (click)="start('bloq_qtd', l)"><mat-icon>do_not_disturb_on</mat-icon>Bloquear quantidade</button>
                      <button mat-menu-item (click)="start('desbloq_qtd', l)"><mat-icon>check_circle</mat-icon>Liberar quantidade bloqueada</button>
                    </mat-menu>
                  </td>
                }
              </tr>
            } @empty { <tr><td colspan="11" class="empty">Nada encontrado.</td></tr> }
          </tbody>
        </table>
      }
      <mat-paginator [length]="filtered().length" [pageSize]="size" [pageIndex]="page" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
    </div>`,
})
export class StockBalances implements OnInit {
  api = inject(Api);
  private route = inject(ActivatedRoute);
  private notify = inject(Notify);
  visao = signal<'produtos' | 'lotes'>('produtos');
  filtro = ''; q = ''; page = 0; size = 25; d1 = 30; d2 = 60;
  loading = signal(true); error = signal(''); busy = signal(false);
  prods = signal<any[]>([]); lots = signal<any[]>([]);
  tick = signal(0);
  act = signal<{ type: string; row: any } | null>(null);
  actQty = ''; actReason = '';
  actLabel: Record<string, string> = { ajuste: 'Ajustar saldo', bloq_lote: 'Bloquear lote', desbloq_lote: 'Desbloquear lote', bloq_qtd: 'Bloquear quantidade', desbloq_qtd: 'Liberar quantidade bloqueada' };
  days = daysUntil;

  filtered = computed(() => {
    this.tick();
    const s = norm(this.q), f = this.filtro, t = todayIso();
    const lim1 = addDaysIso(t, this.d1), lim2 = addDaysIso(t, this.d2);
    if (this.visao() === 'produtos') {
      return this.prods().filter(p => {
        if (s && !norm(p.name + ' ' + p.sku).includes(s)) return false;
        if (f === 'baixo') return p.available > 0 && p.available <= p.min_stock;
        if (f === 'zerado') return p.available <= 0;
        return true;
      });
    }
    return this.lots().filter(l => {
      if (s && !norm(l.product_name + ' ' + l.sku + ' ' + (l.lot_code ?? '')).includes(s)) return false;
      switch (f) {
        case 'baixo': return l.available > 0 && l.available <= l.min_stock;
        case 'zerado': return l.available <= 0;
        case 'vencidos': return l.lot_status === 'vencido';
        case 'vence1': return l.lot_status === 'ativo' && l.expires_at && l.expires_at <= lim1;
        case 'vence2': return l.lot_status === 'ativo' && l.expires_at && l.expires_at > lim1 && l.expires_at <= lim2;
        case 'bloqueado': return Number(l.blocked) > 0;
        case 'reservado': return Number(l.reserved) > 0;
      }
      return true;
    });
  });
  pageRows = computed(() => this.filtered().slice(this.page * this.size, this.page * this.size + this.size));

  async ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('visao') === 'lotes') this.visao.set('lotes');
    this.filtro = qp.get('filtro') ?? '';
    if (['vencidos', 'vence1', 'vence2', 'bloqueado', 'reservado'].includes(this.filtro)) this.visao.set('lotes');
    await this.load();
  }
  setVisao(v: 'produtos' | 'lotes') { this.visao.set(v); this.page = 0; this.filtro = ''; }
  apply() { this.tick.update(n => n + 1); }
  onPage(e: PageEvent) { this.page = e.pageIndex; this.size = e.pageSize; this.apply(); }

  async load() {
    this.loading.set(true); this.error.set('');
    try {
      const s = await this.api.settings();
      this.d1 = s.expiry_alert_days?.[0] ?? 30; this.d2 = s.expiry_alert_days?.[1] ?? 60;
      const [p, l] = await Promise.all([
        this.api.fetchAll(f => this.api.sb.from('v_product_stock').select('*').eq('active', true).order('name').range(f, f + 999)),
        this.api.fetchAll(f => this.api.sb.from('v_balance_detail').select('*').gt('on_hand', 0).order('product_name').order('expires_at').range(f, f + 999)),
      ]);
      this.prods.set(p); this.lots.set(l);
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }

  start(type: string, row: any) { this.act.set({ type, row }); this.actQty = type === 'ajuste' ? String(row.on_hand).replace('.', ',') : ''; this.actReason = ''; }
  async confirmAct() {
    const a = this.act(); if (!a) return;
    this.busy.set(true);
    try {
      const r = a.row, reason = this.actReason.trim();
      if (a.type === 'ajuste') {
        const novo = parseDecimal(this.actQty);
        if (novo === null || novo < 0) throw new Error('Informe o novo saldo físico.');
        const delta = Math.round((novo - Number(r.on_hand)) * 1000) / 1000;
        if (delta === 0) throw new Error('O novo saldo é igual ao atual.');
        await this.api.rpc('adjust_stock', { p_lot_id: r.lot_id, p_location_id: r.location_id, p_delta: delta, p_reason: reason });
      } else if (a.type === 'bloq_lote') await this.api.rpc('block_lot', { p_lot_id: r.lot_id, p_reason: reason });
      else if (a.type === 'desbloq_lote') await this.api.rpc('unblock_lot', { p_lot_id: r.lot_id, p_reason: reason });
      else {
        const qtd = parseDecimal(this.actQty);
        if (!qtd || qtd <= 0) throw new Error('Informe a quantidade.');
        await this.api.rpc(a.type === 'bloq_qtd' ? 'block_stock' : 'unblock_stock', { p_lot_id: r.lot_id, p_location_id: r.location_id, p_qty: qtd, p_reason: reason });
      }
      this.notify.ok('Operação registrada.');
      this.act.set(null);
      await this.load();
    } catch (e) { this.notify.err(e); }
    this.busy.set(false);
  }
}

@Component({
  selector: 'app-stock-alerts',
  imports: [...SHARED, MatProgressBarModule, RouterLink],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <div class="error-box">{{ error() }}</div> }
    <section class="card">
      <h2>Validade (alertas em {{ d1 }} e {{ d2 }} dias)</h2>
      <div class="table-wrap" style="border:0"><table class="t">
        <thead><tr><th>Produto</th><th>Lote</th><th>Local</th><th class="r">Físico</th><th>Validade</th><th>Situação</th></tr></thead>
        <tbody>
          @for (l of lots(); track l.balance_id) {
            <tr><td>{{ l.product_name }}<div class="muted small">{{ l.sku }}</div></td><td>{{ l.lot_code || '—' }}</td><td>{{ l.location_code }}</td>
              <td class="r mono">{{ l.on_hand | qty }}</td><td>{{ l.expires_at | dbr }}</td>
              <td>@if (l.lot_status === 'vencido') { <span class="chip s-red">Vencido</span> } @else if (l.expires_at <= lim1) { <span class="chip s-orange">Vence em até {{ d1 }} d</span> } @else { <span class="chip s-amber">Vence em até {{ d2 }} d</span> }</td></tr>
          } @empty { <tr><td colspan="6" class="empty">Nenhum lote em alerta.</td></tr> }
        </tbody></table></div>
    </section>
    <section class="card">
      <h2>Produtos abaixo do estoque mínimo</h2>
      <div class="table-wrap" style="border:0"><table class="t">
        <thead><tr><th>SKU</th><th>Produto</th><th class="r">Disponível</th><th class="r">Mínimo</th></tr></thead>
        <tbody>
          @for (p of low(); track p.product_id) {
            <tr class="click" [routerLink]="['/produtos', p.product_id]"><td>{{ p.sku }}</td><td>{{ p.name }}</td>
              <td class="r mono"><strong [style.color]="p.available <= 0 ? 'var(--bad)' : 'var(--warn)'">{{ p.available | qty }}</strong></td><td class="r mono">{{ p.min_stock | qty }}</td></tr>
          } @empty { <tr><td colspan="4" class="empty">Nenhum produto abaixo do mínimo.</td></tr> }
        </tbody></table></div>
    </section>`,
})
export class StockAlerts implements OnInit {
  private api = inject(Api);
  loading = signal(true); error = signal('');
  lots = signal<any[]>([]); low = signal<any[]>([]);
  d1 = 30; d2 = 60; lim1 = '';
  async ngOnInit() {
    try {
      await this.api.rpc('refresh_expired_lots');
      const s = await this.api.settings();
      this.d1 = s.expiry_alert_days?.[0] ?? 30; this.d2 = s.expiry_alert_days?.[1] ?? 60;
      const t = todayIso(); this.lim1 = addDaysIso(t, this.d1);
      this.lots.set(await this.api.q<any[]>(this.api.sb.from('v_balance_detail').select('*').gt('on_hand', 0).not('expires_at', 'is', null).lte('expires_at', addDaysIso(t, this.d2)).order('expires_at').limit(500)));
      const p = await this.api.fetchAll<any>(f => this.api.sb.from('v_product_stock').select('*').eq('active', true).order('available').range(f, f + 999));
      this.low.set(p.filter(x => Number(x.available) <= Number(x.min_stock)));
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
}
