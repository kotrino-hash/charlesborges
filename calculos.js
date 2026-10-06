// Motor de cálculos do painel: valor da causa previdenciário, atrasados e atualização monetária.
// Módulo puro (sem acesso ao banco), para poder ser testado isoladamente.

// Salário mínimo nacional: [competência inicial "AAAA-MM", valor]
export const SALARIO_MINIMO = [
  ["2000-04", 151], ["2001-04", 180], ["2002-04", 200], ["2003-04", 240], ["2004-05", 260], ["2005-05", 300],
  ["2006-04", 350], ["2007-04", 380], ["2008-03", 415], ["2009-02", 465], ["2010-01", 510], ["2011-01", 540],
  ["2011-03", 545], ["2012-01", 622], ["2013-01", 678], ["2014-01", 724], ["2015-01", 788], ["2016-01", 880],
  ["2017-01", 937], ["2018-01", 954], ["2019-01", 998], ["2020-01", 1039], ["2020-02", 1045], ["2021-01", 1100],
  ["2022-01", 1212], ["2023-01", 1302], ["2023-05", 1320], ["2024-01", 1412], ["2025-01", 1518], ["2026-01", 1621],
];

export const NOMES_INDICE = { inpc: "INPC", ipca: "IPCA", ipcae: "IPCA-E", igpm: "IGP-M", selic: "SELIC", fselic: "Fator SELIC da taxa legal", taxalegal: "Taxa legal", "taxa legal": "Taxa legal" };
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ---------- datas por mês ----------
// "mês" = inteiro ano*12 + (mês-1)
export const mesDe = (d) => { const [a, m] = d.split("-").map(Number); return a * 12 + m - 1; };
export const rotuloMes = (k) => `${MES[k % 12]}/${Math.floor(k / 12)}`;
export const compStr = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
const diaDe = (d) => Number(d.split("-")[2]);
const diasNoMes = (k) => new Date(Date.UTC(Math.floor(k / 12), (k % 12) + 1, 0)).getUTCDate();
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const K = (a, m) => a * 12 + m - 1;
const DEZ2021 = K(2021, 12), AGO2025 = K(2025, 8), SET2024 = K(2024, 9), AGO2024 = K(2024, 8), JUL2009 = K(2009, 7), MAI2012 = K(2012, 5);
export const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "");
export function somaAnos(d, n) { const [a, m, dia] = d.split("-").map(Number); const x = new Date(Date.UTC(a + n, m - 1, dia)); return x.toISOString().slice(0, 10); }
export function somaDias(d, n) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// Salário mínimo: usa a série do Banco Central (SGS 1619) quando carregada; a tabela acima é a reserva.
let SM_BCB = null, SM_BCB_ULT = null;
export function smEm(k) {
  if (SM_BCB && SM_BCB.size) {
    if (SM_BCB.has(k)) return SM_BCB.get(k);
    if (k > SM_BCB_ULT) return SM_BCB.get(SM_BCB_ULT);
  }
  let v = null;
  for (const [c, val] of SALARIO_MINIMO) if (mesDe(c + "-01") <= k) v = val;
  return v;
}

// rows: [{serie, competencia:"AAAA-MM-DD", valor}]
export function prepararIndices(rows) {
  const I = { inpc: new Map(), ipca: new Map(), ipcae: new Map(), igpm: new Map(), selic: new Map(), fselic: new Map(), taxalegal: new Map(), ultimo: {} };
  const sm = new Map();
  for (const r of rows) {
    if (r.serie === "sm") { const k = mesDe(r.competencia); sm.set(k, Number(r.valor)); SM_BCB_ULT = Math.max(SM_BCB_ULT ?? -1, k); continue; }
    if (!I[r.serie]) continue;
    const k = mesDe(r.competencia);
    I[r.serie].set(k, Number(r.valor) / 100);
    I.ultimo[r.serie] = Math.max(I.ultimo[r.serie] ?? -1, k);
  }
  if (sm.size) SM_BCB = sm;
  I.ultimo.sm = SM_BCB_ULT;
  return I;
}

