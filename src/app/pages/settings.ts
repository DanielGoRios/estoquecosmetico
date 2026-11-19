import { Component, OnInit, inject, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api, friendly } from '../core/api';
import { Notify } from '../core/notify';
import { ROLE } from '../core/status';
import { addDaysIso, dayEnd, dayStart, todayIso } from '../core/util';

@Component({
  selector: 'app-settings-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Configurações</h1><div class="sub">Usuários, loja, alertas e auditoria</div></div></div>
      <nav class="subnav">
        @if (api.isAdmin()) {
          <a routerLink="usuarios" routerLinkActive="active">Usuários</a>
          <a routerLink="loja" routerLinkActive="active">Dados da loja</a>
          <a routerLink="alertas" routerLinkActive="active">Alertas</a>
          <a routerLink="localizacoes" routerLinkActive="active">Localizações</a>
          <a routerLink="catalogo" routerLinkActive="active">Marcas e categorias</a>
          <a routerLink="permissoes" routerLinkActive="active">Permissões</a>
        }
        <a routerLink="auditoria" routerLinkActive="active">Auditoria</a>
      </nav>
      <router-outlet />
    </div>`,
})
export class SettingsShell { api = inject(Api); }

/* ------------------------------------------------------------------ usuários */
@Component({
  selector: 'app-settings-users',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <section class="card">
      <h2>Novo usuário</h2>
      <form (ngSubmit)="create()" #fm="ngForm" class="row">
        <mat-form-field class="grow"><mat-label>Nome *</mat-label><input matInput name="n" [(ngModel)]="f.name" required></mat-form-field>
        <mat-form-field class="grow"><mat-label>E-mail *</mat-label><input matInput name="e" type="email" [(ngModel)]="f.email" required></mat-form-field>
        <mat-form-field style="width:200px"><mat-label>Senha inicial *</mat-label><input matInput name="p" type="password" minlength="8" [(ngModel)]="f.password" required autocomplete="new-password"><mat-hint>Mínimo 8 caracteres</mat-hint></mat-form-field>
        <mat-form-field style="width:170px"><mat-label>Perfil</mat-label><mat-select name="r" [(ngModel)]="f.role"><mat-option value="estoquista">Estoquista</mat-option><mat-option value="administrador">Administrador</mat-option></mat-select></mat-form-field>
        <button mat-flat-button type="submit" [disabled]="!fm.valid || saving()">Criar usuário</button>
      </form>
    </section>
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <div class="error-box">{{ error() }}</div> }
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th class="r">Ativo</th></tr></thead>
      <tbody>
        @for (u of rows(); track u.id) {
          <tr><td>{{ u.name }} @if (u.id === api.userId()) { <span class="muted small">(você)</span> }</td><td>{{ u.email }}</td>
            <td><mat-select style="width:150px" [ngModel]="u.role" (ngModelChange)="setRole(u, $event)" [disabled]="u.id === api.userId()">
              <mat-option value="administrador">Administrador</mat-option><mat-option value="estoquista">Estoquista</mat-option></mat-select></td>
            <td><app-chip kind="role" [value]="u.role" /> @if (!u.active) { <span class="chip s-red">Inativo</span> }</td>
            <td class="r"><mat-slide-toggle [checked]="u.active" [disabled]="u.id === api.userId()" (change)="setActive(u, $event.checked)" /></td></tr>
        } @empty { <tr><td colspan="5" class="empty">Nenhum usuário.</td></tr> }
      </tbody></table></div>
    <p class="muted small">Usuários inativos não acessam o sistema. O próprio perfil não pode ser desativado nem rebaixado.</p>`,
})
export class SettingsUsers implements OnInit {
  api = inject(Api); private notify = inject(Notify);
  rows = signal<any[]>([]); loading = signal(true); error = signal(''); saving = signal(false);
  f = { name: '', email: '', password: '', role: 'estoquista' };
  ngOnInit() { this.load(); }
  async load() {
    this.loading.set(true);
    try { this.rows.set(await this.api.q(this.api.sb.from('profiles').select('*').order('name'))); } catch (e: any) { this.error.set(e.message); }
    this.loading.set(false);
  }
  async create() {
    this.saving.set(true);
    try {
      const { data, error } = await this.api.sb.functions.invoke('create-user', { body: this.f });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      this.notify.ok('Usuário criado.'); this.f = { name: '', email: '', password: '', role: 'estoquista' }; await this.load();
    } catch (e) { this.notify.err(e); }
    this.saving.set(false);
  }
  async setRole(u: any, role: string) {
    try { await this.api.q(this.api.sb.from('profiles').update({ role }).eq('id', u.id)); this.notify.ok('Perfil atualizado.'); } catch (e) { this.notify.err(e); }
    this.load();
  }
  async setActive(u: any, active: boolean) {
    try { await this.api.q(this.api.sb.from('profiles').update({ active }).eq('id', u.id)); this.notify.ok(active ? 'Usuário ativado.' : 'Usuário desativado.'); } catch (e) { this.notify.err(e); }
    this.load();
  }
}

