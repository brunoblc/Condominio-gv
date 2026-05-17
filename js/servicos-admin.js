// ============================================
// PORTAL ADMIN — Gerenciamento de Serviços
// ============================================

// 📝 CONFIGURAÇÃO
// URL do Apps Script (funcionando direto!)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBjDR7aa1g0JKezEExhlzBSW5BrHGtrMy8R0FLUr3aTgfOZYHHhFJTzqTnSgTxhgEB/exec';

// Mock local para testes - funciona sem CORS
const USAR_MOCK_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const ADMIN_PASSWORD = 'admin2024'; // Mesma senha do Apps Script

// Estado de sessão
let sessao = {
  autenticado: false,
  escopo: null,       // 'admin' | 'cond'
  slug: null,         // slug do cond ativo (quando escopo === 'cond' OU admin escolheu um)
  nomeCond: null,     // nome amigável do cond ativo
  senha: null         // senha em uso (admin ou utilizador) — necessária pra calls subsequentes
};
let servicosCache = [];
let condominiosCache = [];
let servicoEmEdicao = null; // id do serviço sendo editado (null = modo criação)

// Slug solicitado pela URL (?cond=xxx — 'c' é reservado pelo Apps Script)
const slugUrl = new URLSearchParams(window.location.search).get('cond')
             || new URLSearchParams(window.location.search).get('c'); // compat com links antigos

// ============================================
// 🔐 AUTENTICAÇÃO
// ============================================

async function fazerLogin(event) {
  event.preventDefault();
  const senha = document.getElementById('senhaAdmin').value;

  try {
    const resultado = await chamarLogin(senha, slugUrl);
    if (!resultado.sucesso) {
      mostrarErro(resultado.erro || 'Senha incorreta');
      return;
    }

    sessao.autenticado = true;
    sessao.escopo = resultado.escopo;
    sessao.senha = senha;

    document.getElementById('telaSenha').style.display = 'none';

    if (slugUrl) {
      // Modo cond (utilizador OU admin acessando link específico)
      sessao.slug = slugUrl;
      sessao.nomeCond = (resultado.cond && resultado.cond.nome) || slugUrl;
      entrarPainelCondominio(sessao.slug, sessao.nomeCond);
    } else {
      // Admin sem slug → lista de condomínios
      if (resultado.escopo !== 'admin') {
        mostrarErro('Acesso restrito ao administrador');
        return;
      }
      mostrarListaCondominios();
    }
  } catch (erro) {
    mostrarErro('Erro na comunicação: ' + erro.message);
  }
}

async function chamarLogin(senha, slug) {
  if (USAR_MOCK_LOCAL) return loginLocal(senha, slug);

  const payload = new URLSearchParams();
  payload.append('data', JSON.stringify({
    acao: 'login',
    senha: senha,
    condominioSlug: slug || undefined
  }));
  const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: payload });
  return await response.json();
}

function logout() {
  sessao = { autenticado: false, escopo: null, slug: null, nomeCond: null, senha: null };
  document.getElementById('telaSenha').style.display = 'flex';
  document.getElementById('telaCondominios').style.display = 'none';
  document.getElementById('telaAdmin').style.display = 'none';
  document.getElementById('senhaAdmin').value = '';
}

function voltarParaCondominios() {
  if (sessao.escopo !== 'admin') return; // só admin pode voltar
  sessao.slug = null;
  sessao.nomeCond = null;
  servicoEmEdicao = null;
  document.getElementById('telaAdmin').style.display = 'none';
  mostrarListaCondominios();
}

// ============================================
// 🏢 CONDOMÍNIOS (somente admin)
// ============================================

async function mostrarListaCondominios() {
  document.getElementById('telaCondominios').style.display = 'block';
  document.getElementById('telaAdmin').style.display = 'none';
  await carregarCondominios();
}