// Acumuladores de índice num intervalo de meses [de, ate]; registra meses sem índice publicado
function produto(I, serie, de, ate, faltas) {
  let f = 1;
  for (let k = de; k <= ate; k++) {
    const v = I[serie].get(k);
    if (v === undefined) { faltas.add(serie + ":" + k); continue; }
    f *= 1 + v;
  }
  return f;
}
function soma(I, serie, de, ate, faltas) {
  let s = 0;
  for (let k = de; k <= ate; k++) {
    const v = I[serie].get(k);
    if (v === undefined) { faltas.add(serie + ":" + k); continue; }
    s += v;
  }
  return s;
}
// Taxa legal no regime previdenciário do Manual CJF: fator SELIC do mês (SGS 29541) deduzido o INPC do mês anterior, mínimo zero
function taxaLegalINPC(I, k, faltas) {
  const s = I.fselic.get(k), d = I.inpc.get(k - 1);
  if (s === undefined || d === undefined) { faltas.add("taxa legal:" + k); return 0; }
  return Math.max(0, (1 + s) / (1 + d) - 1);
}
// Taxa legal do art. 406 do Código Civil, publicada pelo Banco Central (SGS 29543)
function taxaLegalCC(I, k, faltas) {
  const v = I.taxalegal.get(k);
  if (v === undefined) { faltas.add("taxalegal:" + k); return 0; }
  return Math.max(0, v);
}
function jurosPoupanca(I, k, faltas) {
  if (k < JUL2009) return 0.01;
  if (k < MAI2012) return 0.005;
  const s = I.selic.get(k);
  if (s === undefined) { faltas.add("selic:" + k); return 0.005; }
  return Math.pow(1 + s, 12) - 1 > 0.085 ? 0.005 : 0.7 * s;
}
// fração de juros do mês k, considerando início (data) e fim (data exclusiva)
function fracaoMes(k, ini, fim) {
  const dm = diasNoMes(k);
  const a = mesDe(ini) === k ? diaDe(ini) : 1;
  const b = mesDe(fim) === k ? diaDe(fim) - 1 : dm;
  return Math.max(0, b - a + 1) / dm;
}
function textoFaltas(faltas) {
  if (!faltas.size) return [];
  const por = {};
  for (const f of faltas) { const [s, k] = f.split(":"); (por[s] ||= []).push(Number(k)); }
  return Object.entries(por).map(([s, ks]) => {
    ks.sort((a, b) => a - b);
    return `${NOMES_INDICE[s] || s} sem índice publicado em ${ks.length === 1 ? rotuloMes(ks[0]) : rotuloMes(ks[0]) + " a " + rotuloMes(ks[ks.length - 1])} (considerado zero).`;
  });
}

// ============================================================
// Correção de uma parcela previdenciária pelo Manual de Cálculos da Justiça Federal (Res. CJF 990/2026)
//   até 11/2021: INPC | 12/2021 a 08/2025: SELIC (única, soma simples) | a partir de 09/2025: INPC
//   juros de mora (se houver citação): até 11/2021 os da poupança (1% a.m. até 06/2009; 0,5% a.m. até 04/2012; depois 0,5% ou 70% da SELIC);
//   12/2021 a 08/2025 englobados na SELIC; a partir de 09/2025 taxa legal (fator SELIC do mês deduzido o INPC do mês anterior, mínimo zero).
// ============================================================
function corrigirPrev(I, valor, venc, C, dataCalc, jurosDesde, faltas) {
  // venc: mês de vencimento; índices do mês de vencimento até o mês anterior ao do cálculo
  const ult = C - 1;
  const fA = venc <= Math.min(ult, DEZ2021 - 1) ? produto(I, "inpc", venc, Math.min(ult, DEZ2021 - 1), faltas) : 1;
  const sB = Math.max(venc, DEZ2021) <= Math.min(ult, AGO2025) ? soma(I, "selic", Math.max(venc, DEZ2021), Math.min(ult, AGO2025), faltas) : 0;
  const fC = Math.max(venc, AGO2025 + 1) <= ult ? produto(I, "inpc", Math.max(venc, AGO2025 + 1), ult, faltas) : 1;
  let jA = 0, jC = 0;
  if (jurosDesde) {
    const ini = jurosDesde > `${compStr(venc)}-01` ? jurosDesde : `${compStr(venc)}-01`;
    const kIni = mesDe(ini);
    for (let k = kIni; k <= Math.min(ult, DEZ2021 - 1); k++) jA += jurosPoupanca(I, k, faltas) * fracaoMes(k, ini, dataCalc);
    for (let k = Math.max(kIni, AGO2025 + 1); k <= C; k++) jC += taxaLegalINPC(I, k, faltas) * fracaoMes(k, ini, dataCalc);
  }
  let fatorCorr = fA * (1 + sB) * fC;
  if (fatorCorr < 1) fatorCorr = 1; // deflação não reduz o valor nominal
  const corrigido = valor * fatorCorr;
  const juros = valor * fA * jA * (1 + sB) * fC + corrigido * jC;
  return { fator: fatorCorr, corrigido, juros, selic: sB };
}

