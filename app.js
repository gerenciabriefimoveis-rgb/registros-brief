/* Registro de visitas e faxinas - Brief Imóveis / BriefStay */
var API = 'https://script.google.com/macros/s/AKfycbzmbxKJGmrzqZu8OMIzFDDb1Yq2YqGWA976rAplp2RgNcxitgwDFen1MqPZx_lhHcf4/exec';
var MODO = document.body.getAttribute('data-modo');
var LIMITE_MB = 35;

var CHAVE = (function () {
  var m = location.hash.match(/k=([a-z0-9]+)/i);
  if (m) {
    localStorage.setItem('chave_' + MODO, m[1]);
    history.replaceState(null, '', location.pathname);
  }
  return localStorage.getItem('chave_' + MODO) || '';
})();

var unidades = [], unidade = null, tipo = '', arquivos = [];
var gravador = null, pedacos = [], inicioGrav = 0, timerGrav = null, enviando = false;

function $(id) { return document.getElementById(id); }
function semAcento(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function nomeCurto(n) { return n.replace(/^UNIDADE\s+/i, ''); }

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
  api('config').then(function (c) { montarAtalhos(c.atalhos); }).catch(mostrarErroInicio);
  api('unidades').then(function (l) {
    unidades = l;
    $('carregando').textContent = l.length + ' unidades. Digite para buscar.';
  }).catch(mostrarErroInicio);
}
function mostrarErroInicio(e) {
  $('carregando').innerHTML = '<span class="erro">Não consegui carregar: ' + e.message + ' Verifique a internet e abra de novo.</span>';
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
  if (!achou.length) { box.innerHTML = '<div class="contagem">Nada encontrado.</div>'; return; }
  achou.forEach(function (u) {
    var b = document.createElement('button');
    b.innerHTML = nomeCurto(u.nome) + (u.grupo ? '<br><small>' + u.grupo + '</small>' : '');
    b.onclick = function () { escolherUnidade(u); };
    box.appendChild(b);
  });
});
function escolherUnidade(u) {
  unidade = u;
  $('unidadeNome').textContent = nomeCurto(u.nome);
  $('unidadeGrupo').textContent = u.grupo || '';
  $('buscaBox').classList.add('oculto');
  $('unidadeBox').classList.remove('oculto');
  $('aviso').textContent = '';
}
function trocarUnidade() {
  unidade = null;
  $('unidadeBox').classList.add('oculto');
  $('buscaBox').classList.remove('oculto');
  $('busca').value = ''; $('lista').innerHTML = ''; $('busca').focus();
}

/* ---------- o que é ---------- */
function montarAtalhos(lista) {
  lista.forEach(function (t) {
    var b = document.createElement('button');
    b.textContent = t;
    b.onclick = function () { $('tipoTexto').value = t; marcarAtalho(); $('aviso').textContent = ''; };
    $('tipos').appendChild(b);
  });
}
function marcarAtalho() {
  var v = $('tipoTexto').value.trim();
  [].forEach.call($('tipos').children, function (x) { x.classList.toggle('sel', x.textContent === v); });
}
$('tipoTexto').addEventListener('input', function () { marcarAtalho(); $('aviso').textContent = ''; });

/* ---------- fotos ---------- */
function adicionarArquivos(lista) {
  [].forEach.call(lista, function (f) {
    var ehVideo = /^video\//.test(f.type);
    if (f.size > LIMITE_MB * 1048576) {
      alert('"' + f.name + '" é grande demais (' + Math.round(f.size / 1048576) + ' MB). Vídeos precisam ser curtos (até ' + LIMITE_MB + ' MB).');
      return;
    }
    arquivos.push({ file: f, nome: f.name || ('foto_' + Date.now() + '.jpg'), mime: f.type, kind: ehVideo ? 'video' : 'foto' });
    var d = document.createElement('div');
    if (!ehVideo) d.style.backgroundImage = 'url(' + URL.createObjectURL(f) + ')';
    else d.textContent = '🎬 vídeo';
    $('miniaturas').appendChild(d);
  });
  contar();
}
function qtd(k) { return arquivos.filter(function (a) { return a.kind === k; }).length; }
function contar() {
  var f = qtd('foto'), v = qtd('video');
  $('contagemFotos').textContent = (f || v) ? f + ' foto(s)' + (v ? ' e ' + v + ' vídeo(s)' : '') + ' prontos para enviar.' : 'Nenhuma foto ainda.';
}
$('camera').addEventListener('change', function () { adicionarArquivos(this.files); this.value = ''; });
$('galeria').addEventListener('change', function () { adicionarArquivos(this.files); this.value = ''; });

