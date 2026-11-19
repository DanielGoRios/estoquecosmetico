import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { norm, parseDecimal, qtyFmt } from '../core/util';

@Component({
  selector: 'app-stock-simple',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="row" style="margin-bottom:12px">
      <mat-form-field class="grow"><mat-label>Buscar por nome, SKU ou código de barras</mat-label><mat-icon matPrefix>search</mat-icon><input matInput [(ngModel)]="q" (ngModelChange)="page = 0; bump()"></mat-form-field>
      <mat-form-field style="width:200px"><mat-label>Mostrar</mat-label>
        <mat-select [(ngModel)]="filtro" (ngModelChange)="page = 0; bump()">
          <mat-option value="">Todos</mat-option><mat-option value="baixo">Estoque baixo</mat-option><mat-option value="zerado">Estoque zerado</mat-option>
        </mat-select></mat-form-field>
      @if (api.isAdmin()) { <a mat-flat-button routerLink="/estoque/entrada"><mat-icon>add</mat-icon>Entrada</a> }
    </div>
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <div class="error-box">{{ error() }}</div> }
    <div class="table-wrap"><table class="t">
      <thead><tr><th>SKU</th><th>Produto</th><th class="r">Em estoque</th><th class="r">Mínimo</th><th>Situação</th>@if (api.isAdmin()) { <th class="r">Acertar quantidade</th> }</tr></thead>
      <tbody>
        @for (p of pageRows(); track p.product_id) {
          <tr>
            <td class="nowrap">{{ p.sku }}</td><td>{{ p.name }}@if (!p.active) { <span class="chip s-gray" style="margin-left:6px">Inativo</span> }</td>
            <td class="r mono"><strong>{{ p.on_hand | qty }}</strong>@if (+p.reserved > 0) { <div class="muted small">{{ p.reserved | qty }} reservado(s)</div> }</td>
            <td class="r mono">{{ p.min_stock | qty }}</td>
            <td>@if (+p.available <= 0) { <span class="chip s-red">Zerado</span> } @else if (+p.available <= +p.min_stock) { <span class="chip s-amber">Baixo</span> } @else { <span class="chip s-green">OK</span> }</td>
            @if (api.isAdmin()) {
              <td class="r nowrap">
                @if (editing() === p.product_id) {
                  <input class="cell" inputmode="decimal" [(ngModel)]="newQty" placeholder="Quantidade real" (keyup.enter)="saveQty(p)">
                  <button mat-button (click)="saveQty(p)" [disabled]="saving()">Salvar</button><button mat-button (click)="editing.set(null)">Cancelar</button>
                } @else { <button mat-button (click)="edit(p)">Acertar</button> }
              </td>
            }
          </tr>
        } @empty { <tr><td [attr.colspan]="api.isAdmin() ? 6 : 5" class="empty">{{ loading() ? 'Carregando…' : 'Nenhum produto encontrado.' }}</td></tr> }
      </tbody></table>
      <mat-paginator [length]="filtered().length" [pageSize]="size" [pageIndex]="page" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
    </div>
    <p class="muted small">"Acertar" serve para corrigir a quantidade quando a contagem real for diferente do sistema. A diferença fica registrada no histórico.</p>`,
})
export class StockSimple implements OnInit {
  api = inject(Api); private notify = inject(Notify); private route = inject(ActivatedRoute);
  all = signal<any[]>([]); loading = signal(true); error = signal(''); saving = signal(false); editing = signal<string | null>(null);
  tick = signal(0); q = ''; filtro = ''; page = 0; size = 25; newQty = '';
  filtered = computed(() => {
    this.tick();
    const t = norm(this.q);
    return this.all().filter(p => {
      if (t && !norm(`${p.sku} ${p.name} ${p.barcode ?? ''}`).includes(t)) return false;
      if (this.filtro === 'zerado') return Number(p.available) <= 0;
      if (this.filtro === 'baixo') return Number(p.available) > 0 && Number(p.available) <= Number(p.min_stock);
      return true;
    });
  });
  pageRows = computed(() => this.filtered().slice(this.page * this.size, this.page * this.size + this.size));
  bump() { this.tick.update(n => n + 1); }
  onPage(e: PageEvent) { this.page = e.pageIndex; this.size = e.pageSize; this.bump(); }
  async ngOnInit() {
    this.filtro = this.route.snapshot.queryParamMap.get('filtro') ?? '';
    await this.load();
  }
  async load() {
    this.loading.set(true); this.error.set('');
    try { this.all.set(await this.api.fetchAll(f => this.api.sb.from('v_product_stock').select('*').order('name').range(f, f + 999))); }
    catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  edit(p: any) { this.editing.set(p.product_id); this.newQty = qtyFmt(p.on_hand).replace(/\./g, ''); }
  async saveQty(p: any) {
    const q = parseDecimal(this.newQty);
    if (q === null || q < 0) { this.notify.err(new Error('Informe a quantidade real (zero ou mais).')); return; }
    this.saving.set(true);
    try { await this.api.rpc('quick_stock_set', { p_product_id: p.product_id, p_quantity: q, p_reason: 'Acerto de quantidade' }); this.notify.ok('Quantidade atualizada.'); this.editing.set(null); await this.load(); }
    catch (e) { this.notify.err(e); }
    this.saving.set(false);
  }
}
