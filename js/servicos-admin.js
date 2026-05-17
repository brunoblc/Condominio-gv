// ============================================
// PORTAL ADMIN — Gerenciamento de Serviços
// ============================================

// 📝 CONFIGURAÇÃO
// URL do Apps Script (funcionando direto!)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBjDR7aa1g0JKezEExhlzBSW5BrHGtrMy8R0FLUr3aTgfOZYHHhFJTzqTnSgTxhgEB/exec';

// Mock local para testes - funciona sem CORS
const USAR_MOCK_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const ADMIN_PASSWORD = 'admin2024'; // Mesma senha do Apps Script

let autenticado = false;
let servicosCache = [];
let servicoEmEdicao = null; // id do serviço sendo editado (null = modo criação)

// ============================================
// 🔐 AUTENTICAÇÃO
// ============================================

function fazerLogin(event) {
  event.preventDefault();
  const senha = document.getElementById('senhaAdmin').value;

  if (senha === ADMIN_PASSWORD) {
    autenticado = true;
    document.getElementById('telaSenha').style.display = 'none';
    document.getElementById('telaAdmin').style.display = 'block';
    carregarServicosAdmin();
    mostrarQRCode();
  } else {
    mostrarErro('Senha incorreta');
  }
}

function logout() {
  autenticado = false;
  document.getElementById('telaSenha').style.display = 'flex';
  document.getElementById('telaAdmin').style.display = 'none';
  document.getElementById('senhaAdmin').value = '';
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
      senha: ADMIN_PASSWORD,
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
    const payloadObj = { senha: ADMIN_PASSWORD, acao: 'excluir', id };

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
      // MOCK LOCAL
      data = carregarServicosLocal();
    } else {
      // API Real
      const response = await fetch(APPS_SCRIPT_URL);
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
  let urlMoradores;

  // Detectar se está em localhost ou GitHub Pages
  if (USAR_MOCK_LOCAL) {
    // Teste local
    urlMoradores = `http://${window.location.hostname}:${window.location.port}/servicos-moradores.html`;
  } else {
    // GitHub Pages
    urlMoradores = 'https://brunoblc.github.io/Condominio-gv/servicos-moradores.html';
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(urlMoradores)}&size=300x300`;

  const container = document.getElementById('qrContainer');
  container.innerHTML = `
    <div class="qr-box">
      <h3>QRCode para os Moradores</h3>
      <img src="${qrUrl}" alt="QRCode">
      <p class="qr-url">${urlMoradores}</p>
      <button onclick="copiarURL('${urlMoradores}')" class="btn-secundario">Copiar Link</button>
    </div>
  `;
}

function copiarURL(url) {
  navigator.clipboard.writeText(url).then(() => {
    mostrarSucesso('Link copiado!');
  });
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
    fotoDepois: dados.fotoDepois
  });

  localStorage.setItem('servicos-mock', JSON.stringify(servicos));

  return {
    sucesso: true,
    id: id,
    mensagem: 'Serviço cadastrado localmente (MOCK)'
  };
}

function carregarServicosLocal() {
  const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
  return {
    sucesso: true,
    servicos: servicos.reverse(),
    total: servicos.length
  };
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

  // Avisar se está em modo mock
  if (USAR_MOCK_LOCAL) {
    console.log('✅ Modo MOCK LOCAL ativado - Dados salvos em localStorage');
  }
});