/* ---------- áudio ---------- */
function alternarGravacao() {
  if (gravador && gravador.state === 'recording') { gravador.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { alert('Este celular não permite gravar áudio aqui. Use a observação escrita.'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    pedacos = [];
    gravador = new MediaRecorder(stream);
    gravador.ondataavailable = function (e) { if (e.data.size) pedacos.push(e.data); };
    gravador.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      clearInterval(timerGrav);
      var mime = gravador.mimeType || 'audio/webm';
      var ext = mime.indexOf('mp4') >= 0 ? 'm4a' : (mime.indexOf('ogg') >= 0 ? 'ogg' : 'webm');
      var n = qtd('audio') + 1;
      arquivos.push({ file: new Blob(pedacos, { type: mime }), nome: 'audio_' + n + '.' + ext, mime: mime, kind: 'audio' });
      var s = Math.round((Date.now() - inicioGrav) / 1000);
      var d = document.createElement('div');
      d.textContent = '🎤 Áudio ' + n + ' (' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + ')';
      $('audios').appendChild(d);
      $('btnGravar').textContent = '● Gravar outro áudio';
      $('btnGravar').className = 'grande vermelho';
    };
    gravador.start(1000);
    inicioGrav = Date.now();
    $('btnGravar').className = 'grande cinza';
    $('btnGravar').textContent = '■ Parar (0:00)';
    timerGrav = setInterval(function () {
      var s = Math.round((Date.now() - inicioGrav) / 1000);
      $('btnGravar').textContent = '■ Parar (' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + ')';
    }, 500);
  }).catch(function () { alert('Não consegui usar o microfone. Permita o acesso ao microfone e tente de novo.'); });
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
  if (gravador && gravador.state === 'recording') { $('aviso').textContent = 'Pare a gravação do áudio antes de enviar.'; return; }
  if (!unidade) { $('aviso').textContent = 'Escolha a unidade (passo 1).'; window.scrollTo(0, 0); return; }
  tipo = $('tipoTexto').value.trim();
  if (!tipo) { $('aviso').textContent = 'Escreva o que é (passo 2).'; return; }
  var obs = $('obs').value.trim();
  if (!arquivos.length && !obs) { $('aviso').textContent = 'Mande pelo menos uma foto, um áudio ou uma observação.'; return; }

  enviando = true;
  $('telaForm').classList.add('oculto');
  $('telaEnvio').classList.remove('oculto');
  window.scrollTo(0, 0);
  var total = arquivos.length, feitos = 0, erros = [], reg;

  api('iniciar', { unidadeId: unidade.id, tipo: tipo, observacao: obs }).then(function (r) {
    reg = r;
    $('envioTexto').textContent = 'Enviando para ' + nomeCurto(r.unidade) + '. Não feche o app.';
    var fila = arquivos.slice(), idx = 0;
    function proximo() {
      var a = fila.shift();
      if (!a) return Promise.resolve();
      idx++;
      var nome = ('00' + idx).slice(-3) + '_' + a.nome;
      return paraBase64(a.file).then(function (b64) {
        var dados = { pastaId: reg.pastaId, nome: nome, mime: a.mime, base64: b64 };
        return api('arquivo', dados).catch(function () { return api('arquivo', dados); });
      }).then(function () {}, function () { erros.push(a.nome); }).then(function () {
        feitos++;
        $('barra').style.width = Math.round(feitos / total * 100) + '%';
        $('envioDetalhe').textContent = feitos + ' de ' + total + ' arquivos';
        return proximo();
      });
    }
    return Promise.all(total ? [proximo(), proximo()] : []);
  }).then(function () {
    return api('finalizar', { pastaId: reg.pastaId, unidade: reg.unidade, tipo: reg.tipo,
      fotos: qtd('foto'), videos: qtd('video'), audios: qtd('audio'), erros: erros.length, observacao: obs });
  }).then(function () {
    enviando = false;
    $('telaEnvio').classList.add('oculto');
    $('telaFim').classList.remove('oculto');
    var nome = nomeCurto(reg.unidade);
    if (erros.length) {
      $('fimTitulo').innerHTML = '<span class="erro">⚠️ Quase tudo enviado</span>';
      $('fimTexto').innerHTML = 'Salvo em <b>' + nome + '</b>, mas ' + erros.length + ' arquivo(s) não foram: ' + erros.join(', ') + '. Mande esses de novo num novo registro.';
    } else {
      $('fimTitulo').textContent = '✅ Tudo salvo!';
      $('fimTexto').innerHTML = '<b>' + nome + '</b> – ' + reg.tipo + '<br>' + qtd('foto') + ' foto(s), ' + qtd('video') + ' vídeo(s), ' + qtd('audio') + ' áudio(s).';
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
