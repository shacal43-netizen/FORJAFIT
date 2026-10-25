import { createClient } from '@supabase/supabase-js';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const app = document.querySelector('#app');

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

if (!url || !key || url.includes('SEU-PROJETO') || key.includes('COLE_SUA')) {
  app.innerHTML = `
    <main class="shell">
      <header class="brand"><span class="mark">F</span><div><h1>FORJAFIT</h1><p>BY FABIANO SANTOS</p></div></header>
      <section class="panel">
        <h2>Configuração pendente</h2>
        <p>O projeto inicial está pronto, mas ainda precisa ser conectado ao seu projeto Supabase.</p>
        <ol>
          <li>No Supabase, abra <b>Project Settings → API Keys</b> ou a janela <b>Connect</b>.</li>
          <li>Copie a <b>Project URL</b> e a chave <b>publishable</b> (ou a chave pública legada <code>anon</code>).</li>
          <li>Na configuração do projeto, crie as variáveis indicadas no arquivo <code>.env.example</code>.</li>
        </ol>
        <p class="notice">Nunca use uma chave <code>service_role</code> ou <code>secret</code> no navegador ou no Vercel como variável pública.</p>
      </section>
    </main>`;
} else {
  const supabase = createClient(url, key);
  let currentUser = null;
  let profile = null;

  function renderAuth(message = '') {
    app.innerHTML = `
      <main class="shell">
        <header class="brand"><span class="mark">F</span><div><h1>FORJAFIT</h1><p>BY FABIANO SANTOS</p></div></header>
        <section class="panel">
          <h2>Seu treino. Sua evolução.</h2>
          <p class="muted">Entre na sua conta ou crie seu acesso.</p>
          ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ''}
          <form id="login-form">
            <label>E-mail<input name="email" type="email" autocomplete="email" required /></label>
            <label>Senha<input name="password" type="password" autocomplete="current-password" minlength="6" required /></label>
            <div class="actions"><button type="submit">Entrar</button><button class="secondary" id="signup" type="button">Criar conta de aluno</button></div>
          </form>
          <p class="tiny">O cadastro comum cria uma conta de aluno pendente. A conta de treinador deve ser aprovada pelo administrador no banco.</p>
        </section>
      </main>`;
    document.querySelector('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const { error } = await supabase.auth.signInWithPassword({
        email: fd.get('email'), password: fd.get('password')
      });
      if (error) return renderAuth(error.message);
      await loadApp();
    });
    document.querySelector('#signup').addEventListener('click', async () => {
      const form = document.querySelector('#login-form');
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || password.length < 6) return renderAuth('Preencha o e-mail e uma senha com pelo menos 6 caracteres.');
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: '' } } });
      if (error) return renderAuth(error.message);
      renderAuth('Cadastro enviado. Se a confirmação de e-mail estiver ativa, confirme seu e-mail antes de entrar.');
    });
  }

  async function loadApp() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return renderAuth();
    currentUser = user;
    const { data, error } = await supabase.from('profiles')
      .select('id, full_name, role, approval_status')
      .eq('id', user.id).maybeSingle();
    if (error) return renderAuth('Não foi possível carregar o perfil. Confira as políticas RLS no Supabase.');
    profile = data;
    if (!profile) return renderAuth('Sua conta existe, mas não encontramos o perfil. Verifique o trigger de criação de perfis no Supabase.');
    await renderDashboard();
  }

  async function renderDashboard() {
    const trainer = profile.role === 'trainer' && profile.approval_status === 'approved';
    let workoutHtml = '<p class="muted">Nenhuma ficha para mostrar.</p>';
    const { data: workouts, error } = await supabase.from('workouts')
      .select('id, title, notes, is_active, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (!error && workouts?.length) {
      workoutHtml = workouts.map(w => `
        <article class="workout">
          <h3>${escapeHtml(w.title)}</h3>
          ${w.notes ? `<p>${escapeHtml(w.notes)}</p>` : ''}
          <span class="pill">${w.is_active ? 'Ativa' : 'Inativa'}</span>
        </article>`).join('');
    } else if (error) {
      workoutHtml = '<p class="muted">As fichas não puderam ser carregadas com as permissões atuais.</p>';
    }

    app.innerHTML = `
      <main class="shell">
        <header class="brand"><span class="mark">F</span><div><h1>FORJAFIT</h1><p>BY FABIANO SANTOS</p></div><button id="logout" class="secondary logout">Sair</button></header>
        <section class="panel">
          <p class="eyebrow">ÁREA DO USUÁRIO</p>
          <h2>Olá${profile.full_name ? ', ' + escapeHtml(profile.full_name) : ''}!</h2>
          <div class="profile-grid">
            <div><span>Função</span><b>${escapeHtml(profile.role)}</b></div>
            <div><span>Estado da conta</span><b>${escapeHtml(profile.approval_status)}</b></div>
          </div>
          ${profile.approval_status !== 'approved' ? '<p class="notice">Sua conta ainda não está aprovada. Peça ao treinador para verificar seu acesso.</p>' : ''}
          ${trainer ? '<p class="notice">Conta de treinador aprovada. Esta é uma versão inicial; ainda não inclui ferramentas para criar ou atribuir fichas.</p>' : ''}
        </section>
        <section class="panel"><h2>Minhas fichas de treino</h2>${workoutHtml}</section>
        <p class="tiny">Versão inicial do FORJAFIT. Teste com contas fictícias antes de usar dados reais de alunos.</p>
      </main>`;
    document.querySelector('#logout').addEventListener('click', async () => {
      await supabase.auth.signOut();
      currentUser = null; profile = null; renderAuth('Você saiu da conta.');
    });
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) { currentUser = null; profile = null; }
  });
  renderAuth();
  supabase.auth.getSession().then(({ data }) => { if (data.session) loadApp(); });
}
