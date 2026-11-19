import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { ProductPicker, PickerProduct } from '../core/product-picker';
import { parseDecimal } from '../core/util';

interface Line { product: PickerProduct; qty: string; }

@Component({
  selector: 'app-stock-receive',
  imports: [...SHARED, MatButtonModule, MatIconModule, ProductPicker],
  template: `
    <section class="card">
      <h2>Entrada de estoque</h2>
      <p class="muted" style="margin-top:0">Busque o produto, informe quantas unidades chegaram e salve. A quantidade é somada ao que você já tem.</p>
      <app-product-picker label="Buscar produto para dar entrada" (picked)="add($event)" />
      @if (lines().length) {
        <div class="table-wrap" style="margin-top:12px"><table class="t">
          <thead><tr><th>SKU</th><th>Produto</th><th class="r">Quantidade que chegou</th><th></th></tr></thead>
          <tbody>
            @for (l of lines(); track l.product.id; let i = $index) {
              <tr><td class="nowrap">{{ l.product.sku }}</td><td>{{ l.product.name }}</td>
                <td class="r"><input class="cell" inputmode="decimal" [(ngModel)]="l.qty" [name]="'q' + i" placeholder="0" autofocus></td>
                <td class="r"><button mat-icon-button (click)="remove(i)" aria-label="Remover"><mat-icon>close</mat-icon></button></td></tr>
            }
          </tbody></table></div>
        <mat-form-field class="w100" style="margin-top:12px"><mat-label>Observação (opcional) — ex.: fornecedor ou nota</mat-label><input matInput [(ngModel)]="note"></mat-form-field>
        @if (error()) { <div class="error-box">{{ error() }}</div> }
        <div class="row end"><button mat-button (click)="lines.set([])">Limpar</button><button mat-flat-button (click)="save()" [disabled]="saving()"><mat-icon>check</mat-icon>Salvar entrada</button></div>
      } @else { <div class="empty">Nenhum produto adicionado ainda.</div> }
    </section>`,
})
export class StockReceive {
  private api = inject(Api); private notify = inject(Notify); private router = inject(Router);
  lines = signal<Line[]>([]); saving = signal(false); error = signal(''); note = '';
  add(p: PickerProduct) {
    if (this.lines().some(l => l.product.id === p.id)) { this.notify.ok('Este produto já está na lista.'); return; }
    this.lines.update(a => [...a, { product: p, qty: '' }]);
  }
  remove(i: number) { this.lines.update(a => a.filter((_, k) => k !== i)); }
  async save() {
    this.error.set('');
    const items: { product_id: string; quantity: number }[] = [];
    for (const l of this.lines()) {
      const q = parseDecimal(l.qty);
      if (!q || q <= 0) { this.error.set(`Informe a quantidade de ${l.product.name}.`); return; }
      items.push({ product_id: l.product.id, quantity: q });
    }
    this.saving.set(true);
    try {
      await this.api.rpc('quick_stock_entry', { p_items: items, p_note: this.note || null });
      this.notify.ok('Entrada registrada.'); this.router.navigateByUrl('/estoque/saldos');
    } catch (e: any) { this.error.set(e.message); this.notify.err(e); }
    this.saving.set(false);
  }
}
