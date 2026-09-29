import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCheck, CircleAlert, MessageCircle, RefreshCw, Search, Send } from 'lucide-react';
import './WhatsAppScreen.css';

type Conversation = {
  id: string; phone: string; contactName: string | null; unreadCount: number; lastMessageAt: string;
  lastMessage: { body: string; direction: 'INBOUND' | 'OUTBOUND'; status: string } | null;
};
type Message = { id: string; direction: 'INBOUND' | 'OUTBOUND'; body: string; status: string; createdAt: string };
type Props = { request: (path: string, init?: RequestInit) => Promise<any>; onBack: () => void };
const time = (value?: string) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

export default function WhatsAppScreen({ request, onBack }: Props) {
  const [configured, setConfigured] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try { const result = await request('/whatsapp/status'); setConfigured(Boolean(result.configured)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setStatusChecked(true); }
  }, [request]);
  const loadConversations = useCallback(async () => {
    try { setConversations(await request(`/whatsapp/conversations${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`)); }
    catch (cause) { setError((cause as Error).message); }
  }, [request, search]);
  const loadMessages = useCallback(async (conversationId: string) => {
    try { setMessages(await request(`/whatsapp/conversations/${conversationId}/messages`)); }
    catch (cause) { setError((cause as Error).message); }
  }, [request]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => { void loadConversations(); }, 5000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);
  useEffect(() => {
    if (!active) { setMessages([]); return; }
    void loadMessages(active.id);
    void request(`/whatsapp/conversations/${active.id}/read`, { method: 'PATCH' }).then(loadConversations).catch(() => undefined);
    const timer = window.setInterval(() => { void loadMessages(active.id); }, 4000);
    return () => window.clearInterval(timer);
  }, [active?.id, loadMessages, loadConversations, request]);

  const totalUnread = useMemo(() => conversations.reduce((sum, item) => sum + item.unreadCount, 0), [conversations]);
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await request(`/whatsapp/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ text: draft.trim() }) });
      setDraft(''); await Promise.all([loadMessages(active.id), loadConversations()]);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="wa-screen">
    <header className="wa-topbar"><button className="wa-back" onClick={onBack}><ArrowLeft size={17}/> Voltar ao PDV</button><div><span className="wa-kicker">ATENDIMENTO</span><h1>WhatsApp</h1></div><button className="wa-refresh" onClick={() => { void loadStatus(); void loadConversations(); }}><RefreshCw size={15}/> Atualizar</button></header>
    {!statusChecked ? <div className="wa-empty"><RefreshCw size={20}/> Verificando conexão...</div> : !configured ? <section className="wa-setup"><div className="wa-setup-icon"><MessageCircle size={24}/></div><h2>Conecte o WhatsApp Business</h2><p>Para receber e responder mensagens nesta tela, configure a WhatsApp Cloud API no servidor. O token fica protegido no backend e não é enviado ao navegador.</p><ol><li>Configure um aplicativo Meta com WhatsApp Cloud API e um número comercial.</li><li>Adicione no arquivo <code>.env</code> do servidor: <code>WHATSAPP_PROVIDER=cloud_api</code>, <code>WHATSAPP_API_URL</code>, <code>WHATSAPP_API_TOKEN</code> e <code>WHATSAPP_PHONE_NUMBER_ID</code>.</li><li>Configure <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> e <code>WHATSAPP_APP_SECRET</code>, depois reinicie a API.</li><li>Cadastre este webhook no Meta e assine o evento <code>messages</code>:</li></ol><div className="wa-webhook-url">{window.location.origin}/api/whatsapp/webhook</div><p className="wa-note"><CircleAlert size={15}/> O webhook precisa estar publicado em HTTPS e acessível pela Meta. Em <code>localhost</code>, será necessário publicar a API ou usar um túnel seguro.</p></section> : <section className="wa-inbox">
      <aside className="wa-conversations"><div className="wa-list-heading"><div><span className="wa-kicker">CAIXA DE ENTRADA</span><h2>Conversas {totalUnread > 0 && <small>{totalUnread}</small>}</h2></div></div><label className="wa-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nome ou telefone"/></label><div className="wa-list">{conversations.length ? conversations.map(conversation => <button key={conversation.id} className={`wa-contact ${active?.id === conversation.id ? 'selected' : ''}`} onClick={() => { setError(''); setActive(conversation); }}><span className="wa-avatar">{(conversation.contactName || conversation.phone).slice(0, 1).toUpperCase()}</span><span className="wa-contact-copy"><strong>{conversation.contactName || conversation.phone}</strong><small>{conversation.lastMessage?.body || conversation.phone}</small></span><span className="wa-contact-meta"><time>{time(conversation.lastMessageAt)}</time>{conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}</span></button>) : <div className="wa-list-empty">Nenhuma conversa recebida ainda.</div>}</div></aside>
      <section className="wa-chat">{active ? <><div className="wa-chat-head"><span className="wa-avatar">{(active.contactName || active.phone).slice(0, 1).toUpperCase()}</span><div><strong>{active.contactName || active.phone}</strong><small>{active.phone}</small></div></div><div className="wa-messages">{messages.map(message => <article key={message.id} className={`wa-bubble ${message.direction === 'OUTBOUND' ? 'outbound' : ''}`}><p>{message.body}</p><time>{time(message.createdAt)} {message.direction === 'OUTBOUND' && <CheckCheck size={13}/>}</time></article>)}{!messages.length && <div className="wa-chat-empty">As mensagens desta conversa aparecerão aqui.</div>}</div><form className="wa-compose" onSubmit={sendMessage}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Digite sua resposta..." rows={2} maxLength={4096}/><button disabled={!draft.trim() || busy} aria-label="Enviar mensagem"><Send size={17}/></button></form></> : <div className="wa-empty"><MessageCircle size={25}/><strong>Selecione uma conversa</strong><span>As mensagens serão respondidas aqui, dentro do PDV.</span></div>}</section>
    </section>}
    {error && <div className="wa-error"><CircleAlert size={15}/>{error}<button onClick={() => setError('')}>Fechar</button></div>}
  </main>;
}
