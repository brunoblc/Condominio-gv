// ============================================
// PORTAL ADMIN — Gerenciamento de Serviços
// ============================================

// 📝 CONFIGURAÇÃO
// URL do Apps Script (ativa quando hospedar em GitHub Pages)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBjDR7aa1g0JKezEExhlzBSW5BrHGtrMy8R0FLUr3aTgfOZYHHhFJTzqTnSgTxhgEB/exec';

// Mock local para testes - funciona sem CORS
const USAR_MOCK_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const ADMIN_PASSWORD = 'admin2024'; // Mesma senha do Apps Script

let autenticado = false;
let servicosCache = [];

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
  const valor = document.getElementById('valor').value;
  const descricao = document.getElementById('descricao').value;
  const fotoAntes = document.getElementById('fotoDataAntes').value;
  const fotoDepois = document.getElementById('fotoDataDepois').value;

  if (!titulo || !fotoAntes || !fotoDepois) {
    mostrarErro('Preencha pelo menos: título e ambas as fotos');
    return;
  }

  const btn = document.querySelector('#formularioServico button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    let resultado;

    if (USAR_MOCK_LOCAL) {
      // MOCK LOCAL para testes
      resultado = salvarServicoLocal({
        senha: ADMIN_PASSWORD,
        titulo,
        categoria,
        data,
        valor,
        descricao,
        fotoAntes,
        fotoDepois
      });
    } else {
      // API Real (GitHub Pages)
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        payload: JSON.stringify({
          senha: ADMIN_PASSWORD,
          titulo,
          categoria,
          data,
          valor,
          descricao,
          fotoAntes,
          fotoDepois
        })
      });
      resultado = await response.json();
    }

    if (resultado.sucesso) {
      mostrarSucesso('Serviço cadastrado com sucesso! ID: ' + resultado.id);
      document.getElementById('formularioServico').reset();
      document.getElementById('previewAntes').innerHTML = '';
      document.getElementById('previewDepois').innerHTML = '';
      carregarServicosAdmin();
    } else {
      mostrarErro(resultado.erro || 'Erro ao cadastrar serviço');
    }
  } catch (erro) {
    mostrarErro('Erro na comunicação: ' + erro.message);
  }

  btn.disabled = false;
  btn.textContent = 'Cadastrar Serviço →';
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
    card.innerHTML = `
      <div class="card-header">
        <h3>${servico.titulo}</h3>
        <span class="badge-categoria">${servico.categoria}</span>
      </div>
      <div class="card-info">
        <p><strong>Data:</strong> ${servico.data}</p>
        <p><strong>Valor:</strong> ${servico.valor}</p>
        <p><strong>Status:</strong> ${servico.status}</p>
      </div>
      ${servico.descricao ? `<p class="descricao">${servico.descricao}</p>` : ''}
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
    // GitHub Pages (você atualiza quando fizer deploy)
    urlMoradores = 'https://seuusername.github.io/condominio-gv-servicos/servicos-moradores.html'; // 📝 MUDE ISSO! Coloque sua URL real do GitHub Pages
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
    valor: dados.valor,
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
