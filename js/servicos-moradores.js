// ============================================
// PORTAL MORADORES — Acompanhamento de Serviços
// ============================================

// 📝 CONFIGURAÇÃO
// URL do Apps Script (funcionando direto!)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBjDR7aa1g0JKezEExhlzBSW5BrHGtrMy8R0FLUr3aTgfOZYHHhFJTzqTnSgTxhgEB/exec';

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
      // API Real — GET simples, sem headers custom (evita preflight)
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

  const grupos = agruparPorMes(servicosGlobal);

  grupos.forEach((grupo, grupoIdx) => {
    const details = document.createElement('details');
    details.className = 'grupo-mes';
    if (grupoIdx === 0) details.open = true; // mais recente já aberto

    const plural = grupo.servicos.length === 1 ? 'serviço' : 'serviços';

    details.innerHTML = `
      <summary class="grupo-header">
        <div class="grupo-header-left">
          <span class="grupo-chevron">▶</span>
          <span class="grupo-label">${grupo.label}</span>
        </div>
        <span class="grupo-count">${grupo.servicos.length} ${plural}</span>
      </summary>
      <div class="grupo-servicos"></div>
    `;

    const innerContainer = details.querySelector('.grupo-servicos');

    grupo.servicos.forEach((servico) => {
      const index = servicosGlobal.indexOf(servico); // índice global pra toggle
      const corCategoria = obterCorCategoria(servico.categoria);

      const card = document.createElement('details');
      card.className = 'card-servico';
      card.innerHTML = `
        <summary class="card-header">
          <span class="card-chevron">▶</span>
          <div class="header-info">
            <h2 class="titulo-servico">${servico.titulo}</h2>
            <span class="badge" style="background: ${corCategoria};">${servico.categoria}</span>
          </div>
          <div class="meta-rapida">
            <div class="meta-item">
              <span class="meta-label">Data</span>
              <span class="meta-valor">${formatarData(servico.data)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Valor</span>
              <span class="meta-valor">${formatarValor(servico.valor)}</span>
            </div>
          </div>
        </summary>

        ${servico.descricao ? `<div class="descricao-servico">${servico.descricao}</div>` : ''}

        <div class="fotos-container" id="fotos-${index}">
          ${renderizarFotos(servico, index)}
        </div>

        <div class="card-footer">
          <span class="status-badge status-${servico.status.toLowerCase()}">${servico.status}</span>
        </div>
      `;

      innerContainer.appendChild(card);

      if (servico.fotoAntes && servico.fotoDepois) {
        const toggleBtn = card.querySelector(`#toggle-${index}`);
        if (toggleBtn) {
          toggleBtn.addEventListener('click', () => toggleFoto(index));
        }
      }
    });

    container.appendChild(details);
  });
}

// ============================================
// 📅 AGRUPAMENTO POR MÊS
// ============================================

function agruparPorMes(servicos) {
  const grupos = {};
  servicos.forEach((s) => {
    const d = parseData(s.data);
    const chave = d
      ? `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      : 'sem-data';
    if (!grupos[chave]) {
      grupos[chave] = {
        chave,
        data: d,
        label: d ? formatarLabelMes(d) : 'Sem data',
        servicos: []
      };
    }
    grupos[chave].servicos.push(s);
  });

  return Object.values(grupos).sort((a, b) => {
    if (!a.data) return 1;
    if (!b.data) return -1;
    return b.data - a.data;
  });
}

function parseData(valor) {
  if (!valor) return null;
  const str = String(valor);
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  return null;
}

function formatarLabelMes(d) {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function renderizarFotos(servico, index) {
  const urlAntes = transformarFotoUrl(servico.fotoAntes);
  const urlDepois = transformarFotoUrl(servico.fotoDepois);
  const temAntes = urlAntes && urlAntes.length > 0;
  const temDepois = urlDepois && urlDepois.length > 0;

  if (!temAntes && !temDepois) {
    return '<p class="aviso">Sem fotos</p>';
  }

  if (temAntes && temDepois) {
    return `
      <div class="slider-foto">
        <div class="slider-img">
          <img id="img-antes-${index}" src="${urlAntes}" alt="Foto Antes" class="img-ativa">
          <img id="img-depois-${index}" src="${urlDepois}" alt="Foto Depois" class="img-inativa">
        </div>
        <button id="toggle-${index}" class="toggle-btn">
          <span class="toggle-label">Antes/Depois</span>
        </button>
      </div>
    `;
  }

  if (temAntes) {
    return `<div class="foto-box"><img src="${urlAntes}" alt="Foto Antes"></div>`;
  }

  return `<div class="foto-box"><img src="${urlDepois}" alt="Foto Depois"></div>`;
}

function transformarFotoUrl(url) {
  if (!url) return '';
  const str = String(url);
  // Já é thumbnail (vindo do Apps Script novo) — passa direto
  if (str.includes('drive.google.com/thumbnail')) return str;
  // Extrai fileId do formato viewer (entries antigas)
  const match = str.match(/\/file\/d\/([^\/]+)|[?&]id=([^&]+)/);
  const fileId = match ? (match[1] || match[2]) : null;
  if (!fileId) return str;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
}

function formatarData(valor) {
  if (!valor) return '—';
  const str = String(valor);
  // ISO string (ex: 2026-05-11T03:00:00.000Z)
  if (/\d{4}-\d{2}-\d{2}T/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
  }
  return str;
}

function formatarValor(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const str = String(valor).trim();
  // Já vem formatado em R$
  if (str.includes('R$')) return str;
  // Tenta parsear: aceita "550", "550.00", "550,00", "1.200,50"
  const limpo = str.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const numero = Number(limpo);
  if (isNaN(numero)) return str;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