/* ------------------------------------------------------------------ loja */
@Component({
  selector: 'app-settings-store',
  imports: [...SHARED, MatButtonModule],
  template: `
    @if (s(); as s) {
      <section class="card">
        <h2>Dados da loja (usados nos documentos impressos)</h2>
        <form (ngSubmit)="save()" #fm="ngForm">
          <div class="grid g2">
            <mat-form-field><mat-label>Nome da loja *</mat-label><input matInput name="a" [(ngModel)]="s.store_name" required></mat-form-field>
            <mat-form-field><mat-label>CNPJ / CPF</mat-label><input matInput name="b" [(ngModel)]="s.store_document"></mat-form-field>
            <mat-form-field><mat-label>Telefone</mat-label><input matInput name="c" [(ngModel)]="s.store_phone"></mat-form-field>
            <mat-form-field><mat-label>E-mail</mat-label><input matInput name="d" [(ngModel)]="s.store_email"></mat-form-field>
          </div>
          <mat-form-field class="w100" style="margin-top:12px"><mat-label>Endereço</mat-label><input matInput name="e" [(ngModel)]="s.store_address"></mat-form-field>
          <mat-form-field class="w100" style="margin-top:12px"><mat-label>Condições de pagamento (aparecem no pedido)</mat-label><textarea matInput rows="2" name="f" [(ngModel)]="s.payment_terms"></textarea></mat-form-field>
          <mat-form-field class="w100" style="margin-top:12px"><mat-label>Rodapé dos documentos</mat-label><input matInput name="g" [(ngModel)]="s.print_footer"></mat-form-field>
          <div class="row end"><button mat-flat-button type="submit" [disabled]="!fm.valid || saving()">Salvar</button></div>
        </form>
      </section>
      <section class="card">
        <h2>Numeração dos pedidos</h2>
        <p class="muted">A numeração é sequencial e única. Use apenas para começar a contagem de um número maior (por exemplo, ao migrar de outro sistema).</p>
        <div class="row"><mat-form-field style="width:220px"><mat-label>Próximo número</mat-label><input matInput [(ngModel)]="next" inputmode="numeric"></mat-form-field>
          <button mat-stroked-button (click)="setNext()" [disabled]="!next">Definir</button></div>
      </section>
    }`,
})
export class SettingsStore implements OnInit {
  private api = inject(Api); private notify = inject(Notify);
  s = signal<any>(null); saving = signal(false); next = '';
  async ngOnInit() { try { this.s.set(await this.api.settings()); } catch (e) { this.notify.err(e); } }
  async save() {
    this.saving.set(true);
    const { id, updated_at, expiry_alert_days, ...v } = this.s();
    try { await this.api.q(this.api.sb.from('app_settings').update({ ...v, updated_at: new Date().toISOString() }).eq('id', 1)); this.notify.ok('Dados da loja salvos.'); } catch (e) { this.notify.err(e); }
    this.saving.set(false);
  }
  async setNext() {
    const n = Number(this.next);
    if (!Number.isInteger(n) || n < 1) { this.notify.err(new Error('Informe um número inteiro válido.')); return; }
    try { await this.api.rpc('set_next_order_number', { p_next: n }); this.notify.ok('Numeração atualizada.'); this.next = ''; } catch (e) { this.notify.err(e); }
  }
}

