import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, CircleDollarSign, Clock3, CreditCard, Minus, Plus, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

type Expense = { id: string; description: string; category: string; amount: string; paymentMethod: string; spentAt: string; user: { name: string } };
type CashSession = { id: string; status: string; openingAmount: string; closingAmount: string | null; expectedClosingAmount: string | null; openedAt: string; closedAt: string | null };
type Balance = { weekStart: string; weekEnd: string; orderCount: number; cancelledCount: number; salesTotal: string; expensesTotal: string; result: string; cashSales: string; cashExpenses: string; expectedCash: string | null; openCashWeekStart: string | null; paymentTotals: Record<string, string>; dailyTotals: { date: string; count: number; total: string }[]; expenses: Expense[]; cashSessions: CashSession[] };
type Props = { request: (path: string, init?: RequestInit) => Promise<any>; onBack: () => void; flash: (message: string) => void };
const categories = ['Ingredientes', 'Embalagens', 'Bebidas', 'Aluguel', 'Energia', 'Água', 'Gás', 'Funcionários', 'Taxas', 'Entrega', 'Manutenção', 'Outros'];
const paymentLabels: Record<string, string> = { CASH: 'Dinheiro', PIX: 'PIX', CARD: 'Cartão' };
const money = (value: string | number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const currentWeekStart = () => { const [year, month, day] = today().split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day)); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return date.toISOString().slice(0, 10); };
const localDateTime = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const longDate = (value: string) => new Date(`${value}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });

export default function CashBalanceScreen({ request, onBack, flash }: Props) {
  const [weekDate, setWeekDate] = useState(today());
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState({ description: '', category: 'Ingredientes', amount: '', paymentMethod: 'CASH', spentAt: localDateTime() });

  async function load(day = weekDate) {
    setLoading(true);
    try { setBalance(await request(`/cash/balance?week=${encodeURIComponent(day)}`)); }
    catch (error) { flash((error as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(weekDate); }, [weekDate]);

  async function openCash() {
    const raw = window.prompt('Valor inicial do caixa semanal (R$)', '0');
    if (raw === null) return;
    setSaving(true);
    try { await request('/cash/open', { method: 'POST', body: JSON.stringify({ openingAmount: raw.trim().replace(',', '.') }) }); flash('Caixa semanal aberto.'); await load(); }
    catch (error) { flash((error as Error).message); }
    finally { setSaving(false); }
  }

  async function closeCash() {
    if (!balance) return;
    const expected = Number(balance.expectedCash ?? 0);
    const raw = window.prompt(`Dinheiro esperado na gaveta: ${money(expected)}. Informe o valor contado (R$).`, expected.toFixed(2).replace('.', ','));
    if (raw === null) return;
    setSaving(true);
    try {
      const closed = await request('/cash/close', { method: 'POST', body: JSON.stringify({ closingAmount: raw.trim().replace(',', '.') }) });
      const difference = (Math.round(Number(closed.closingAmount) * 100) - Math.round(Number(closed.expectedClosingAmount) * 100)) / 100;
      flash(`Caixa semanal fechado. Diferença: ${money(difference)}.`);
      await load();
    } catch (error) { flash((error as Error).message); }
    finally { setSaving(false); }
  }

  async function addExpense(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await request('/expenses', { method: 'POST', body: JSON.stringify({ description: expense.description, category: expense.category, amount: expense.amount.trim().replace(',', '.'), paymentMethod: expense.paymentMethod, spentAt: new Date(expense.spentAt).toISOString() }) });
      flash('Gasto registrado no caixa.');
      setExpense({ ...expense, description: '', amount: '', spentAt: localDateTime() });
      await load();
    } catch (error) { flash((error as Error).message); }
    finally { setSaving(false); }
  }

  const currentCash = balance?.cashSessions.find(session => session.status === 'OPEN');
  const canRecordThisWeek = Boolean(currentCash && balance?.weekStart === currentWeekStart() && balance?.openCashWeekStart === balance?.weekStart);
  const cashIsFromAnotherWeek = Boolean(currentCash && balance?.openCashWeekStart !== balance?.weekStart);
  const result = Number(balance?.result ?? 0);

  return <main className="balance-screen">
    <header className="balance-topbar"><button className="menu-back" onClick={onBack}><ArrowLeft size={17}/> Voltar para venda</button><div className="menu-account">HELP BURGUER <span>·</span> BALANÇO DE CAIXA</div></header>
    <section className="balance-heading"><div><div className="section-kicker">CONTROLE FINANCEIRO</div><h1>Balanço da semana</h1><p>Acompanhe vendas, gastos e fechamento do caixa semanal.</p></div><div className="balance-period"><CalendarDays size={15}/><input aria-label="Escolher semana pelo dia" type="date" value={weekDate} max={today()} onChange={event => setWeekDate(event.target.value)}/><span>{balance ? `${longDate(balance.weekStart)} – ${longDate(balance.weekEnd)}` : ''}</span></div></section>
    <section className="balance-cards">
      <article><span>VENDAS</span><strong>{money(balance?.salesTotal ?? 0)}</strong><small><ArrowUpRight size={13}/> {balance?.orderCount ?? 0} pedidos{balance?.cancelledCount ? ` · ${balance.cancelledCount} cancelados` : ''}</small></article>
      <article><span>GASTOS REGISTRADOS</span><strong>{money(balance?.expensesTotal ?? 0)}</strong><small><Minus size={13}/> {balance?.expenses.length ?? 0} lançamentos</small></article>
      <article className={result < 0 ? 'balance-loss' : 'balance-profit'}><span>RESULTADO DA SEMANA</span><strong>{money(balance?.result ?? 0)}</strong><small>{result < 0 ? <TrendingDown size={13}/> : <TrendingUp size={13}/>} {result < 0 ? 'Saldo negativo' : result > 0 ? 'Saldo positivo' : 'Sem movimento líquido'}</small></article>
      <article><span>DINHEIRO EM CAIXA</span><strong>{money(balance?.expectedCash ?? 0)}</strong><small><Wallet size={13}/> abertura + vendas em dinheiro − gastos em dinheiro</small></article>
    </section>
    <p className="balance-explainer">Resultado = vendas recebidas − gastos cadastrados. Para lucro contábil completo, registre também custos de ingredientes, taxas e demais despesas.</p>
    <section className="balance-grid">
      <div className="balance-main-column">
        <section className="balance-panel"><div className="balance-panel-heading"><div><div className="section-kicker">MOVIMENTO</div><h2>Vendas por dia</h2></div>{loading && <RefreshCw className="spin" size={15}/>}</div>{!balance?.dailyTotals.length ? <div className="balance-empty">Nenhuma venda nesta semana.</div> : <div className="daily-sales">{balance.dailyTotals.map(day => <div className="daily-row" key={day.date}><span>{longDate(day.date)}</span><div className="daily-bar"><i style={{ width: `${Math.max(4, Number(day.total) / Math.max(...balance.dailyTotals.map(item => Number(item.total))) * 100)}%` }}/></div><small>{day.count} {day.count === 1 ? 'pedido' : 'pedidos'}</small><strong>{money(day.total)}</strong></div>)}</div>}
          <div className="payment-breakdown"><div className="section-kicker">VENDAS POR PAGAMENTO</div>{Object.keys(balance?.paymentTotals ?? {}).length === 0 ? <p>Sem pagamentos registrados.</p> : Object.entries(balance!.paymentTotals).map(([method, total]) => <div className="payment-row" key={method}><span>{paymentLabels[method] ?? method}</span><strong>{money(total)}</strong></div>)}</div>
        </section>
        <section className="balance-panel expense-history"><div className="balance-panel-heading"><div><div className="section-kicker">SAÍDAS</div><h2>Gastos da semana</h2></div><span className="expense-count">{balance?.expenses.length ?? 0}</span></div>{!balance?.expenses.length ? <div className="balance-empty">Nenhum gasto registrado nesta semana.</div> : <div className="expense-list">{balance.expenses.map(item => <article className="expense-row" key={item.id}><div className="expense-symbol"><CircleDollarSign size={16}/></div><div className="expense-copy"><strong>{item.description}</strong><span>{item.category} · {paymentLabels[item.paymentMethod] ?? item.paymentMethod} · {item.user.name}</span></div><time>{new Date(item.spentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><b>{money(item.amount)}</b></article>)}</div>}</section>
      </div>
      <aside className="balance-side">
        <form className="expense-form" onSubmit={addExpense}><div className="expense-form-title"><div className="expense-symbol"><Plus size={16}/></div><div><div className="section-kicker">REGISTRAR SAÍDA</div><h2>Novo gasto</h2></div></div><label>Descrição<input required minLength={2} maxLength={200} placeholder="Ex.: compra de pão" value={expense.description} onChange={event => setExpense({ ...expense, description: event.target.value })}/></label><label>Categoria<select value={expense.category} onChange={event => setExpense({ ...expense, category: event.target.value })}>{categories.map(category => <option key={category}>{category}</option>)}</select></label><div className="expense-form-row"><label>Valor (R$)<input required inputMode="decimal" placeholder="0,00" value={expense.amount} onChange={event => setExpense({ ...expense, amount: event.target.value })}/></label><label>Pago com<select value={expense.paymentMethod} onChange={event => setExpense({ ...expense, paymentMethod: event.target.value })}><option value="CASH">Dinheiro</option><option value="PIX">PIX</option><option value="CARD">Cartão</option></select></label></div><label>Data e hora<input required type="datetime-local" value={expense.spentAt} onChange={event => setExpense({ ...expense, spentAt: event.target.value })}/></label><button className="expense-submit" disabled={saving || !canRecordThisWeek}><Check size={15}/>{saving ? 'Salvando…' : 'Registrar gasto'}</button>{!currentCash ? <small className="need-open-cash">Abra o caixa semanal para lançar gastos.</small> : cashIsFromAnotherWeek ? <small className="need-open-cash">Este caixa começou em outra semana. Feche-o e abra o caixa desta semana para registrar gastos aqui.</small> : !canRecordThisWeek && <small className="need-open-cash">Gastos só podem ser lançados na semana atual.</small>}</form>
        <section className="weekly-cash-card"><div className="weekly-cash-status"><span className={`status-led ${currentCash ? '' : 'closed'}`}/><div><div className="section-kicker">CAIXA SEMANAL</div><strong>{currentCash ? (cashIsFromAnotherWeek ? 'Caixa da semana anterior' : 'Em andamento') : balance?.cashSessions.length ? 'Fechado' : 'Não aberto'}</strong></div></div>{currentCash ? <><p>Aberto {new Date(currentCash.openedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}. Valores em dinheiro esperados: <b>{money(balance?.expectedCash ?? 0)}</b>.</p><button className="weekly-close" disabled={saving} onClick={closeCash}>{cashIsFromAnotherWeek ? 'Fechar caixa anterior' : 'Fechar caixa da semana'}</button></> : <><p>Abra o caixa no começo da semana. As vendas e gastos serão associados a esta sessão.</p><button className="weekly-open" disabled={saving || balance?.weekStart !== currentWeekStart()} onClick={openCash}>{balance?.weekStart !== currentWeekStart() ? 'Selecione a semana atual para abrir' : 'Abrir caixa semanal'}</button></>}{balance?.cashSessions.filter(session => session.status === 'CLOSED').map(session => <div className="closed-cash-summary" key={session.id}><Clock3 size={13}/> Fechado {new Date(session.closedAt ?? '').toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · contado {money(session.closingAmount ?? 0)} · esperado {money(session.expectedClosingAmount ?? 0)}</div>)}</section>
      </aside>
    </section>
    <p className="balance-footnote">Movimentos fechados ficam preservados no histórico. Despesas são mantidas com valor, categoria, forma de pagamento, data e usuário responsável.</p>
  </main>;
}
