// ============================================
// Teste estático + simulação do mock multi-condomínio
// Roda com: node teste_multicond.js
// ============================================

const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');

const ROOT = __dirname;

function ler(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let falhas = 0;
function pass(msg) { console.log('   ✓', msg); }
function fail(msg) { console.error('   ❌', msg); falhas++; }
function assert(cond, msg) { cond ? pass(msg) : fail(msg); }

// ---------- 1) IDs do JS existem no HTML ----------
function checkIds(jsRel, htmlRel, rotulo) {
  console.log(`\n[${rotulo}] checando IDs`);
  const js = ler(jsRel);
  const html = ler(htmlRel);
  const ids = new Set([...js.matchAll(/getElementById\(['"]([^'"]+)['"]/g)].map(m => m[1]));
  const htmlIds = new Set([...html.matchAll(/id=['"]([^'"]+)['"]/g)].map(m => m[1]));
  const faltam = [...ids].filter(id => !htmlIds.has(id));
  if (faltam.length) fail(`IDs ausentes no HTML: ${faltam.join(', ')}`);
  else pass(`Todos ${ids.size} IDs do JS existem no HTML`);
}

// ---------- 2) Funções chamadas no HTML existem no JS ----------
function checkFuncs(jsRel, htmlRel, rotulo) {
  console.log(`\n[${rotulo}] checando funções`);
  const js = ler(jsRel);
  const html = ler(htmlRel);
  const chamadas = new Set();
  for (const pat of [
    /onclick=['"]([a-zA-Z_]\w*)\(/g,
    /onsubmit=['"]([a-zA-Z_]\w*)\(/g,
    /oninput=['"]([a-zA-Z_]\w*)\(/g,
    /onchange=['"]([a-zA-Z_]\w*)\(/g,
  ]) {
    for (const m of html.matchAll(pat)) chamadas.add(m[1]);
  }
  const definidas = new Set();
  for (const m of js.matchAll(/(?:async\s+)?function\s+([a-zA-Z_]\w*)\s*\(/g)) definidas.add(m[1]);
  const faltam = [...chamadas].filter(f => !definidas.has(f));
  if (faltam.length) fail(`Funções ausentes no JS: ${faltam.join(', ')}`);
  else pass(`Todas ${chamadas.size} funções chamadas pelo HTML existem no JS`);
}

// ---------- 3) Sintaxe do Apps Script ----------
function checkAppsScriptSyntax() {
  console.log('\n[APPS-SCRIPT] sintaxe');
  try {
    new Function(ler('apps-script/Code.gs'));
    pass('Code.gs compila');
  } catch (e) {
    fail('Code.gs erro: ' + e.message);
  }
}

// ---------- 4) Simulação fim-a-fim do mock local ----------
function simularMock() {
  console.log('\n[SIMULAÇÃO MOCK]');

  // Shim de ambiente
  const store = {};
  global.localStorage = {
    getItem: k => k in store ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const stubEl = () => new Proxy({ value: '', textContent: '', innerHTML: '', style: {}, checked: false }, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string') return () => stubEl();
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
  global.window = { location: { hostname: 'localhost', port: '8080', pathname: '/servicos-admin.html', origin: 'http://localhost:8080', search: '' } };
  global.URLSearchParams = URLSearchParams;
  global.document = {
    addEventListener: () => {},
    getElementById: () => stubEl(),
    createElement: () => stubEl(),
    querySelector: () => null,
    querySelectorAll: () => []
  };
  global.navigator = { clipboard: { writeText: async () => {} } };
  global.fetch = () => Promise.reject(new Error('Não deve chamar fetch no mock'));

  // Carrega admin.js no contexto
  eval(ler('js/servicos-admin.js'));

  // 1) Login admin sem slug
  let r = loginLocal('admin2024', null);
  assert(r.sucesso && r.escopo === 'admin', 'Login admin sem slug → escopo=admin');

  // 2) Senha errada
  r = loginLocal('errada', null);
  assert(!r.sucesso, 'Senha errada → falha');

  // 3) Lista vazia
  r = listarCondominiosLocal();
  assert(r.sucesso && r.condominios.length === 0 && r.orfaos === 0, 'Lista vazia, 0 órfãos');

  // 4) Plantar órfãos (legado pré-multicond)
  localStorage.setItem('servicos-mock', JSON.stringify([
    { id: 'SRV-OLD-1', titulo: 'Pintura antiga', categoria: 'Pintura', data: '01/01/2026', status: 'Concluído', fotoAntes: 'data:a', fotoDepois: 'data:b' },
    { id: 'SRV-OLD-2', titulo: 'Reparo antigo', categoria: 'Reparos', data: '02/01/2026', status: 'Concluído', fotoAntes: 'data:c', fotoDepois: 'data:d' }
  ]));
  r = listarCondominiosLocal();
  assert(r.orfaos === 2, 'Detectou 2 órfãos');

  // 5) Criar cond + migrar
  r = criarCondominioLocal({ nome: 'GV Principal', slug: 'gv-principal', senhaUtilizador: 'zelador123', migrarOrfaos: true });
  assert(r.sucesso && r.migrados === 2, 'Cond criado + 2 migrados');

  // 6) Pós-migração
  r = listarCondominiosLocal();
  assert(r.condominios.length === 1 && r.orfaos === 0, 'Lista=1, órfãos=0 após migrar');

  // 7) Slug duplicado bloqueado
  r = criarCondominioLocal({ nome: 'Dup', slug: 'gv-principal', senhaUtilizador: 'x' });
  assert(!r.sucesso, 'Slug duplicado rejeitado');

  // 8) Segundo cond
  r = criarCondominioLocal({ nome: 'Edifício Flores', slug: 'ed-flores', senhaUtilizador: 'flores2024' });
  assert(r.sucesso, 'Segundo cond criado');

  // 9) Login utilizador correto
  r = loginLocal('flores2024', 'ed-flores');
  assert(r.sucesso && r.escopo === 'cond' && r.slug === 'ed-flores', 'Utilizador flores → escopo=cond, slug correto');

  // 10) Senha de outro cond bloqueada
  r = loginLocal('zelador123', 'ed-flores');
  assert(!r.sucesso, 'Senha do gv-principal NÃO funciona em ed-flores');

  // 11) Admin via slug = override
  r = loginLocal('admin2024', 'ed-flores');
  assert(r.sucesso && r.escopo === 'admin' && r.cond && r.cond.nome === 'Edifício Flores', 'Admin com slug → escopo=admin + dados do cond');

  // 12) Criar serviço no ed-flores
  r = salvarServicoLocal({ condominioSlug: 'ed-flores', titulo: 'Pintura nova', categoria: 'Pintura', data: '15/05/2026', descricao: 'Garagem', fotoAntes: 'data:novaA', fotoDepois: 'data:novaD' });
  assert(r.sucesso, 'Serviço criado em ed-flores');

  // 13) Isolamento ed-flores
  r = carregarServicosLocal('ed-flores');
  assert(r.sucesso && r.servicos.length === 1 && r.servicos[0].titulo === 'Pintura nova', 'ed-flores tem só o serviço dele');

  // 14) gv-principal mantém os migrados
  r = carregarServicosLocal('gv-principal');
  assert(r.servicos.length === 2, 'gv-principal tem 2 serviços (migrados)');

  // 15) Editar serviço
  const idNovo = JSON.parse(localStorage.getItem('servicos-mock')).find(s => s.titulo === 'Pintura nova').id;
  r = editarServicoLocal({ id: idNovo, titulo: 'Pintura EDITADA', categoria: 'Pintura', data: '15/05/2026', descricao: 'nova desc' });
  assert(r.sucesso, 'Serviço editado');
  r = carregarServicosLocal('ed-flores');
  assert(r.servicos[0].titulo === 'Pintura EDITADA' && r.servicos[0].descricao === 'nova desc', 'Edição persistiu');

  // 16) Excluir cond → leva os serviços junto
  r = excluirCondominioLocal({ slug: 'ed-flores' });
  assert(r.sucesso, 'Cond ed-flores excluído');
  r = listarCondominiosLocal();
  assert(r.condominios.length === 1 && r.condominios[0].slug === 'gv-principal', 'Resta só gv-principal');
  const todos = JSON.parse(localStorage.getItem('servicos-mock'));
  assert(todos.length === 2 && todos.every(s => s.condominioSlug === 'gv-principal'), 'Serviços do ed-flores foram apagados em cascata');

  // 17) Excluir serviço individual
  r = excluirServicoLocal({ id: 'SRV-OLD-1' });
  assert(r.sucesso, 'Serviço SRV-OLD-1 excluído');
  r = carregarServicosLocal('gv-principal');
  assert(r.servicos.length === 1, 'gv-principal agora tem 1 serviço');

  // 18) Slugify
  assert(slugify('Edifício das Flores!') === 'edificio-das-flores', 'Slugify remove acentos e símbolos');
  assert(slugify('  espaços  e--hifens  ') === 'espacos-e-hifens', 'Slugify normaliza hífens e espaços');
}

// ====== Run ======
checkAppsScriptSyntax();
checkIds('js/servicos-admin.js', 'servicos-admin.html', 'ADMIN');
checkIds('js/servicos-moradores.js', 'servicos-moradores.html', 'MORADORES');
checkFuncs('js/servicos-admin.js', 'servicos-admin.html', 'ADMIN funcs');
checkFuncs('js/servicos-moradores.js', 'servicos-moradores.html', 'MORADORES funcs');
simularMock();

console.log('\n' + '='.repeat(50));
console.log(falhas === 0 ? '✅ TUDO OK' : `❌ ${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
