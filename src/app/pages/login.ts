import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SHARED } from '../core/shared';
import { Api, friendly } from '../core/api';

@Component({
  selector: 'app-login',
  imports: [...SHARED, MatButtonModule, MatIconModule, MatProgressBarModule],
  styles: [`
    .wrap { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; }
    .hero { background: linear-gradient(150deg, #8e2c5a 0%, #c0567f 55%, #e8a0b8 100%); color: #fff; padding: 56px; display: flex; flex-direction: column; justify-content: space-between; }
    .hero h1 { font-family: Fraunces, serif; font-size: 40px; line-height: 1.1; max-width: 420px; }
    .hero p { max-width: 380px; opacity: .92; line-height: 1.5; }
    .hero ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .hero li { display: flex; gap: 10px; align-items: center; opacity: .95; }
    .form { display: grid; place-items: center; padding: 32px; background: #fff; }
    .form form { width: 100%; max-width: 360px; display: grid; gap: 14px; }
    @media (max-width: 800px) { .wrap { grid-template-columns: 1fr; } .hero { padding: 28px; } .hero h1 { font-size: 28px; } .hero ul { display: none; } }
  `],
  template: `
    <div class="wrap">
      <section class="hero">
        <div style="display:flex;gap:10px;align-items:center;font-family:Fraunces,serif;font-size:18px"><mat-icon>spa</mat-icon> Estoque Cosméticos</div>
        <div>
          <h1>Estoque, validade e pedidos em um só lugar.</h1>
          <p>Controle lotes e validade, preços de varejo e atacado, separação e expedição com segurança.</p>
        </div>
        <ul>
          <li><mat-icon>event_available</mat-icon> Lotes e validade com FEFO</li>
          <li><mat-icon>sell</mat-icon> Preço de varejo e atacado por produto</li>
          <li><mat-icon>print</mat-icon> Fichas de separação em A4</li>
        </ul>
      </section>
      <section class="form">
        @if (busy()) { <mat-progress-bar mode="indeterminate" style="position:fixed;top:0;left:0;right:0" /> }
        @if (setup()) {
          <form (ngSubmit)="createFirst()">
            <div><h1>Primeiro acesso</h1><p class="muted">Crie o usuário administrador do sistema.</p></div>
            @if (error()) { <div class="error-box">{{ error() }}</div> }
            <mat-form-field><mat-label>Nome</mat-label><input matInput name="n" [(ngModel)]="name" required></mat-form-field>
            <mat-form-field><mat-label>E-mail</mat-label><input matInput type="email" name="e" [(ngModel)]="email" required autocomplete="username"></mat-form-field>
            <mat-form-field><mat-label>Senha (mín. 8 caracteres)</mat-label><input matInput type="password" name="p" [(ngModel)]="password" required minlength="8" autocomplete="new-password"></mat-form-field>
            <button mat-flat-button type="submit" [disabled]="busy()">Criar administrador</button>
          </form>
        } @else {
          <form (ngSubmit)="login()">
            <div><h1>Entrar</h1><p class="muted">Acesse com seu e-mail e senha.</p></div>
            @if (error()) { <div class="error-box">{{ error() }}</div> }
            <mat-form-field><mat-label>E-mail</mat-label><input matInput type="email" name="e" [(ngModel)]="email" required autocomplete="username"></mat-form-field>
            <mat-form-field><mat-label>Senha</mat-label><input matInput type="password" name="p" [(ngModel)]="password" required autocomplete="current-password"></mat-form-field>
            <button mat-flat-button type="submit" [disabled]="busy()">Entrar</button>
          </form>
        }
      </section>
    </div>`,
})
export class Login implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  name = ''; email = ''; password = '';
  busy = signal(false); error = signal(''); setup = signal(false);

  async ngOnInit() {
    if (this.api.session()) { this.router.navigateByUrl('/dashboard'); return; }
    try {
      const { data } = await this.api.sb.functions.invoke('create-user', { body: { action: 'status' } });
      this.setup.set(!!data?.needsSetup);
    } catch { /* função indisponível: segue para o login normal */ }
  }
  async login() {
    this.error.set(''); this.busy.set(true);
    try { await this.api.signIn(this.email.trim(), this.password); this.router.navigateByUrl('/dashboard'); }
    catch (e) { this.error.set(friendly(e)); }
    this.busy.set(false);
  }
  async createFirst() {
    this.error.set(''); this.busy.set(true);
    try {
      const { data, error } = await this.api.sb.functions.invoke('create-user', {
        body: { action: 'create', name: this.name, email: this.email.trim(), password: this.password, role: 'administrador' },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      await this.api.signIn(this.email.trim(), this.password);
      this.router.navigateByUrl('/dashboard');
    } catch (e) { this.error.set(friendly(e)); }
    this.busy.set(false);
  }
}
