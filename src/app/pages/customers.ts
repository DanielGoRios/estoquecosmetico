import { Component, OnInit, inject, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { SHARED } from '../core/shared';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { CHANNELS } from '../core/status';
import { sanitizeSearch } from '../core/util';

@Component({
  selector: 'app-customers',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Clientes</h1><div class="sub">Cadastro e histórico de pedidos</div></div>
        <button mat-flat-button (click)="edit(null)"><mat-icon>person_add</mat-icon>Novo cliente</button>
      </div>
      @if (form(); as c) {
        <section class="card">
          <h2>{{ c.id ? 'Editar cliente' : 'Novo cliente' }}</h2>
          <form (ngSubmit)="save()" #fm="ngForm">
            <div class="grid">
              <mat-form-field style="grid-column: span 2"><mat-label>Nome ou razão social *</mat-label><input matInput name="n" [(ngModel)]="c.name" required></mat-form-field>
              <mat-form-field><mat-label>CPF / CNPJ</mat-label><input matInput name="d" [(ngModel)]="c.document"></mat-form-field>
              <mat-form-field><mat-label>Telefone</mat-label><input matInput name="p" [(ngModel)]="c.phone" inputmode="tel"></mat-form-field>
              <mat-form-field><mat-label>WhatsApp</mat-label><input matInput name="w" [(ngModel)]="c.whatsapp" inputmode="tel"></mat-form-field>
              <mat-form-field><mat-label>E-mail (opcional)</mat-label><input matInput name="e" type="email" [(ngModel)]="c.email"></mat-form-field>
            </div>
            <mat-form-field class="w100" style="margin-top:12px"><mat-label>Endereço de entrega</mat-label><input matInput name="a" [(ngModel)]="c.address"></mat-form-field>
            <mat-form-field class="w100" style="margin-top:12px"><mat-label>Observações</mat-label><textarea matInput rows="2" name="o" [(ngModel)]="c.notes"></textarea></mat-form-field>
            <p class="muted small">Guardamos apenas os dados necessários para a operação.</p>
            <div class="row end"><button mat-button type="button" (click)="form.set(null)">Cancelar</button><button mat-flat-button type="submit" [disabled]="!fm.valid || saving()">Salvar</button></div>
          </form>
          @if (c.id) {
            <h2 style="margin-top:20px">Histórico de pedidos</h2>
            <div class="table-wrap"><table class="t"><thead><tr><th>Pedido</th><th>Data</th><th>Canal</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
              @for (o of history(); track o.id) {
                <tr class="click" [routerLink]="['/pedidos', o.id]"><td>#{{ o.order_number }}</td><td>{{ o.created_at | dtbr }}</td><td>{{ channels[o.channel] }}</td><td><app-chip kind="order" [value]="o.status" /></td><td class="r mono">{{ o.total | brl }}</td></tr>
              } @empty { <tr><td colspan="5" class="empty">Este cliente ainda não tem pedidos.</td></tr> }
            </tbody></table></div>
          }
        </section>
      }
      <mat-form-field class="w100"><mat-label>Buscar por nome, telefone, WhatsApp, documento ou e-mail</mat-label><mat-icon matPrefix>search</mat-icon><input matInput [(ngModel)]="q" (ngModelChange)="onSearch()"></mat-form-field>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="error-box">{{ error() }}</div> }
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Nome</th><th>Contato</th><th>Documento</th><th>Endereço</th><th></th></tr></thead>
        <tbody>
          @for (c of rows(); track c.id) {
            <tr class="click" (click)="edit(c)"><td>{{ c.name }}</td><td>{{ c.whatsapp || c.phone || '—' }}<div class="muted small">{{ c.email }}</div></td><td>{{ c.document || '—' }}</td><td>{{ c.address || '—' }}</td>
              <td class="nowrap" (click)="$event.stopPropagation()"><a mat-button routerLink="/pedidos/novo" [queryParams]="{cliente: c.id}">Novo pedido</a></td></tr>
          } @empty { <tr><td colspan="5" class="empty">{{ loading() ? 'Carregando…' : 'Nenhum cliente encontrado.' }}</td></tr> }
        </tbody></table>
        <mat-paginator [length]="total()" [pageSize]="size" [pageIndex]="page" [pageSizeOptions]="[20, 50]" (page)="onPage($event)" />
      </div>
    </div>`,
})
export class Customers implements OnInit {
  private api = inject(Api);
  private notify = inject(Notify);
  rows = signal<any[]>([]); total = signal(0); loading = signal(true); error = signal(''); saving = signal(false);
  form = signal<any>(null); history = signal<any[]>([]);
  q = ''; page = 0; size = 20; channels = CHANNELS; private timer: any;
  ngOnInit() { this.load(); }
  onSearch() { clearTimeout(this.timer); this.timer = setTimeout(() => { this.page = 0; this.load(); }, 300); }
  onPage(e: PageEvent) { this.page = e.pageIndex; this.size = e.pageSize; this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      let qb = this.api.sb.from('customers').select('*', { count: 'exact' });
      const s = sanitizeSearch(this.q);
      if (s) qb = qb.or(`name.ilike.%${s}%,phone.ilike.%${s}%,whatsapp.ilike.%${s}%,document.ilike.%${s}%,email.ilike.%${s}%`);
      const { data, count } = await this.api.qc<any[]>(qb.order('name').range(this.page * this.size, this.page * this.size + this.size - 1));
      this.rows.set(data); this.total.set(count);
    } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  async edit(c: any | null) {
    this.form.set(c ? { ...c } : { name: '', phone: '', whatsapp: '', document: '', email: '', address: '', notes: '' });
    this.history.set([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (c) {
      try { this.history.set(await this.api.q<any[]>(this.api.sb.from('orders').select('id,order_number,created_at,channel,status,total').eq('customer_id', c.id).order('created_at', { ascending: false }).limit(50))); }
      catch (e) { this.notify.err(e); }
    }
  }
  async save() {
    const c = this.form(); if (!c) return;
    this.saving.set(true);
    try {
      const body = { name: c.name.trim(), phone: c.phone?.trim() || null, whatsapp: c.whatsapp?.trim() || null, document: c.document?.trim() || null, email: c.email?.trim() || null, address: c.address?.trim() || null, notes: c.notes?.trim() || null };
      if (c.id) await this.api.q(this.api.sb.from('customers').update(body).eq('id', c.id));
      else await this.api.q(this.api.sb.from('customers').insert(body));
      this.notify.ok('Cliente salvo.'); this.form.set(null); await this.load();
    } catch (e) { this.notify.err(e); }
    this.saving.set(false);
  }
}
