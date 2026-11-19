import { Injectable, computed, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from './config';

export interface Profile { id: string; name: string; email: string | null; role: 'administrador' | 'estoquista'; active: boolean; created_at: string; }

export function friendly(e: any): string {
  const m: string = e?.message ?? String(e ?? 'Erro desconhecido');
  if (/products_sku_key/.test(m)) return 'Já existe um produto com este SKU.';
  if (/products_barcode_key/.test(m)) return 'Já existe um produto com este código de barras.';
  if (/stock_locations_code_uq/.test(m)) return 'Já existe uma localização com este código.';
  if (/brands_name_uq/.test(m)) return 'Já existe uma marca com este nome.';
  if (/categories_name_uq/.test(m)) return 'Já existe uma categoria com este nome.';
  if (/duplicate key/.test(m)) return 'Registro duplicado.';
  if (/violates foreign key/.test(m)) return 'Este registro está em uso e não pode ser removido.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha inválidos.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado.';
  if (/permission denied|row-level security|JWT/i.test(m)) return 'Você não tem permissão para esta ação.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.';
  return m;
}

@Injectable({ providedIn: 'root' })
export class Api {
  readonly sb: SupabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly ready = signal(false);
  readonly isAdmin = computed(() => { const p = this.profile(); return !!p && p.active && p.role === 'administrador'; });
  readonly isActive = computed(() => !!this.profile()?.active);
  readonly userId = computed(() => this.session()?.user.id ?? null);

  async init(): Promise<void> {
    try {
      const { data } = await this.sb.auth.getSession();
      this.session.set(data.session);
      if (data.session) await this.loadProfile();
    } catch { /* sem sessão */ }
    this.ready.set(true);
    this.sb.auth.onAuthStateChange((_ev, s) => {
      this.session.set(s);
      setTimeout(() => { if (s) this.loadProfile(); else this.profile.set(null); }, 0);
    });
  }
  async loadProfile(): Promise<void> {
    const id = this.session()?.user.id;
    if (!id) return;
    const { data } = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle();
    this.profile.set((data as Profile) ?? null);
  }
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error));
    const { data } = await this.sb.auth.getSession();
    this.session.set(data.session);
    await this.loadProfile();
  }
  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    this.session.set(null); this.profile.set(null);
  }
  /** chama uma função (RPC) e lança erro em português se falhar */
  async rpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(friendly(error));
    return data as T;
  }
  /** executa uma consulta e devolve os dados (ou lança erro) */
  async q<T = any>(query: PromiseLike<{ data: any; error: any; count?: number | null }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw new Error(friendly(error));
    return data as T;
  }
  async qc<T = any>(query: PromiseLike<{ data: any; error: any; count?: number | null }>): Promise<{ data: T; count: number }> {
    const { data, error, count } = await query;
    if (error) throw new Error(friendly(error));
    return { data: data as T, count: count ?? 0 };
  }
  /** busca todas as páginas de uma consulta (limite de 1000 por requisição) */
  async fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>, max = 20000): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; from < max; from += 1000) {
      const { data, error } = await build(from, from + 999);
      if (error) throw new Error(friendly(error));
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  async settings(): Promise<any> {
    return this.q(this.sb.from('app_settings').select('*').eq('id', 1).single());
  }
}
