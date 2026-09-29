// Área do Cliente | Charles Borges Advocacia
// Montagem dos dados e geração dos documentos (procuração, contratos e declarações) a partir dos modelos DOCX.

const UF_NOME = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};
export const ESTADOS_CIVIS = {
  solteiro: ["solteiro", "solteira"],
  casado: ["casado", "casada"],
  uniao_estavel: ["em união estável", "em união estável"],
  divorciado: ["divorciado", "divorciada"],
  separado: ["separado judicialmente", "separada judicialmente"],
  viuvo: ["viúvo", "viúva"],
};
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const MODELOS = {
  procuracao: { arquivo: "procuracao.docx", nome: "Procuração" },
  contrato_previdenciario: { arquivo: "contrato_previdenciario.docx", nome: "Contrato de honorários (previdenciário, percentual)" },
  contrato_fixo: { arquivo: "contrato_fixo.docx", nome: "Contrato de honorários (valor fixo)" },
  contrato_misto: { arquivo: "contrato_misto.docx", nome: "Contrato de honorários (fixo + êxito)" },
  declaracao_hipossuficiencia: { arquivo: "declaracao_hipossuficiencia.docx", nome: "Declaração de hipossuficiência" },
  declaracao_residencia: { arquivo: "declaracao_residencia.docx", nome: "Declaração de residência" },
};

// ---------------- números por extenso ----------------
const UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze",
  "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n) {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100, partes = [];
  if (c) partes.push(CEN[c]);
  if (r) {
    if (r < 20) partes.push(UNI[r]);
    else { const d = Math.floor(r / 10), u = r % 10; partes.push(u ? DEZ[d] + " e " + UNI[u] : DEZ[d]); }
  }
  return partes.join(" e ");
}
export function inteiroExtenso(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "zero";
  const grupos = [];
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  const nomes = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let txt = i === 1 && g === 1 ? "mil" : ate999(g) + (i ? " " + nomes[i][g === 1 ? 0 : 1] : "");
    partes.push({ txt, g, i });
  }
  let s = "";
  partes.forEach((p, k) => {
    if (k === 0) { s = p.txt; return; }
    const ultimo = k === partes.length - 1;
    // "e" antes do último grupo quando ele é menor que 100 ou centena redonda
    s += ultimo && (p.g < 100 || p.g % 100 === 0) ? " e " + p.txt : " " + p.txt;
  });
  return s;
}
export function reaisExtenso(valor) {
  const cent = Math.round(Number(valor) * 100);
  const r = Math.floor(cent / 100), c = cent % 100;
  const partes = [];
  if (r) {
    const milhoesRedondos = r >= 1000000 && r % 1000000 === 0;
    partes.push(inteiroExtenso(r) + (milhoesRedondos ? " de reais" : r === 1 ? " real" : " reais"));
  }
  if (c) partes.push(inteiroExtenso(c) + (c === 1 ? " centavo" : " centavos"));
  return partes.length ? partes.join(" e ") : "zero real";
}
export function moeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}
export function dataExtenso(d) {
  const [a, m, dia] = d.split("-").map(Number);
  return `${dia === 1 ? "1º" : dia} de ${MESES[m - 1]} de ${a}`;
}
const dataBR = (d) => d.split("-").reverse().join("/");

// ---------------- qualificação ----------------
function idade(nasc) {
  if (!nasc) return null;
  const [a, m, d] = nasc.split("-").map(Number), h = new Date();
  let i = h.getFullYear() - a;
  if (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) i--;
  return i;
}
const g = (sexo, masc, fem) => (sexo === "f" ? fem : masc);
function nacionalidade(n, sexo) {
  const v = String(n || "brasileira").trim().toLowerCase();
  if (v === "brasileira" || v === "brasileiro") return g(sexo, "brasileiro", "brasileira");
  return v;
}
export function endereco(c, comCidade = true) {
  if (!c.logradouro) return "";
  const log = c.logradouro.trim();
  const partes = [log];
  const num = String(c.numero || "").trim();
  if (num) partes.push(/^s\/?n$/i.test(num) ? "S/N" : "nº " + num);
  if (c.complemento) partes.push(c.complemento.trim());
  if (c.bairro) partes.push(c.bairro.trim());
  if (c.cep) partes.push("CEP " + c.cep.trim());
  if (comCidade && c.cidade) partes.push("Município de " + c.cidade.trim() + (c.uf ? ", Estado de " + (UF_NOME[c.uf.toUpperCase()] || c.uf) : ""));
  return partes.join(", ");
}
function prep(log) {
  return /^(travessão|sítio|loteamento|condomínio|distrito|assentamento|km|lote|conjunto|núcleo|parque|jardim)\b/i.test(log || "") ? "no" : "na";
}
function docs(p, sexo) {
  const x = [];
  if (p.rg) x.push(`${g(sexo, "portador", "portadora")} da Carteira de Identidade RG nº ${p.rg}` + (p.rg_orgao ? `, expedida pela ${p.rg_orgao}` : ""));
  if (p.cpf) x.push(`${g(sexo, "inscrito", "inscrita")} no CPF/MF sob o nº ${p.cpf}`);
  return x;
}