async function carregarCondominios() {
  try {
    let resultado;
    if (USAR_MOCK_LOCAL) {
      resultado = listarCondominiosLocal();
    } else {
      const payload = new URLSearchParams();
      payload.append('data', JSON.stringify({ acao: 'listarCondominios', senha: sessao.senha }));
      const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: payload });
      resultado = await response.json();
    }

    if (!resultado.sucesso) {
      mostrarErro(resultado.erro || 'Erro ao listar condomínios');
      return;
    }

    condominiosCache = resultado.condominios || [];
    renderizarCondominios(resultado.orfaos || 0);
  } catch (erro) {
    mostrarErro('Erro na comunicação: ' + erro.message);
  }
}

function renderizarCondominios(orfaos) {
  const container = document.getElementById('listaCondominios');

  if (condominiosCache.length === 0) {
    container.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px;">Nenhum condomínio cadastrado. Clique em "Adicionar Condomínio" pra começar.</p>';
    return;
  }

  container.innerHTML = '';
  const origem = window.location.origin + window.location.pathname.replace(/[^/]+$/, '');
  condominiosCache.forEach(cond => {
    const urlUtilizador = `${origem}servicos-admin.html?cond=${cond.slug}`;
    const urlMoradores = `${origem}servicos-moradores.html?cond=${cond.slug}`;
    const slugEsc = String(cond.slug).replace(/'/g, "\\'");
    const nomeEsc = String(cond.nome).replace(/'/g, "\\'");

    const card = document.createElement('div');
    card.className = 'cond-card';
    card.innerHTML = `
      <div class="cond-card-header">
        <div>
          <h3>${escapeHtml(cond.nome)}</h3>
          <div class="cond-slug">${escapeHtml(cond.slug)}</div>
        </div>
      </div>
      <div class="cond-urls">
        <div><strong>Utilizador:</strong> <span title="${urlUtilizador}">${urlUtilizador}</span></div>
        <div><strong>Moradores (QR):</strong> <span title="${urlMoradores}">${urlMoradores}</span></div>
        <div><strong>Senha utilizador:</strong> <code>${escapeHtml(cond.senhaUtilizador || '')}</code></div>
      </div>
      <div class="cond-acoes">
        <button onclick="entrarComoAdmin('${slugEsc}', '${nomeEsc}')">🔧 Gerenciar</button>
        <button onclick="copiarTexto('${urlUtilizador.replace(/'/g, "\\'")}','Link utilizador copiado')">📋 Link utilizador</button>
        <button onclick="copiarTexto('${urlMoradores.replace(/'/g, "\\'")}','Link moradores copiado')">📋 Link moradores</button>
        <button class="btn-excluir-cond" onclick="confirmarExclusaoCond('${slugEsc}','${nomeEsc}')">🗑️ Excluir</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function abrirFormAdicionarCond() {
  document.getElementById('formAdicionarCondWrap').style.display = 'block';
  document.getElementById('condNome').value = '';
  document.getElementById('condSlug').value = '';
  document.getElementById('condSenha').value = '';
  document.getElementById('condNome').focus();
}

function cancelarFormCond() {
  document.getElementById('formAdicionarCondWrap').style.display = 'none';
}

function atualizarSlugAuto() {
  const nome = document.getElementById('condNome').value;
  document.getElementById('condSlug').value = slugify(nome);
}

function slugify(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
}

async function adicionarCondominio(event) {
  event.preventDefault();
  const nome = document.getElementById('condNome').value.trim();
  const slug = document.getElementById('condSlug').value.trim();
  const senhaUtilizador = document.getElementById('condSenha').value;

  if (!nome || !slug || !senhaUtilizador) {
    mostrarErro('Preencha nome, identificador e senha');
    return;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    mostrarErro('Identificador inválido (só a-z, 0-9 e -)');
    return;
  }

  try {
    const payloadObj = {
      acao: 'criarCondominio',
      senha: sessao.senha,
      nome, slug, senhaUtilizador
    };
    let resultado;
    if (USAR_MOCK_LOCAL) {
      resultado = criarCondominioLocal(payloadObj);
    } else {
      const payload = new URLSearchParams();
      payload.append('data', JSON.stringify(payloadObj));
      const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: payload });
      resultado = await response.json();
    }

    if (!resultado.sucesso) {
      mostrarErro(resultado.erro || 'Erro ao criar');
      return;
    }
    mostrarSucesso('Condomínio criado!');
    cancelarFormCond();
    carregarCondominios();
  } catch (erro) {
    mostrarErro('Erro na comunicação: ' + erro.message);
  }
}

async function confirmarExclusaoCond(slug, nome) {
  if (!confirm(`Excluir "${nome}"?\n\nIsso apaga TODOS os serviços, fotos e o utilizador desse condomínio. Não dá pra desfazer.`)) return;

  try {
    const payloadObj = { acao: 'excluirCondominio', senha: sessao.senha, slug };
    let resultado;
    if (USAR_MOCK_LOCAL) {
      resultado = excluirCondominioLocal(payloadObj);
    } else {
      const payload = new URLSearchParams();
      payload.append('data', JSON.stringify(payloadObj));
      const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: payload });
      resultado = await response.json();
    }
    if (!resultado.sucesso) {
      mostrarErro(resultado.erro || 'Erro ao excluir');
      return;
    }
    mostrarSucesso('Condomínio excluído');
    carregarCondominios();
  } catch (erro) {
    mostrarErro('Erro na comunicação: ' + erro.message);
  }
}

function entrarComoAdmin(slug, nome) {
  sessao.slug = slug;
  sessao.nomeCond = nome;
  entrarPainelCondominio(slug, nome);
}

function entrarPainelCondominio(slug, nome) {
  document.getElementById('telaCondominios').style.display = 'none';
  document.getElementById('telaAdmin').style.display = 'block';
  document.getElementById('btnVoltarConds').style.display = sessao.escopo === 'admin' ? 'inline-block' : 'none';

  const contexto = document.getElementById('condContexto');
  contexto.style.display = 'block';
  contexto.innerHTML = `Gerenciando: <strong>${escapeHtml(nome)}</strong> <span style="color: var(--muted); font-family: monospace; font-size: 12px;">(${escapeHtml(slug)})</span>`;

  // Limpa qualquer estado de edição/preview de cond anterior
  cancelarEdicao();
  servicosCache = [];

  carregarServicosAdmin();
  mostrarQRCode();
}

function copiarTexto(texto, msgSucesso) {
  navigator.clipboard.writeText(texto).then(() => {
    mostrarSucesso(msgSucesso || 'Copiado!');
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================
// 📸 UPLOAD DE FOTOS
// ============================================

function handleFotoChange(event, tipo) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    const preview = document.getElementById(`preview${tipo}`);
    const img = document.createElement('img');
    img.src = base64;
    preview.innerHTML = '';
    preview.appendChild(img);
    document.getElementById(`fotoData${tipo}`).value = base64;
  };
  reader.readAsDataURL(file);
}

// ============================================
// 📤 ENVIAR SERVIÇO
// ============================================

async function enviarServico(event) {
  event.preventDefault();

  const titulo = document.getElementById('titulo').value;
  const categoria = document.getElementById('categoria').value;
  const data = document.getElementById('data').value;
  const descricao = document.getElementById('descricao').value;
  const fotoAntes = document.getElementById('fotoDataAntes').value;
  const fotoDepois = document.getElementById('fotoDataDepois').value;

  const editando = !!servicoEmEdicao;

  if (!titulo) {
    mostrarErro('Preencha o título');
    return;
  }
  if (!editando && (!fotoAntes || !fotoDepois)) {
    mostrarErro('Selecione as fotos Antes e Depois');
    return;
  }

  const btn = document.getElementById('btnEnviar');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = editando ? 'Atualizando...' : 'Enviando...';

  try {
    let resultado;

    const payloadObj = {
      senha: sessao.senha,
      condominioSlug: sessao.slug,
      titulo,
      categoria,
      data,
      descricao,
      fotoAntes,
      fotoDepois
    };
    if (editando) {
      payloadObj.acao = 'editar';
      payloadObj.id = servicoEmEdicao;
    }

    if (USAR_MOCK_LOCAL) {
      resultado = editando ? editarServicoLocal(payloadObj) : salvarServicoLocal(payloadObj);
    } else {
      const payload = new URLSearchParams();
      payload.append('data', JSON.stringify(payloadObj));
      const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: payload });
      resultado = await response.json();
    }

    if (resultado.sucesso) {
      mostrarSucesso(editando ? 'Serviço atualizado!' : 'Serviço cadastrado! ID: ' + resultado.id);
      cancelarEdicao();
      carregarServicosAdmin();
    } else {
      mostrarErro(resultado.erro || 'Erro ao salvar serviço');
    }
  } catch (erro) {
    mostrarErro('Erro na comunicação: ' + erro.message);
  }

  btn.disabled = false;
  btn.textContent = textoOriginal;
}

// ============================================
// ✏️ EDITAR SERVIÇO
// ============================================

function iniciarEdicao(id) {
  const servico = servicosCache.find(s => s.id === id);
  if (!servico) {
    mostrarErro('Serviço não encontrado');
    return;
  }

  servicoEmEdicao = id;

  document.getElementById('titulo').value = servico.titulo || '';
  document.getElementById('categoria').value = servico.categoria || '';
  document.getElementById('descricao').value = servico.descricao || '';

  // converter data dd/MM/yyyy → yyyy-MM-dd pro <input type="date">
  const dataInput = document.getElementById('data');
  const m = String(servico.data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    dataInput.value = `${m[3]}-${m[2]}-${m[1]}`;
  } else {
    dataInput.value = '';
  }

  // mostrar fotos atuais no preview, manter hidden vazio (= não alterar)
  const previewAntes = document.getElementById('previewAntes');
  const previewDepois = document.getElementById('previewDepois');
  previewAntes.innerHTML = servico.fotoAntes ? `<img src="${servico.fotoAntes}" alt="Foto antes atual">` : '';
  previewDepois.innerHTML = servico.fotoDepois ? `<img src="${servico.fotoDepois}" alt="Foto depois atual">` : '';
  document.getElementById('fotoDataAntes').value = '';
  document.getElementById('fotoDataDepois').value = '';

  document.getElementById('formTitulo').textContent = '✏️ Editando Serviço';
  const banner = document.getElementById('bannerEdicao');
  banner.style.display = 'block';
  banner.textContent = `Editando: ${servico.titulo}. Selecione novas fotos só se quiser substituir as atuais.`;
  document.getElementById('btnEnviar').textContent = 'Atualizar Serviço';
  document.getElementById('btnCancelarEdicao').style.display = 'inline-block';

  document.getElementById('formularioServico').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicao() {
  servicoEmEdicao = null;
  document.getElementById('formularioServico').reset();
  document.getElementById('previewAntes').innerHTML = '';
  document.getElementById('previewDepois').innerHTML = '';
  document.getElementById('fotoDataAntes').value = '';
  document.getElementById('fotoDataDepois').value = '';

  // restaurar data pra hoje (igual ao boot)
  document.getElementById('data').value = new Date().toISOString().split('T')[0];

  document.getElementById('formTitulo').textContent = '📋 Novo Serviço';
  document.getElementById('bannerEdicao').style.display = 'none';
  document.getElementById('btnEnviar').textContent = 'Cadastrar Serviço →';
  document.getElementById('btnCancelarEdicao').style.display = 'none';
}

// ============================================
// 🗑️ EXCLUIR SERVIÇO
// ============================================

async function excluirServico(id) {
  const servico = servicosCache.find(s => s.id === id);
  const nome = servico ? servico.titulo : id;
  if (!confirm(`Excluir "${nome}"?\n\nIsso remove o serviço e as fotos do Drive. Não dá pra desfazer.`)) {
    return;
  }

  try {
    let resultado;
    const payloadObj = { senha: sessao.senha, condominioSlug: sessao.slug, acao: 'excluir', id };

    if (USAR_MOCK_LOCAL) {
      resultado = excluirServicoLocal(payloadObj);
    } else {
      const payload = new URLSearchParams();
      payload.append('data', JSON.stringify(payloadObj));
      const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: payload });
      resultado = await response.json();
    }

    if (resultado.sucesso) {
      mostrarSucesso('Serviço excluído');
      if (servicoEmEdicao === id) cancelarEdicao();
      carregarServicosAdmin();
    } else {
      mostrarErro(resultado.erro || 'Erro ao excluir');
    }
  } catch (erro) {
    mostrarErro('Erro na comunicação: ' + erro.message);
  }
}

// ============================================
// 📋 CARREGAR LISTA DE SERVIÇOS
// ============================================

async function carregarServicosAdmin() {
  try {
    let data;

    if (USAR_MOCK_LOCAL) {
      data = carregarServicosLocal(sessao.slug);
    } else {
      const url = sessao.slug ? `${APPS_SCRIPT_URL}?cond=${encodeURIComponent(sessao.slug)}` : APPS_SCRIPT_URL;
      const response = await fetch(url);
      data = await response.json();
    }

    if (data.sucesso && data.servicos) {
      servicosCache = data.servicos;
      renderizarListaAdmin();
    }
  } catch (erro) {
    console.error('Erro ao carregar serviços:', erro);
  }
}

function renderizarListaAdmin() {
  const container = document.getElementById('listaServicosAdmin');
  container.innerHTML = '';

  if (servicosCache.length === 0) {
    container.innerHTML = '<p style="color: var(--muted); text-align: center;">Nenhum serviço cadastrado ainda</p>';
    return;
  }

  servicosCache.slice(0, 5).forEach(servico => {
    const card = document.createElement('div');
    card.className = 'card-servico-admin';
    const idEscapado = String(servico.id).replace(/'/g, "\\'");
    card.innerHTML = `
      <div class="card-header">
        <h3>${servico.titulo}</h3>
        <span class="badge-categoria">${servico.categoria}</span>
      </div>
      <div class="card-info">
        <p><strong>Data:</strong> ${servico.data}</p>
        <p><strong>Status:</strong> ${servico.status}</p>
      </div>
      ${servico.descricao ? `<p class="descricao">${servico.descricao}</p>` : ''}
      <div class="card-acoes">
        <button type="button" class="btn-acao" onclick="iniciarEdicao('${idEscapado}')">✏️ Editar</button>
        <button type="button" class="btn-acao btn-excluir" onclick="excluirServico('${idEscapado}')">🗑️ Excluir</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ============================================
// 🔗 QRCODE
// ============================================

function mostrarQRCode() {
  let baseUrl;
  if (USAR_MOCK_LOCAL) {
    baseUrl = `http://${window.location.hostname}:${window.location.port}/servicos-moradores.html`;
  } else {
    baseUrl = 'https://brunoblc.github.io/Condominio-gv/servicos-moradores.html';
  }

  const urlMoradores = sessao.slug ? `${baseUrl}?cond=${encodeURIComponent(sessao.slug)}` : baseUrl;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(urlMoradores)}&size=300x300`;
  const u = urlMoradores.replace(/'/g, "\\'");

  const container = document.getElementById('qrContainer');
  container.innerHTML = `
    <div class="qr-box">
      <h3>QRCode para os Moradores</h3>
      <img src="${qrUrl}" alt="QRCode">
      <p class="qr-url">${urlMoradores}</p>
      <div class="qr-acoes">
        <button onclick="copiarURL('${u}')" class="btn-qr">🔗 Copiar Link</button>
        <button onclick="baixarQRCode('${u}')" class="btn-qr">⬇️ Baixar</button>
        <button onclick="compartilharQRCode('${u}')" class="btn-qr">💬 WhatsApp</button>
        <button onclick="imprimirQRCode('${u}')" class="btn-qr">🖨️ Imprimir</button>
      </div>
    </div>
  `;
}

function copiarURL(url) {
  navigator.clipboard.writeText(url).then(() => {
    mostrarSucesso('Link copiado!');
  });
}

function urlQRGrande(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=600x600&margin=20`;
}

async function baixarQRCode(url) {
  try {
    const response = await fetch(urlQRGrande(url));
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'qrcode-servicos-gv.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    mostrarSucesso('QRCode baixado!');
  } catch (erro) {
    mostrarErro('Erro ao baixar: ' + erro.message);
  }
}

async function compartilharQRCode(url) {
  const mensagem = `Acompanhe os serviços do condomínio:\n${url}`;
  try {
    if (navigator.share && navigator.canShare) {
      const response = await fetch(urlQRGrande(url));
      const blob = await response.blob();
      const arquivo = new File([blob], 'qrcode-servicos-gv.png', { type: 'image/png' });
      if (navigator.canShare({ files: [arquivo] })) {
        await navigator.share({
          files: [arquivo],
          title: 'QRCode Serviços GV',
          text: mensagem
        });
        return;
      }
    }
  } catch (erro) {
    if (erro.name === 'AbortError') return; // usuário cancelou
  }
  // Fallback: abre WhatsApp Web só com o link
  window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank');
}

function imprimirQRCode(url) {
  const janela = window.open('', '_blank', 'width=600,height=800');
  if (!janela) {
    mostrarErro('Bloqueador de popup impediu a impressão');
    return;
  }
  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>QRCode Serviços GV</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px 20px; color: #111; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .subtitulo { font-size: 14px; color: #555; margin: 0 0 28px; }
          img { width: 420px; height: 420px; max-width: 90vw; max-height: 60vh; }
          .url { font-size: 11px; color: #333; word-break: break-all; margin-top: 18px; }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <h1>Acompanhe os Serviços</h1>
        <p class="subtitulo">GV Gestão Predial · Aponte a câmera do celular</p>
        <img src="${urlQRGrande(url)}" alt="QRCode">
        <p class="url">${url}</p>
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
      </body>
    </html>
  `);
  janela.document.close();
}

// ============================================
// 🎨 NOTIFICAÇÕES
// ============================================

function mostrarErro(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = '❌ ' + mensagem;
  toast.className = 'toast toast-erro show';
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function mostrarSucesso(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = '✅ ' + mensagem;
  toast.className = 'toast toast-sucesso show';
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// 🧪 MOCK LOCAL (localStorage) - Testes sem CORS
// ============================================

function salvarServicoLocal(dados) {
  const id = 'SRV-' + Date.now();
  const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');

  servicos.push({
    id,
    data: dados.data,
    titulo: dados.titulo,
    descricao: dados.descricao,
    categoria: dados.categoria,
    status: 'Concluído',
    fotoAntes: dados.fotoAntes,
    fotoDepois: dados.fotoDepois,
    condominioSlug: dados.condominioSlug || ''
  });

  localStorage.setItem('servicos-mock', JSON.stringify(servicos));

  return {
    sucesso: true,
    id: id,
    mensagem: 'Serviço cadastrado localmente (MOCK)'
  };
}

function carregarServicosLocal(slug) {
  const todos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
  const conds = JSON.parse(localStorage.getItem('condominios-mock') || '[]');

  // Fallback: nenhum slug + apenas 1 cond → usa esse
  let slugFiltro = slug;
  if (!slugFiltro && conds.length === 1) slugFiltro = conds[0].slug;

  const filtrados = slugFiltro
    ? todos.filter(s => s.condominioSlug === slugFiltro)
    : todos;

  return {
    sucesso: true,
    servicos: filtrados.slice().reverse(),
    total: filtrados.length
  };
}

// ============================================
// 🏢 MOCK — CONDOMÍNIOS E LOGIN
// ============================================

function loginLocal(senha, slug) {
  if (senha === ADMIN_PASSWORD) {
    if (slug) {
      const cond = (JSON.parse(localStorage.getItem('condominios-mock') || '[]')).find(c => c.slug === slug);
      return { sucesso: true, escopo: 'admin', slug, cond };
    }
    return { sucesso: true, escopo: 'admin' };
  }
  if (slug) {
    const conds = JSON.parse(localStorage.getItem('condominios-mock') || '[]');
    const cond = conds.find(c => c.slug === slug && c.senhaUtilizador === senha);
    if (cond) return { sucesso: true, escopo: 'cond', slug, cond };
  }
  return { sucesso: false, erro: 'Senha incorreta' };
}

function listarCondominiosLocal() {
  const conds = JSON.parse(localStorage.getItem('condominios-mock') || '[]');
  const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
  const orfaos = servicos.filter(s => !s.condominioSlug).length;
  return { sucesso: true, condominios: conds, orfaos };
}

function criarCondominioLocal(dados) {
  const conds = JSON.parse(localStorage.getItem('condominios-mock') || '[]');
  if (conds.some(c => c.slug === dados.slug)) {
    return { sucesso: false, erro: 'Já existe condomínio com esse slug' };
  }
  const cond = {
    id: 'COND-' + Date.now(),
    slug: dados.slug,
    nome: dados.nome,
    senhaUtilizador: dados.senhaUtilizador,
    folderID: 'mock-folder-' + dados.slug,
    dataCriacao: new Date().toISOString()
  };
  conds.push(cond);
  localStorage.setItem('condominios-mock', JSON.stringify(conds));

  let migrados = 0;
  if (dados.migrarOrfaos) {
    const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
    servicos.forEach(s => {
      if (!s.condominioSlug) { s.condominioSlug = dados.slug; migrados++; }
    });
    localStorage.setItem('servicos-mock', JSON.stringify(servicos));
  }
  return { sucesso: true, id: cond.id, slug: cond.slug, migrados };
}

function excluirCondominioLocal(dados) {
  const conds = JSON.parse(localStorage.getItem('condominios-mock') || '[]');
  const novos = conds.filter(c => c.slug !== dados.slug);
  if (novos.length === conds.length) return { sucesso: false, erro: 'Condomínio não encontrado' };

  const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
  const servicosRestantes = servicos.filter(s => s.condominioSlug !== dados.slug);
  localStorage.setItem('servicos-mock', JSON.stringify(servicosRestantes));
  localStorage.setItem('condominios-mock', JSON.stringify(novos));
  return { sucesso: true, slug: dados.slug };
}

function editarServicoLocal(dados) {
  const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
  const i = servicos.findIndex(s => s.id === dados.id);
  if (i === -1) return { sucesso: false, erro: 'Serviço não encontrado' };

  servicos[i].titulo = dados.titulo;
  servicos[i].categoria = dados.categoria;
  servicos[i].data = dados.data;
  servicos[i].descricao = dados.descricao;
  if (dados.fotoAntes && String(dados.fotoAntes).startsWith('data:')) {
    servicos[i].fotoAntes = dados.fotoAntes;
  }
  if (dados.fotoDepois && String(dados.fotoDepois).startsWith('data:')) {
    servicos[i].fotoDepois = dados.fotoDepois;
  }

  localStorage.setItem('servicos-mock', JSON.stringify(servicos));
  return { sucesso: true, id: dados.id, mensagem: 'Serviço atualizado (MOCK)' };
}

function excluirServicoLocal(dados) {
  const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
  const novos = servicos.filter(s => s.id !== dados.id);
  if (novos.length === servicos.length) return { sucesso: false, erro: 'Serviço não encontrado' };

  localStorage.setItem('servicos-mock', JSON.stringify(novos));
  return { sucesso: true, id: dados.id, mensagem: 'Serviço excluído (MOCK)' };
}

// ============================================
// 🚀 INICIALIZAR
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Data padrão = hoje
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('data').value = hoje;

  // Subtítulo do login muda se a URL aponta pra um cond específico
  if (slugUrl) {
    const sub = document.getElementById('loginSubtitulo');
    if (sub) sub.textContent = `Acesso ao condomínio: ${slugUrl}`;
  }

  if (USAR_MOCK_LOCAL) {
    console.log('✅ Modo MOCK LOCAL ativado - Dados salvos em localStorage');
  }
});
