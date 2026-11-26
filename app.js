/* Registro de visitas e faxinas - Brief Imóveis / BriefStay */
var API = 'https://script.google.com/macros/s/AKfycbzmbxKJGmrzqZu8OMIzFDDb1Yq2YqGWA976rAplp2RgNcxitgwDFen1MqPZx_lhHcf4/exec';
var MODO = document.body.getAttribute('data-modo');
var LIMITE_MB = 35;
var ICONES = { 'Precisa de manutenção': '🔧', 'Encontrei um objeto': '🔎', 'Falta item': '📦' };

var CHAVE = (function () {
  var m = location.hash.match(/k=([a-z0-9]+)/i);
  if (m) {
    localStorage.setItem('chave_' + MODO, m[1]);
    history.replaceState(null, '', location.pathname);
  }
  return localStorage.getItem('chave_' + MODO) || '';
})();

var cfg = { textoLivre: true, atalhos: [], ocorrencias: [] };
var unidades = [], unidade = null, tipo = '';
var arquivos = [];      // fotos/vídeos/áudios gerais: {file, nome, mime, kind}
var ocorrencias = [];   // {n, tipo, el, arquivos: [...]}
var gravando = null, enviando = false, contOcorr = 0;

function $(id) { return document.getElementById(id); }
function semAcento(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function nomeCurto(n) { return n.replace(/^UNIDADE\s+/i, ''); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function api(acao, dados) {
  var corpo = Object.assign({ acao: acao, modo: MODO, chave: CHAVE }, dados || {});
  return fetch(API, { method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
    .then(function (r) { return r.json(); })
    .then(function (j) { if (!j.ok) throw new Error(j.erro); return j.dados; });
}

/* ---------- início ---------- */
if (!CHAVE) {
  $('telaForm').innerHTML = '<div class="card erro">Este aparelho ainda não foi liberado. Abra o app pelo link que a Brief mandou.</div>';
} else {
  api('config').then(aplicarConfig).catch(mostrarErroInicio);
  api('unidades').then(function (l) {
    unidades = l;
    $('carregando').textContent = l.length + ' unidades. Digite para buscar.';
  }).catch(mostrarErroInicio);
}
function mostrarErroInicio(e) {
  $('carregando').innerHTML = '<span class="erro">Não consegui carregar: ' + esc(e.message) + ' Verifique a internet e abra de novo.</span>';
}
function aplicarConfig(c) {
  cfg = c;
  if (c.textoLivre !== false) cfg.textoLivre = true;
  if (c.textoLivre === false) {
    $('tipoTexto').classList.add('oculto');
    $('tipoDica').classList.add('oculto');
    $('tipos').classList.add('dois');
  }
  c.atalhos.forEach(function (t) {
    var b = document.createElement('button');
    b.textContent = t;
    b.onclick = function () { $('tipoTexto').value = t; marcarAtalho(); $('aviso').textContent = ''; };
    $('tipos').appendChild(b);
  });
  var tx = c.textos || {};
  if (tx.resp && $('tResp')) $('tResp').textContent = tx.resp;
  if (tx.ocorr && $('tOcorr')) $('tOcorr').textContent = tx.ocorr;
  if (c.pedirData && $('cardData')) {
    var hoje = new Date();
    $('dataVisita').value = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);
    $('dataVisita').max = $('dataVisita').value;
    $('cardData').classList.remove('oculto');
  }
  if (c.responsaveis && c.responsaveis.length) montarResponsaveis(c.responsaveis);
  if (c.checklist && c.checklist.length && $('cardCheck')) {
    c.checklist.forEach(function (item) {
      var l = document.createElement('label');
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = item;
      cb.onchange = function () { $('aviso').textContent = ''; };
      l.appendChild(cb); l.appendChild(document.createTextNode(item));
      $('checkLista').appendChild(l);
    });
    $('cardCheck').classList.remove('oculto');
  }
  if (c.ocorrencias && c.ocorrencias.length) {
    $('cardOcorr').classList.remove('oculto');
    // vistorias: primeiro as fotos e o áudio da visita, depois cada manutenção separada
    if (c.pastaOcorr) $('telaForm').insertBefore($('cardOcorr'), $('obs').closest('.card'));
    c.ocorrencias.forEach(function (t) {
      var b = document.createElement('button');
      b.innerHTML = (ICONES[t] || '⚠️') + ' ' + esc(tx.botaoOcorr || t);
      b.onclick = function () { novaOcorrencia(t); };
      $('botoesOcorr').appendChild(b);
    });
  }
  numerarPassos();
  if (c.comodos && c.comodos.length && $('cardAndamento')) verAndamento();
}
function numerarPassos() {
  var n = 0;
  [].forEach.call(document.querySelectorAll('#telaForm .card'), function (card) {
    var p = card.querySelector('.passo');
    if (!p || card.classList.contains('oculto')) return;
    n++;
    p.querySelector('.num').textContent = n + '.';
  });
}

/* ---------- unidade ---------- */
$('busca').addEventListener('input', function () {
  var q = semAcento(this.value.trim());
  var box = $('lista');
  box.innerHTML = '';
  if (q.length < 2) return;
  var partes = q.split(/\s+/);
  var achou = unidades.filter(function (u) {
    var n = semAcento(u.nome + ' ' + u.grupo);
    return partes.every(function (p) { return n.indexOf(p) >= 0; });
  }).slice(0, 12);
  if (!achou.length) box.innerHTML = '<div class="contagem">Nada encontrado.</div>';
  achou.forEach(function (u) {
    var b = document.createElement('button');
    b.innerHTML = esc(nomeCurto(u.nome)) + (u.grupo && u.nome.indexOf(u.grupo) < 0 ? '<br><small>' + esc(u.grupo) + '</small>' : '');
    b.onclick = function () { escolherUnidade(u); };
    box.appendChild(b);
  });
  if (cfg && cfg.outraUnidade) {
    var o = document.createElement('button');
    o.className = 'outra';
    o.innerHTML = '➕ Outra unidade<br><small>não está na lista: toque para digitar</small>';
    o.onclick = abrirOutraUnidade;
    box.appendChild(o);
  }
});
function abrirOutraUnidade() {
  var box = $('lista');
  box.innerHTML = '<div class="contagem">Digite a unidade e o prédio (ex.: 1513 Air Brooklin):</div>' +
    '<input type="search" id="outraTexto" maxlength="60" autocomplete="off">' +
    '<button class="grande" id="outraOk">Usar esta unidade</button>';
  var inp = $('outraTexto');
  inp.value = $('busca').value.trim();
  inp.focus();
  $('outraOk').onclick = function () {
    var t = inp.value.trim();
    if (t.length < 2) { inp.focus(); return; }
    escolherUnidade({ id: 'outra', nome: t, grupo: 'Outra unidade (digitada)' });
  };
}
function escolherUnidade(u) {
  unidade = u;
  $('unidadeNome').textContent = nomeCurto(u.nome);
  $('unidadeGrupo').textContent = u.grupo && u.nome.indexOf(u.grupo) < 0 ? u.grupo : '';
  $('buscaBox').classList.add('oculto');
  $('unidadeBox').classList.remove('oculto');
  $('aviso').textContent = '';
  if (cfg.locacoes && u.id !== 'outra') carregarLocacoes(u);
}
function trocarUnidade() {
  unidade = null; locacao = null; entradaId = '';
  if ($('cardLoc')) { $('cardLoc').classList.add('oculto'); numerarPassos(); }
  $('unidadeBox').classList.add('oculto');
  $('buscaBox').classList.remove('oculto');
  $('busca').value = ''; $('lista').innerHTML = ''; $('busca').focus();
}

/* ---------- locação (inquilino) e vistoria de entrada ---------- */
var locacao = null, entradaId = '';
function carregarLocacoes(u) {
  locacao = null; entradaId = '';
  $('cardLoc').classList.remove('oculto');
  $('locEscolhida').classList.add('oculto');
  $('locLista').innerHTML = '';
  $('locCarregando').textContent = 'Procurando as locações desta unidade…';
  numerarPassos();
  api('locacoes', { unidadeId: u.id }).then(function (lista) {
    if (unidade !== u) return;   // trocou de unidade enquanto carregava
    $('locCarregando').textContent = lista.length ? 'Toque na locação certa:' : 'Nenhuma pasta de locação encontrada nesta unidade.';
    lista.forEach(function (l) {
      var b = document.createElement('button');
      var info = (l.atual ? 'atual' : (l.antigo ? 'antiga' : '')) +
        (l.vistorias.length ? (l.atual || l.antigo ? ' · ' : '') + l.vistorias.length + ' vistoria(s)' : (l.atual || l.antigo ? ' · ' : '') + 'sem vistoria');
      b.innerHTML = esc(l.nome) + '<br><small>' + esc(info) + '</small>';
      b.onclick = function () { escolherLocacao(l); };
      $('locLista').appendChild(b);
    });
    var s = document.createElement('button');
    s.innerHTML = 'Sem inquilino / não sei<br><small>registra sem comparar com vistoria</small>';
    s.onclick = function () { escolherLocacao({ id: '', nome: '', vistorias: [] }); };
    $('locLista').appendChild(s);
  }).catch(function (e) {
    $('locCarregando').innerHTML = '<span class="erro">Não consegui ver as locações: ' + esc(e.message) + '</span>';
    escolherLocacao({ id: '', nome: '', vistorias: [] });
  });
}
function escolherLocacao(l) {
  locacao = l;
  $('locLista').innerHTML = ''; $('locCarregando').textContent = '';
  $('locEscolhida').classList.remove('oculto');
  $('locNome').textContent = l.nome || 'Sem inquilino';
  var box = $('entradaBox');
  if (!l.vistorias.length) {
    entradaId = '';
    box.textContent = l.nome ? 'Nenhuma vistoria encontrada nesta locação: o envio não terá comparativo.' : '';
    return;
  }
  box.innerHTML = 'Vistoria de entrada para o comparativo:';
  var sel = document.createElement('select');
  l.vistorias.forEach(function (v) {
    var o = document.createElement('option');
    o.value = v.id; o.textContent = v.nome.replace(/\.pdf$/i, '') + ' (' + v.data + ')';
    sel.appendChild(o);
  });
  var n = document.createElement('option'); n.value = ''; n.textContent = 'Não comparar';
  sel.appendChild(n);
  var abrir = document.createElement('a'); abrir.target = '_blank'; abrir.textContent = '📄 Abrir a vistoria';
  function mudou() {
    entradaId = sel.value;
    abrir.style.display = entradaId ? '' : 'none';
    abrir.href = 'https://drive.google.com/file/d/' + entradaId + '/view';
  }
  sel.onchange = mudou;
  box.appendChild(sel);
  var d = document.createElement('div'); d.style.marginTop = '6px'; d.appendChild(abrir); box.appendChild(d);
  mudou();
}
function trocarLocacao() { if (unidade) carregarLocacoes(unidade); }

/* ---------- responsável (quem fez) ---------- */
var EXTRA = '__extra';
function montarResponsaveis(lista) {
  var sel = $('resp');
  sel.innerHTML = '<option value="">Escolha seu nome…</option>';
  lista.forEach(function (r) {
    var o = document.createElement('option');
    o.value = r.nome;
    o.textContent = r.apelido === r.nome ? r.nome : r.apelido + ' (' + r.nome + ')';
    sel.appendChild(o);
  });
  var x = document.createElement('option');
  x.value = EXTRA; x.textContent = 'Extra (outra pessoa)';
  sel.appendChild(x);
  // lembra a última escolha deste celular (aparece preenchida; dá para trocar)
  var salvo = localStorage.getItem('resp_' + MODO) || '';
  if (salvo.indexOf('extra:') === 0) { sel.value = EXTRA; $('respExtra').value = salvo.slice(6); }
  else if (lista.some(function (r) { return r.nome === salvo; })) sel.value = salvo;
  else if (lista.length === 1) sel.value = lista[0].nome;   // só uma pessoa (ex.: Shirley): já vem escolhida
  sel.addEventListener('change', respMudou);
  $('respExtra').addEventListener('input', respMudou);
  respMudou();
  $('cardResp').classList.remove('oculto');
}
function respMudou() {
  var extra = $('resp').value === EXTRA;
  $('respExtra').classList.toggle('oculto', !extra);
  if (extra && document.activeElement === $('resp')) $('respExtra').focus();
  var v = responsavelAtual();
  if (v) localStorage.setItem('resp_' + MODO, extra ? 'extra:' + v : v);
  $('aviso').textContent = '';
}
function responsavelAtual() {
  var v = $('resp').value;
  if (v === EXTRA) return $('respExtra').value.trim();
  return v;
}

/* ---------- tipo ---------- */
function marcarAtalho() {
  var v = $('tipoTexto').value.trim();
  [].forEach.call($('tipos').children, function (x) { x.classList.toggle('sel', x.textContent === v); });
  atualizarTelaTipo();
}
$('tipoTexto').addEventListener('input', function () { marcarAtalho(); $('aviso').textContent = ''; });

/* ---------- arquivos (geral e ocorrências) ---------- */
function lerArquivos(lista, destino, miniaturas, aoMudar) {
  [].forEach.call(lista, function (f) {
    var ehVideo = /^video\//.test(f.type);
    if (f.size > LIMITE_MB * 1048576) {
      alert('"' + f.name + '" é grande demais (' + Math.round(f.size / 1048576) + ' MB). Vídeos precisam ser curtos (até ' + LIMITE_MB + ' MB).');
      return;
    }
    destino.push({ file: f, nome: f.name || ('foto_' + Date.now() + '.jpg'), mime: f.type, kind: ehVideo ? 'video' : 'foto' });
    var d = document.createElement('div');
    if (!ehVideo) d.style.backgroundImage = 'url(' + URL.createObjectURL(f) + ')';
    else d.textContent = '🎬';
    miniaturas.appendChild(d);
  });
  aoMudar();
}
function qtd(lista, k) { return lista.filter(function (a) { return a.kind === k; }).length; }
function contarGeral() {
  var f = qtd(arquivos, 'foto'), v = qtd(arquivos, 'video');
  $('contagemFotos').textContent = (f || v) ? f + ' foto(s)' + (v ? ' e ' + v + ' vídeo(s)' : '') + ' prontos para enviar.' : 'Nenhuma foto ainda.';
}
$('camera').addEventListener('change', function () { lerArquivos(this.files, arquivos, $('miniaturas'), contarGeral); this.value = ''; });
$('galeria').addEventListener('change', function () { lerArquivos(this.files, arquivos, $('miniaturas'), contarGeral); this.value = ''; });

/* ---------- áudio (um por vez) ---------- */
function gravarAudio(botao, destino, listaEl, rotulo) {
  if (gravando) {
    if (gravando.botao === botao) { gravando.rec.stop(); }
    else { alert('Pare a outra gravação antes.'); }
    return;
  }
  if (!navigator.mediaDevices || !window.MediaRecorder) { alert('Este celular não permite gravar áudio aqui. Escreva a explicação.'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    var pedacos = [], rec = new MediaRecorder(stream), inicio = Date.now(), textoOriginal = botao.textContent;
    gravando = { botao: botao, rec: rec };
    rec.ondataavailable = function (e) { if (e.data.size) pedacos.push(e.data); };
    rec.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      clearInterval(timer);
      gravando = null;
      var mime = rec.mimeType || 'audio/webm';
      var ext = mime.indexOf('mp4') >= 0 ? 'm4a' : (mime.indexOf('ogg') >= 0 ? 'ogg' : 'webm');
      var n = qtd(destino, 'audio') + 1;
      destino.push({ file: new Blob(pedacos, { type: mime }), nome: 'audio_' + n + '.' + ext, mime: mime, kind: 'audio' });
      var s = Math.round((Date.now() - inicio) / 1000);
      var d = document.createElement('div');
      d.textContent = '🎤 ' + rotulo + ' ' + n + ' (' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + ')';
      listaEl.appendChild(d);
      botao.textContent = textoOriginal.indexOf('outro') >= 0 ? textoOriginal : textoOriginal.replace('Gravar', 'Gravar outro');
      botao.classList.remove('cinza');
    };
    rec.start(1000);
    botao.classList.add('cinza');
    botao.textContent = '■ Parar (0:00)';
    var timer = setInterval(function () {
      var s = Math.round((Date.now() - inicio) / 1000);
      botao.textContent = '■ Parar (' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + ')';
    }, 500);
  }).catch(function () { alert('Não consegui usar o microfone. Permita o acesso ao microfone e tente de novo.'); });
}
function alternarGravacao() { gravarAudio($('btnGravar'), arquivos, $('audios'), 'Áudio'); }

/* ---------- ocorrências ---------- */
function txt(k, padrao) { return (cfg.textos && cfg.textos[k]) || padrao; }
function novaOcorrencia(t) {
  contOcorr++;
  var o = { n: contOcorr, tipo: t, arquivos: [] };
  var el = document.createElement('div');
  el.className = 'ocorrencia';
  var titulo = cfg.pastaOcorr ? txt('ocorrNome', t) + ' ' + (ocorrencias.length + 1) : t;
  var prova = txt('ocorrProva', 'Mande uma foto ou um áudio como prova.');
  el.innerHTML =
    '<div class="ocTopo"><b>' + (ICONES[t] || '⚠️') + ' ' + esc(titulo) + '</b>' +
    '<button class="link remover">Remover</button></div>' +
    '<textarea placeholder="' + esc(txt('ocorrPlaceholder', 'Explique o que encontrou (opcional)')) + '"></textarea>' +
    '<div class="ocBotoes">' +
    '<label class="peq">📷 Foto<input type="file" accept="image/*" capture="environment"></label>' +
    '<label class="peq">🖼️ Galeria<input type="file" accept="image/*,video/*" multiple></label>' +
    '<button class="peq vermelho">● Gravar áudio</button></div>' +
    '<div class="miniaturas"></div><div class="audios"></div>' +
    '<div class="contagem">' + esc(prova) + '</div>';
  o.el = el;
  var mini = el.querySelector('.miniaturas'), auds = el.querySelector('.audios'), cont = el.querySelector('.contagem');
  function atualizar() {
    var f = qtd(o.arquivos, 'foto') + qtd(o.arquivos, 'video'), a = qtd(o.arquivos, 'audio');
    cont.textContent = (f || a) ? f + ' foto(s)/vídeo(s) e ' + a + ' áudio(s).' : prova;
    cont.classList.remove('erro');
  }
  [].forEach.call(el.querySelectorAll('input[type=file]'), function (inp) {
    inp.addEventListener('change', function () { lerArquivos(this.files, o.arquivos, mini, atualizar); this.value = ''; });
  });
  var bAudio = el.querySelector('button.peq');
  bAudio.onclick = function () { gravarAudio(bAudio, o.arquivos, auds, 'Áudio'); };
  new MutationObserver(atualizar).observe(auds, { childList: true });
  el.querySelector('.remover').onclick = function () {
    if (gravando && gravando.botao === bAudio) { alert('Pare a gravação antes de remover.'); return; }
    if ((o.arquivos.length || el.querySelector('textarea').value.trim()) && !confirm('Remover este item?')) return;
    ocorrencias = ocorrencias.filter(function (x) { return x !== o; });
    el.remove();
    if (cfg.pastaOcorr) ocorrencias.forEach(function (x, i) {   // renumera "Manutenção 1, 2, 3..."
      x.el.querySelector('.ocTopo b').textContent = (ICONES[x.tipo] || '⚠️') + ' ' + txt('ocorrNome', x.tipo) + ' ' + (i + 1);
    });
  };
  ocorrencias.push(o);
  $('listaOcorr').appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- envio ---------- */
function paraBase64(blob) {
  return new Promise(function (ok, falha) {
    var r = new FileReader();
    r.onload = function () { ok(String(r.result).split(',')[1]); };
    r.onerror = falha;
    r.readAsDataURL(blob);
  });
}

// diminui a foto no próprio celular antes de enviar (lado maior até 2000 px, JPEG 85%):
// foto de 4-6 MB vira ~0,5-1 MB, o envio fica muito mais rápido e não cai no meio
var FOTO_MAX_PX = 2000, FOTO_QUALIDADE = 0.85;
function comprimirFoto(item) {
  var f = item.file;
  if (item.kind !== 'foto' || !/^image\/(jpeg|jpg|png|webp)$/i.test(f.type || '') || f.size < 700 * 1024) {
    return Promise.resolve({ blob: f, mime: item.mime, nome: null });
  }
  return new Promise(function (ok) {
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      try {
        var w = img.naturalWidth, h = img.naturalHeight, esc = Math.min(1, FOTO_MAX_PX / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * esc); c.height = Math.round(h * esc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.size < f.size) ok({ blob: b, mime: 'image/jpeg', nome: null });
          else ok({ blob: f, mime: item.mime, nome: null });
        }, 'image/jpeg', FOTO_QUALIDADE);
      } catch (e) { URL.revokeObjectURL(url); ok({ blob: f, mime: item.mime, nome: null }); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); ok({ blob: f, mime: item.mime, nome: null }); };
    img.src = url;
  });
}