/* ------------------------------------------------------------------ alertas */
@Component({
  selector: 'app-settings-alerts',
  imports: [...SHARED, MatButtonModule],
  template: `
    <section class="card">
      <h2>Alertas de validade</h2>
      <p class="muted">Lotes com saldo que vencem dentro destes prazos aparecem no dashboard e nos alertas de estoque.</p>
      <div class="row">
        <mat-form-field style="width:200px"><mat-label>1º alerta (dias)</mat-label><input matInput type="number" min="1" [(ngModel)]="d1"></mat-form-field>
        <mat-form-field style="width:200px"><mat-label>2º alerta (dias)</mat-label><input matInput type="number" min="2" [(ngModel)]="d2"></mat-form-field>
        <button mat-flat-button (click)="save()" [disabled]="!(d1 >= 1 && d2 > d1)">Salvar</button>
      </div>
      @if (!(d1 >= 1 && d2 > d1)) { <p class="small" style="color:var(--bad)">O 2º prazo deve ser maior que o 1º.</p> }
      <p class="muted small">O estoque mínimo e a quantidade mínima de atacado são configurados em cada produto.</p>
    </section>`,
})
export class SettingsAlerts implements OnInit {
  private api = inject(Api); private notify = inject(Notify);
  d1 = 30; d2 = 60;
  async ngOnInit() { try { const s = await this.api.settings(); this.d1 = s.expiry_alert_days?.[0] ?? 30; this.d2 = s.expiry_alert_days?.[1] ?? 60; } catch (e) { this.notify.err(e); } }
  async save() {
    try { await this.api.q(this.api.sb.from('app_settings').update({ expiry_alert_days: [Number(this.d1), Number(this.d2)] }).eq('id', 1)); this.notify.ok('Alertas salvos.'); } catch (e) { this.notify.err(e); }
  }
}

/* ------------------------------------------------------------------ localizações */
@Component({
  selector: 'app-settings-locations',
  imports: [...SHARED, MatButtonModule, MatIconModule],
  template: `
    <section class="card">
      <h2>{{ edit()?.id ? 'Editar localização' : 'Nova localização' }}</h2>
      <form (ngSubmit)="save()" #fm="ngForm" class="row">
        <mat-form-field style="width:180px"><mat-label>Código *</mat-label><input matInput name="c" [(ngModel)]="f.code" required placeholder="Ex.: A1-P2"></mat-form-field>
        <mat-form-field class="grow"><mat-label>Descrição</mat-label><input matInput name="d" [(ngModel)]="f.description"></mat-form-field>
        <button mat-flat-button type="submit" [disabled]="!fm.valid">{{ edit()?.id ? 'Salvar' : 'Adicionar' }}</button>
        @if (edit()) { <button mat-button type="button" (click)="reset()">Cancelar</button> }
      </form>
    </section>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Código</th><th>Descrição</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        @for (l of rows(); track l.id) {
          <tr><td><b>{{ l.code }}</b></td><td>{{ l.description || '—' }}</td><td>{{ l.active ? 'Ativa' : 'Inativa' }}</td>
            <td class="r nowrap"><button mat-button (click)="start(l)">Editar</button><button mat-button (click)="toggle(l)">{{ l.active ? 'Desativar' : 'Ativar' }}</button></td></tr>
        } @empty { <tr><td colspan="4" class="empty">Nenhuma localização cadastrada.</td></tr> }
      </tbody></table></div>`,
})
export class SettingsLocations implements OnInit {
  private api = inject(Api); private notify = inject(Notify);
  rows = signal<any[]>([]); edit = signal<any>(null); f = { code: '', description: '' };
  ngOnInit() { this.load(); }
  async load() { try { this.rows.set(await this.api.q(this.api.sb.from('stock_locations').select('*').order('code'))); } catch (e) { this.notify.err(e); } }
  start(l: any) { this.edit.set(l); this.f = { code: l.code, description: l.description ?? '' }; }
  reset() { this.edit.set(null); this.f = { code: '', description: '' }; }
  async save() {
    const v = { code: this.f.code.trim(), description: this.f.description.trim() || null };
    try {
      const e = this.edit();
      await this.api.q(e ? this.api.sb.from('stock_locations').update(v).eq('id', e.id) : this.api.sb.from('stock_locations').insert(v));
      this.notify.ok('Localização salva.'); this.reset(); this.load();
    } catch (e) { this.notify.err(e); }
  }
  async toggle(l: any) { try { await this.api.q(this.api.sb.from('stock_locations').update({ active: !l.active }).eq('id', l.id)); this.load(); } catch (e) { this.notify.err(e); } }
}