// Valor mensal do benefício na competência k
function serieMensal(p, I, kIni, kFim) {
  const out = new Map();
  if (p.rmiModo === "sm") { for (let k = kIni; k <= kFim; k++) out.set(k, smEm(k)); return { out, reajustes: [] }; }
  const kDib = mesDe(p.dib);
  let teorico = Number(p.rmi) || 0;
  const reajustes = [];
  for (let k = kDib; k <= kFim; k++) {
    if (k > kDib && k % 12 === 0) { // janeiro: reajuste pelo INPC do ano anterior, proporcional à DIB (art. 41-A da Lei 8.213/91)
      const de = Math.max(kDib, k - 12);
      const f = new Set();
      const fator = produto(I, "inpc", de, k - 1, f);
      teorico = r2(teorico * fator);
      reajustes.push({ ano: k / 12, percentual: (fator - 1) * 100, valor: teorico });
    }
    if (k >= kIni) {
      const sm = smEm(k);
      out.set(k, p.pisoSM && sm && teorico < sm ? sm : teorico);
    }
  }
  return { out, reajustes };
}

export function calcularPrevidenciario(p, I) {
  const faltas = new Set();
  const avisos = [];
  const atrasados = p.modo === "atrasados";
  const dataCalc = atrasados ? (p.dataCalculo || p.ajuizamento) : p.ajuizamento;
  const C = mesDe(dataCalc);
  const kAj = mesDe(p.ajuizamento);
  // período das parcelas vencidas
  let inicio = p.dib;
  let prescritoAte = null;
  if (p.prescricao) {
    const corte = somaAnos(p.ajuizamento, -5);
    if (corte > inicio) { inicio = corte; prescritoAte = somaDias(corte, -1); }
  }
  // fim (data inclusiva)
  let fim = atrasados ? somaDias(p.dip || dataCalc, -1) : somaDias(`${compStr(kAj)}-01`, -1);
  if (p.dcb && p.dcb < fim) fim = p.dcb;
  const kIni = mesDe(inicio), kFim = mesDe(fim);
  const { out: mensal, reajustes } = serieMensal(p, I, Math.min(kIni, kAj), Math.max(kFim, kAj, C));
  const linhas = [];
  const jurosDesde = atrasados && p.citacao ? p.citacao : null;
  const add = (rot, k, valor, venc, extra = {}) => {
    const c = corrigirPrev(I, valor, venc, C, dataCalc, jurosDesde, faltas);
    linhas.push({ rotulo: rot, competencia: compStr(k), devido: r2(valor), fator: c.fator, corrigido: r2(c.corrigido), juros: r2(c.juros), total: r2(r2(c.corrigido) + r2(c.juros)), ...extra });
  };
  if (inicio <= fim) {
    const dias13 = {}; // ano -> meses com 15 dias ou mais
    for (let k = kIni; k <= kFim; k++) {
      const dm = diasNoMes(k);
      const a = k === kIni ? diaDe(inicio) : 1;
      const b = k === kFim ? diaDe(fim) : dm;
      const dias = b - a + 1;
      const frac = dias / dm;
      const base = mensal.get(k) || 0;
      add(rotuloMes(k), k, base * frac, k + 1, { base, dias: dias < dm ? dias : null });
      const ano = Math.floor(k / 12);
      dias13[ano] ||= { meses: 0, ultimo: k };
      if (dias >= 15) dias13[ano].meses++;
      dias13[ano].ultimo = k;
    }
    if (p.decimoTerceiro) {
      for (const [ano, d] of Object.entries(dias13)) {
        if (!d.meses) continue;
        const kRef = d.ultimo;
        const base = mensal.get(kRef) || 0;
        const completo = d.meses === 12;
        const idx = linhas.findIndex((l) => l.competencia === compStr(kRef));
        const c = corrigirPrev(I, base * d.meses / 12, kRef + 1, C, dataCalc, jurosDesde, faltas);
        linhas.splice(idx + 1, 0, { rotulo: `13º/${ano}${completo ? "" : ` (${d.meses}/12)`}`, competencia: compStr(kRef), decimo: true,
          devido: r2(base * d.meses / 12), base, fator: c.fator, corrigido: r2(c.corrigido), juros: r2(c.juros), total: r2(r2(c.corrigido) + r2(c.juros)) });
      }
    }
  } else if (!atrasados) {
    avisos.push("Não há parcelas vencidas no período informado.");
  }
  // valores já recebidos no período (benefício inacumulável, pagamentos administrativos): abatidos mês a mês
  const descontos = [];
  for (const d of p.descontos || []) {
    if (!d.inicio || !d.fim || d.fim < d.inicio) continue;
    const a0 = d.inicio > inicio ? d.inicio : inicio, a1 = d.fim < fim ? d.fim : fim;
    if (a0 > a1) continue;
    const meses13 = {};
    for (let k = mesDe(a0); k <= mesDe(a1); k++) {
      const dm = diasNoMes(k);
      const da = k === mesDe(a0) ? diaDe(a0) : 1, db = k === mesDe(a1) ? diaDe(a1) : dm;
      const dias = db - da + 1;
      const base = d.modo === "sm" ? smEm(k) || 0 : Number(d.valor) || 0;
      const c = corrigirPrev(I, base * dias / dm, k + 1, C, dataCalc, jurosDesde, faltas);
      descontos.push({ rotulo: (d.descricao ? d.descricao + " " : "Recebido ") + rotuloMes(k), competencia: compStr(k), base, dias: dias < dm ? dias : null, desconto: true,
        devido: r2(base * dias / dm), fator: c.fator, corrigido: r2(c.corrigido), juros: r2(c.juros), total: r2(r2(c.corrigido) + r2(c.juros)) });
      const ano = Math.floor(k / 12);
      meses13[ano] ||= { n: 0, ult: k };
      if (dias >= 15) meses13[ano].n++;
      meses13[ano].ult = k;
    }
    if (d.decimo) for (const [ano, x] of Object.entries(meses13)) {
      if (!x.n) continue;
      const base = d.modo === "sm" ? smEm(x.ult) || 0 : Number(d.valor) || 0;
      const c = corrigirPrev(I, base * x.n / 12, x.ult + 1, C, dataCalc, jurosDesde, faltas);
      descontos.push({ rotulo: `${d.descricao || "Recebido"} 13º/${ano}${x.n < 12 ? ` (${x.n}/12)` : ""}`, competencia: compStr(x.ult), base, desconto: true, decimo: true,
        devido: r2(base * x.n / 12), fator: c.fator, corrigido: r2(c.corrigido), juros: r2(c.juros), total: r2(r2(c.corrigido) + r2(c.juros)) });
    }
  }
  descontos.sort((a, b) => a.competencia.localeCompare(b.competencia) || (a.decimo ? 1 : 0) - (b.decimo ? 1 : 0));
  const somaL = (lst, campo) => r2(lst.reduce((s, l) => s + l[campo], 0));
  const tot = (campo) => somaL(linhas, campo);
  const bruto = { devido: tot("devido"), corrigido: tot("corrigido"), juros: tot("juros"), total: tot("total") };
  const desc = { devido: somaL(descontos, "devido"), corrigido: somaL(descontos, "corrigido"), juros: somaL(descontos, "juros"), total: somaL(descontos, "total") };
  const vencidas = descontos.length
    ? { devido: r2(bruto.devido - desc.devido), corrigido: r2(bruto.corrigido - desc.corrigido), juros: r2(bruto.juros - desc.juros), total: r2(bruto.total - desc.total) }
    : bruto;
  if (vencidas.total < 0) avisos.push("Os valores já recebidos superam os atrasados no período informado.");

  // parcelas vincendas (art. 292, §§ 1º e 2º, do CPC)
  let vincendas = null;
  if (!atrasados && p.vincendas) {
    let n = 12;
    if (p.dcb) { const kD = mesDe(p.dcb); n = kD < kAj ? 0 : Math.min(12, kD - kAj + 1); }
    const valorMes = mensal.get(kAj) || 0;
    const extra13 = p.decimoTerceiro && p.vincendas13 && n === 12 ? 1 : 0;
    vincendas = { parcelas: n, decimo: extra13, valorMensal: r2(valorMes), total: r2(valorMes * (n + extra13)) };
  }
  const total = r2(vencidas.total + (vincendas ? vincendas.total : 0));
  const sm = smEm(kAj);
  const tetoJEF = r2(60 * (sm || 0));
  const ultimoInpc = I.ultimo.inpc, ultimaSelic = I.ultimo.selic;
  if (C - 1 > ultimoInpc) avisos.push(`O INPC está publicado até ${rotuloMes(ultimoInpc)}; os meses seguintes entram sem correção até a publicação.`);
  avisos.push(...textoFaltas(new Set([...faltas].filter((f) => { const k = Number(f.split(":")[1]); return !(f.startsWith("inpc") && k > ultimoInpc); }))));
  return {
    tipo: "previdenciario", modo: atrasados ? "atrasados" : "causa",
    dataCalculo: dataCalc, periodo: { inicio, fim: inicio <= fim ? fim : null, prescritoAte },
    linhas, vencidas, bruto, descontos, descontosTotal: desc, vincendas, total, reajustes,
    salarioMinimo: sm, tetoJEF, excedeJEF: !atrasados && total > tetoJEF,
    indicesAte: { inpc: ultimoInpc != null ? rotuloMes(ultimoInpc) : "-", selic: ultimaSelic != null ? rotuloMes(ultimaSelic) : "-" },
    avisos,
  };
}