// tenta até 4 vezes, esperando 3 s, 8 s e 15 s entre as tentativas (sinal fraco na rua)
function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
function enviarComTentativas(dados) {
  var esperas = [3000, 8000, 15000];
  function tentar(n) {
    return api('arquivo', dados).catch(function (e) {
      if (n >= esperas.length) throw e;
      return esperar(esperas[n]).then(function () { return tentar(n + 1); });
    });
  }
  return tentar(0);
}

// mantém a tela acesa durante o envio (se a tela apagar, o celular pausa o envio)
var travaTela = null;
function manterTelaAcesa(ligar) {
  try {
    if (ligar && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (t) { travaTela = t; }).catch(function () {});
    else if (!ligar && travaTela) { travaTela.release(); travaTela = null; }
  } catch (e) {}
}
document.addEventListener('visibilitychange', function () {
  if (enviando && document.visibilityState === 'visible') manterTelaAcesa(true);
});

function enviar() {
  if (enviando) return;
  if (modoComodos()) return finalizarComodos();
  if (gravando) { $('aviso').textContent = 'Pare a gravação do áudio antes de enviar.'; return; }
  if (!unidade) { $('aviso').textContent = 'Escolha a unidade (passo 1).'; window.scrollTo(0, 0); return; }
  if (cfg.locacoes && unidade.id !== 'outra' && !locacao) {
    $('aviso').textContent = 'Escolha a locação (inquilino) (passo 2).';
    $('cardLoc').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  var dataVisita = '';
  if (cfg.pedirData) {
    dataVisita = $('dataVisita').value;
    if (!dataVisita) { $('aviso').textContent = 'Escolha a data da visita.'; $('cardData').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  }
  var responsavel = '';
  if (cfg.responsaveis && cfg.responsaveis.length) {
    responsavel = responsavelAtual();
    if (!responsavel) {
      $('aviso').textContent = $('resp').value === EXTRA ? 'Digite o seu nome completo.' : txt('respAviso', 'Escolha quem fez a faxina (passo 2).');
      $('cardResp').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
  tipo = $('tipoTexto').value.trim();
  if (!tipo) { $('aviso').textContent = cfg.textoLivre ? 'Escreva o que é (passo 2).' : txt('tipoAviso', 'Escolha o tipo de faxina (passo 2).'); return; }
  for (var i = 0; i < ocorrencias.length; i++) {
    var o = ocorrencias[i];
    if (!o.arquivos.length) {
      var c = o.el.querySelector('.contagem');
      c.textContent = 'Falta a prova: mande uma foto ou um áudio.'; c.classList.add('erro');
      o.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('aviso').textContent = (cfg.pastaOcorr ? 'Uma manutenção' : 'Uma ocorrência') + ' está sem foto ou áudio.';
      return;
    }
  }
  var obs = $('obs').value.trim();
  if (!arquivos.length && !obs && !ocorrencias.length) { $('aviso').textContent = 'Mande pelo menos uma foto, um áudio ou uma observação.'; return; }
  // checklist de limpeza: avisa o que faltou marcar e pergunta se quer enviar assim mesmo
  var checklist = [];
  if (cfg.checklist && cfg.checklist.length && $('checkLista')) {
    var caixas = [].slice.call($('checkLista').querySelectorAll('input'));
    checklist = caixas.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
    var faltou = caixas.filter(function (x) { return !x.checked; }).map(function (x) { return x.value; });
    if (faltou.length && !confirm('Faltou marcar no checklist:\n\n• ' + faltou.join('\n• ') + '\n\nEnviar assim mesmo?')) {
      $('cardCheck').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('aviso').textContent = 'Confira o checklist de limpeza.';
      return;
    }
  }

  // monta a fila: arquivos gerais + arquivos e explicação de cada ocorrência
  var fila = [];
  arquivos.forEach(function (a, i) { fila.push({ a: a, sub: '', nome: ('00' + (i + 1)).slice(-3) + '_' + a.nome }); });
  var resumo = [];
  ocorrencias.forEach(function (o, idx) {
    var sub = cfg.pastaOcorr ? cfg.pastaOcorr + ' ' + (idx + 1) : 'OCORRENCIA ' + (idx + 1) + ' - ' + o.tipo;
    var texto = o.el.querySelector('textarea').value.trim();
    o.arquivos.forEach(function (a, i) { fila.push({ a: a, sub: sub, nome: ('00' + (i + 1)).slice(-3) + '_' + a.nome }); });
    if (texto) fila.push({ a: { file: new Blob([texto], { type: 'text/plain' }), mime: 'text/plain', kind: 'texto' }, sub: sub, nome: 'EXPLICACAO.txt' });
    resumo.push({ tipo: o.tipo, texto: texto, fotos: qtd(o.arquivos, 'foto') + qtd(o.arquivos, 'video'), audios: qtd(o.arquivos, 'audio') });
  });

  enviando = true;
  $('telaForm').classList.add('oculto');
  $('telaEnvio').classList.remove('oculto');
  window.scrollTo(0, 0);
  var total = fila.length, feitos = 0, erros = [], reg;

  api('iniciar', { unidadeId: unidade.id, unidadeTexto: unidade.id === 'outra' ? unidade.nome : '', tipo: tipo, observacao: obs, responsavel: responsavel, dataVisita: dataVisita,
    locacao: locacao ? locacao.nome : '', entradaId: entradaId }).then(function (r) {
    reg = r;
    $('envioTexto').textContent = 'Enviando para ' + nomeCurto(r.unidade) + '. Não feche o app.';
    manterTelaAcesa(true);
    var falhas = [];
    function rodada(lista) {
      var fila2 = lista.slice();
      function proximo() {
        var item = fila2.shift();
        if (!item) return Promise.resolve();
        return comprimirFoto(item.a).then(function (c) {
          return paraBase64(c.blob).then(function (b64) {
            var nome = c.mime === 'image/jpeg' && !/\.jpe?g$/i.test(item.nome) ? item.nome.replace(/\.[^.]*$/, '') + '.jpg' : item.nome;
            return enviarComTentativas({ pastaId: reg.pastaId, subpasta: item.sub, nome: nome, mime: c.mime, base64: b64 });
          });
        }).then(function () { feitos++; }, function () { falhas.push(item); }).then(function () {
          $('barra').style.width = Math.round(feitos / total * 100) + '%';
          $('envioDetalhe').textContent = feitos + ' de ' + total + ' arquivos' + (falhas.length ? ' (' + falhas.length + ' para tentar de novo)' : '');
          return proximo();
        });
      }
      return Promise.all(lista.length ? [proximo(), proximo()] : []).then(function () {
        if (!falhas.length) return;
        // sobrou arquivo sem enviar: pergunta se tenta de novo (na mesma pasta) ou finaliza assim
        return new Promise(function (ok) {
          var box = document.createElement('div');
          box.innerHTML = '<div class="erro" style="margin-top:10px">' + falhas.length + ' arquivo(s) não subiram (internet fraca?). ' +
            'Os outros ' + feitos + ' já estão salvos.</div>' +
            '<button class="grande">🔁 Tentar de novo os que faltaram</button>' +
            '<button class="grande cinza">Finalizar sem eles</button>';
          $('telaEnvio').appendChild(box);
          var bts = box.querySelectorAll('button');
          bts[0].onclick = function () { box.remove(); var l = falhas; falhas = []; ok(rodada(l)); };
          bts[1].onclick = function () { box.remove(); erros = falhas.map(function (x) { return x.nome; }); ok(); };
        });
      });
    }
    return rodada(fila);
  }).then(function () {
    manterTelaAcesa(false);
    // REGISTROS conta só o material da faxina; cada ocorrência tem a própria contagem
    return api('finalizar', { pastaId: reg.pastaId, unidade: reg.unidade, predio: reg.predio || '', tipo: reg.tipo, responsavel: responsavel, dataVisita: dataVisita,
      fotos: qtd(arquivos, 'foto'), videos: qtd(arquivos, 'video'), audios: qtd(arquivos, 'audio'),
      erros: erros.length, observacao: obs, ocorrencias: resumo, checklist: checklist });
  }).then(function () {
    enviando = false;
    $('telaEnvio').classList.add('oculto');
    $('telaFim').classList.remove('oculto');
    var nome = nomeCurto(reg.unidade);
    if (erros.length) {
      $('fimTitulo').innerHTML = '<span class="erro">⚠️ Quase tudo enviado</span>';
      $('fimTexto').innerHTML = 'Salvo em <b>' + esc(nome) + '</b>, mas ' + erros.length + ' arquivo(s) não foram: ' + esc(erros.join(', ')) + '. Mande esses de novo num novo registro.';
    } else {
      $('fimTitulo').textContent = '✅ Tudo salvo!';
      $('fimTexto').innerHTML = '<b>' + esc(nome) + '</b> – ' + esc(reg.tipo) +
        (dataVisita ? '<br>Data da visita: <b>' + dataVisita.split('-').reverse().join('/') + '</b>' : '') +
        (responsavel ? '<br>' + esc(txt('feitaPor', 'Feita por')) + ': <b>' + esc(responsavel) + '</b>' : '') +
        '<br>' + total + ' arquivo(s) enviados' +
        (ocorrencias.length ? '<br>' + ocorrencias.length + (cfg.pastaOcorr ? ' manutenção(ões)' : ' ocorrência(s)') + ' registrada(s).' : '.');
    }
    // comparativo com a vistoria de entrada (pré-vistoria e vistoria final)
    if (entradaId && (cfg.compararTipos || []).indexOf(reg.tipo) >= 0) comecarComparativo(reg.pastaId);
  }).catch(function (e) {
    enviando = false;
    manterTelaAcesa(false);
    $('telaEnvio').classList.add('oculto');
    $('telaForm').classList.remove('oculto');
    $('aviso').textContent = 'Não consegui enviar: ' + (e && e.message ? e.message : e) + ' Verifique a internet e toque em Enviar de novo.';
  });
}

/* ---------- comparativo com a vistoria de entrada (pré-vistoria e vistoria final) ---------- */
function comecarComparativo(pastaId) {
  var fc = $('fimComparativo');
  fc.classList.remove('oculto');
  function gerar() {
    fc.innerHTML = '⏳ Gerando o <b>comparativo</b> com a vistoria de entrada… leva de 1 a 4 minutos. ' +
      '<b>Deixe o app aberto</b> até aparecer o link do PDF.';
    manterTelaAcesa(true);
    api('comparar', { pastaId: pastaId }).then(function (c) {
      manterTelaAcesa(false);
      if (c.feito) {
        fc.innerHTML = '✅ Comparativo pronto' + (c.fotos ? ' (' + c.fotos + ' fotos analisadas)' : '') + ': <a target="_blank" href="' + esc(c.link) + '">abrir o PDF</a>' +
          '<br>Comparado com: <a target="_blank" href="' + esc(c.laudoLink) + '">' + esc(c.laudo) + '</a>';
      } else falhou(c.motivo || '');
    }).catch(function (e) { manterTelaAcesa(false); falhou(e.message || String(e)); });
  }
  function falhou(motivo) {
    fc.innerHTML = '⚠️ O comparativo não saiu: ' + esc(motivo) + '<br>As fotos já estão salvas. ' +
      '<button class="grande" style="margin-top:10px">🔁 Tentar o comparativo de novo</button>';
    fc.querySelector('button').onclick = gerar;
  }
  gerar();
}

/* =====================================================================
   VISTORIA POR CÔMODOS (pré-vistoria e vistoria final, quando o motor manda "comodos")
   Cada cômodo vira uma subpasta ("01 SALA", "02 QUARTO 1"…) e sobe na hora em que a pessoa toca
   "Enviar este cômodo". A pasta da visita é criada no 1º cômodo enviado. O andamento fica guardado
   no celular: se o app fechar, dá para continuar de onde parou.
   ===================================================================== */
var comodos = [], vist = null, seqPasta = 0, seqManut = 0, manutEnviadas = [], contComodo = {}, filaEnvio = Promise.resolve();
var CHAVE_ANDAMENTO = 'vist_andamento_' + MODO;

function modoComodos() {
  return !!(cfg.comodos && cfg.comodos.length && (cfg.comodosTipos || []).indexOf($('tipoTexto').value.trim()) >= 0);
}
function atualizarTelaTipo() {
  if (!$('cardComodos')) return;
  var on = modoComodos();
  $('camera').closest('.card').classList.toggle('oculto', on);
  $('btnGravar').closest('.card').classList.toggle('oculto', on);
  if (cfg.ocorrencias && cfg.ocorrencias.length) $('cardOcorr').classList.toggle('oculto', on);
  $('cardComodos').classList.toggle('oculto', !on);
  $('btnEnviar').textContent = on ? '🏁 Finalizar vistoria' : '✅ Enviar tudo';
  if (on && !$('comodosBotoes').children.length) montarBotoesComodos();
  numerarPassos();
}
function montarBotoesComodos() {
  cfg.comodos.forEach(function (d) {
    var b = document.createElement('button');
    b.textContent = d.livre ? '➕ ' + d.nome : (d.multi ? d.nome + ' (+)' : d.nome);
    b.onclick = function () { adicionarComodo(d); };
    $('comodosBotoes').appendChild(b);
  });
}
function adicionarComodo(d) {
  var nome = d.nome;
  if (d.livre) {
    nome = (prompt('Nome do cômodo (ex.: Escritório, Hall, Closet):') || '').trim();
    if (!nome) return;
  } else if (d.multi) {
    contComodo[d.nome] = (contComodo[d.nome] || 0) + 1;
    nome = d.nome + ' ' + contComodo[d.nome];
  } else {
    var ja = comodos.filter(function (c) { return c.nome === d.nome; })[0];
    if (ja) { ja.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  }
  var c = criarComodo(nome);
  if (d.banheiro) criarComodo(d.banheiro + ' ' + contComodo[d.nome]);   // Suíte 2 → Banheiro suíte 2
  c.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function criarComodo(nome, salvo) {
  var c = salvo || { nome: nome, pasta: ('0' + (++seqPasta)).slice(-2) + ' ' + nome.toUpperCase(), enviado: { fotos: 0, videos: 0, audios: 0 }, nArq: 0, nTxt: 0 };
  c.arquivos = []; c.manut = [];
  var el = document.createElement('div');
  el.className = 'comodo';
  el.innerHTML =
    '<div class="ocTopo"><b>🏠 ' + esc(c.nome) + '</b><button class="link remover">Remover</button></div>' +
    '<div class="contagem estado"></div>' +
    '<div class="ocBotoes">' +
    '<label class="peq">📷 Foto<input type="file" accept="image/*" capture="environment"></label>' +
    '<label class="peq">🖼️ Galeria<input type="file" accept="image/*,video/*" multiple></label>' +
    '<button class="peq vermelho">● Áudio</button></div>' +
    '<div class="miniaturas"></div><div class="audios"></div>' +
    '<textarea placeholder="Observação deste cômodo (opcional)"></textarea>' +
    '<div class="manuts"></div>' +
    '<button class="peq cinza addManut" style="width:100%;margin-top:8px">🔧 Registrar manutenção neste cômodo</button>' +
    '<button class="grande verde enviarC">✅ Enviar este cômodo</button>';
  c.el = el;
  var mini = el.querySelector('.miniaturas'), auds = el.querySelector('.audios');
  [].forEach.call(el.querySelectorAll('.ocBotoes input[type=file]'), function (inp) {
    inp.addEventListener('change', function () { lerArquivos(this.files, c.arquivos, mini, function () { estadoComodo(c); }); this.value = ''; });
  });
  var bAudio = el.querySelector('.ocBotoes button');
  bAudio.onclick = function () { gravarAudio(bAudio, c.arquivos, auds, 'Áudio'); };
  new MutationObserver(function () { estadoComodo(c); }).observe(auds, { childList: true });
  el.querySelector('.addManut').onclick = function () { novaManutComodo(c); };
  el.querySelector('.enviarC').onclick = function () { enviarComodo(c); };
  el.querySelector('.remover').onclick = function () {
    if (c.enviado.fotos || c.enviado.videos || c.enviado.audios) { alert('Este cômodo já foi enviado e está salvo no Drive.'); return; }
    if ((c.arquivos.length || c.manut.length) && !confirm('Remover ' + c.nome + ' e as fotos dele?')) return;
    comodos = comodos.filter(function (x) { return x !== c; });
    el.remove();
    var m = c.nome.match(/^(.*) (\d+)$/);   // tirou o último "Quarto 2": o próximo volta a ser Quarto 2
    if (m && contComodo[m[1]] === +m[2]) contComodo[m[1]]--;
  };
  comodos.push(c);
  $('listaComodos').appendChild(el);
  estadoComodo(c);
  return c;
}
function estadoComodo(c, texto) {
  var e = c.el.querySelector('.estado'), env = c.enviado;
  var feito = env.fotos + env.videos + env.audios;
  var pend = c.arquivos.length;
  c.el.classList.toggle('enviado', feito > 0 && !pend && !c.manut.length);
  e.classList.remove('erro');
  e.innerHTML = texto || ((feito ? '✅ Enviado: ' + env.fotos + ' foto(s)' + (env.videos ? ', ' + env.videos + ' vídeo(s)' : '') + (env.audios ? ', ' + env.audios + ' áudio(s)' : '') + '. ' : '') +
    (pend ? pend + ' arquivo(s) para enviar.' : (feito ? 'Pode adicionar mais se precisar.' : 'Tire as fotos deste cômodo.')));
  c.el.querySelector('.enviarC').textContent = feito ? '✅ Enviar o que foi adicionado' : '✅ Enviar este cômodo';
}
function novaManutComodo(c) {
  var m = { arquivos: [] };
  var el = document.createElement('div');
  el.className = 'ocorrencia';
  el.innerHTML =
    '<div class="ocTopo"><b>🔧 Manutenção (' + esc(c.nome) + ')</b><button class="link remover">Remover</button></div>' +
    '<textarea placeholder="' + esc(txt('ocorrPlaceholder', 'Descreva a manutenção')) + '"></textarea>' +
    '<div class="ocBotoes">' +
    '<label class="peq">📷 Foto<input type="file" accept="image/*" capture="environment"></label>' +
    '<label class="peq">🖼️ Galeria<input type="file" accept="image/*,video/*" multiple></label>' +
    '<button class="peq vermelho">● Áudio</button></div>' +
    '<div class="miniaturas"></div><div class="audios"></div><div class="contagem">' + esc(txt('ocorrProva', 'Mande uma foto ou um áudio.')) + '</div>';
  m.el = el;
  var mini = el.querySelector('.miniaturas'), auds = el.querySelector('.audios'), cont = el.querySelector('.contagem');
  function atualizar() {
    var f = qtd(m.arquivos, 'foto') + qtd(m.arquivos, 'video'), a = qtd(m.arquivos, 'audio');
    cont.textContent = (f || a) ? f + ' foto(s)/vídeo(s) e ' + a + ' áudio(s).' : txt('ocorrProva', 'Mande uma foto ou um áudio.');
    cont.classList.remove('erro');
  }
  [].forEach.call(el.querySelectorAll('input[type=file]'), function (inp) {
    inp.addEventListener('change', function () { lerArquivos(this.files, m.arquivos, mini, atualizar); this.value = ''; });
  });
  var bA = el.querySelector('.ocBotoes button');
  bA.onclick = function () { gravarAudio(bA, m.arquivos, auds, 'Áudio'); };
  new MutationObserver(atualizar).observe(auds, { childList: true });
  el.querySelector('.remover').onclick = function () {
    if ((m.arquivos.length || el.querySelector('textarea').value.trim()) && !confirm('Remover esta manutenção?')) return;
    c.manut = c.manut.filter(function (x) { return x !== m; });
    el.remove(); estadoComodo(c);
  };
  c.manut.push(m);
  c.el.querySelector('.manuts').appendChild(el);
  estadoComodo(c);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Confere o cabeçalho (unidade, locação, data, quem, tipo) e cria a pasta da visita no 1º cômodo enviado. */
function garantirInicio() {
  if (vist) return Promise.resolve(vist);
  var erro = '';
  if (!unidade) erro = 'Escolha a unidade (passo 1).';
  else if (cfg.locacoes && unidade.id !== 'outra' && !locacao) erro = 'Escolha a locação (inquilino).';
  else if (cfg.pedirData && !$('dataVisita').value) erro = 'Escolha a data da visita.';
  else if (cfg.responsaveis && cfg.responsaveis.length && !responsavelAtual()) erro = txt('respAviso', 'Escolha quem fez a visita.');
  if (erro) { $('aviso').textContent = erro; window.scrollTo(0, 0); return Promise.reject(new Error(erro)); }
  var dados = { unidadeId: unidade.id, unidadeTexto: unidade.id === 'outra' ? unidade.nome : '', tipo: $('tipoTexto').value.trim(),
    observacao: '', responsavel: responsavelAtual(), dataVisita: $('dataVisita').value, locacao: locacao ? locacao.nome : '', entradaId: entradaId };
  return api('iniciar', dados).then(function (r) {
    vist = { pastaId: r.pastaId, unidade: r.unidade, predio: r.predio || '', tipo: r.tipo, responsavel: dados.responsavel, dataVisita: dados.dataVisita, entradaId: entradaId };
    travarCabecalho();
    salvarAndamento();
    return vist;
  });
}
function travarCabecalho() {
  [].forEach.call(document.querySelectorAll('#unidadeBox .link, #locEscolhida .link'), function (b) { b.classList.add('oculto'); });
  $('dataVisita').disabled = true; $('resp').disabled = true; $('respExtra').disabled = true;
  [].forEach.call($('tipos').children, function (b) { b.disabled = true; });
  if ($('entradaBox').querySelector('select')) $('entradaBox').querySelector('select').disabled = true;
  $('travadoAviso').classList.remove('oculto');
}

/** Envia o que está pendente no cômodo (fotos, áudios, observação e as manutenções dele). Um cômodo por vez. */
function enviarComodo(c) {
  if (gravando) { alert('Pare a gravação do áudio antes de enviar.'); return Promise.resolve(false); }
  var texto = c.el.querySelector('textarea').value.trim();
  for (var i = 0; i < c.manut.length; i++) {
    if (!c.manut[i].arquivos.length) {
      var ct = c.manut[i].el.querySelector('.contagem');
      ct.textContent = 'Falta a prova: mande uma foto ou um áudio.'; ct.classList.add('erro');
      c.manut[i].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return Promise.resolve(false);
    }
  }
  if (!c.arquivos.length && !c.manut.length && !texto) {
    estadoComodo(c, '<span class="erro">Tire pelo menos uma foto deste cômodo.</span>');
    return Promise.resolve(false);
  }
  var botao = c.el.querySelector('.enviarC');
  botao.disabled = true;
  estadoComodo(c, '⏳ Na fila para enviar…');
  var p = filaEnvio.then(function () {
    return garantirInicio().then(function () {
      enviando = true;
      manterTelaAcesa(true);
      var fila = [];
      c.arquivos.forEach(function (a) { fila.push({ a: a, sub: c.pasta, nome: ('00' + (++c.nArq)).slice(-3) + '_' + a.nome, dono: c }); });
      if (texto) {
        c.nTxt++;
        fila.push({ a: { file: new Blob([texto], { type: 'text/plain' }), mime: 'text/plain', kind: 'texto' }, sub: c.pasta,
          nome: 'OBSERVACAO' + (c.nTxt > 1 ? ' ' + c.nTxt : '') + '.txt', dono: c, ehTexto: true });
      }
      var manutsAgora = c.manut.slice();
      manutsAgora.forEach(function (m) {
        m.n = ++seqManut;
        var sub = (cfg.pastaOcorr || 'MANUTENCAO') + ' ' + m.n, tm = m.el.querySelector('textarea').value.trim();
        m.arquivos.forEach(function (a, k) { fila.push({ a: a, sub: sub, nome: ('00' + (k + 1)).slice(-3) + '_' + a.nome, dono: m }); });
        fila.push({ a: { file: new Blob(['Cômodo: ' + c.nome + (tm ? '\n' + tm : '')], { type: 'text/plain' }), mime: 'text/plain', kind: 'texto' }, sub: sub, nome: 'EXPLICACAO.txt', dono: m, ehTexto: true });
        manutEnviadas.push({ n: m.n, comodo: c.nome, tipo: 'Precisa de manutenção', texto: tm,
          fotos: qtd(m.arquivos, 'foto') + qtd(m.arquivos, 'video'), audios: qtd(m.arquivos, 'audio') });
      });
      var total = fila.length, feitos = 0, falhas = [];
      function proximo() {
        var item = fila.shift();
        if (!item) return Promise.resolve();
        return comprimirFoto(item.a).then(function (cp) {
          return paraBase64(cp.blob).then(function (b64) {
            var nome = cp.mime === 'image/jpeg' && !/\.jpe?g$/i.test(item.nome) ? item.nome.replace(/\.[^.]*$/, '') + '.jpg' : item.nome;
            return enviarComTentativas({ pastaId: vist.pastaId, subpasta: item.sub, nome: nome, mime: cp.mime, base64: b64 });
          });
        }).then(function () {
          feitos++;
          if (item.dono === c && !item.ehTexto) {
            c.enviado[item.a.kind === 'audio' ? 'audios' : (item.a.kind === 'video' ? 'videos' : 'fotos')]++;
            c.arquivos = c.arquivos.filter(function (x) { return x !== item.a; });
          }
        }, function () { falhas.push(item); }).then(function () {
          estadoComodo(c, '⏳ Enviando ' + c.nome + ': ' + feitos + ' de ' + total + '…');
          return proximo();
        });
      }
      return Promise.all([proximo(), proximo()]).then(function () {
        // manutenções e observação já foram (mesmo que alguma foto delas tenha falhado, a pasta existe)
        c.manut = []; c.el.querySelector('.manuts').innerHTML = '';
        if (texto && !falhas.some(function (f) { return f.ehTexto && f.dono === c; })) c.el.querySelector('textarea').value = '';
        var mini = c.el.querySelector('.miniaturas');
        mini.innerHTML = '';
        c.arquivos.forEach(function (a) {
          var d = document.createElement('div');
          if (a.kind === 'foto') d.style.backgroundImage = 'url(' + URL.createObjectURL(a.file) + ')'; else d.textContent = a.kind === 'audio' ? '🎤' : '🎬';
          mini.appendChild(d);
        });
        c.el.querySelector('.audios').innerHTML = '';
        salvarAndamento();
        if (falhas.length) estadoComodo(c, '<span class="erro">' + falhas.length + ' arquivo(s) não subiram (internet?). Toque em Enviar de novo.</span>');
        else estadoComodo(c);
        return !falhas.length;
      });
    });
  }).catch(function (e) {
    estadoComodo(c, '<span class="erro">Não consegui enviar: ' + esc(e.message || e) + '</span>');
    return false;
  }).then(function (ok) {
    botao.disabled = false;
    enviando = false;
    manterTelaAcesa(false);
    return ok;
  });
  filaEnvio = p;
  return p;
}

/** "Finalizar vistoria": manda o que ainda está pendente, escreve a planilha e gera o comparativo. */
function finalizarComodos() {
  if (gravando) { $('aviso').textContent = 'Pare a gravação do áudio antes.'; return; }
  var pendentes = comodos.filter(function (c) { return c.arquivos.length || c.manut.length || c.el.querySelector('textarea').value.trim(); });
  var obs = $('obs').value.trim();
  var cadeia = Promise.resolve(true);
  pendentes.forEach(function (c) { cadeia = cadeia.then(function (ok) { return enviarComodo(c).then(function (k) { return ok && k; }); }); });
  $('btnEnviar').disabled = true;
  $('aviso').textContent = pendentes.length ? 'Enviando os cômodos que faltavam…' : '';
  cadeia.then(function (tudoOk) {
    if (!tudoOk) throw new Error('Algum cômodo não terminou de enviar. Veja o aviso em vermelho e toque em Enviar nele.');
    var feitos = comodos.filter(function (c) { return c.enviado.fotos + c.enviado.videos + c.enviado.audios > 0; });
    if (!vist || !feitos.length) throw new Error('Envie pelo menos um cômodo antes de finalizar.');
    var soma = function (k) { return feitos.reduce(function (s, c) { return s + c.enviado[k]; }, 0); };
    enviando = true;
    $('aviso').textContent = 'Finalizando…';
    return api('finalizar', { pastaId: vist.pastaId, unidade: vist.unidade, predio: vist.predio, tipo: vist.tipo, responsavel: vist.responsavel,
      dataVisita: vist.dataVisita, fotos: soma('fotos'), videos: soma('videos'), audios: soma('audios'), erros: 0, observacao: obs,
      ocorrencias: manutEnviadas.sort(function (a, b) { return a.n - b.n; }),
      comodos: feitos.map(function (c) { return { nome: c.nome, fotos: c.enviado.fotos + c.enviado.videos }; }) }).then(function () {
      enviando = false;
      localStorage.removeItem(CHAVE_ANDAMENTO);
      $('telaForm').classList.add('oculto');
      $('telaFim').classList.remove('oculto');
      window.scrollTo(0, 0);
      $('fimTitulo').textContent = '✅ Vistoria salva!';
      $('fimTexto').innerHTML = '<b>' + esc(nomeCurto(vist.unidade)) + '</b> – ' + esc(vist.tipo) +
        '<br>Data da visita: <b>' + vist.dataVisita.split('-').reverse().join('/') + '</b>' +
        '<br>' + feitos.length + ' cômodo(s): ' + esc(feitos.map(function (c) { return c.nome + ' (' + c.enviado.fotos + ')'; }).join(', ')) +
        (manutEnviadas.length ? '<br>' + manutEnviadas.length + ' manutenção(ões) registrada(s).' : '');
      if (vist.entradaId) comecarComparativo(vist.pastaId);
    });
  }).catch(function (e) {
    enviando = false;
    $('aviso').textContent = e.message || String(e);
  }).then(function () { $('btnEnviar').disabled = false; });
}

/* ---------- andamento guardado no celular (para continuar depois) ---------- */
function salvarAndamento() {
  if (!vist) return;
  localStorage.setItem(CHAVE_ANDAMENTO, JSON.stringify({
    quando: Date.now(), vist: vist, unidade: unidade, locacao: locacao ? { nome: locacao.nome } : null, entradaId: entradaId,
    tipo: $('tipoTexto').value.trim(), seqPasta: seqPasta, seqManut: seqManut, manutEnviadas: manutEnviadas, contComodo: contComodo,
    comodos: comodos.filter(function (c) { return c.enviado.fotos + c.enviado.videos + c.enviado.audios > 0 || c.nTxt; })
      .map(function (c) { return { nome: c.nome, pasta: c.pasta, enviado: c.enviado, nArq: c.nArq, nTxt: c.nTxt }; })
  }));
}
function verAndamento() {
  var s = null;
  try { s = JSON.parse(localStorage.getItem(CHAVE_ANDAMENTO) || 'null'); } catch (e) {}
  if (!s || !s.vist) return;
  if (Date.now() - s.quando > 7 * 86400000) { localStorage.removeItem(CHAVE_ANDAMENTO); return; }
  var box = $('cardAndamento');
  box.classList.remove('oculto');
  box.innerHTML = '<div class="passo">Vistoria em andamento</div>' +
    '<div><b>' + esc(nomeCurto(s.vist.unidade)) + '</b> – ' + esc(s.vist.tipo) + (s.locacao && s.locacao.nome ? ' – ' + esc(s.locacao.nome) : '') +
    '<br><small>' + s.comodos.length + ' cômodo(s) já enviado(s): ' + esc(s.comodos.map(function (c) { return c.nome; }).join(', ')) + '</small></div>' +
    '<button class="grande">▶ Continuar esta vistoria</button><button class="grande cinza">Descartar e começar outra</button>';
  var b = box.querySelectorAll('button');
  b[0].onclick = function () { continuarAndamento(s); };
  b[1].onclick = function () {
    if (!confirm('Descartar? O que já foi enviado continua salvo no Drive, mas esta vistoria não será finalizada na planilha.')) return;
    localStorage.removeItem(CHAVE_ANDAMENTO); box.classList.add('oculto');
  };
}
function continuarAndamento(s) {
  $('cardAndamento').classList.add('oculto');
  vist = s.vist; seqManut = s.seqManut; manutEnviadas = s.manutEnviadas || [];
  // numeração recomeça a partir dos cômodos já salvos (os que não foram enviados se perderam ao fechar o app)
  seqPasta = 0; contComodo = {};
  s.comodos.forEach(function (sc) {
    seqPasta = Math.max(seqPasta, parseInt(sc.pasta, 10) || 0);
    var m = sc.nome.match(/^(.*) (\d+)$/);
    if (m) {
      var base = cfg.comodos.filter(function (d) { return d.nome === m[1] || d.banheiro === m[1]; })[0];
      if (base && base.nome === m[1]) contComodo[m[1]] = Math.max(contComodo[m[1]] || 0, +m[2]);
    }
  });
  unidade = s.unidade; entradaId = s.entradaId || '';
  $('unidadeNome').textContent = nomeCurto(unidade.nome);
  $('unidadeGrupo').textContent = unidade.grupo && unidade.nome.indexOf(unidade.grupo) < 0 ? unidade.grupo : '';
  $('buscaBox').classList.add('oculto'); $('unidadeBox').classList.remove('oculto');
  if (cfg.locacoes) {
    locacao = s.locacao || { nome: '' };
    $('cardLoc').classList.remove('oculto'); $('locLista').innerHTML = ''; $('locCarregando').textContent = '';
    $('locEscolhida').classList.remove('oculto'); $('locNome').textContent = locacao.nome || 'Sem inquilino';
    $('entradaBox').textContent = entradaId ? 'Comparativo com a vistoria de entrada escolhida no início.' : '';
  }
  $('dataVisita').value = vist.dataVisita;
  if (vist.responsavel) {
    if ([].some.call($('resp').options, function (o) { return o.value === vist.responsavel; })) $('resp').value = vist.responsavel;
    else { $('resp').value = EXTRA; $('respExtra').value = vist.responsavel; }
  }
  $('tipoTexto').value = vist.tipo; marcarAtalho();
  s.comodos.forEach(function (sc) { criarComodo(sc.nome, sc); });
  travarCabecalho();
  $('cardComodos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.addEventListener('beforeunload', function (e) {
  if (enviando) { e.preventDefault(); e.returnValue = ''; }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
