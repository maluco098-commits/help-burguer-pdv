import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowLeft, CalendarDays, CheckCircle2, Clock3, CreditCard, PackageCheck, RefreshCw, Wallet } from 'lucide-react';

type Order = { id: string; number: string; customerName: string; address?: string | null; notes?: string | null; needsChange?: boolean; changeFor?: string | null; channel: string; status: string; paymentMethod: string; subtotal: string; discount: string; deliveryFee: string; total: string; createdAt: string; items: { id: string; name: string; quantity: number; subtotal: string }[] };
type CashSession = { id: string; status: string; openingAmount: string; closingAmount: string | null; openedAt: string; closedAt: string | null };
type Props = { request: (path: string, init?: RequestInit) => Promise<any>; onBack: () => void; flash: (message: string) => void };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const currency = (value: string | number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const paymentName: Record<string, string> = { CASH: 'Dinheiro', PIX: 'PIX', CARD: 'Cartão' };
const channelName: Record<string, string> = { COUNTER: 'Balcão', DELIVERY: 'Delivery', TABLE: 'Mesa' };
const statusName: Record<string, string> = { OPEN: 'Aberto', CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto', OUT_FOR_DELIVERY: 'Saiu para entrega', DELIVERED: 'Entregue', CANCELLED: 'Cancelado' };

export default function OrdersScreen({ request, onBack, flash }: Props) {
  const [date, setDate] = useState(today());
  const [orders, setOrders] = useState<Order[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(day = date) {
    setLoading(true);
    try { const data = await request(`/orders?date=${encodeURIComponent(day)}`); setOrders(data.orders); setCashSessions(data.cashSessions); }
    catch (error) { flash((error as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(date); }, [date]);

  const completedOrders = orders.filter(order => order.status !== 'CANCELLED');
  const gross = completedOrders.reduce((sum, order) => sum + Math.round(Number(order.total) * 100), 0) / 100;
  const average = completedOrders.length ? gross / completedOrders.length : 0;
  const closed = cashSessions.length > 0 && cashSessions.every(session => session.status === 'CLOSED');
  const openCash = cashSessions.find(session => session.status === 'OPEN');
  const payments = completedOrders.reduce<Record<string, number>>((sum, order) => { sum[order.paymentMethod] = (sum[order.paymentMethod] ?? 0) + Math.round(Number(order.total) * 100); return sum; }, {});

  return <main className="orders-screen">
    <header className="orders-topbar"><button className="menu-back" onClick={onBack}><ArrowLeft size={17}/> Voltar para venda</button><div className="menu-account">HELP BURGUER <span>·</span> PEDIDOS</div></header>
    <section className="orders-heading"><div><div className="section-kicker">ACOMPANHAMENTO DIÁRIO</div><h1>Pedidos recentes</h1><p>Veja os pedidos por dia. O caixa e o balanço financeiro são fechados semanalmente.</p></div><div className="orders-day"><CalendarDays size={15}/><input aria-label="Filtrar data dos pedidos" type="date" value={date} max={today()} onChange={event => setDate(event.target.value)}/></div></section>
    <section className="orders-summary">
      <article><span>PEDIDOS DO DIA</span><strong>{orders.length}</strong><small><PackageCheck size={13}/> pedidos registrados</small></article>
      <article><span>VENDAS DO DIA</span><strong>{currency(gross)}</strong><small><ArrowDownLeft size={13}/> total confirmado</small></article>
      <article><span>TICKET MÉDIO</span><strong>{currency(average)}</strong><small><CreditCard size={13}/> por pedido</small></article>
      <article className={closed ? 'summary-closed' : openCash ? 'summary-open' : ''}><span>CAIXA DA SEMANA</span><strong>{closed ? 'Encerrado' : openCash ? 'Em andamento' : 'Sem abertura'}</strong><small><Wallet size={13}/>{closed ? `Fechado às ${new Date(cashSessions.at(-1)?.closedAt ?? '').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : openCash ? 'Caixa semanal aberto' : 'Sem caixa registrado nesta semana'}</small></article>
    </section>
    <section className="orders-content">
      <div className="orders-list-panel"><div className="orders-list-head"><div><div className="section-kicker">HISTÓRICO</div><h2>Todos os pedidos</h2></div><button className="orders-refresh" onClick={() => load()} disabled={loading}><RefreshCw size={14}/> Atualizar</button></div>
        {loading ? <div className="orders-message">Carregando pedidos…</div> : orders.length === 0 ? <div className="orders-message"><div className="orders-empty-icon"><PackageCheck size={21}/></div><strong>Nenhum pedido nesta data</strong><span>Pedidos finalizados aparecerão aqui.</span></div> : <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>HORÁRIO / PEDIDO</th><th>CLIENTE</th><th>ITENS</th><th>ATENDIMENTO</th><th>PAGAMENTO</th><th>STATUS</th><th className="align-right">TOTAL</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td><strong>{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong><small>{order.number}</small></td><td className="order-customer"><strong>{order.customerName}</strong>{order.address && <small>Endereço: {order.address}</small>}{Number(order.deliveryFee) > 0 && <small>Taxa de entrega: {currency(order.deliveryFee)}</small>}{order.notes && <small>Obs.: {order.notes}</small>}{order.needsChange && order.changeFor && <small>Troco para {currency(order.changeFor)}</small>}</td><td><div className="order-item-lines">{order.items.map(item => <span key={item.id}>{item.quantity} × {item.name}</span>)}</div></td><td>{channelName[order.channel] ?? order.channel}</td><td>{paymentName[order.paymentMethod] ?? order.paymentMethod}</td><td><span className={`order-status status-${order.status.toLowerCase()}`}>{statusName[order.status] ?? order.status}</span></td><td className="align-right order-total">{currency(order.total)}</td></tr>)}</tbody></table></div>}
      </div>
      <aside className="orders-side"><div className="section-kicker">PAGAMENTOS</div><h2>Resumo por forma</h2>{Object.keys(payments).length === 0 ? <p className="payment-empty">Sem pagamentos nesta data.</p> : Object.entries(payments).map(([key, cents]) => <div className="payment-row" key={key}><span>{paymentName[key] ?? key}</span><strong>{currency(cents / 100)}</strong></div>)}<div className="payment-total"><span>Total do dia</span><strong>{currency(gross)}</strong></div>
        {closed && <div className="closed-note"><CheckCircle2 size={15}/> Caixa semanal encerrado. Os pedidos deste dia permanecem no histórico.</div>}
        {!closed && openCash && <div className="closed-note"><Clock3 size={15}/> Caixa semanal em andamento.</div>}
        {!closed && !openCash && orders.length > 0 && <div className="closed-note"><Clock3 size={15}/> Os pedidos estão salvos no histórico.</div>}
      </aside>
    </section>
    <p className="orders-footnote">Esta tela lista pedidos por dia. O caixa é fechado por semana; cada pedido mantém seu status operacional no histórico.</p>
  </main>;
}
