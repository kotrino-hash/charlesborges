/* Atendimento online | Charles Borges Advocacia
   Consulta de andamento pelo CPF, com confirmação por código enviado ao e-mail do cadastro. */
(function () {
  var ENDERECO = "https://xfdhyqqinqwxfswawdxi.supabase.co/functions/v1/atendimento";
  var CHAVE = "sb_publishable_V6JkMmXfq9oV8PBelsp8fg_QNdgD587";
  var WHATS = "https://wa.me/5549998214100";

  var css = "" +
    ".at-botao{position:fixed;right:20px;bottom:92px;z-index:31;display:flex;align-items:center;gap:8px;background:#1F2F42;color:#fff;border:0;border-radius:30px;padding:12px 18px 12px 14px;font:600 .95rem 'Public Sans',system-ui,sans-serif;box-shadow:0 10px 24px -8px rgba(0,0,0,.45);cursor:pointer}" +
    ".at-botao:hover{background:#7A5F45}.at-botao svg{width:22px;height:22px}" +
    ".at-painel{position:fixed;right:20px;bottom:20px;z-index:40;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 40px);background:#FCFBF8;border-radius:10px;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;font-family:'Public Sans',system-ui,sans-serif;color:#1D2530}" +
    ".at-painel[hidden]{display:none}" +
    ".at-cab{background:#1F2F42;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}" +
    ".at-cab img{width:36px;height:36px;border-radius:50%;background:#F6F2EA;padding:3px}" +
    ".at-cab b{display:block;font-size:.98rem}.at-cab small{display:block;font-size:.76rem;color:#C9CFD8}" +
    ".at-cab .at-x{margin-left:auto;background:none;border:0;color:#fff;font-size:1.6rem;line-height:1;cursor:pointer;padding:0 4px}" +
    ".at-msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px;background:#F6F2EA}" +
    ".at-b{max-width:88%;padding:10px 12px;border-radius:10px;font-size:.93rem;line-height:1.5;white-space:normal;overflow-wrap:anywhere}" +
    ".at-bot{background:#fff;border:1px solid #E3DCCF;align-self:flex-start;border-top-left-radius:3px}" +
    ".at-eu{background:#1F2F42;color:#fff;align-self:flex-end;border-top-right-radius:3px}" +
    ".at-bot a{color:#7A5F45;font-weight:600}" +
    ".at-ops{display:flex;flex-direction:column;gap:6px;align-self:stretch;margin:2px 0 4px}" +
    ".at-op{text-align:left;background:#fff;border:1px solid #967A5E;color:#1F2F42;border-radius:8px;padding:9px 12px;font:600 .88rem 'Public Sans',system-ui,sans-serif;cursor:pointer}" +
    ".at-op:hover{background:#F1E9DF}.at-op[disabled]{opacity:.5;cursor:default}" +
    ".at-dig{align-self:flex-start;color:#5B6370;font-size:.85rem;padding:4px 8px}" +
    ".at-form{display:flex;gap:8px;padding:10px;border-top:1px solid #E3DCCF;background:#fff}" +
    ".at-form input{flex:1;border:1px solid #D6CDBD;border-radius:8px;padding:11px 12px;font:1rem 'Public Sans',system-ui,sans-serif;min-width:0}" +
    ".at-form button{background:#1F2F42;color:#fff;border:0;border-radius:8px;padding:0 16px;font-weight:600;cursor:pointer}" +
    ".at-rod{font-size:.72rem;color:#5B6370;text-align:center;padding:6px 10px 8px;background:#fff}" +
    "@media (max-width:520px){.at-painel{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}.at-botao{bottom:88px;right:16px}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var botao = document.createElement("button");
  botao.className = "at-botao"; botao.type = "button";
  botao.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>Consultar meu processo';
  document.body.appendChild(botao);

  var painel = document.createElement("section");
  painel.className = "at-painel"; painel.hidden = true; painel.setAttribute("aria-label", "Atendimento online");
  painel.innerHTML = '<div class="at-cab"><img src="emblema.png" alt=""><div><b>Atendimento online</b><small>Charles Borges Advocacia</small></div><button class="at-x" type="button" aria-label="Fechar">×</button></div>' +
    '<div class="at-msgs" role="log" aria-live="polite"></div>' +
    '<form class="at-form"><input type="text" autocomplete="off" inputmode="text" placeholder="Digite aqui" aria-label="Mensagem" maxlength="600"><button type="submit">Enviar</button></form>' +
    '<div class="at-rod">Atendimento automático e sigiloso. Prefere falar com uma pessoa? <a href="' + WHATS + '" target="_blank" rel="noopener">WhatsApp</a></div>';
  document.body.appendChild(painel);
  var msgs = painel.querySelector(".at-msgs"), form = painel.querySelector("form"), campo = form.querySelector("input");

  function idConversa() {
    var id = null;
    try { id = sessionStorage.getItem("at-conversa"); } catch (e) {}
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      id = Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      try { sessionStorage.setItem("at-conversa", id); } catch (e) {}
    }
    return id;
  }
  var conversa = idConversa(), iniciado = false, ocupado = false;

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function formatar(t) {
    return esc(t)
      .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
      .replace(/(^|\s)_([^_\n]+)_/g, "$1<i>$2</i>")
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, "<br>");
  }
  function rolar() { msgs.scrollTop = msgs.scrollHeight; }
  function bolha(texto, de) {
    var d = document.createElement("div"); d.className = "at-b " + (de === "eu" ? "at-eu" : "at-bot");
    d.innerHTML = de === "eu" ? esc(texto) : formatar(texto); msgs.appendChild(d);
    if (de === "eu") rolar();
    return d;
  }
  function opcoes(lista) {
    if (!lista || !lista.length) return;
    var box = document.createElement("div"); box.className = "at-ops";
    lista.forEach(function (o) {
      var b = document.createElement("button"); b.type = "button"; b.className = "at-op"; b.textContent = o.rotulo;
      b.onclick = function () { box.querySelectorAll("button").forEach(function (x) { x.disabled = true; }); enviar(o.valor, o.rotulo); };
      box.appendChild(b);
    });
    msgs.appendChild(box); rolar();
  }
  function enviar(valor, mostrar) {
    if (ocupado) return;
    ocupado = true;
    if (mostrar) bolha(mostrar, "eu");
    var dig = document.createElement("div"); dig.className = "at-dig"; dig.textContent = "digitando..."; msgs.appendChild(dig); rolar();
    fetch(ENDERECO, { method: "POST", headers: { "Content-Type": "application/json", "apikey": CHAVE }, body: JSON.stringify({ conversa: conversa, texto: valor }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        dig.remove();
        var primeira = null;
        (r.mensagens || []).forEach(function (m) { var d = bolha(m.texto, "bot"); primeira = primeira || d; opcoes(m.opcoes); });
        // mostra o começo da resposta; se for curta, vai até o fim
        if (primeira && msgs.scrollHeight - primeira.offsetTop > msgs.clientHeight) msgs.scrollTop = primeira.offsetTop - 10; else rolar();
        if (!r.mensagens) bolha("Desculpe, não consegui responder agora. Tente de novo ou fale conosco pelo WhatsApp: " + WHATS, "bot");
      })
      .catch(function () { dig.remove(); bolha("Sem conexão com o atendimento. Tente de novo ou fale conosco pelo WhatsApp: " + WHATS, "bot"); })
      .then(function () { ocupado = false; campo.focus(); });
  }
  function abrir() {
    painel.hidden = false; botao.hidden = true;
    if (!iniciado) { iniciado = true; enviar("oi", null); }
    setTimeout(function () { campo.focus(); }, 50);
  }
  botao.onclick = abrir;
  painel.querySelector(".at-x").onclick = function () { painel.hidden = true; botao.hidden = false; };
  form.onsubmit = function (e) {
    e.preventDefault();
    var v = campo.value.trim(); if (!v || ocupado) return;
    campo.value = ""; enviar(v, v);
  };
  document.querySelectorAll('a[href="#consultar"]').forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); abrir(); }); });
  if (location.hash === "#consultar") abrir();
})();
