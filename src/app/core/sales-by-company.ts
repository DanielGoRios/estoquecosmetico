import { Api } from './api';
import { addDaysIso, dayEnd, dayStart, norm, todayIso } from './util';

/** Agrupamento do relatório: por cliente (empresa que comprou) ou por marca (empresa fornecedora). */
export type CompanyGroupBy = 'cliente' | 'marca';

export interface CompanyProductLine {
  product_id: string;
  sku: string;
  name: string;
  qtd: number;
  pedidos: number;
  receita: number;
}

export interface CompanyGroup {
  key: string;
  empresa: string;
  itens: CompanyProductLine[];
  qtd: number;
  pedidos: number;
  receita: number;
}

export interface SalesByCompanyFilter {
  from: string;
  to: string;
  by: CompanyGroupBy;
  channel?: string;
  product?: string;
}

/** Segunda-feira da semana de `iso` (semana de segunda a domingo). */
export function weekStartIso(iso: string = todayIso()): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay(); // 0 = domingo
  return addDaysIso(iso, dow === 0 ? -6 : 1 - dow);
}
export function weekEndIso(iso: string = todayIso()): string {
  return addDaysIso(weekStartIso(iso), 6);
}

/**
 * Produtos vendidos (pedidos confirmados, exceto rascunhos e cancelados) no período,
 * agrupados por empresa — cliente do pedido ou marca do produto — com a quantidade de cada produto.
 */
export interface SalesByCompanyResult { groups: CompanyGroup[]; totalPedidos: number; }

export async function salesByCompany(api: Api, f: SalesByCompanyFilter): Promise<SalesByCompanyResult> {
  const sb = api.sb;
  const items = await api.fetchAll((a, b) => {
    let q = sb.from('order_items')
      .select('product_id,sku_snapshot,product_name_snapshot,quantity_ordered,line_total,orders!inner(id,order_number,confirmed_at,channel,status,customer_id,customer_reference,customers(name))')
      .not('orders.status', 'in', '(rascunho,cancelado)')
      .gte('orders.confirmed_at', dayStart(f.from)).lte('orders.confirmed_at', dayEnd(f.to));
    if (f.channel) q = q.eq('orders.channel', f.channel);
    return q.range(a, b);
  });

  let brandOf = new Map<string, string | null>();
  let brandName = new Map<string, string>();
  if (f.by === 'marca') {
    const [prods, brands] = await Promise.all([
      api.fetchAll((a, b) => sb.from('products').select('id,brand_id').range(a, b)),
      api.fetchAll((a, b) => sb.from('brands').select('id,name').range(a, b)),
    ]);
    brandOf = new Map(prods.map((p: any) => [p.id, p.brand_id]));
    brandName = new Map(brands.map((b: any) => [b.id, b.name]));
  }

  const t = norm(f.product ?? '');
  const allOrders = new Set<string>();
  const groups = new Map<string, { key: string; empresa: string; itens: Map<string, any>; pedidos: Set<string> }>();

  for (const i of items as any[]) {
    if (t && !norm(`${i.sku_snapshot ?? ''} ${i.product_name_snapshot ?? ''}`).includes(t)) continue;
    const o = i.orders;
    let key: string; let empresa: string;
    if (f.by === 'cliente') {
      if (o.customer_id) { key = o.customer_id; empresa = o.customers?.name ?? 'Cliente'; }
      else { const ref = (o.customer_reference ?? '').trim(); key = 'ref:' + norm(ref); empresa = ref ? `${ref} (sem cadastro)` : 'Sem cliente identificado'; }
    } else {
      const bid = brandOf.get(i.product_id) ?? null;
      key = bid ?? 'sem-marca'; empresa = bid ? (brandName.get(bid) ?? 'Marca') : 'Sem marca';
    }
    const g = groups.get(key) ?? { key, empresa, itens: new Map(), pedidos: new Set<string>() };
    const line = g.itens.get(i.product_id) ?? { product_id: i.product_id, sku: i.sku_snapshot, name: i.product_name_snapshot, qtd: 0, receita: 0, pedidos: new Set<string>() };
    line.qtd += Number(i.quantity_ordered);
    line.receita += Number(i.line_total);
    line.pedidos.add(o.id);
    g.itens.set(i.product_id, line);
    g.pedidos.add(o.id);
    allOrders.add(o.id);
    groups.set(key, g);
  }

  const out = [...groups.values()].map(g => {
    const itens: CompanyProductLine[] = [...g.itens.values()]
      .map(l => ({ ...l, pedidos: l.pedidos.size }))
      .sort((a, b) => b.qtd - a.qtd || String(a.name).localeCompare(String(b.name), 'pt-BR'));
    return {
      key: g.key, empresa: g.empresa, itens, pedidos: g.pedidos.size,
      qtd: itens.reduce((s, l) => s + l.qtd, 0), receita: itens.reduce((s, l) => s + l.receita, 0),
    };
  }).sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
  return { groups: out, totalPedidos: allOrders.size };
}
