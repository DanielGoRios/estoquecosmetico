import { Pipe, PipeTransform } from '@angular/core';

export const TZ = 'America/Sao_Paulo';

export function brlFmt(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function qtyFmt(v: any): string {
  return Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
export function dateFmt(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  return dt.toLocaleDateString('pt-BR', { timeZone: d.length === 10 ? undefined : TZ });
}
export function dateTimeFmt(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
}
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const a = new Date(todayIso() + 'T12:00:00').getTime();
  const b = new Date(iso + 'T12:00:00').getTime();
  return Math.round((b - a) / 86400000);
}
/** início/fim do dia em horário de Brasília (UTC-3) para filtros timestamptz */
export function dayStart(iso: string): string { return iso + 'T00:00:00-03:00'; }
export function dayEnd(iso: string): string { return iso + 'T23:59:59.999-03:00'; }

export function sanitizeSearch(q: string): string {
  return (q || '').replace(/[,()%*\\"']/g, ' ').trim();
}
export function parseDecimal(s: any): number | null {
  if (s === null || s === undefined) return null;
  let t = String(s).trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
/** aceita AAAA-MM-DD ou DD/MM/AAAA */
export function parseDateInput(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}
export function downloadCsv(filename: string, rows: any[][]): void {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

@Pipe({ name: 'brl' }) export class BrlPipe implements PipeTransform { transform(v: any) { return brlFmt(v); } }
@Pipe({ name: 'qty' }) export class QtyPipe implements PipeTransform { transform(v: any) { return qtyFmt(v); } }
@Pipe({ name: 'dbr' }) export class DatePipeBr implements PipeTransform { transform(v: any) { return dateFmt(v); } }
@Pipe({ name: 'dtbr' }) export class DateTimePipeBr implements PipeTransform { transform(v: any) { return dateTimeFmt(v); } }