/* ------------------------------------------------------------------ marcas e categorias */
@Component({
  selector: 'app-settings-catalog',
  imports: [...SHARED, MatButtonModule],
  template: `
    <div class="grid g2" style="align-items:start">
      @for (g of groups; track g.table) {
        <section class="card">
          <h2>{{ g.title }}</h2>
          <div class="row"><mat-form-field class="grow"><mat-label>Novo(a) {{ g.single }}</mat-label><input matInput [(ngModel)]="g.text" (keyup.enter)="add(g)"></mat-form-field>
            <button mat-flat-button (click)="add(g)" [disabled]="!g.text.trim()">Adicionar</button></div>
          <div class="table-wrap"><table class="t"><tbody>
            @for (r of g.rows(); track r.id) {
              <tr><td>
                @if (g.editing === r.id) { <input class="cell wide" [(ngModel)]="g.editText" (keyup.enter)="rename(g, r)"> } @else { <span [style.opacity]="r.active ? 1 : .5">{{ r.name }}</span> }
              </td><td class="r nowrap">
                @if (g.editing === r.id) { <button mat-button (click)="rename(g, r)">Salvar</button><button mat-button (click)="g.editing = null">Cancelar</button> }
                @else { <button mat-button (click)="g.editing = r.id; g.editText = r.name">Renomear</button><button mat-button (click)="toggle(g, r)">{{ r.active ? 'Desativar' : 'Ativar' }}</button> }
              </td></tr>
            } @empty { <tr><td class="empty">Nada cadastrado.</td></tr> }
          </tbody></table></div>
        </section>
      }
    </div>`,
})
export class SettingsCatalog implements OnInit {
  private api = inject(Api); private notify = inject(Notify);
  groups: any[] = [
    { table: 'brands', title: 'Marcas', single: 'marca', rows: signal<any[]>([]), text: '', editing: null, editText: '' },
    { table: 'categories', title: 'Categorias', single: 'categoria', rows: signal<any[]>([]), text: '', editing: null, editText: '' },
  ];
  ngOnInit() { this.groups.forEach(g => this.load(g)); }
  async load(g: any) { try { g.rows.set(await this.api.q(this.api.sb.from(g.table).select('*').order('name'))); } catch (e) { this.notify.err(e); } }
  async add(g: any) {
    const name = g.text.trim(); if (!name) return;
    try { await this.api.q(this.api.sb.from(g.table).insert({ name })); g.text = ''; this.load(g); } catch (e) { this.notify.err(e); }
  }
  async rename(g: any, r: any) {
    const name = g.editText.trim(); if (!name) return;
    try { await this.api.q(this.api.sb.from(g.table).update({ name }).eq('id', r.id)); g.editing = null; this.load(g); } catch (e) { this.notify.err(e); }
  }
  async toggle(g: any, r: any) { try { await this.api.q(this.api.sb.from(g.table).update({ active: !r.active }).eq('id', r.id)); this.load(g); } catch (e) { this.notify.err(e); } }
}

/* ------------------------------------------------------------------ permissões */
@Component({
  selector: 'app-settings-permissions',
  imports: [MatIconModule],
  template: `
    <section class="card">
      <h2>Permissões por perfil</h2>
      <p class="muted">As permissões são aplicadas no banco de dados (RLS e funções), não apenas na tela. Nesta versão elas são fixas por perfil e não podem ser editadas.</p>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Operação</th><th style="text-align:center">Administrador</th><th style="text-align:center">Estoquista</th></tr></thead>
        <tbody>
          @for (p of perms; track p[0]) {
            <tr><td>{{ p[0] }}</td>
              @for (v of [p[1], p[2]]; track $index) { <td style="text-align:center">@if (v === 1) { <mat-icon style="color:var(--ok)">check_circle</mat-icon> } @else if (v === 2) { <span class="chip s-amber">Limitado</span> } @else { <mat-icon style="color:var(--muted)">remove_circle_outline</mat-icon> }</td> }
            </tr>
          }
        </tbody></table></div>
    </section>`,
})
export class SettingsPermissions {
  perms: [string, number, number][] = [
    ['Consultar produtos', 1, 2], ['Criar / editar produtos e imagens', 1, 0], ['Ver e alterar preços', 1, 0], ['Ver custos e margens', 1, 0],
    ['Consultar estoque, lotes e validades', 1, 1], ['Registrar entradas e saldos iniciais', 1, 0], ['Ajustes, inventário e bloqueios', 1, 0],
    ['Gerenciar clientes', 1, 0], ['Criar, confirmar e cancelar pedidos', 1, 0], ['Aplicar descontos', 1, 0],
    ['Ver fila de separação e imprimir ficha', 1, 1], ['Separar, conferir e registrar divergências', 1, 1], ['Autorizar divergência e confirmar saída', 1, 0],
    ['Relatórios e dashboard financeiro', 1, 0], ['Gerenciar usuários e configurações', 1, 0], ['Consultar auditoria', 1, 2],
  ];
}

