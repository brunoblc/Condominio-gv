// ============================================
// PORTAL MORADORES — Acompanhamento de Serviços
// ============================================

// 📝 CONFIGURAÇÃO
// URL do Apps Script com CORS proxy
const APPS_SCRIPT_URL = 'https://cors-anywhere.herokuapp.com/https://script.google.com/macros/s/AKfycbxBjDR7aa1g0JKezEExhlzBSW5BrHGtrMy8R0FLUr3aTgfOZYHHhFJTzqTnSgTxhgEB/exec';

// Mock local para testes - funciona sem CORS
const USAR_MOCK_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const CACHE_DURATION = 3600000; // 1 hora em ms
const AUTO_REFRESH_INTERVAL = 3600000; // 1 hora

let servicosGlobal = [];

// ============================================
// 📥 CARREGAR SERVIÇOS
// ============================================

async function carregarServicos() {
  const cache = localStorage.getItem('servicos-cache');
  const cacheTime = localStorage.getItem('servicos-cache-time');
  const agora = Date.now();

  // Se houver cache válido, usar
  if (cache && cacheTime && (agora - parseInt(cacheTime)) < CACHE_DURATION) {
    servicosGlobal = JSON.parse(cache);
    renderizarServicos();
    return;
  }

  // Caso contrário, buscar do servidor
  try {
    mostrarCarregando();
    let data;

    if (USAR_MOCK_LOCAL) {
      // MOCK LOCAL - ler do localStorage
      const servicos = JSON.parse(localStorage.getItem('servicos-mock') || '[]');
      data = {
        sucesso: true,
        servicos: servicos.reverse(),
        total: servicos.length
      };
    } else {
      // API Real
      const response = await fetch(APPS_SCRIPT_URL);
      data = await response.json();
    }

    if (data.sucesso && data.servicos) {
      servicosGlobal = data.servicos;
      // Salvar no cache
      localStorage.setItem('servicos-cache', JSON.stringify(servicosGlobal));
      localStorage.setItem('servicos-cache-time', agora.toString());
      renderizarServicos();
      mostrarAtualizacao();
    } else {
      mostrarErro('Erro ao carregar serviços');
    }
  } catch (erro) {
    console.error('Erro ao carregar serviços:', erro);
    // Se houver cache expirado, usar mesmo assim
    if (cache) {
      servicosGlobal = JSON.parse(cache);
      renderizarServicos();
      mostrarErro('Usando dados em cache (conexão offline)');
    } else {
      mostrarErro('Não foi possível carregar os serviços');
    }
  }
}

// ============================================
// 🎨 RENDERIZAR CARDS
// ============================================

function renderizarServicos() {
  const container = document.getElementById('containerServicos');
  container.innerHTML = '';

  if (servicosGlobal.length === 0) {
    container.innerHTML = '<p class="aviso">Nenhum serviço realizado ainda</p>';
    return;
  }

  servicosGlobal.forEach((servico, index) => {
    const card = document.createElement('div');
    card.className = 'card-servico';

    // Badge da categoria com cor
    const corCategoria = obterCorCategoria(servico.categoria);

    card.innerHTML = `
      <div class="card-header">
        <div class="header-info">
          <h2 class="titulo-servico">${servico.titulo}</h2>
          <span class="badge" style="background: ${corCategoria};">${servico.categoria}</span>
        </div>
        <div class="meta-rapida">
          <div class="meta-item">
            <span class="meta-label">Data</span>
            <span class="meta-valor">${servico.data}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Valor</span>
            <span class="meta-valor">${servico.valor}</span>
          </div>
        </div>
      </div>

      ${servico.descricao ? `<div class="descricao-servico">${servico.descricao}</div>` : ''}

      <div class="fotos-container" id="fotos-${index}">
        ${renderizarFotos(servico, index)}
      </div>

      <div class="card-footer">
        <span class="status-badge status-${servico.status.toLowerCase()}">${servico.status}</span>
      </div>
    `;

    container.appendChild(card);

    // Configurar toggle antes/depois se houver fotos
    if (servico.fotoAntes && servico.fotoDepois) {
      const toggleBtn = document.getElementById(`toggle-${index}`);
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => toggleFoto(index));
      }
    }
  });
}

function renderizarFotos(servico, index) {
  const temAntes = servico.fotoAntes && servico.fotoAntes.length > 0;
  const temDepois = servico.fotoDepois && servico.fotoDepois.length > 0;

  if (!temAntes && !temDepois) {
    return '<p class="aviso">Sem fotos</p>';
  }

  if (temAntes && temDepois) {
    return `
      <div class="slider-foto">
        <div class="slider-img">
          <img id="img-antes-${index}" src="${servico.fotoAntes}" alt="Foto Antes" class="img-ativa">
          <img id="img-depois-${index}" src="${servico.fotoDepois}" alt="Foto Depois" class="img-inativa">
        </div>
        <button id="toggle-${index}" class="toggle-btn">
          <span class="toggle-label">Antes/Depois</span>
        </button>
      </div>
    `;
  }

  if (temAntes) {
    return `<div class="foto-box"><img src="${servico.fotoAntes}" alt="Foto Antes"></div>`;
  }

  return `<div class="foto-box"><img src="${servico.fotoDepois}" alt="Foto Depois"></div>`;
}

function toggleFoto(index) {
  const imgAntes = document.getElementById(`img-antes-${index}`);
  const imgDepois = document.getElementById(`img-depois-${index}`);

  imgAntes.classList.toggle('img-ativa');
  imgAntes.classList.toggle('img-inativa');
  imgDepois.classList.toggle('img-ativa');
  imgDepois.classList.toggle('img-inativa');
}

// ============================================
// 🎨 CORES DAS CATEGORIAS
// ============================================

function obterCorCategoria(categoria) {
  const cores = {
    'Pintura': '#ff6b6b',
    'Elétrica': '#ffd93d',
    'Hidráulica': '#6bcf7f',
    'Limpeza': '#4d96ff',
    'Manutenção': '#a78bfa',
    'Outros': '#8b7d6b'
  };
  return cores[categoria] || cores['Outros'];
}

// ============================================
// 💬 NOTIFICAÇÕES E ESTADOS
// ============================================

function mostrarCarregando() {
  const container = document.getElementById('containerServicos');
  container.innerHTML = `
    <div class="skeleton-loader">
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
    </div>
  `;
}

function mostrarErro(mensagem) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = '⚠️ ' + mensagem;
    toast.className = 'toast toast-aviso show';
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
}

function mostrarAtualizacao() {
  const agora = new Date();
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const footer = document.getElementById('footerAtualizacao');
  if (footer) {
    footer.textContent = `✅ Atualizado em ${hora}`;
  }
}

// ============================================
// 🔄 AUTO-REFRESH
// ============================================

function iniciarAutoRefresh() {
  carregarServicos(); // Carregar na primeira vez
  setInterval(carregarServicos, AUTO_REFRESH_INTERVAL);
}

// ============================================
// 🚀 INICIALIZAR
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  iniciarAutoRefresh();
});
