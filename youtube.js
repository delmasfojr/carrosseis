/* Postar o Reels pronto no YouTube (vira Short). Sem servidor: o login é do Google (popup), a autorização vale ~1 h e fica só na
   memória desta página; nada de senha aqui. O ID de cliente não é segredo, mas é configurável em ⚙️. */
const YouTubePost = (() => {
  const CANAL = 'UCrJn1VpgkNC5BmWCchcDFlQ', CLIENTE = '78771326624-3l8vof2htf3cdq38tf0gnggmru0h1b0c.apps.googleusercontent.com';  // canal @delmaosimplifica
  const ESCOPOS = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
  const cliente = () => (localStorage.getItem('ytcliente') || CLIENTE).trim();
  let ficha = null, carregando = null, ui = null, enviando = false;  // ficha = {token, ate}

  function carregarGoogle() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return carregando = carregando || new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.onload = ok;
      s.onerror = () => { carregando = null; s.remove(); erro(new Error('não consegui abrir o login do Google (internet?)')); };
      document.head.appendChild(s);
    });
  }
  // tem de ser chamada no toque do botão (senão o navegador bloqueia o popup)
  function autorizar() {
    if (ficha && Date.now() < ficha.ate) return Promise.resolve(ficha.token);
    return new Promise((ok, erro) => {
      google.accounts.oauth2.initTokenClient({client_id: cliente(), scope: ESCOPOS,
        callback: r => {
          if (r.error) return erro(new Error('o Google não autorizou (' + r.error + ')'));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...ESCOPOS.split(' '))) return erro(new Error('falta marcar as duas permissões na tela do Google. Tente de novo e marque todas.'));
          ficha = {token: r.access_token, ate: Date.now() + (Number(r.expires_in) - 120) * 1000};
          ok(ficha.token);
        },
        error_callback: e => erro(new Error(e.type === 'popup_failed_to_open' ? 'o navegador bloqueou a janela do Google: libere os pop-ups deste site' : 'a janela do Google foi fechada antes de autorizar')),
      }).requestAccessToken();
    });
  }
  function explicar(status, j) {
    const m = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
    if (status === 401) { ficha = null; return 'a autorização venceu. Toque em Postar de novo.'; }
    if (m === 'quotaExceeded') return 'a cota de hoje do YouTube acabou. Amanhã ela volta.';
    if (m === 'uploadLimitExceeded') return 'o YouTube limitou os envios deste canal por hoje.';
    if (m === 'youtubeSignupRequired') return 'essa conta não tem canal. Escolha o canal Delmão Simplifica.';
    return (j && j.error && j.error.message) || `o YouTube respondeu ${status}`;
  }
  async function conferirCanal(token) {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {headers: {Authorization: 'Bearer ' + token}});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(explicar(r.status, j));
    const c = j.items && j.items[0];
    if (!c || c.id !== CANAL) {
      ficha = null;
      throw new Error(`você entrou ${c ? `no canal “${c.snippet.title}”` : 'numa conta sem canal'}. Nada foi enviado. Toque em Postar de novo e escolha Delmão Simplifica.`);
    }
  }
  async function enviar(token, video, meta, andou) {
    const r = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {method: 'POST',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': video.type || 'video/mp4', 'X-Upload-Content-Length': String(video.size)}, body: JSON.stringify(meta)});
    if (!r.ok) throw new Error(explicar(r.status, await r.json().catch(() => ({}))));
    const onde = r.headers.get('Location');
    if (!onde) throw new Error('o YouTube não abriu o envio');
    return new Promise((ok, erro) => {
      const x = new XMLHttpRequest();
      x.open('PUT', onde); x.setRequestHeader('Content-Type', video.type || 'video/mp4');
      x.upload.onprogress = e => { if (e.lengthComputable) andou(e.loaded / e.total); };
      x.onload = () => {
        let j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* sem corpo */ }
        if (x.status >= 200 && x.status < 300 && j.id) ok(j); else erro(new Error(explicar(x.status, j)));
      };
      // a internet caiu no meio: pode ter chegado inteiro; não dá para saber daqui
      x.onerror = () => erro(new Error('a internet falhou no envio. Antes de tentar de novo, veja no YouTube Studio se o vídeo chegou.'));
      x.send(video);
    });
  }

  const limpo = t => String(t || '').replace(/[<>]/g, '').replace(/\\n/g, '\n').trim();
  const corta = (t, n) => { const a = [...t]; return a.length <= n ? t : a.slice(0, n - 1).join('').replace(/\s+\S*$/, '') + '…'; };
  function sugestao(item, legenda) {
    const desc = limpo(legenda);
    return {titulo: corta(limpo(item.conteudo.ganchos[item.gancho || 0] || item.conteudo.tema), 100), desc,
      tags: [...new Set((desc.match(/#[\p{L}\p{N}_]+/gu) || []).map(x => x.slice(1)))].slice(0, 15)};
  }
  function criarUI() {
    if (ui) return;
    ui = document.createElement('div'); ui.id = 'ytpost'; ui.hidden = true;
    ui.innerHTML = `<style>#ytpost{position:fixed;inset:0;z-index:70;background:rgba(15,27,45,.75);overflow:auto;padding:16px}#ytpost[hidden]{display:none}
      #ytpost>div{background:var(--creme,#FFF6E6);border-radius:16px;padding:18px;max-width:520px;margin:0 auto}
      #ytpost textarea{min-height:170px}#ytpost progress{width:100%;height:14px;margin-top:12px}</style>
      <div><h2>Postar no <span>YouTube</span></h2>
      <p class="dica">Confira antes: vai para o canal <b>@delmaosimplifica</b>.</p>
      <label for="yttit">Título <small id="ytcont"></small></label><input id="yttit" type="text" maxlength="100">
      <label for="ytdesc">Descrição</label><textarea id="ytdesc"></textarea>
      <label for="ytquem">Quem pode ver</label>
      <select id="ytquem"><option value="public">Todo mundo (público)</option><option value="unlisted">Só quem tem o link</option><option value="private">Só eu (privado)</option></select>
      <progress id="ytbarra" max="1" value="0" hidden></progress><p id="ytinfo" class="dica" hidden></p>
      <div class="acoes"><button id="ytcancela" class="sec">Cancelar</button><button id="ytvai" class="principal" style="grid-column:auto;margin:0">▶ Postar</button></div></div>`;
    document.body.appendChild(ui);
  }
  const q = id => ui.querySelector('#' + id);
  function abrir(item, legenda, salvar, depois) {
    if (!cliente()) { alert('Falta ligar o app ao YouTube: cole o ID de cliente do Google em ⚙️ › Postar no YouTube.'); return; }
    if (item.youtube && !confirm('Esse vídeo já foi postado no YouTube. Postar outra vez?')) return;
    criarUI();
    const s = sugestao(item, legenda);
    const diz = t => { q('ytinfo').hidden = !t; q('ytinfo').textContent = t || ''; };
    q('yttit').value = s.titulo; q('ytdesc').value = s.desc; q('ytquem').value = 'public'; q('ytbarra').hidden = true; diz('');
    q('ytcont').textContent = `(${s.titulo.length}/100)`;
    q('yttit').oninput = () => { q('ytcont').textContent = `(${q('yttit').value.length}/100)`; };
    q('ytvai').disabled = true;
    carregarGoogle().then(() => { q('ytvai').disabled = false; }, e => diz('Deu erro: ' + e.message));
    q('ytcancela').onclick = () => { if (!enviando) ui.hidden = true; };
    q('ytvai').onclick = async () => {
      const titulo = limpo(q('yttit').value);
      if (!titulo) return diz('Escreva o título.');
      if (new TextEncoder().encode(limpo(q('ytdesc').value)).length > 5000) return diz('A descrição passou do limite do YouTube (5 mil letras).');
      enviando = true; q('ytvai').disabled = q('ytcancela').disabled = true;
      try {
        diz('Esperando a autorização do Google…');
        const token = await autorizar();
        diz('Conferindo o canal…');
        await conferirCanal(token);
        q('ytbarra').hidden = false; q('ytbarra').value = 0;
        const quem = q('ytquem').value;
        const j = await enviar(token, item.video, {
          snippet: {title: titulo, description: limpo(q('ytdesc').value), tags: s.tags, categoryId: '27', defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt-BR'},
          status: {privacyStatus: quem, selfDeclaredMadeForKids: false},
        }, f => { q('ytbarra').value = f; diz(`Enviando… ${Math.round(f * 100)}%. Deixe o app aberto.`); });
        const ficou = (j.status && j.status.privacyStatus) || quem;
        item.youtube = {id: j.id, quando: new Date().toISOString(), quem: ficou};
        await salvar(item).catch(() => {});
        ui.hidden = true;
        alert('Vídeo enviado ao YouTube! Ele leva alguns minutos processando.' + (ficou !== quem ? '\n⚠️ O YouTube deixou o vídeo como “' + ficou + '”. Confira no YouTube Studio.' : ''));
        depois();
      } catch (e) { diz('Não postou: ' + e.message); }
      finally { enviando = false; q('ytvai').disabled = q('ytcancela').disabled = false; }
    };
    ui.hidden = false;
  }
  function iniciar() {
    const c = document.querySelector('#ytcliente');
    if (!c) return;
    c.value = localStorage.getItem('ytcliente') || '';
    document.querySelector('#salvarytc').onclick = () => {
      const v = c.value.trim();
      if (v && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(v)) return alert('Esse não parece o ID de cliente: ele termina em .apps.googleusercontent.com');
      localStorage.setItem('ytcliente', v); alert('Salvo.');
    };
  }
  return {abrir, iniciar};
})();
YouTubePost.iniciar();
