import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, ImagePlus, Pencil, Plus, RotateCcw, Tags, Trash2, X } from 'lucide-react';

type Category = { id: string; name: string };
type Product = { id: string; name: string; description: string; price: string; active: boolean; imageUrl: string | null; category: Category };
type Props = { request: (path: string, init?: RequestInit) => Promise<any>; onBack: () => void; flash: (message: string) => void };
const empty = { name: '', description: '', price: '', categoryId: '' };
const priceLabel = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const mediaUrl = (url: string) => { const base = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, ''); return base ? `${base}${url}` : url; };

export default function MenuScreen({ request, onBack, flash }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const [items, groups] = await Promise.all([request('/manage/products'), request('/categories')]);
    setProducts(items);
    setCategories(groups);
  }
  useEffect(() => { load().catch(error => flash(error.message)); }, []);

  function beginEdit(product: Product) {
    setEditing(product);
    setForm({ name: product.name, description: product.description, price: String(product.price), categoryId: product.category.id });
    setImageData(null);
    setRemoveImage(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function clearForm() { setEditing(null); setForm({ ...empty, categoryId: categories[0]?.id ?? '' }); setImageData(null); setRemoveImage(false); if (fileInput.current) fileInput.current.value = ''; }

  function chooseImage(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { flash('Use uma imagem PNG, JPG ou WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { flash('A imagem deve ter no máximo 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setImageData(String(reader.result)); setRemoveImage(false); };
    reader.onerror = () => flash('Não foi possível ler essa imagem.');
    reader.readAsDataURL(file);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.categoryId) { flash('Cadastre uma categoria antes de incluir produtos.'); return; }
    setBusy(true);
    try {
      const body = { ...form, price: form.price.trim().replace(',', '.'), ...(imageData ? { imageData } : {}), ...(removeImage ? { removeImage: true } : {}) };
      await request(editing ? `/manage/products/${editing.id}` : '/manage/products', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      flash(editing ? 'Produto atualizado.' : 'Produto cadastrado.');
      clearForm();
      await load();
    } catch (error) { flash((error as Error).message); }
    finally { setBusy(false); }
  }

  async function addCategory() {
    const name = window.prompt('Nome da nova categoria');
    if (!name?.trim()) return;
    try {
      const category = await request('/categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      await load();
      setForm(current => ({ ...current, categoryId: category.id }));
      flash('Categoria adicionada.');
    } catch (error) { flash((error as Error).message); }
  }

  async function toggleProduct(product: Product) {
    try {
      if (product.active) await request(`/manage/products/${product.id}`, { method: 'DELETE' });
      else await request(`/manage/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
      flash(product.active ? 'Produto desativado e removido das vendas.' : 'Produto reativado.');
      await load();
    } catch (error) { flash((error as Error).message); }
  }

  const visibleProducts = products.filter(product => showInactive || product.active);
  const activeCount = products.filter(product => product.active).length;
  const archivedCount = products.length - activeCount;

  return <main className="menu-screen">
    <header className="menu-topbar"><button className="menu-back" onClick={onBack}><ArrowLeft size={17}/> Voltar para venda</button><div className="menu-account">HELP BURGUER <span>·</span> CARDÁPIO</div></header>
    <section className="menu-heading"><div><div className="section-kicker">GESTÃO DO CARDÁPIO</div><h1>Seus produtos,<br/><em>do seu jeito.</em></h1><p>Cadastre os produtos que você vende. Só os ativos aparecem no caixa.</p></div><div className="menu-count"><Tags size={17}/><strong>{activeCount}</strong><span>produtos ativos</span></div></section>
    <section className="menu-columns">
      <form className="menu-form" onSubmit={save}>
        <div className="menu-form-head"><div className="menu-icon"><Plus size={17}/></div><div><div className="section-kicker">{editing ? 'EDITAR ITEM' : 'NOVO ITEM'}</div><h2>{editing ? 'Atualizar produto' : 'Cadastrar produto'}</h2></div></div>
        <label>Nome do produto<input required maxLength={100} placeholder="Ex.: Clássico da casa" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>
        <label>Descrição<textarea maxLength={500} rows={3} placeholder="Ingredientes ou detalhes para a equipe" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label>
        <div className="photo-field"><span className="photo-label">FOTO DO PRODUTO</span><input ref={fileInput} className="photo-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseImage(event.target.files?.[0])}/>{imageData || (editing?.imageUrl && !removeImage) ? <div className="photo-preview"><img src={imageData ?? mediaUrl(editing?.imageUrl ?? '')} alt="Prévia do produto"/><div><strong>Foto selecionada</strong><span>PNG, JPG ou WebP · até 5 MB</span><button type="button" onClick={() => { setImageData(null); setRemoveImage(Boolean(editing?.imageUrl)); if (fileInput.current) fileInput.current.value = ''; }}><X size={13}/> Remover foto</button></div></div> : <button type="button" className="photo-picker" onClick={() => fileInput.current?.click()}><ImagePlus size={18}/><span><strong>Escolher foto do computador</strong><small>PNG, JPG ou WebP · até 5 MB</small></span></button>}</div>
        <div className="menu-form-row"><label>Preço (R$)<input required inputMode="decimal" placeholder="0,00" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })}/></label><label>Categoria<select required value={form.categoryId} onChange={event => setForm({ ...form, categoryId: event.target.value })}><option value="" disabled>Escolher…</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div>
        <button type="button" className="category-add" onClick={addCategory}><Tags size={14}/> Criar nova categoria</button>
        <div className="menu-form-actions">{editing && <button type="button" className="cancel-edit" onClick={clearForm}>Cancelar</button>}<button className="save-product" disabled={busy}>{editing ? <Pencil size={15}/> : <Check size={16}/>} {busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar ao cardápio'}</button></div>
      </form>

      <section className="menu-list">
        <div className="menu-list-head"><div><div className="section-kicker">SEU CARDÁPIO</div><h2>Produtos cadastrados</h2></div><button className={`inactive-toggle ${showInactive ? 'selected' : ''}`} onClick={() => setShowInactive(value => !value)}>{showInactive ? <EyeOff size={14}/> : <Eye size={14}/>} {showInactive ? 'Ocultar inativos' : `Inativos (${archivedCount})`}</button></div>
        {visibleProducts.length === 0 ? <div className="menu-empty"><div className="menu-empty-mark"><Tags size={23}/></div><strong>Seu cardápio começa aqui</strong><span>Cadastre o primeiro produto no formulário ao lado.</span></div> : <div className="menu-product-list">{visibleProducts.map(product => <article className={`menu-product ${product.active ? '' : 'disabled'}`} key={product.id}><div className="menu-product-mark">{product.imageUrl ? <img src={mediaUrl(product.imageUrl)} alt=""/> : <span>HB</span>}</div><div className="menu-product-copy"><div className="menu-product-title"><h3>{product.name}</h3>{!product.active && <span className="inactive-tag">INATIVO</span>}</div><div className="menu-product-meta">{product.category.name} <span>·</span> {priceLabel(product.price)}</div>{product.description && <p>{product.description}</p>}</div><div className="menu-product-actions"><button title="Editar produto" onClick={() => beginEdit(product)}><Pencil size={15}/></button><button title={product.active ? 'Desativar produto' : 'Reativar produto'} className={product.active ? 'deactivate' : 'reactivate'} onClick={() => toggleProduct(product)}>{product.active ? <Trash2 size={15}/> : <RotateCcw size={15}/>}</button></div></article>)}</div>}
      </section>
    </section>
    <p className="menu-history-note">Produtos desativados deixam de aparecer nas vendas. Se já tiveram pedidos, ficam guardados no histórico.</p>
  </main>;
}
