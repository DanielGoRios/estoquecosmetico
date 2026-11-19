import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Api, friendly } from './api';
import { sanitizeSearch } from './util';

export interface PickerProduct { id: string; sku: string; name: string; unit: string; barcode: string | null; active: boolean; default_location_id: string | null; }

@Component({
  selector: 'app-product-picker',
  imports: [FormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <mat-form-field class="w100" appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input matInput [(ngModel)]="text" (ngModelChange)="onType($event)" [matAutocomplete]="auto" autocomplete="off"
             placeholder="Nome, SKU ou código de barras">
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="pick($event.option.value)" [displayWith]="show">
        @for (o of options(); track o.id) {
          <mat-option [value]="o">{{ o.sku }} — {{ o.name }}</mat-option>
        }
        @if (searched() && !options().length) { <mat-option disabled>Nenhum produto encontrado</mat-option> }
      </mat-autocomplete>
    </mat-form-field>`,
})
export class ProductPicker {
  label = input('Buscar produto');
  onlyActive = input(true);
  picked = output<PickerProduct>();
  text: any = '';
  options = signal<PickerProduct[]>([]);
  searched = signal(false);
  private timer: any;
  constructor(private api: Api) {}
  show = () => '';
  onType(v: any) {
    clearTimeout(this.timer);
    if (typeof v !== 'string') return;
    const s = sanitizeSearch(v);
    if (s.length < 2) { this.options.set([]); this.searched.set(false); return; }
    this.timer = setTimeout(async () => {
      try {
        let q = this.api.sb.from('products').select('id,sku,name,unit,barcode,active,default_location_id')
          .or(`name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`).order('name').limit(15);
        if (this.onlyActive()) q = q.eq('active', true);
        const { data, error } = await q;
        if (error) throw error;
        this.options.set((data ?? []) as PickerProduct[]);
        this.searched.set(true);
      } catch (e) { console.error(friendly(e)); }
    }, 250);
  }
  pick(p: PickerProduct) {
    this.picked.emit(p);
    setTimeout(() => { this.text = ''; this.options.set([]); this.searched.set(false); }, 0);
  }
}