function qualifPessoa(p, sexo, { comEndereco = true, extraApos = [] } = {}) {
  const x = [nacionalidade(p.nacionalidade, sexo), ...extraApos];
  if (p.estado_civil && ESTADOS_CIVIS[p.estado_civil]) x.push(ESTADOS_CIVIS[p.estado_civil][sexo === "f" ? 1 : 0]);
  if (p.profissao) x.push(p.profissao.trim());
  x.push(...docs(p, sexo));
  if (comEndereco && p.logradouro) x.push(`${g(sexo, "residente e domiciliado", "residente e domiciliada")} ${prep(p.logradouro)} ${endereco(p)}`);
  return x;
}

function representante(c) {
  return {
    nacionalidade: "brasileira", estado_civil: c.rep_estado_civil, profissao: c.rep_profissao,
    rg: c.rep_rg, rg_orgao: c.rep_rg_orgao, cpf: c.rep_cpf,
  };
}

// Monta todos os campos do documento. Retorna { dados, faltando }
export function montarDados(c, op) {
  const faltando = [];
  const pj = c.tipo_pessoa === "pj";
  const sexo = pj ? "f" : c.sexo === "f" ? "f" : "m";
  const anos = idade(c.nascimento);
  const menor = !pj && anos !== null && anos < 18;
  const temRep = !!(c.rep_nome && c.rep_nome.trim());
  const repSexo = c.rep_sexo === "f" ? "f" : "m";
  const NOME = String(c.nome || "").trim().toUpperCase();

  if (!c.nome) faltando.push("nome");
  if (pj) { if (!c.cnpj) faltando.push("CNPJ"); if (!temRep) faltando.push("representante legal (sócio)"); }
  else {
    if (!c.cpf) faltando.push("CPF");
    if (!menor && !temRep && !c.estado_civil) faltando.push("estado civil");
    if (menor && !temRep) faltando.push("representante legal (menor de idade)");
  }
  if (!c.logradouro) faltando.push("endereço (logradouro)");
  if (!c.cidade) faltando.push("cidade");
  if (!c.uf) faltando.push("UF");
  if (temRep && !c.rep_cpf) faltando.push("CPF do representante");

  let qualif = "", qualifSemEnd = "";
  if (pj) {
    const sede = c.logradouro ? `, com sede ${prep(c.logradouro)} ${endereco(c)}` : "";
    const rep = temRep ? `, neste ato representada por ${g(repSexo, "seu", "sua")} ${c.rep_qualidade || g(repSexo, "sócio administrador", "sócia administradora")}, ${c.rep_nome.trim().toUpperCase()}, ` +
      qualifPessoa(representante(c), repSexo, { comEndereco: false }).join(", ") : "";
    qualif = `, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${c.cnpj || ""}${sede}${rep}`;
    qualifSemEnd = `, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${c.cnpj || ""}${rep}`;
  } else {
    const extra = [];
    if (menor) extra.push(anos < 16 ? g(sexo, "menor impúbere", "menor impúbere") : g(sexo, "menor púbere", "menor púbere"));
    const base = qualifPessoa(c, sexo, { extraApos: extra });
    const baseSemEnd = qualifPessoa(c, sexo, { comEndereco: false, extraApos: extra });
    let rep = "";
    if (temRep) {
      const verbo = menor && anos >= 16 ? g(sexo, "assistido", "assistida") : g(sexo, "representado", "representada");
      const qual = c.rep_qualidade || (menor ? g(repSexo, "genitor", "genitora") : g(repSexo, "curador", "curadora"));
      rep = `, neste ato ${verbo} por ${g(repSexo, "seu", "sua")} ${qual}, ${c.rep_nome.trim().toUpperCase()}, ` +
        qualifPessoa(representante(c), repSexo, { comEndereco: false }).join(", ");
    }
    qualif = ", " + base.join(", ") + rep;
    qualifSemEnd = ", " + baseSemEnd.join(", ") + rep;
  }

  const adv = op.advogados || "ambos"; // ambos | charles | elmo
  const hoje = op.data || new Date().toISOString().slice(0, 10);
  const perc = Number(op.percentual || 30);
  const dados = {
    NOME, qualif, qualif_sem_endereco: qualifSemEnd,
    rotulo_outorgante: pj ? "Outorgante" : g(sexo, "Outorgante", "Outorgante"),
    art: pj || sexo === "f" ? "a" : "o", outorgante: "outorgante",
    art_declarante: pj || sexo === "f" ? "a declarante" : "o declarante",
    domiciliado: g(sexo, "domiciliado", "domiciliada"),
    endereco_completo: endereco(c),
    ambos: adv === "ambos", so_charles: adv === "charles", so_elmo: adv === "elmo", um_so: adv !== "ambos",
    aos_advogados: adv === "ambos" ? "aos Advogados acima descritos" : "ao Advogado acima descrito",
    hipo: op.hipossuficiencia !== false,
    FINALIDADE: String(op.finalidade || "PROPOR AÇÃO CÍVEL").trim().toUpperCase(),
    OBJETO: String(op.objeto || "").trim(),
    percentual: String(perc).replace(".", ","),
    percentual_extenso: inteiroExtenso(Math.round(perc)),
    valor_fixo: moeda(op.valor_fixo), valor_fixo_extenso: reaisExtenso(op.valor_fixo || 0),
    forma_pagamento: formaPagamento(op),
    cidade_data: `${op.cidade || "Anchieta (SC)"}, ${dataExtenso(hoje)}.`,
    ASSINANTE: (temRep ? c.rep_nome : c.nome || "").trim().toUpperCase(),
    rep: temRep,
    rep_linha: temRep ? (pj ? "representante legal de " : g(repSexo, "representante legal de ", "representante legal de ")) + NOME : "",
  };
  if (op.modelo && op.modelo.startsWith("contrato") && !dados.OBJETO) faltando.push("objeto do contrato");
  if ((op.modelo === "contrato_fixo" || op.modelo === "contrato_misto") && !(Number(op.valor_fixo) > 0)) faltando.push("valor dos honorários");
  if (op.modelo === "declaracao_residencia" && !c.logradouro) faltando.push("endereço");
  return { dados, faltando: [...new Set(faltando)] };
}

