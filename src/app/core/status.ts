export interface StatusInfo { label: string; cls: string; }
type Map = Record<string, StatusInfo>;

export const ORDER_STATUS: Map = {
  rascunho: { label: 'Rascunho', cls: 's-gray' },
  confirmado: { label: 'Confirmado', cls: 's-blue' },
  em_separacao: { label: 'Em separação', cls: 's-amber' },
  separado: { label: 'Separado', cls: 's-teal' },
  expedido: { label: 'Concluído', cls: 's-green' },
  retirado: { label: 'Concluído', cls: 's-green' },
  cancelado: { label: 'Cancelado', cls: 's-red' },
  aguardando_reposicao: { label: 'Aguardando reposição', cls: 's-purple' },
  divergencia: { label: 'Divergência', cls: 's-orange' },
};
export const LOT_STATUS: Map = {
  ativo: { label: 'Ativo', cls: 's-green' },
  bloqueado: { label: 'Bloqueado', cls: 's-orange' },
  vencido: { label: 'Vencido', cls: 's-red' },
  encerrado: { label: 'Encerrado', cls: 's-gray' },
};
export const PICK_STATUS: Map = {
  pendente: { label: 'Pendente', cls: 's-blue' },
  em_andamento: { label: 'Em andamento', cls: 's-amber' },
  concluida: { label: 'Concluída', cls: 's-teal' },
  divergencia: { label: 'Divergência', cls: 's-orange' },
  cancelada: { label: 'Cancelada', cls: 's-red' },
};
export const PAY_STATUS: Map = {
  pendente: { label: 'Pendente', cls: 's-amber' },
  parcial: { label: 'Parcial', cls: 's-blue' },
  pago: { label: 'Pago', cls: 's-green' },
  estornado: { label: 'Estornado', cls: 's-red' },
};
export const ROLE: Map = {
  administrador: { label: 'Administrador', cls: 's-purple' },
  estoquista: { label: 'Estoquista', cls: 's-teal' },
};
export const CHANNELS: Record<string, string> = { loja_fisica: 'Loja física', whatsapp: 'WhatsApp', internet: 'Internet' };
export const SALE_TYPES: Record<string, string> = { varejo: 'Varejo', atacado: 'Atacado' };
export const MOVEMENT_LABELS: Record<string, string> = {
  saldo_inicial: 'Saldo inicial', entrada: 'Entrada', reserva: 'Reserva', liberacao_reserva: 'Liberação de reserva',
  saida: 'Saída', devolucao: 'Devolução', bloqueio: 'Bloqueio', desbloqueio: 'Desbloqueio',
  ajuste_positivo: 'Ajuste (+)', ajuste_negativo: 'Ajuste (−)',
};
export const ORDER_STATUS_LIST = Object.keys(ORDER_STATUS);
export const kindMaps: Record<string, Map> = { order: ORDER_STATUS, lot: LOT_STATUS, pick: PICK_STATUS, pay: PAY_STATUS, role: ROLE };
