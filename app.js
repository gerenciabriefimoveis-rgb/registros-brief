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

function enviar() {
  if (enviando) return;
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
    var fila2 = fila.slice();
    function proximo() {
      var item = fila2.shift();
      if (!item) return Promise.resolve();
      return paraBase64(item.a.file).then(function (b64) {
        var dados = { pastaId: reg.pastaId, subpasta: item.sub, nome: item.nome, mime: item.a.mime, base64: b64 };
        return api('arquivo', dados).catch(function () { return api('arquivo', dados); });
      }).then(function () {}, function () { erros.push(item.nome); }).then(function () {
        feitos++;
        $('barra').style.width = Math.round(feitos / total * 100) + '%';
        $('envioDetalhe').textContent = feitos + ' de ' + total + ' arquivos';
        return proximo();
      });
    }
    return Promise.all(total ? [proximo(), proximo()] : []);
  }).then(function () {
    // REGISTROS conta só o material da faxina; cada ocorrência tem a própria contagem
    return api('finalizar', { pastaId: reg.pastaId, unidade: reg.unidade, predio: reg.predio || '', tipo: reg.tipo, responsavel: responsavel, dataVisita: dataVisita,
      fotos: qtd(arquivos, 'foto'), videos: qtd(arquivos, 'video'), audios: qtd(arquivos, 'audio'),
      erros: erros.length, observacao: obs, ocorrencias: resumo });
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
    if (entradaId && (cfg.compararTipos || []).indexOf(reg.tipo) >= 0) {
      var fc = $('fimComparativo');
      fc.classList.remove('oculto');
      fc.innerHTML = '⏳ Gerando o <b>comparativo</b> com a vistoria de entrada… leva de 1 a 4 minutos. ' +
        'Pode esperar aqui ou fechar o app: ele fica salvo na pasta da visita e na planilha.';
      api('comparar', { pastaId: reg.pastaId }).then(function (c) {
        fc.innerHTML = c.feito
          ? '✅ Comparativo pronto (' + c.fotos + ' fotos analisadas): <a target="_blank" href="' + esc(c.link) + '">abrir o PDF</a>' +
            '<br>Comparado com: <a target="_blank" href="' + esc(c.laudoLink) + '">' + esc(c.laudo) + '</a>'
          : '⚠️ O comparativo não foi feito: ' + esc(c.motivo || '');
      }).catch(function (e) {
        fc.innerHTML = '⚠️ Não consegui acompanhar o comparativo (' + esc(e.message) + '). Ele pode aparecer na pasta da visita em alguns minutos.';
      });
    }
  }).catch(function (e) {
    enviando = false;
    $('telaEnvio').classList.add('oculto');
    $('telaForm').classList.remove('oculto');
    $('aviso').textContent = 'Não consegui enviar: ' + (e && e.message ? e.message : e) + ' Verifique a internet e toque em Enviar de novo.';
  });
}

window.addEventListener('beforeunload', function (e) {
  if (enviando) { e.preventDefault(); e.returnValue = ''; }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
