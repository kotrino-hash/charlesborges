// ============================================================
// Leitor de documentos para a ficha do cliente
// Lê RG, CNH, CIN, comprovante de endereço, procuração ou processo em PDF
// no próprio navegador. Nada é enviado a servidor nem guardado.
// ============================================================

const CFG = Object.assign({
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  tesseractOpcoes: {},          // workerPath, corePath, langPath (os padrões já apontam para o jsDelivr)
  maxPaginasPdf: 400,           // processo na íntegra: lê o texto de até 400 páginas
  maxPaginasOcr: 6,             // páginas digitalizadas (sem texto) lidas por reconhecimento de imagem
}, globalThis.__LEITOR_CFG || {});

let pdfjsP = null, ocrP = null, avisarOcr = () => {};

function carregarScript(src) {
  return new Promise((ok, erro) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src; s.dataset.src = src; s.onload = () => ok(); s.onerror = () => erro(new Error("Não foi possível carregar " + src));
    document.head.appendChild(s);
  });
}
async function pdfjs() {
  if (!pdfjsP) pdfjsP = import(CFG.pdfjs).then((m) => { m.GlobalWorkerOptions.workerSrc = CFG.pdfjsWorker; return m; });
  return pdfjsP;
}
function comPrazo(promessa, ms, msg) {
  let t; return Promise.race([promessa, new Promise((_, erro) => (t = setTimeout(() => erro(new Error(msg)), ms)))]).finally(() => clearTimeout(t));
}
async function ocr(progresso) {
  if (!ocrP) {
    progresso && progresso("Baixando o leitor de imagens (só na primeira vez, cerca de 4 MB)...");
    ocrP = comPrazo((async () => {
      await carregarScript(CFG.tesseract);
      return globalThis.Tesseract.createWorker("por", 1, Object.assign({
        logger: (m) => { if (m && m.status === "recognizing text") avisarOcr(m.progress || 0); },
        errorHandler: () => {},
      }, CFG.tesseractOpcoes));
    })(), 120000, "não foi possível baixar o leitor de imagens. Confira a internet e tente de novo.");
    ocrP.catch(() => { ocrP = null; });  // permite tentar de novo
  }
  return ocrP;
}

// Melhora a imagem para o reconhecimento: tamanho adequado, tons de cinza e contraste
function prepararCanvas(fonte, w, h) {
  const maior = Math.max(w, h), alvo = Math.min(2600, Math.max(1600, maior));
  const k = alvo / maior;
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(fonte, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    y = Math.max(0, Math.min(255, (y - 128) * 1.35 + 128));
    p[i] = p[i + 1] = p[i + 2] = y;
  }
  g.putImageData(d, 0, 0);
  return c;
}
async function reconhecer(canvas, progresso, rotulo) {
  avisarOcr = (x) => progresso(`${rotulo}: lendo a imagem ${Math.round(x * 100)}%`);
  const w = await ocr(progresso);
  progresso(`${rotulo}: lendo a imagem`);
  const r = await comPrazo(w.recognize(canvas), 180000, "a leitura da imagem demorou demais. Tente uma foto menor ou em PDF.");
  return (r && r.data && r.data.text) || "";
}

async function lerPdf(arquivo, progresso) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const total = Math.min(doc.numPages, CFG.maxPaginasPdf);
  let texto = "", ocrs = 0, usouOcr = false;
  for (let n = 1; n <= total; n++) {
    progresso(`${arquivo.name}: página ${n} de ${total}`);
    const pag = await doc.getPage(n);
    const tc = await pag.getTextContent();
    let t = "";
    for (const it of tc.items) t += (it.str || "") + (it.hasEOL ? "\n" : " ");
    if (t.replace(/\s/g, "").length < 40 && ocrs < CFG.maxPaginasOcr) {
      // página digitalizada: transforma em imagem e reconhece o texto
      const vp = pag.getViewport({ scale: 2.2 });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await pag.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      t = await reconhecer(prepararCanvas(c, c.width, c.height), progresso, `${arquivo.name}, página ${n}`);
      ocrs++; usouOcr = true;
    }
    texto += t + "\n\f\n";
  }
  return { nome: arquivo.name, texto, ocr: usouOcr, paginas: doc.numPages };
}

