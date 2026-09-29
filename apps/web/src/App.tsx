import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingBag, LayoutDashboard, Utensils, Wallet, CircleDollarSign, MessageCircle, Settings, Flame, X, Check, Printer, LogOut } from 'lucide-react';
import MenuScreen from './MenuScreen';
import OrdersScreen from './OrdersScreen';
import CashBalanceScreen from './CashBalanceScreen';
import PricingScreen from './PricingScreen';
import WhatsAppScreen from './WhatsAppScreen';

const API = `${import.meta.env.VITE_API_URL ?? '/api'}`;
const mediaUrl = (url: string) => { const base = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, ''); return base ? `${base}${url}` : url; };
type Product = { id: string; name: string; description: string; price: string; imageUrl: string | null; category: { name: string } };
type User = { id: string; name: string; username: string; role: string };
type CartLine = { product: Product; quantity: number };
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const parseCents = (value: string) => { const normalized = value.trim().replace(',', '.'); if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return 0; const [whole, fraction = ''] = normalized.split('.'); return Number(whole) * 100 + Number((fraction + '00').slice(0, 2)); };

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('hb-token') ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState('Todos');
  const [query, setQuery] = useState('');
  const [cash, setCash] = useState<any>(null);
  const [customer, setCustomer] = useState('Cliente balcão');
  const [channel, setChannel] = useState('COUNTER');
  const [payment, setPayment] = useState('PIX');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('3');
  const [orderNotes, setOrderNotes] = useState('');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [notice, setNotice] = useState('');
  const [login, setLogin] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [page, setPage] = useState<'sale' | 'menu' | 'orders' | 'balance' | 'pricing' | 'whatsapp'>('sale');
  const categories = ['Todos', ...new Set(products.map(p => p.category?.name).filter(Boolean))];
  const shown = products.filter(p => (category === 'Todos' || p.category?.name === category) && `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()));
  const totalCents = useMemo(() => cart.reduce((sum, row) => sum + Math.round(Number(row.product.price) * 100) * row.quantity, 0), [cart]);
  const total = (totalCents + (channel === 'DELIVERY' ? parseCents(deliveryFee) : 0)) / 100;
  const itemsTotal = totalCents / 100;
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Falha na operação'); return data;
  }
  async function refresh() { const [items, current] = await Promise.all([request('/products'), request('/cash/current')]); setProducts(items); setCash(current); }
  useEffect(() => { if (!token) return; request('/auth/me').then(setUser).then(refresh).catch(() => { setToken(''); localStorage.removeItem('hb-token'); }); }, [token]);
  function flash(text: string) { setNotice(text); window.setTimeout(() => setNotice(''), 4000); }
  async function signIn(e: React.FormEvent) { e.preventDefault(); setBusy(true); try { const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(login) }); localStorage.setItem('hb-token', data.token); setToken(data.token); setUser(data.user); } catch (e) { flash((e as Error).message); } finally { setBusy(false); } }
  function add(product: Product) { setCart(prev => { const found = prev.find(r => r.product.id === product.id); return found ? prev.map(r => r.product.id === product.id ? { ...r, quantity: r.quantity + 1 } : r) : [...prev, { product, quantity: 1 }]; }); }
  function printReceipt(orderToPrint: any) {
    const receipt = orderToPrint;
    if (!receipt) return;
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const lines = (receipt.items ?? []).map((item: any) => `<div class="item-line"><span class="item-name">${item.quantity} x ${escape(item.name)}</span><strong class="item-price">${money(Number(item.subtotal))}</strong></div>`).join('');
    const extra = `${receipt.address ? `<p>Entrega: ${escape(receipt.address)}</p>` : ''}${receipt.notes ? `<p>Observacao: ${escape(receipt.notes)}</p>` : ''}${receipt.needsChange ? `<p>Troco para: ${money(Number(receipt.changeFor))}</p>` : ''}`;
    const deliveryFeeLine = Number(receipt.deliveryFee) > 0 ? `<div class="item-line"><span class="item-name">Taxa de entrega</span><strong class="item-price">${money(Number(receipt.deliveryFee))}</strong></div>` : '';
    const frame = document.createElement('iframe');
    frame.title = 'Comprovante para impressão';
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:58mm;height:297mm;border:0';
    frame.onload = () => {
      const printWindow = frame.contentWindow, printDocument = frame.contentDocument;
      if (!printWindow || !printDocument) { frame.remove(); window.print(); return; }
      printWindow.requestAnimationFrame(() => {
        const ticket = printDocument.querySelector<HTMLElement>('.ticket');
        if (!ticket) { frame.remove(); window.print(); return; }
        const pageStyle = printDocument.getElementById('page-size')!;
        pageStyle.textContent = '@page { size: 58mm 297mm; margin: 0; }';
        printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
        printWindow.requestAnimationFrame(() => {
          printWindow.focus();
          printWindow.print();
        });
      });
    };
    const logoUrl = escape(new URL('/assets/logo-help-burguer.png', window.location.href).href);
    frame.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${escape(receipt.number)}</title><style id="page-size">@page{size:58mm 297mm;margin:0!important}*{box-sizing:border-box}html,body{width:58mm;height:297mm;margin:0!important;padding:0!important;background:#fff;color:#111;min-height:0;overflow:visible;vertical-align:top}body{display:block!important;text-align:left!important;position:relative!important}.ticket{display:block;position:absolute!important;top:0!important;left:0!important;width:58mm;height:auto;min-height:0;overflow:visible;margin:0!important;padding:0 1.5mm!important;font:8pt/1.2 monospace;text-align:left}.center{text-align:center}.logo{display:block!important;width:100%!important;height:auto!important;max-height:28mm!important;object-fit:contain;margin:0 auto 2mm}.center p{margin:1.5mm 0}.item-line{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;column-gap:6mm;margin:2.5mm 0;padding:0 0 1.5mm;border-bottom:1px dotted #888;font-size:9px;line-height:1.35}.item-name{display:block;min-width:0;text-align:left;font-size:9px;font-weight:400;line-height:1.35;overflow-wrap:anywhere}.item-price{display:block;justify-self:end;text-align:right;white-space:nowrap;font-size:9px!important;font-weight:400!important;line-height:1.35}.line{display:flex;justify-content:space-between;gap:1mm;margin:1.5mm 0}.line span:first-child{flex:1;overflow-wrap:anywhere}.line strong{white-space:nowrap}p{margin:1.5mm 0;line-height:1.3;overflow-wrap:anywhere}hr{border:0;border-top:1px dashed #111;margin:2mm 0}.total{font-weight:bold;font-size:9pt}@media print{html,body{margin:0!important;padding:0!important;height:297mm!important}.ticket{position:fixed!important;top:0!important;left:0!important;margin:0!important}}</style></head><body><main class="ticket"><div class="center"><img class="logo" src="${logoUrl}" style="display:block;width:100%!important;height:auto!important;max-height:28mm!important;object-fit:contain;margin:0 auto 2mm" alt="Help Burguer"><p>Pedido ${escape(receipt.number)}</p><p>${new Date(receipt.createdAt).toLocaleString('pt-BR')}</p><p>${escape(receipt.customerName)} · ${escape(receipt.channel)}</p></div>${extra}<hr/>${lines}${deliveryFeeLine}<hr/><div class="line total"><span>Total</span><strong>${money(Number(receipt.total))}</strong></div><p>Pagamento: ${escape(receipt.paymentMethod)}</p><p class="center">Obrigado pela preferencia!</p></main></body></html>`;
    document.body.appendChild(frame);
  }
  async function finalize() {
    if (!cart.length) return;
    if (channel === 'DELIVERY' && !customer.trim()) { flash('Informe o nome do cliente para a entrega.'); return; }
    if (channel === 'DELIVERY' && !deliveryAddress.trim()) { flash('Informe o endereço de entrega.'); return; }
    if (channel === 'DELIVERY' && !/^\d+([,.]\d{0,2})?$/.test(deliveryFee.trim())) { flash('Informe uma taxa de entrega valida.'); return; }
    if (channel === 'DELIVERY' && needsChange && !changeFor.trim()) { flash('Informe o valor para o qual precisa de troco.'); return; }
    setBusy(true);
    try {
      const order = await request('/orders', { method: 'POST', body: JSON.stringify({ customerName: customer.trim() || 'Cliente balcão', channel, paymentMethod: payment, ...(channel === 'DELIVERY' ? { address: deliveryAddress.trim(), notes: orderNotes.trim() || undefined, deliveryFee: String(parseCents(deliveryFee) / 100), needsChange, changeFor: needsChange ? changeFor.replace(',', '.') : undefined } : {}), items: cart.map(r => ({ productId: r.product.id, quantity: r.quantity })) }) });
      flash(`Pedido ${order.number} registrado · ${money(Number(order.total))}`);
      setReceipt(order);
      setCart([]);
      setDeliveryAddress(''); setOrderNotes(''); setNeedsChange(false); setChangeFor('');
      if (window.confirm('Pedido salvo no histórico. Deseja imprimir o comprovante?')) window.setTimeout(() => printReceipt(order), 150);
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  if (!token || !user) return <main className="login-screen"><div className="login-card"><img src="/assets/logo-help-burguer.png"/><div className="eyebrow">PAINEL DE OPERAÇÃO</div><h1>Seu balcão,<br/><em>sob controle.</em></h1><p>Entre para iniciar o atendimento.</p><form onSubmit={signIn}><label>Usuário<input value={login.username} onChange={e => setLogin({ ...login, username: e.target.value })}/></label><label>Senha<input type="password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })}/></label><button className="primary wide" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no sistema'}</button></form>{notice && <div className="notice">{notice}</div>}</div></main>;

  if (page === 'menu') return <MenuScreen request={request} onBack={() => setPage('sale')} flash={flash}/>;
  if (page === 'orders') return <OrdersScreen request={request} onBack={() => setPage('sale')} flash={flash}/>;
  if (page === 'balance') return <CashBalanceScreen request={request} onBack={() => setPage('sale')} flash={flash}/>;
  if (page === 'pricing') return <PricingScreen request={request} onBack={() => setPage('sale')} flash={flash}/>;
  if (page === 'whatsapp') return <WhatsAppScreen request={request} onBack={() => setPage('sale')}/>;

  return <div className="app-shell">
    {receipt && <section className="receipt"><img src="/assets/logo-help-burguer.png"/><h1>HELP BURGUER</h1><h2>Pedido {receipt.number}</h2><p>{new Date(receipt.createdAt).toLocaleString('pt-BR')}</p><p>{receipt.customerName} · {receipt.channel}</p>{receipt.address && <p>Entrega: {receipt.address}</p>}{Number(receipt.deliveryFee) > 0 && <p>Taxa de entrega: {money(Number(receipt.deliveryFee))}</p>}{receipt.notes && <p>Observação: {receipt.notes}</p>}{receipt.needsChange && <p>Troco para: {money(Number(receipt.changeFor))}</p>}<hr/>{receipt.items?.map((item: any) => <div className="receipt-line" key={item.id}><span>{item.quantity} × {item.name}</span><span>{money(Number(item.subtotal))}</span></div>)}<hr/><div className="receipt-line"><strong>Total</strong><strong>{money(Number(receipt.total))}</strong></div><p>Pagamento: {receipt.paymentMethod}</p><p>Obrigado pela preferência!</p><strong>HELP BURGUER</strong></section>}
    <aside className="sidebar"><div className="brand"><img src="/assets/logo-help-burguer.png"/><div className="brand-line"/></div><div className="nav-label">OPERAÇÃO</div><button className="nav active"><ShoppingBag size={18}/> Venda <span className="nav-dot"/></button><button className="nav" onClick={() => setPage('menu')}><Utensils size={18}/> Cardápio</button><button className="nav" onClick={() => setPage('orders')}><LayoutDashboard size={18}/> Pedidos recentes</button><div className="nav-label space">GESTÃO</div><button className="nav" onClick={() => setPage('balance')}><Wallet size={18}/> Balanço de caixa</button><button className="nav" onClick={() => setPage('pricing')}><CircleDollarSign size={18}/> Precificação</button><button className="nav" onClick={() => setPage('whatsapp')}><MessageCircle size={18}/> WhatsApp</button><button className="nav" onClick={() => flash(`Sessão: ${user.username} · Perfil ${user.role}`)}><Settings size={18}/> Configurações</button><div className="sidebar-bottom"><div className="cash-card"><div className="cash-head"><span className={`status-led ${cash ? '' : 'closed'}`}/><span>{cash ? 'CAIXA SEMANAL ABERTO' : 'CAIXA SEMANAL FECHADO'}</span></div><p>{cash ? `Desde ${new Date(cash.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Abra para registrar vendas'}</p><button onClick={() => setPage('balance')}>{cash ? 'Ver fechamento' : 'Abrir caixa semanal'} <span>↗</span></button></div><div className="user-row"><div className="avatar">{user.name.slice(0, 1)}</div><div><strong>{user.name}</strong><small>Administrador</small></div><button className="logout" onClick={() => { setToken(''); setUser(null); localStorage.removeItem('hb-token'); }}><LogOut size={16}/></button></div></div></aside>
    <main className="workspace"><header className="topbar"><div><div className="eyebrow">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</div><h2>Terminal de vendas</h2></div><div className="top-actions"><span className="live"><span/> SISTEMA ONLINE</span><span className="clock">● &nbsp; Atendimento presencial</span></div></header><div className="sales-layout"><section className="catalog"><div className="catalog-head"><div><div className="section-kicker">CARDÁPIO</div><h1>O que vai ser?</h1></div><div className="search"><Search size={17}/><input placeholder="Buscar no cardápio…" value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></div></div><div className="categories">{categories.map(c => <button key={c} onClick={() => setCategory(c)} className={category === c ? 'selected' : ''}>{c}</button>)}</div><div className="products">{shown.map((p, i) => <article className="product" key={p.id}><div className={`product-art art-${i % 5}`}>{p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt={p.name}/> : <><Flame size={19}/><span>HB</span></>}</div><div className="product-info"><span className="product-tag">{p.category?.name === 'Combos' ? 'COMBO' : p.category?.name?.toUpperCase()}</span><h3>{p.name}</h3><p>{p.description}</p><div className="product-bottom"><strong>{money(Number(p.price))}</strong><button onClick={() => add(p)} aria-label={`Adicionar ${p.name}`}><Plus size={17}/></button></div></div></article>)}</div></section>
    <aside className="order-panel"><div className="order-title"><div><div className="section-kicker">PEDIDO ATUAL</div><h2>Seu pedido</h2></div><button className="clear" onClick={() => setCart([])} disabled={!cart.length}><Trash2 size={16}/> Limpar</button></div><label className="field">CLIENTE<input required={channel === 'DELIVERY'} value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Nome do cliente"/></label><div className="field"><div className="field-label">ATENDIMENTO</div><div className="segmented">{[['COUNTER','Balcão'],['DELIVERY','Delivery'],['TABLE','Mesa']].map(([id, label]) => <button key={id} className={channel === id ? 'on' : ''} onClick={() => { if (id === 'DELIVERY' && customer === 'Cliente balcão') setCustomer(''); setChannel(id); }}>{label}</button>)}</div></div>{channel === 'DELIVERY' && <div className="delivery-fields"><label className="field">ENDEREÇO DE ENTREGA<input required value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Rua, número, bairro e complemento"/></label><label className="field">TAXA DE ENTREGA (R$)<input required type="text" inputMode="decimal" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} placeholder="3,00"/></label><label className="field">OBSERVAÇÃO<textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Referência, ponto de entrega ou instruções" rows={2}/></label>{payment === 'CASH' && <><div className="field"><div className="field-label">PRECISA DE TROCO?</div><div className="segmented"><button type="button" className={!needsChange ? 'on' : ''} onClick={() => { setNeedsChange(false); setChangeFor(''); }}>Não</button><button type="button" className={needsChange ? 'on' : ''} onClick={() => setNeedsChange(true)}>Sim</button></div></div>{needsChange && <label className="field">TROCO PARA (R$)<input required inputMode="decimal" value={changeFor} onChange={e => setChangeFor(e.target.value)} placeholder="Ex.: 50,00"/></label>}</>}</div>}<div className="cart-lines">{cart.length === 0 ? <div className="empty"><div className="empty-icon"><ShoppingBag size={22}/></div><strong>Seu pedido começa aqui</strong><span>Adicione algo gostoso do cardápio.</span></div> : cart.map(row => <div className="cart-row" key={row.product.id}><div className="cart-symbol"><Flame size={16}/></div><div className="cart-copy"><strong>{row.product.name}</strong><span>{money(Number(row.product.price))} cada</span></div><div className="quantity"><button onClick={() => setCart(cart.flatMap(r => r.product.id !== row.product.id ? [r] : r.quantity > 1 ? [{ ...r, quantity: r.quantity - 1 }] : []))}><Minus size={12}/></button><span>{row.quantity}</span><button onClick={() => add(row.product)}><Plus size={12}/></button></div><strong className="line-price">{money(Number(row.product.price) * row.quantity)}</strong></div>)}</div><div className="field pay-field"><div className="field-label">PAGAMENTO</div><div className="segmented">{[['PIX','PIX'],['CARD','Cartão'],['CASH','Dinheiro']].map(([id, label]) => <button key={id} className={payment === id ? 'on' : ''} onClick={() => { setPayment(id); if (id !== 'CASH') { setNeedsChange(false); setChangeFor(''); } }}>{label}</button>)}</div></div><div className="totals"><div><span>Subtotal</span><span>{money(itemsTotal)}</span></div>{channel === 'DELIVERY' && <div><span>Taxa de entrega</span><span>{money(parseCents(deliveryFee) / 100)}</span></div>}<div><span>Desconto</span><button className="discount" onClick={() => flash('Desconto exige autorização de gerente.')}>Adicionar</button></div><div className="grand"><strong>Total a pagar</strong><strong>{money(total)}</strong></div></div><button className="finish" disabled={busy || !cart.length || !cash} onClick={finalize}><Check size={18}/>{busy ? 'Salvando pedido…' : 'Finalizar pedido'}<span>↗</span></button><div className="secure"><span>●</span> Pedido salvo com segurança no sistema</div></aside></div><footer><span>HELP BURGUER &nbsp;·&nbsp; PDV</span><span>Operador autenticado &nbsp;·&nbsp; <Printer size={13}/> Impressão pelo navegador</span></footer></main>{notice && <div className="toast"><Check size={17}/>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}</div>;
}