/* ------------------------------------------------------------------ auditoria */
@Component({
  selector: 'app-settings-audit',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (!api.isAdmin()) { <div class="hint-box">Você vê apenas as ações registradas em seu próprio usuário.</div> }
    <div class="row" style="margin-bottom:12px">
      <mat-form-field style="width:150px"><mat-label>De</mat-label><input matInput type="date" [(ngModel)]="from" (ngModelChange)="reload()"></mat-form-field>
      <mat-form-field style="width:150px"><mat-label>Até</mat-label><input matInput type="date" [(ngModel)]="to" (ngModelChange)="reload()"></mat-form-field>
      <mat-form-field style="width:200px"><mat-label>Tipo de registro</mat-label>
        <mat-select [(ngModel)]="entity" (ngModelChange)="reload()"><mat-option value="">Todos</mat-option>
          @for (e of entities; track e) { <mat-option [value]="e">{{ e }}</mat-option> }</mat-select></mat-form-field>
      @if (api.isAdmin()) {
        <mat-form-field style="width:200px"><mat-label>Usuário</mat-label><mat-select [(ngModel)]="user" (ngModelChange)="reload()"><mat-option value="">Todos</mat-option>
          @for (u of users(); track u.id) { <mat-option [value]="u.id">{{ u.name }}</mat-option> }</mat-select></mat-form-field>
      }
    </div>
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <div class="error-box">{{ error() }}</div> }
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead>
      <tbody>
        @for (r of rows(); track r.id) {
          <tr><td class="nowrap">{{ r.created_at | dtbr }}</td><td>{{ r.profiles?.name || '—' }}</td><td>{{ r.action }}</td><td>{{ r.entity_type }}</td>
            <td><details><summary class="muted small" style="cursor:pointer">ver</summary><pre class="small" style="white-space:pre-wrap;max-width:520px;margin:6px 0">{{ pretty(r.details) }}</pre></details></td></tr>
        } @empty { <tr><td colspan="5" class="empty">{{ loading() ? 'Carregando…' : 'Nenhum registro no período.' }}</td></tr> }
      </tbody></table>
      <mat-paginator [length]="total()" [pageSize]="size" [pageIndex]="page" [pageSizeOptions]="[30, 100]" (page)="onPage($event)" />
    </div>`,
})
export class SettingsAudit implements OnInit {
  api = inject(Api); private notify = inject(Notify);
  rows = signal<any[]>([]); total = signal(0); loading = signal(true); error = signal(''); users = signal<any[]>([]);
  from = addDaysIso(todayIso(), -7); to = todayIso(); entity = ''; user = ''; page = 0; size = 30;
  entities = ['orders', 'pick_tasks', 'stock_lots', 'receipt', 'products', 'customers', 'profiles', 'app_settings', 'stock_locations', 'brands', 'categories'];
  async ngOnInit() {
    if (this.api.isAdmin()) { try { this.users.set(await this.api.q(this.api.sb.from('profiles').select('id,name').order('name'))); } catch (e) { this.notify.err(e); } }
    this.load();
  }
  reload() { this.page = 0; this.load(); }
  onPage(e: PageEvent) { this.page = e.pageIndex; this.size = e.pageSize; this.load(); }
  pretty(d: any) { return JSON.stringify(d, null, 1); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      let q = this.api.sb.from('audit_logs').select('id,created_at,action,entity_type,entity_id,details,profiles(name)', { count: 'exact' })
        .gte('created_at', dayStart(this.from)).lte('created_at', dayEnd(this.to)).order('created_at', { ascending: false });
      if (this.entity) q = q.eq('entity_type', this.entity);
      if (this.user) q = q.eq('user_id', this.user);
      const { data, count } = await this.api.qc<any[]>(q.range(this.page * this.size, this.page * this.size + this.size - 1));
      this.rows.set(data); this.total.set(count);
    } catch (e: any) { this.error.set(friendly(e)); }
    this.loading.set(false);
  }
}
