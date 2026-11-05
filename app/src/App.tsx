import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './supabase';

type Category = 'Бот' | 'Интеграция' | 'Отчёт' | 'Другое';
type Status = 'Новая' | 'В работе' | 'Завершена';
type RequestRow = {
  id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  created_at: string;
};
type FormState = Pick<RequestRow, 'title' | 'description' | 'category' | 'status'>;

const categories: Category[] = ['Бот', 'Интеграция', 'Отчёт', 'Другое'];
const statuses: Status[] = ['Новая', 'В работе', 'Завершена'];
const freshForm = (): FormState => ({ title: '', description: '', category: 'Бот', status: 'Новая' });
const formatDate = (s: string) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', year: 'numeric'
}).format(new Date(s));

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'Все'>('Все');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FormState>(freshForm());
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    const client = supabase;
    let active = true;
    client.auth.getSession().then(({ data, error: e }) => {
      if (!active) return;
      if (e) setError(e.message);
      setSession(data.session);
      setAuthReady(true);
    }).catch(e => {
      if (active) { setError(String(e)); setAuthReady(true); }
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, current) => {
      if (active) { setSession(current); setAuthReady(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || !session) { setRows([]); return; }
    setLoading(true);
    setError('');
    try {
      // RLS is enforced in PostgreSQL, not by this client-side query.
      const { data, error: e } = await supabase.from('automation_requests')
        .select('id,title,description,category,status,created_at')
        .order('created_at', { ascending: false });
      if (e) throw e;
      setRows((data || []) as RequestRow[]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [session?.user.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    if (!supabase || authPending) return;
    setAuthPending(true); setError(''); setNotice('');
    try {
      const result = authMode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) {
        setNotice('Аккаунт создан. Проверьте почту и подтвердите регистрацию, затем войдите.');
      } else {
        setNotice(authMode === 'signup' ? 'Аккаунт создан.' : 'Вход выполнен.');
      }
      setPassword('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAuthPending(false); }
  }

  function createNew() {
    setEditingId(null); setDraft(freshForm());
    setError(''); setNotice(''); setEditorOpen(true);
  }

  function edit(row: RequestRow) {
    setEditingId(row.id);
    setDraft({ title: row.title, description: row.description, category: row.category, status: row.status });
    setError(''); setNotice(''); setEditorOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    // Synchronous ref closes the gap between two clicks before React re-renders.
    if (saveInFlight.current || !supabase || !session) return;
    if (!draft.title.trim() || !draft.description.trim() || !categories.includes(draft.category)) {
      setError('Заполните название, описание и категорию.'); return;
    }
    saveInFlight.current = true;
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category,
        status: editingId ? draft.status : 'Новая',
      };
      const op = editingId
        ? supabase.from('automation_requests').update(payload).eq('id', editingId)
        : supabase.from('automation_requests').insert(payload);
      const { error: e } = await op;
      if (e) throw e;
      setNotice(editingId ? 'Изменения сохранены.' : 'Заявка создана.');
      setEditorOpen(false); setEditingId(null); setDraft(freshForm());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { saveInFlight.current = false; setSaving(false); }
  }

  const visible = rows.filter(row =>
    (filter === 'Все' || row.status === filter) &&
    (row.title.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')))
  );
  const done = rows.filter(row => row.status === 'Завершена').length;
  const progress = rows.filter(row => row.status === 'В работе').length;

  if (!configured) return <main className="setup-layout">
    <div className="setup-card">
      <div className="brand"><span className="brand-square">L</span><span>LD LATTE <span className="muted">/ Automation Desk</span></span></div>
      <h1>Настройка Supabase</h1>
      <p>Интерфейс собран, но ключи проекта Supabase не подключены. Примените <code>supabase/schema.sql</code> в SQL Editor проекта, затем создайте файл <code>app/.env</code> на основе <code>.env.example</code>.</p>
      <pre>VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_ANON_KEY=...</pre>
      <p className="subtext">Используйте только publishable/anon key. Service role key никогда не отправляйте в браузер.</p>
    </div>
  </main>;

  if (!authReady) return <main className="setup-layout"><div className="setup-card">Загрузка приложения…</div></main>;

  if (!session) return <main className="auth-layout">
    <section className="auth-promo">
      <div className="brand brand-light"><span className="brand-square">L</span><span>LD LATTE <span className="brand-separator">/</span> Automation Desk</span></div>
      <div className="auth-promo-content">
        <p className="eyebrow">ВНУТРЕННИЕ ИНСТРУМЕНТЫ</p>
        <h1>Хорошие идеи <em>заслуживают</em> реализации.</h1>
        <p>Единое пространство для заявок на автоматизацию — от идеи до результата.</p>
        <div className="feature-mark">01 — Создавайте заявки  ·  02 — Отслеживайте статус  ·  03 — Экономьте время</div>
      </div>
      <span className="promo-footer">DEMO • 2026</span>
    </section>
    <section className="auth-side">
      <div className="auth-box">
        <p className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p>
        <h2>{authMode === 'signin' ? 'С возвращением' : 'Создать аккаунт'}</h2>
        <p className="muted">{authMode === 'signin' ? 'Войдите, чтобы продолжить работу с заявками.' : 'Регистрация по электронной почте и паролю.'}</p>
        {error && <div className="message error" role="alert">{error}</div>}
        {notice && <div className="message success" role="status">{notice}</div>}
        <form onSubmit={handleAuth}>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com"/></label>
          <label>Пароль<input type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Не менее 6 символов"/></label>
          <button type="submit" className="btn btn-primary wide" disabled={authPending}>{authPending ? 'Подождите…' : authMode === 'signin' ? 'Войти →' : 'Создать аккаунт →'}</button>
        </form>
        <div className="auth-switch">{authMode === 'signin' ? 'Нет аккаунта?' : 'Уже зарегистрированы?'} <button className="text-btn" type="button" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}>{authMode === 'signin' ? 'Зарегистрироваться' : 'Войти'}</button></div>
      </div>
    </section>
  </main>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-square">L</span><span>LD LATTE <small>WORKSPACE</small></span></div>
      <div className="nav-section">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <div className="nav-link current"><span>▦</span> Заявки <span className="nav-counter">{rows.length}</span></div>
      <div className="sidebar-bottom"><span className="avatar">{session.user.email?.charAt(0).toUpperCase()}</span><div className="account-info"><b>Мой аккаунт</b><small title={session.user.email}>{session.user.email}</small></div></div>
    </aside>
    <div className="content-wrap">
      <header className="topbar">
        <div><span className="mobile-brand">LD LATTE / </span>Automation Desk</div>
        <div className="top-actions"><span className="muted desktop-only">{session.user.email}</span><button type="button" className="text-btn" onClick={async () => { if (!supabase) return; setError(''); const { error: e } = await supabase.auth.signOut(); if (e) setError(e.message); }}>Выйти ↗</button></div>
      </header>
      <main className="main-content">
        <div className="page-heading">
          <div><p className="eyebrow">УПРАВЛЕНИЕ ПРОЦЕССАМИ</p><h1>Заявки на автоматизацию<span className="dot">.</span></h1><p className="muted">Каждое улучшение начинается с идеи. Соберите их в одном месте.</p></div>
          <button type="button" className="btn btn-primary" onClick={createNew}>＋ Новая заявка</button>
        </div>
        <div className="stats-grid">
          <div className="stat"><span>ВСЕ ЗАЯВКИ</span><strong>{rows.length}</strong><small>Зарегистрировано</small></div>
          <div className="stat"><span>В РАБОТЕ</span><strong>{progress}</strong><small>В процессе реализации</small></div>
          <div className="stat"><span>ЗАВЕРШЕНО</span><strong>{done}</strong><small>Успешные решения</small></div>
        </div>
        <div className="toolbar">
          <div className="search-wrap"><span>⌕</span><input type="search" aria-label="Поиск по названию" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти заявку по названию…"/></div>
          <select value={filter} aria-label="Фильтр по статусу" onChange={e=>setFilter(e.target.value as Status | 'Все')}><option value="Все">Все статусы</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
          <button type="button" className="btn btn-outline refresh" onClick={()=>void refresh()} disabled={loading}>↻ <span>Обновить</span></button>
        </div>
        {error && <div role="alert" className="message error">{error}</div>}
        {notice && <div role="status" className="message success">{notice}</div>}
        <section className="requests-panel">
          {loading ? <div className="empty-state">Загрузка заявок…</div> :
            visible.length === 0 ? <div className="empty-state"><span className="empty-icon">✳</span><h2>{rows.length ? 'Ничего не найдено' : 'Пока нет заявок'}</h2><p>{rows.length ? 'Попробуйте другой поиск или фильтр.' : 'Создайте первую заявку на автоматизацию.'}</p><button className="btn btn-outline" onClick={rows.length ? ()=>{setFilter('Все');setQuery('');} : createNew}>{rows.length ? 'Сбросить фильтры' : 'Создать заявку'}</button></div> :
            <div className="request-list">
              <div className="request-list-head"><span>ЗАЯВКА</span><span>КАТЕГОРИЯ</span><span>СОЗДАНА</span><span>СТАТУС</span><span></span></div>
              {visible.map(row => <div className="request-line" key={row.id}>
                <div className="request-title"><b>{row.title}</b><small>{row.description}</small></div>
                <span className="category">{row.category}</span>
                <span className="date">{formatDate(row.created_at)}</span>
                <span className={'status status-' + (row.status === 'Новая' ? 'new' : row.status === 'В работе' ? 'work' : 'done')}>{row.status}</span>
                <button className="btn btn-link" onClick={()=>edit(row)} aria-label={'Редактировать: '+row.title}>Изменить ↗</button>
              </div>)}
            </div>
          }
        </section>
        <footer className="footer">LD LATTE © 2026 · Демо-приложение · Данные защищены политиками Supabase RLS</footer>
      </main>
    </div>
    {editorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setEditorOpen(false);}}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={editingId ? 'Редактирование заявки' : 'Новая заявка'}>
        <div className="modal-heading"><div><p className="eyebrow">АВТОМАТИЗАЦИЯ</p><h2>{editingId ? 'Редактировать заявку' : 'Новая заявка'}</h2></div><button className="modal-close" type="button" disabled={saving} onClick={()=>setEditorOpen(false)} aria-label="Закрыть">×</button></div>
        <form onSubmit={handleSave}>
          <label>Название задачи <span className="required">*</span><input required maxLength={150} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Например: автоматизация отчётов"/></label>
          <label>Описание <span className="required">*</span><textarea required rows={5} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Опишите задачу, ожидаемый результат и текущие сложности"/></label>
          <div className="form-grid">
            <label>Категория <span className="required">*</span><select required value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as Category})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
            {editingId && <label>Статус<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as Status})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>}
          </div>
          {error && <div className="message error" role="alert">{error}</div>}
          <div className="modal-actions"><button type="button" className="btn btn-outline" disabled={saving} onClick={()=>setEditorOpen(false)}>Отмена</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение…' : editingId ? 'Сохранить изменения' : 'Создать заявку'}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}

export default App;