async function lerImagem(arquivo, progresso) {
  progresso(`${arquivo.name}: preparando a imagem`);
  const bmp = await createImageBitmap(arquivo);
  const c = prepararCanvas(bmp, bmp.width, bmp.height);
  const texto = await reconhecer(c, progresso, arquivo.name);
  return { nome: arquivo.name, texto, ocr: true, paginas: 1 };
}

// Lê vários arquivos; devolve [{nome, texto, ocr, erro}]
export async function lerArquivos(arquivos, progresso = () => {}) {
  const saida = [];
  for (const a of arquivos) {
    try {
      if (/\.(heic|heif)$/i.test(a.name) || /heic|heif/i.test(a.type)) throw new Error("foto no formato HEIC (iPhone). Envie em JPG ou PDF.");
      if (a.type === "application/pdf" || /\.pdf$/i.test(a.name)) saida.push(await lerPdf(a, progresso));
      else if (/^image\//.test(a.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(a.name)) saida.push(await lerImagem(a, progresso));
      else throw new Error("formato não suportado. Use PDF, JPG ou PNG.");
    } catch (e) {
      saida.push({ nome: a.name, texto: "", erro: e.message || String(e) });
    }
  }
  return saida;
}

// ============================================================
// Extração dos dados (funciona com qualquer texto; testável fora do navegador)
// ============================================================
const MIN = "da|de|do|das|dos|e|di|du|del|van|von";
export function nomeProprio(s) {
  if (!s) return "";
  s = s.replace(/\s+/g, " ").trim();
  if (s !== s.toUpperCase()) return s;  // já está em caixa mista: mantém como veio
  return s.toLowerCase().split(" ").map((p, i) => (i > 0 && new RegExp("^(" + MIN + ")$").test(p) ? p : p.replace(/(^|[-'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()))).join(" ");
}
function so(s) { return (s || "").replace(/\D/g, ""); }
export function cpfOk(v) {
  const d = so(v); if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += +d[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +d[t]) return false; }
  return true;
}
const fmtCPF = (d) => d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const fmtCEP = (d) => d.replace(/(\d{5})(\d{3})/, "$1-$2");
function dataISO(s) {
  const m = (s || "").match(/(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/);
  if (!m) return "";
  const [d, mm, a] = [+m[1], +m[2], +m[3]];
  if (d < 1 || d > 31 || mm < 1 || mm > 12 || a < 1900 || a > new Date().getFullYear()) return "";
  return `${a}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";
const ORGAOS = "SSP|IGP|SESP|SDS|PC|DETRAN|SJS|SEJUSP|DGPC|IIRGD|SSPDS|IFP|DIC|SPTC|SEDS|SESDEC|PCSC|PCPR|PCRS|IGPSC";
const ESCRITORIO = /CHARLES\s+DOS\s+SANTOS\s+BORGES|ELMO\s+MOSCON|CATIANA\s+MITTMANN/i;
const FONE_ESCRITORIO = /9?9821-?4100/;
const ENTIDADES = /\b(MINIST[ÉE]RIO|INSTITUTO|BANCO|ESTADO D[EO]|MUNIC[ÍI]PIO|UNI[ÃA]O|LTDA|S\.?\s?A\b|EIRELI|ME\b|COOPERATIVA|SICREDI|SICOOB|CAIXA|INSS|FAZENDA|PREFEITURA|C[ÂA]MARA|TRIBUNAL|JU[ÍI]ZO|VARA|COMARCA|PODER|ASSOCIA[ÇC][ÃA]O|SEGURADORA|COMPANHIA|CELESC|COPEL|CASAN|SANEPAR)\b/i;

const NAC = "brasileir[oa]s?|estrangeir[oa]|portugu[eê]sa?|argentin[oa]|paraguai[oa]|uruguai[oa]|italian[oa]|alem[ãa]o?|venezuelan[oa]|haitian[oa]";
const EC = "solteir[oa]|casad[oa]|divorciad[oa]|vi[úu]v[oa]|separad[oa](?: judicialmente)?|em uni[ãa]o est[áa]vel|convivente|companheir[oa]";
function estadoCivil(t) {
  t = (t || "").toLowerCase();
  if (/solteir/.test(t)) return "solteiro";
  if (/uni[ãa]o est[áa]vel|convivente|companheir/.test(t)) return "uniao_estavel";
  if (/divorciad/.test(t)) return "divorciado";
  if (/separad/.test(t)) return "separado";
  if (/vi[úu]v/.test(t)) return "viuvo";
  if (/casad/.test(t)) return "casado";
  return "";
}

// Endereço escrito por extenso: "Linha João Café Filho, s/n, interior, Anchieta/SC, CEP 89970-000"
function partirEndereco(txt) {
  const e = {};
  if (!txt) return e;
  const cep = txt.match(/(\d{2}\.?\d{3})\s*-\s*(\d{3})/) || txt.match(/\bCEP\D{0,5}(\d{5})(\d{3})\b/i);
  if (cep) e.cep = fmtCEP(so(cep[1]) + so(cep[2]));
  let s = txt.replace(/,?\s*CEP\b\D{0,5}[\d.\-\s]{8,11}/i, "").replace(/(\d{2}\.?\d{3})\s*-\s*(\d{3})/, "");
  const cid = s.match(/(?:munic[íi]pio|cidade|comarca)?\s*(?:de\s+)?([A-ZÀ-Ý][A-Za-zÀ-ÿ'´`\s]{2,40}?)\s*(?:\/|\s-\s|-)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  if (cid) { e.cidade = nomeProprio(cid[1].replace(/^(?:munic[íi]pio|cidade)\s+de\s+/i, "").trim()); e.uf = cid[2]; s = s.slice(0, cid.index); }
  const partes = s.split(/\s*,\s*|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  const resto = [];
  for (const p of partes) {
    let m;
    if (!e.logradouro && !resto.length) { e.logradouro = nomeProprio(p.replace(/^(?:na|no|em|à)\s+/i, "")); continue; }
    if (!e.numero && (m = p.match(/^(?:n[º°o.]*\s*)?(\d+[A-Za-z]?|s\.?\/?n\.?(?:º)?)$/i))) { e.numero = /^s/i.test(m[1]) ? "S/N" : m[1]; continue; }
    if (!e.bairro && (m = p.match(/^bairro\s+(.+)/i))) { e.bairro = nomeProprio(m[1]); continue; }
    if (!e.bairro && /^(interior|zona rural|centro|área rural)$/i.test(p)) { e.bairro = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); continue; }
    resto.push(p);
  }
  // número colado ao logradouro: "Rua das Flores 123" / "Rua das Flores nº 123"
  if (e.logradouro && !e.numero) {
    const m = e.logradouro.match(/^(.*?)[\s,]+(?:n[º°o.]*\s*)?(\d{1,5}[A-Za-z]?)$/i);
    if (m && m[1].length > 3) { e.logradouro = m[1]; e.numero = m[2]; }
  }
  if (!e.bairro && resto.length) { const b = resto.find((p) => !/apto|apartamento|casa|bloco|sala|lote|fundos/i.test(p) && p.length < 40); if (b) e.bairro = nomeProprio(b); }
  const comp = resto.filter((p) => /apto|apartamento|casa|bloco|sala|lote|fundos|km/i.test(p));
  if (comp.length) e.complemento = comp.join(", ");
  return e;
}

// 1) Qualificações em procurações, contratos e peças: "FULANO DE TAL, brasileiro, casado, agricultor, ..."
function qualificacoes(texto) {
  const pessoas = [];
  const t = texto.replace(/­/g, "").replace(/[ \t]+/g, " ");
  const re = new RegExp("([A-ZÀ-Ý][A-Za-zÀ-ÿ'´`.]+(?:[ \\n]+(?:d[aeo]s?|e|D[AEO]S?|E|[A-ZÀ-Ý][A-Za-zÀ-ÿ'´`.]+)){1,9})\\s*,\\s*(?:(?:maior|capaz|menor(?: impúbere| púbere)?|nascid[oa] em [\\d/.]+)\\s*,\\s*)*(" + NAC + "|" + EC + ")\\b", "g");
  let m;
  while ((m = re.exec(t))) {
    // o nome não atravessa linhas de cabeçalho: fica só o trecho depois da última quebra de linha
    let bruto = m[1].split("\n").pop();
    if (bruto.trim().split(/\s+/).length < 2) bruto = m[1].split("\n").slice(-2).join("\n");
    const ini = m.index + m[1].lastIndexOf(bruto);
    let nome = bruto.replace(/\s+/g, " ").trim();
    // remove palavras de ligação que antecedem o nome ("Outorgante: FULANO", "AUTOR: FULANO", "eu, FULANO")
    nome = nome.replace(/^(?:(?:Outorgante|Outorgado|Contratante|Contratad[oa]|Autor[a]?|Requerente|Declarante|Eu|Pelo presente|Nome|Cliente|Agravante|Exequente|Executad[oa]|Ré[u]?|Requerid[oa])\s*:?\s+)+/i, "");
    const palavras = nome.split(" ");
    if (palavras.length < 2 || nome.length > 90) continue;
    if (ESCRITORIO.test(nome) || ENTIDADES.test(nome)) continue;
    let bloco = t.slice(ini, ini + 900);
    // termina antes da qualificação da pessoa seguinte (segunda nacionalidade encontrada)
    const nacs = [...bloco.matchAll(new RegExp("\\b(" + NAC + ")\\b", "gi"))];
    if (nacs.length > 1) { const ate = bloco.slice(0, nacs[1].index); const d = Math.max(ate.lastIndexOf(";"), ate.lastIndexOf("."), ate.lastIndexOf(":"), ate.lastIndexOf("\n"), ate.lastIndexOf(" e ")); if (d > nome.length) bloco = bloco.slice(0, d); }
    const corte = bloco.slice(bruto.length).search(/\b(v[eê]m|propor|ajuizar|por (?:seu|sua|meio|interm[ée]dio)|neste ato|doravante|em face|nomeia|constitui|outorga|outorgad[oa]s?|requerer|celebram|resolvem|declara(?:,| para| que| sob))\b|\n\s*\n/i);
    if (corte > 0) bloco = bloco.slice(0, bruto.length + corte);
    if (/\bOAB\b/i.test(bloco.slice(0, 200)) && /advogad/i.test(bloco.slice(0, 200))) continue;
    const p = { nome: nomeProprio(nome), origem: "qualificação" };
    const nac = bloco.match(new RegExp("\\b(" + NAC + ")\\b", "i")); if (nac) p.nacionalidade = nac[1].toLowerCase().replace(/s$/, "");
    const ec = bloco.match(new RegExp("\\b(" + EC + ")\\b", "i")); if (ec) p.estado_civil = estadoCivil(ec[1]);
    const fem = /\b(brasileira|casada|solteira|divorciada|vi[úu]va|separada|portadora|inscrita|domiciliada|nascida|filha)\b/i.test(bloco), masc = /\b(brasileiro|casado|solteiro|divorciado|vi[úu]vo|separado|portador|inscrito|domiciliado|nascido|filho)\b/i.test(bloco);
    if (fem && !masc) p.sexo = "f"; else if (masc && !fem) p.sexo = "m";
    // profissão: primeiro trecho entre vírgulas que não seja nacionalidade, estado civil ou documento
    const pedacos = bloco.slice(bruto.length).split(",").map((x) => x.trim()).filter(Boolean);
    for (const pd of pedacos.slice(0, 6)) {
      if (new RegExp("^(" + NAC + "|" + EC + "|maior|capaz|menor.*|nascid.*|natural .*|filh[oa] .*)$", "i").test(pd)) continue;
      if (/\b(portador|inscrit|cpf|rg\b|identidade|residente|domiciliad|cnh|carteira|nit|pis|e-?mail|telefone|celular|cep)\b/i.test(pd)) break;
      if (/^[a-zà-ÿ][a-zà-ÿ\s\-/()]{2,40}$/i.test(pd) && pd.split(" ").length <= 5) { p.profissao = pd.toLowerCase(); break; }
    }
    const cpf = bloco.match(/\bCPF[^\d]{0,30}(\d{3}\.?\d{3}\.?\d{3}\s*-?\s*\d{2})/i) || bloco.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
    if (cpf && cpfOk(cpf[1])) p.cpf = fmtCPF(so(cpf[1]));
    const rg = bloco.match(new RegExp("(?:\\bRG\\b|R\\.G\\.|identidade|C\\.I\\.)[^\\d]{0,30}?([0-9][0-9.\\-xX ]{3,14}[0-9xX])\\s*(?:[-–,]?\\s*(?:expedid[oa] pel[oa]\\s*)?((?:" + ORGAOS + ")\\s*[\\/-]?\\s*(?:" + UFS + ")))?", "i"));
    if (rg) { p.rg = rg[1].trim(); if (rg[2]) p.rg_orgao = rg[2].toUpperCase().replace(/\s*[\/-]?\s*([A-Z]{2})$/, "/$1").replace(/\s+/g, ""); }
    const nasc = bloco.match(/nascid[oa] (?:em|aos?)\s*([\d]{1,2}[\/.\-][\d]{1,2}[\/.\-][\d]{4})/i); if (nasc) p.nascimento = dataISO(nasc[1]);
    const nat = bloco.match(/natural (?:de|do|da)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ\s']+?\s*[\/-]\s*(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO))\b/); if (nat) p.naturalidade = nat[1].replace(/\s*[\/-]\s*/, "/").trim();
    const fil = bloco.match(/filh[oa] de\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'\s]+?)\s+e de\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'\s]+?)\s*(?:,|\.|$)/);
    if (fil) { p.pai = nomeProprio(fil[1]); p.mae = nomeProprio(fil[2]); }
    const nit = bloco.match(/\b(?:NIT|PIS|PASEP|NIS)[^\d]{0,15}([\d.\-]{11,16})/i); if (nit) p.nit = nit[1];
    const em = bloco.match(/[\w.+-]+@[\w-]+\.[\w.]+/); if (em && !/portalcharles|moscon/i.test(em[0])) p.email = em[0].replace(/[.,;]$/, "").toLowerCase();
    const fone = bloco.match(/\(?\b(\d{2})\)?\s*(9?\s?\d{4})\s*-?\s*(\d{4})\b/); if (fone && !FONE_ESCRITORIO.test(fone[0]) && !/cpf|rg|cep/i.test(bloco.slice(Math.max(0, fone.index - 12), fone.index))) p.whatsapp = fone[1] + so(fone[2]) + fone[3];
    const end = bloco.match(/residente e domiciliad[oa]\s+(?:na|no|em|à)\s+(.+?)(?:\.\s|\.$|;|$)/is) || bloco.match(/(?:residente|domiciliad[oa]|com endere[çc]o)\s+(?:na|no|em|à)\s+(.+?)(?:\.\s|\.$|;|$)/is);
    if (end) Object.assign(p, partirEndereco(end[1].replace(/\s+/g, " ")));
    pessoas.push(p);
  }
  return pessoas;
}

// 2) Documento de identidade (RG, CIN, CNH) lido por imagem: rótulos seguidos dos valores
function identidade(texto) {
  const T = texto.toUpperCase();
  // só trata como documento de identidade se tiver ao menos dois rótulos típicos em linhas próprias
  const rot = [/^\s*NOME\b/m, /FILIA[ÇC][ÃA]O/, /REGISTRO GERAL/, /DOC\.?\s*IDENTIDADE/, /NATURALIDADE/, /HABILITA[ÇC][ÃA]O/, /DATA DE NASCIMENTO|DATA NASCIMENTO/, /CARTEIRA DE IDENTIDADE|CARTEIRA NACIONAL/];
  if (rot.filter((r) => r.test(T)).length < 2 || texto.length > 6000) return null;
  const linhas = texto.split(/\n/).map((l) => l.replace(/[|_~«»“”"]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const ehRotulo = (l) => /^(NOME|FILIA|NATURALIDADE|DATA|DOC|CPF|NASC|ORIGEM|ASSINATURA|REGISTRO|VALIDADE|EXPEDI|CAT\.?\s?HAB|N[º°]?\s?REGISTRO|PERMISS|ACC|OBSERVA|LOCAL|SEXO|NACIONALIDADE|RG\b|ÓRG|ORG)/i.test(l);
  const ehNome = (l) => /^[A-ZÀ-Ý'´`\s]{5,70}$/.test(l.toUpperCase()) && l.split(" ").filter((x) => x.length > 1).length >= 2 && !ehRotulo(l) && !ENTIDADES.test(l) && !/REP[ÚU]BLICA|FEDERATIVA|BRASIL|SECRETARIA|SEGURAN[ÇC]A|DEPARTAMENTO|TR[ÂA]NSITO|CARTEIRA|NACIONAL|V[ÁA]LIDA|TERRIT[ÓO]RIO|INSTITUTO|POL[ÍI]CIA|IDENTIFICA/i.test(l);
  const limpaNome = (l) => l.replace(/[^A-Za-zÀ-ÿ'´`\s]/g, " ").replace(/\s+/g, " ").trim();
  const depois = (re, max = 3) => { const i = linhas.findIndex((l) => re.test(l)); if (i < 0) return []; const resto = linhas[i].replace(re, "").replace(/^[\s:./-]+/, ""); return [resto, ...linhas.slice(i + 1, i + 1 + max)]; };
  const p = { origem: "documento de identidade" };
  for (const l of depois(/\bNOME(?!\s*(SOCIAL|D[OA]\s+(PAI|M[ÃA]E)))\b\s*(\/\s*NAME)?/i, 2)) { const n = limpaNome(l); if (n && ehNome(n)) { p.nome = nomeProprio(n); break; } }
  const fil = []; for (const l of depois(/FILIA[ÇC][ÃA]O|FILIATION/i, 4)) { if (!l) continue; if (ehRotulo(l) && fil.length) break; const n = limpaNome(l); if (ehNome(n)) fil.push(nomeProprio(n)); if (fil.length === 2) break; }
  if (fil.length === 2) { p.pai = fil[0]; p.mae = fil[1]; } else if (fil.length === 1) p.mae = fil[0];
  for (const l of depois(/NASC|DATE OF BIRTH/i, 2)) { const d = dataISO(l); if (d) { p.nascimento = d; break; } }
  if (!p.nascimento) { const ds = [...texto.matchAll(/\b\d{2}[\/.\-]\d{2}[\/.\-]\d{4}\b/g)].map((m) => dataISO(m[0])).filter(Boolean).sort(); const ano = new Date().getFullYear(); const d = ds.find((x) => +x.slice(0, 4) < ano - 5); if (d) p.nascimento = d; }
  for (const l of depois(/NATURALIDADE|PLACE OF BIRTH|LOCAL DE NASC/i, 2)) { const m = l.match(/([A-ZÀ-Ýa-zà-ÿ'\s]{3,40}?)\s*[\/-]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i); if (m) { p.naturalidade = nomeProprio(m[1].trim()) + "/" + m[2].toUpperCase(); break; } }
  const rgL = depois(/REGISTRO\s+GERAL|DOC\.?\s*IDENTIDADE|N[º°]?\s*DO\s*RG|\bR\.?\s?G\.?\b/i, 2);
  for (const l of rgL) { const m = l.match(new RegExp("([0-9][0-9.\\-xX]{4,13}[0-9xX])\\s*(?:(" + ORGAOS + ")\\s*[\\/-]?\\s*(" + UFS + "))?", "i")); if (m && (!cpfOk(m[1]) || /RG|REGISTRO|IDENTIDADE/i.test(l))) { p.rg = m[1]; if (m[2]) p.rg_orgao = m[2].toUpperCase() + "/" + m[3].toUpperCase(); break; } }
  if (!p.rg_orgao) { const o = T.match(new RegExp("\\b(" + ORGAOS + ")\\s*[\\/-]?\\s*(" + UFS + ")\\b")); if (o) p.rg_orgao = o[1] + "/" + o[2]; }
  const cpfs = [...texto.matchAll(/(\d{3})\s*\.?\s*(\d{3})\s*\.?\s*(\d{3})\s*[-–.]?\s*(\d{2})/g)].map((m) => m[1] + m[2] + m[3] + m[4]).filter(cpfOk);
  if (cpfs.length) p.cpf = fmtCPF(cpfs[0]);
  if (/\bSEXO\b[^A-Z]{0,5}F\b/.test(T)) p.sexo = "f"; else if (/\bSEXO\b[^A-Z]{0,5}M\b/.test(T)) p.sexo = "m";
  return p.nome ? p : null;
}

// 3) Comprovante de endereço: procura o CEP e a linha do endereço do titular
function comprovante(texto, nomeAlvo) {
  const linhas = texto.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const alvo = (nomeAlvo || "").toUpperCase();
  const cands = [];
  linhas.forEach((l, i) => {
    const m = l.match(/(\d{2}\.?\d{3})\s*-\s*(\d{3})\b/) || l.match(/\bCEP\D{0,4}(\d{5})(\d{3})\b/i);
    if (!m) return;
    const cep = so(m[1]) + so(m[2]);
    const viz = linhas.slice(Math.max(0, i - 4), i + 1).join(" | ").toUpperCase();
    let nota = 0;
    if (alvo && viz.includes(alvo.split(" ")[0]) && viz.includes(alvo.split(" ").slice(-1)[0])) nota += 4;
    if (/\b(RUA|R\.|AV\.?|AVENIDA|LINHA|ESTRADA|RODOVIA|TRAVESSA|COMUNIDADE|S[ÍI]TIO|INTERIOR|LOTE|LOTEAMENTO|ALAMEDA|BR-|SC-|PR-|VILA)\b/.test(viz)) nota += 2;
    if (/CNPJ|INSCRI[ÇC][ÃA]O ESTADUAL|SAC|OUVIDORIA|CENTRAL DE ATENDIMENTO|WWW\.|SEDE/.test(viz)) nota -= 4;
    // linha do endereço: a própria linha (sem o CEP) ou as anteriores que pareçam endereço
    let end = l.replace(m[0], "").replace(/\bCEP\b[:\s]*/i, "").trim();
    const ant = linhas.slice(Math.max(0, i - 2), i).filter((x) => /\b(RUA|R\.|AV|AVENIDA|LINHA|ESTRADA|RODOVIA|TRAVESSA|COMUNIDADE|S[ÍI]TIO|INTERIOR|LOTE|ALAMEDA|BAIRRO|VILA|CENTRO)\b/i.test(x) || /,\s*\d+/.test(x));
    if (ant.length) end = ant.join(", ") + (end ? ", " + end : "");
    cands.push({ nota, end, cep });
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.nota - a.nota);
  const c = cands[0];
  if (c.nota < 0) return null;
  const e = partirEndereco(c.end + ", CEP " + fmtCEP(c.cep));
  e.cep = fmtCEP(c.cep);
  e.origem = "comprovante de endereço";
  return e;
}

const CAMPOS = ["nome", "cpf", "rg", "rg_orgao", "sexo", "nascimento", "estado_civil", "nacionalidade", "profissao", "naturalidade", "mae", "pai", "email", "whatsapp", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "nit"];
const chave = (p) => (p.cpf ? so(p.cpf) : (p.nome || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "));
const semAcento = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const temAcento = (x) => /[À-ÿ]/.test(x);
function juntar(a, b) {
  for (const k of CAMPOS) {
    if (!b[k]) continue;
    if (!a[k]) { a[k] = b[k]; (a.fontes ||= {})[k] = b.fonte; }
    // mesmo valor, mas um veio sem acento (leitura de imagem): fica a versão acentuada
    else if (semAcento(a[k]) === semAcento(b[k]) && !temAcento(a[k]) && temAcento(b[k])) a[k] = b[k];
  }
  return a;
}

// Recebe [{nome, texto}] e devolve { pessoas: [...], endereco, processos: [...] }
export function extrairDados(docs) {
  const pessoas = [];
  const add = (p, fonte) => {
    p.fonte = fonte; p.fontes = Object.fromEntries(CAMPOS.filter((k) => p[k]).map((k) => [k, fonte]));
    const k = chave(p);
    const ja = pessoas.find((x) => chave(x) === k || (p.cpf && x.cpf === p.cpf) || (p.nome && x.nome && x.nome.toUpperCase() === p.nome.toUpperCase()));
    if (ja) juntar(ja, p); else pessoas.push(p);
  };
  const comQualificacao = new Set();
  for (const d of docs) {
    if (!d.texto) continue;
    const id = identidade(d.texto); if (id) { add(id, d.nome); comQualificacao.add(d); }
    const qs = qualificacoes(d.texto);
    for (const q of qs) add(q, d.nome);
    if (qs.some((q) => q.cep || q.logradouro)) comQualificacao.add(d);
  }
  // identidade primeiro (é o documento do próprio cliente); depois quem tem mais dados
  pessoas.sort((a, b) => (b.origem === "documento de identidade") - (a.origem === "documento de identidade") || Object.keys(b.fontes).length - Object.keys(a.fontes).length);
  let endereco = null;
  for (const d of docs) {
    if (!d.texto || comQualificacao.has(d)) continue;  // procuração, peça ou RG não são comprovante de endereço
    const e = comprovante(d.texto, pessoas[0] && pessoas[0].nome);
    if (e && (!endereco || (/comprovante|conta|fatura|luz|energia|[áa]gua|celesc|copel|telefone|internet|claro|vivo|tim\b|oi\b/i.test(d.nome + " " + d.texto.slice(0, 800)) && !endereco.forte))) {
      endereco = Object.assign(e, { fonte: d.nome, forte: /comprovante|conta|fatura|luz|energia|[áa]gua|celesc|copel/i.test(d.nome + " " + d.texto.slice(0, 800)) });
    }
  }
  const processos = [...new Set(docs.flatMap((d) => [...(d.texto || "").matchAll(/\b(\d{7})\s*-\s*(\d{2})\s*\.\s*(\d{4})\s*\.\s*(\d)\s*\.\s*(\d{2})\s*\.\s*(\d{4})\b/g)].map((m) => `${m[1]}-${m[2]}.${m[3]}.${m[4]}.${m[5]}.${m[6]}`)))].slice(0, 5);
  return { pessoas, endereco, processos };
}

export const ROTULOS = {
  nome: "Nome", cpf: "CPF", rg: "RG", rg_orgao: "Órgão expedidor", sexo: "Sexo", nascimento: "Nascimento", estado_civil: "Estado civil",
  nacionalidade: "Nacionalidade", profissao: "Profissão", naturalidade: "Naturalidade", mae: "Nome da mãe", pai: "Nome do pai",
  email: "E-mail", whatsapp: "WhatsApp", cep: "CEP", logradouro: "Logradouro", numero: "Número", complemento: "Complemento",
  bairro: "Bairro / localidade", cidade: "Cidade", uf: "UF", nit: "NIT / PIS",
};
export { CAMPOS };