// Divide o valor em parcelas (centavos exatos; a diferença vai na última)
export function dividirParcelas(total, n, primeiro) {
  n = Math.max(1, parseInt(n || 1, 10));
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / n), resto = cents - base * n;
  const out = [];
  const [a, m, d] = (primeiro || new Date().toISOString().slice(0, 10)).split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(a, m - 1 + i, 1));
    const ultimoDia = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setUTCDate(Math.min(d, ultimoDia));
    out.push({ vencimento: dt.toISOString().slice(0, 10), valor: (base + (i === n - 1 ? resto : 0)) / 100 });
  }
  return out;
}

export function formaPagamento(op) {
  const n = Math.max(1, parseInt(op.parcelas || 1, 10));
  if (op.a_vista || !op.primeiro_vencimento) return "a ser pago à vista, no ato da assinatura deste contrato";
  const ps = dividirParcelas(op.valor_fixo || 0, n, op.primeiro_vencimento);
  if (n === 1) return `a ser pago em parcela única, com vencimento em ${dataBR(ps[0].vencimento)}`;
  const iguais = ps.every((p) => p.valor === ps[0].valor);
  const v = (x) => `${moeda(x)} (${reaisExtenso(x)})`;
  return `a ser pago em ${n} (${inteiroExtenso(n)}) parcelas mensais e sucessivas de ${v(ps[0].valor)}` +
    (iguais ? "" : `, sendo a última de ${v(ps[n - 1].valor)}`) +
    `, com vencimento da primeira em ${dataBR(ps[0].vencimento)} e as demais no mesmo dia dos meses subsequentes`;
}

// Gera e baixa o DOCX (navegador). Requer PizZip e docxtemplater carregados.
export async function gerarDocx(modelo, dados, nomeArquivo) {
  const r = await fetch("modelo-" + MODELOS[modelo].arquivo, { cache: "no-cache" });
  if (!r.ok) throw new Error("Modelo não encontrado: " + MODELOS[modelo].arquivo);
  const zip = new window.PizZip(await r.arrayBuffer());
  const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  doc.render(dados);
  const blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
