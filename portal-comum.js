// Área do Cliente | Charles Borges Advocacia
// Configuração e funções comuns ao portal do cliente e ao painel do escritório.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Dados do projeto no Supabase (Project Settings > API). A chave pública pode ficar no site:
// quem protege os dados são as regras de acesso do banco.
export const SUPABASE_URL = "https://xfdhyqqinqwxfswawdxi.supabase.co";
export const SUPABASE_CHAVE = "sb_publishable_V6JkMmXfq9oV8PBelsp8fg_QNdgD587";

export const WHATS_ESCRITORIO = "5549998214100";
export const PORTAL_URL = "https://charlesborges.adv.br/cliente.html";
const FUSO = "America/Sao_Paulo";

export const configurado = !SUPABASE_URL.startsWith("__");
export const db = configurado
  ? createClient(SUPABASE_URL, SUPABASE_CHAVE, {
      auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// ---------- texto e formatação ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
export function primeiroNome(nome) {
  const p = String(nome || "").trim().split(/\s+/)[0] || "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}
export const NOME_TIPO = { audiencia: "Audiência", pericia: "Perícia", prazo: "Prazo", reuniao: "Reunião", andamento: "Andamento" };

const fmt = (o) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, ...o });
export const dataBR = (iso) => fmt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
export const horaBR = (iso) => fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(":", "h");
export const diaNum = (iso) => fmt({ day: "2-digit" }).format(new Date(iso));
export const mesCurto = (iso) => fmt({ month: "short" }).format(new Date(iso)).replace(".", "");
export const semana = (iso) => fmt({ weekday: "long" }).format(new Date(iso));
export const dataLonga = (iso) => fmt({ weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));

// Partes da data no fuso de Brasília, para preencher formulários
export function partesData(iso) {
  const p = Object.fromEntries(
    fmt({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
// Brasília não tem horário de verão desde 2019: UTC-3 fixo
export const isoDeBrasilia = (data, hora) => new Date(`${data}T${hora || "09:00"}:00-03:00`).toISOString();
export const chaveDia = (iso) => partesData(iso).data;

// Telefone: guarda só dígitos com DDI 55
export function normalizaWhats(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11) d = "55" + d.replace(/^0+/, "");
  return d;
}
export function mostraWhats(d) {
  d = String(d || "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
}
export const linkWhats = (numero, texto) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

// Arquivo de agenda (.ics) para o cliente salvar no celular
export function baixarICS(ev, processo) {
  const inicio = new Date(ev.data_hora);
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
  const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const limpa = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Charles Borges Advocacia//Portal//PT",
    "BEGIN:VEVENT", `UID:${ev.id}@charlesborges.adv.br`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(inicio)}`, `DTEND:${f(fim)}`,
    `SUMMARY:${limpa(`${NOME_TIPO[ev.tipo]}: ${ev.titulo}`)}`,
    `DESCRIPTION:${limpa(`Processo: ${processo}${ev.descricao ? "\n" + ev.descricao : ""}${ev.link ? "\nAcesso: " + ev.link : ""}`)}`,
    ev.local ? `LOCATION:${limpa(ev.local)}` : null,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Lembrete", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${NOME_TIPO[ev.tipo].toLowerCase()}-${partesData(ev.data_hora).data}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- avisos na tela ----------
let toastTimer;
export function toast(msg, erro = false) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.toggle("erro", erro); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), erro ? 6000 : 3200);
}

// ---------- login por e-mail (link ou código) ----------
export function montarLogin(el, { titulo, sub, destino }) {
  el.innerHTML = `
  <div class="login">
    <div class="cartao">
      <img class="emblema" src="emblema.png" alt="" width="92" height="82">
      <h1>${esc(titulo)}</h1>
      <p class="sub">${esc(sub)}</p>
      <div id="msg"></div>
      <form id="f-email" novalidate>
        <div class="campo">
          <label for="email">Seu e-mail</label>
          <input id="email" type="email" autocomplete="email" inputmode="email" required placeholder="nome@exemplo.com">
        </div>
        <button class="btn btn-primario" type="submit">Receber acesso por e-mail</button>
      </form>
      <form id="f-codigo" hidden novalidate>
        <div class="separa">ou digite o código do e-mail</div>
        <div class="campo">
          <label for="codigo">Código de acesso</label>
          <input id="codigo" class="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="000000">
        </div>
        <button class="btn btn-sec" type="submit">Entrar com o código</button>
        <p class="rodape-login"><a href="#" id="outro">Usar outro e-mail</a></p>
      </form>
      <p class="rodape-login">Problemas para entrar? <a href="${linkWhats(WHATS_ESCRITORIO, "Olá! Preciso de ajuda para acessar a área do cliente.")}" target="_blank" rel="noopener">Fale conosco pelo WhatsApp</a></p>
    </div>
  </div>`;
  const msg = el.querySelector("#msg");
  const fE = el.querySelector("#f-email"), fC = el.querySelector("#f-codigo");
  const mostra = (tipo, texto) => (msg.innerHTML = `<div class="aviso aviso-${tipo}">${texto}</div>`);
  let emailAtual = "";

  if (!configurado) {
    mostra("erro", "O portal ainda está sendo configurado.");
    fE.querySelector("button").disabled = true;
    return;
  }
  if (location.hash.includes("error")) {
    mostra("erro", "Este link de acesso expirou ou já foi usado. Peça um novo abaixo.");
    history.replaceState(null, "", location.pathname);
  }

  fE.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = el.querySelector("#email").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostra("erro", "Confira o e-mail digitado.");
    const b = fE.querySelector("button"); b.disabled = true; b.textContent = "Enviando...";
    const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: destino } });
    b.disabled = false; b.textContent = "Receber acesso por e-mail";
    if (error && /rate|seconds|segundos|too many/i.test(error.message)) {
      return mostra("erro", "Muitos pedidos seguidos. Aguarde um minuto e tente de novo.");
    }
    // Mesmo em caso de e-mail não cadastrado, a resposta é a mesma (protege o sigilo de quem é cliente)
    emailAtual = email;
    mostra("ok", `Se <b>${esc(email)}</b> estiver cadastrado no escritório, você vai receber um e-mail com um botão de acesso e um código. Confira também a caixa de spam.`);
    fE.hidden = true; fC.hidden = false; el.querySelector("#codigo").focus();
  });
  fC.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = el.querySelector("#codigo").value.replace(/\D/g, "");
    if (token.length < 6) return mostra("erro", "Digite o código de 6 dígitos que chegou no e-mail.");
    const b = fC.querySelector("button"); b.disabled = true;
    const { error } = await db.auth.verifyOtp({ email: emailAtual, token, type: "email" });
    b.disabled = false;
    if (error) mostra("erro", "Código inválido ou vencido. Confira o último e-mail recebido ou peça um novo.");
  });
  el.querySelector("#outro").addEventListener("click", (e) => {
    e.preventDefault(); fC.hidden = true; fE.hidden = false; msg.innerHTML = ""; el.querySelector("#email").focus();
  });
}
