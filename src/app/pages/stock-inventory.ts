import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { dateFmt, norm, parseDecimal, todayIso } from '../core/util';

@Component({
  selector: 'app-stock-inventory',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <section class="card">
      <h2>Inventário físico</h2>
      <p class="muted" style="margin-top:-6px">Conte as unidades, digite a quantidade contada e aplique. Só as diferenças geram ajuste, com justificativa e usuário registrados.</p>
      <div class="row">
        <mat-form-field style="width:220px"><mat-label>Localização</mat-label>
          <mat-select [(ngModel)]="locId" (ngModelChange)="load()"><mat-option value="">Todas</mat-option>@for (l of locations(); track l.id) { <mat-option [value]="l.id">{{ l.code }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field class="grow"><mat-label>Filtrar produto ou lote</mat-label><input matInput [(ngModel)]="q" (ngModelChange)="tick.update(n => n + 1)"></mat-form-field>
      </div>
    </section>
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <div class="error-box">{{ error() }}</div> }
    @if (result()) { <div class="hint-box">{{ result() }}</div> }
    <div class="table-wrap">
      <table class="t">
        <thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Local</th><th class="r">Sistema</th><th>Contado</th><th class="r">Diferença</th></tr></thead>
        <tbody>
          @for (r of visible(); track r.balance_id) {
            <tr>
              <td>{{ r.product_name }}<div class="muted small">{{ r.sku }}</div></td><td>{{ r.lot_code || '—' }}</td><td>{{ r.expires_at | dbr }}</td><td>{{ r.location_code }}</td>
              <td class="r mono">{{ r.on_hand | qty }}</td>
              <td><input class="cell" inputmode="decimal" [ngModel]="counts[r.balance_id] ?? ''" (ngModelChange)="setCount(r.balance_id, $event)"></td>
              <td class="r mono" [style.color]="diff(r) > 0 ? 'var(--ok)' : diff(r) < 0 ? 'var(--bad)' : ''">{{ diff(r) === 0 ? '—' : (diff(r) > 0 ? '+' : '') + (diff(r) | qty) }}</td>
            </tr>
          } @empty { <tr><td colspan="7" class="empty">Nenhum saldo encontrado.</td></tr> }
        </tbody>
      </table>
    </div>
    <div class="row end" style="margin-top:12px">
      <span class="muted">{{ changes().length }} diferença(s) a ajustar</span>
      <button mat-flat-button (click)="apply()" [disabled]="!changes().length || busy()"><mat-icon>fact_check</mat-icon>Aplicar ajustes</button>
    </div>`,
})
export class StockInventory implements OnInit {
  private api = inject(Api);
  private notify = inject(Notify);
  locations = signal<any[]>([]); rows = signal<any[]>([]);
  loading = signal(true); busy = signal(false); error = signal(''); result = signal('');
  locId = ''; q = ''; counts: Record<string, string> = {}; tick = signal(0);
  visible = computed(() => { this.tick(); const s = norm(this.q); return this.rows().filter(r => !s || norm(r.product_name + ' ' + r.sku + ' ' + (r.lot_code ?? '')).includes(s)); });
  changes = computed(() => { this.tick(); return this.rows().filter(r => this.diff(r) !== 0); });

  async ngOnInit() {
    try { this.locations.set(await this.api.q<any[]>(this.api.sb.from('stock_locations').select('id,code').eq('active', true).order('code'))); } catch (e: any) { this.error.set(e.message); }
    await this.load();
  }
  setCount(id: string, v: string) { this.counts[id] = v; this.tick.update(n => n + 1); }
  diff(r: any): number {
    const raw = this.counts[r.balance_id];
    if (raw === undefined || raw === '') return 0;
    const c = parseDecimal(raw);
    return c === null ? 0 : Math.round((c - Number(r.on_hand)) * 1000) / 1000;
  }
  async load() {
    this.loading.set(true); this.error.set(''); this.counts = {};
    try {
      this.rows.set(await this.api.fetchAll(f => {
        let qb = this.api.sb.from('v_balance_detail').select('*').gt('on_hand', 0);
        if (this.locId) qb = qb.eq('location_id', this.locId);
        return qb.order('location_code').order('product_name').range(f, f + 999);
      }));
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  async apply() {
    const list = this.changes();
    if (!await this.notify.confirm('Aplicar ajustes de inventário?', `${list.length} saldo(s) serão ajustados para a quantidade contada.`)) return;
    this.busy.set(true); this.result.set(''); let ok = 0; const fails: string[] = [];
    const reason = `Inventário físico de ${dateFmt(todayIso())}`;
    for (const r of list) {
      try { await this.api.rpc('adjust_stock', { p_lot_id: r.lot_id, p_location_id: r.location_id, p_delta: this.diff(r), p_reason: reason }); ok++; }
      catch (e: any) { fails.push(`${r.sku} (lote ${r.lot_code || '—'}): ${e.message}`); }
    }
    this.result.set(`${ok} ajuste(s) aplicado(s).${fails.length ? ' Falhas: ' + fails.join(' | ') : ''}`);
    await this.load();
    this.busy.set(false);
  }
}