// ============================================================
// Atualização de débitos (Justiça Estadual / Código Civil)
// regime "lei14905": correção pelo INPC até 08/2024 e pelo IPCA a partir de 09/2024 (art. 389, parágrafo único, do CC);
//   juros de 1% ao mês até 29/08/2024 e, a partir de 30/08/2024, pela taxa legal do art. 406 do CC divulgada pelo Banco Central.
// ============================================================
export const REGIMES = {
  lei14905: "Código Civil, Lei 14.905/2024 (INPC até 08/2024 e IPCA depois; juros de 1% a.m. até 29/08/2024 e taxa legal depois)",
  inpc: "INPC", ipca: "IPCA", ipcae: "IPCA-E", igpm: "IGP-M", selic: "SELIC (correção e juros, soma simples)", nenhum: "Sem correção",
};
export const JUROS = { regime: "Conforme o regime", nenhum: "Sem juros", um: "1% ao mês (simples)", meio: "0,5% ao mês (simples)", legal: "Taxa legal do art. 406 do CC (Banco Central)" };

export function calcularAtualizacao(p, I) {
  const faltas = new Set();
  const avisos = [];
  const dataFim = p.dataFinal;
  const C = mesDe(dataFim);
  const ult = C - 1;
  const regime = p.regime || "lei14905";
  let jurosModo = p.juros || "regime";
  if (jurosModo === "regime") jurosModo = regime === "lei14905" ? "regime" : "nenhum";
  const linhas = [];
  const calcular = (it) => {
    const valor = Number(it.valor) || 0;
    const k0 = mesDe(it.data);
    let fator = 1;
    if (regime === "lei14905") {
      if (k0 <= Math.min(ult, SET2024 - 1)) fator *= produto(I, "inpc", k0, Math.min(ult, SET2024 - 1), faltas);
      if (Math.max(k0, SET2024) <= ult) fator *= produto(I, "ipca", Math.max(k0, SET2024), ult, faltas);
    } else if (regime === "selic") {
      fator = 1 + (k0 <= ult ? soma(I, "selic", k0, ult, faltas) : 0);
    } else if (regime !== "nenhum") {
      fator = k0 <= ult ? produto(I, regime, k0, ult, faltas) : 1;
    }
    if (fator < 1) fator = 1; // deflação não reduz o valor nominal
    const corrigido = valor * fator;
    // juros simples, pro rata die, sobre o valor corrigido
    let taxa = 0;
    const ini = p.jurosDesde && p.jurosDesde > it.data ? p.jurosDesde : it.data;
    if (jurosModo !== "nenhum" && ini < dataFim) {
      for (let k = mesDe(ini); k <= C; k++) {
        let t = 0, fr = fracaoMes(k, ini, dataFim);
        if (!fr) continue;
        if (jurosModo === "um") t = 0.01 * fr;
        else if (jurosModo === "meio") t = 0.005 * fr;
        else if (jurosModo === "legal") t = taxaLegalCC(I, k, faltas) * fr;
        else if (k < AGO2024) t = 0.01 * fr; // regime: 1% ao mês até a vigência da Lei 14.905/2024 (30/08/2024)
        else if (k > AGO2024) t = taxaLegalCC(I, k, faltas) * fr;
        else { // agosto/2024: dias 1 a 29 a 1%, dias 30 e 31 pela taxa legal
          const antes = fracaoMes(k, ini, dataFim < "2024-08-30" ? dataFim : "2024-08-30");
          t = 0.01 * antes + taxaLegalCC(I, k, faltas) * (fr - antes);
        }
        taxa += t;
      }
    }
    const juros = corrigido * taxa;
    return { descricao: it.descricao || "", data: it.data, valor: r2(valor), fator, corrigido: r2(corrigido), taxaJuros: taxa * 100, juros: r2(juros), total: r2(r2(corrigido) + r2(juros)) };
  };
  for (const it of p.itens || []) { if (it.data && Number(it.valor)) linhas.push(calcular(it)); }
  // valores já recebidos: atualizados pelos mesmos critérios desde a data de cada pagamento e abatidos
  const pagos = [];
  for (const pg of p.pagamentos || []) { if (pg.data && Number(pg.valor)) pagos.push(calcular(pg)); }
  const tot = (lst, c) => r2(lst.reduce((s, l) => s + l[c], 0));
  const debito = tot(linhas, "total");
  const pagoAtual = tot(pagos, "total");
  const subtotal = r2(debito - pagoAtual);
  if (subtotal < 0) avisos.push("Os valores recebidos, atualizados, superam o débito: há saldo a favor do devedor.");
  const base = Math.max(subtotal, 0);
  const multa = r2(base * (Number(p.multa) || 0) / 100);
  const honorarios = r2(base * (Number(p.honorarios) || 0) / 100);
  if (ult > (I.ultimo.ipca ?? -1) && ["lei14905", "ipca"].includes(regime)) avisos.push(`O IPCA está publicado até ${rotuloMes(I.ultimo.ipca)}.`);
  avisos.push(...textoFaltas(faltas));
  return {
    tipo: "atualizacao", dataCalculo: dataFim, regime, juros: jurosModo, linhas, pagos,
    totais: { valor: tot(linhas, "valor"), corrigido: tot(linhas, "corrigido"), juros: tot(linhas, "juros"), debito,
      pagoValor: tot(pagos, "valor"), pago: pagoAtual, subtotal, multa, honorarios, total: r2(subtotal + multa + honorarios) },
    avisos,
  };
}
