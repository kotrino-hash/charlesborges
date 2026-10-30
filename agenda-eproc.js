// ============================================================
// Leitura das listas de perícias e audiências do eproc
// (Painel do advogado > Perícias futuras / Audiências), salvas em PDF (Ctrl+P) ou copiadas da tela.
// Devolve um item por processo com data, hora, local, perito e partes. Nada é enviado a servidor.
// ============================================================

const CNJ = /\b(\d{7})\s*-\s*(\d{2})\s*\.\s*(\d{4})\s*\.\s*(\d)\s*\.\s*(\d{2})\s*\.\s*(\d{4})\b/g;
const so = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
const MIN = /^(da|de|do|das|dos|e)$/;
export function nomeProprio(s) {
  s = limpa(s); if (!s) return "";
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(" ").map((p, i) => (i > 0 && MIN.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}
const dataISO = (d) => { const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };

// Tipos de audiência mais comuns nas pautas, para montar o título
const TIPOS_AUD = [
  [/instru[çc][ãa]o\s+e\s+julgamento/i, "Audiência de instrução e julgamento"],
  [/concilia[çc][ãa]o/i, "Audiência de conciliação"],
  [/media[çc][ãa]o/i, "Audiência de mediação"],
  [/instru[çc][ãa]o/i, "Audiência de instrução"],
  [/justifica[çc][ãa]o/i, "Audiência de justificação"],
  [/cust[óo]dia/i, "Audiência de custódia"],
  [/admonit[óo]ria/i, "Audiência admonitória"],
  [/preliminar/i, "Audiência preliminar"],
  [/una\b/i, "Audiência una"],
  [/inicial/i, "Audiência inicial"],
  [/sess[ãa]o de julgamento|sustenta[çc][ãa]o/i, "Sessão de julgamento"],
];

// texto: o conteúdo da página do eproc (PDF lido ou texto colado)
export function lerAgendaEproc(texto) {
  const t = String(texto || "").replace(/ /g, " ");
  const ehPericia = /per[íi]cias?\s+futuras|lista de per[íi]cias|\bperito\b/i.test(t);
  const ehAudiencia = /audi[êe]ncias?/i.test(t) && !/lista de per[íi]cias/i.test(t);
  const marcas = [...t.matchAll(CNJ)];
  const itens = [];
  marcas.forEach((m, i) => {
    const bloco = t.slice(m.index, i + 1 < marcas.length ? marcas[i + 1].index : t.length);
    const numero = `${m[1]}-${m[2]}.${m[3]}.${m[4]}.${m[5]}.${m[6]}`;
    // data e hora: primeira data seguida de horário
    // (na tela copiada, a hora pode vir algumas palavras depois da data)
    const dh = bloco.match(/(\d{2}\/\d{2}\/\d{4})(?!\s*,)[\s\S]{0,300}?\b(\d{1,2}):(\d{2})(?::\d{2})?\b/i);
    if (!dh) return;                                   // o mesmo processo citado de novo, sem data: ignora
    if (itens.some((x) => x.numero === numero && x.data === dataISO(dh[1]) && x.hora === dh[2].padStart(2, "0") + ":" + dh[3])) return;
    const linear = limpa(bloco);
    const unidade = (linear.match(/^\S+\s*\(([^)]+)\)/) || [])[1] || "";
    const autor = limpa((linear.match(/Partes:\s*(.+?)\s*-\s*(?:AUTOR|AUTORA|REQUERENTE|EXEQUENTE|IMPETRANTE|EMBARGANTE|APELANTE|RECORRENTE|AGRAVANTE|RECLAMANTE)\b/i) || [])[1]);
    const reu = limpa((linear.match(/\bX\s+(.+?)\s*-\s*(?:R[ÉE]U|R[ÉE]|REQUERID[OA]|EXECUTAD[OA]|IMPETRAD[OA]|EMBARGAD[OA]|APELAD[OA]|RECORRID[OA]|AGRAVAD[OA]|RECLAMAD[OA])\b/i) || [])[1]);
    const depois = limpa(bloco.slice(bloco.indexOf(dh[0]) + dh[0].length));
    const item = {
      numero, unidade: limpa(unidade), autor, reu,
      data: dataISO(dh[1]), hora: dh[2].padStart(2, "0") + ":" + dh[3],
      link: ((bloco.match(/https?:\/\/(?!eproc)[^\s"'<>]+/i) || [])[0] || "").replace(/[).,;]+$/, ""),
    };
    const ehP = ehPericia || /per[íi]cia|perito/i.test(bloco);
    if (ehP && !ehAudiencia) {
      // "Dr Airton Pagani - ORTOPEDISTA", "Dra. Tadiane Luiza Ficagna - PSIQUIATRA", "Dr Renato Pagani - JF - PSIQUIATRA"
      const pm = depois.match(/(Dra?\.?\s*[A-ZÀ-Ý][a-zà-ÿ.]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ.]+){0,5})\s*-?\s*(?:JF\s*-\s*)?(M[ÉE]DICO DO TRABALHO|MED\.? TRABALHO|[A-ZÀ-Ý]{4,})/);
      const esp = depois.match(/(M[ée]dic[oa]\s*-\s*[A-Za-zÀ-ÿ ]+?|Assistente Social|Engenheir[oa][A-Za-zÀ-ÿ ]*|Psic[óo]log[oa]|Fisioterapeuta|Contador[a]?|Odont[óo]log[oa])\s*$/);
      let especialidade = pm ? pm[2] : esp ? esp[1].replace(/^M[ée]dic[oa]\s*-\s*/, "") : "";
      especialidade = especialidade.toLowerCase().replace(/^med\.? trabalho$/, "médico do trabalho").replace(/^ortopedis$/, "ortopedista");
      item.tipo = "pericia";
      item.perito = pm ? limpa(pm[1]).replace(/^Dr(a?)\.?\s*/, "Dr$1. ") : "";
      item.especialidade = especialidade;
      item.titulo = /assistente social/i.test(depois) ? "Perícia social (visita da assistente social)"
        : "Perícia médica" + (especialidade ? ` (${especialidade})` : "");
      item.local = item.unidade ? nomeProprio(item.unidade).replace(/\bDe\b/g, "de").replace(/Pericias/g, "Perícias") : "";
    } else {
      const tipoTxt = TIPOS_AUD.find(([re]) => re.test(bloco));
      item.tipo = "audiencia";
      item.titulo = tipoTxt ? tipoTxt[1] : "Audiência";
      const sala = depois.match(/(sala[^,;\n]{0,60}|videoconfer[êe]ncia|presencial|h[íi]brida|virtual)/i);
      item.local = limpa([item.unidade && nomeProprio(item.unidade), sala && sala[1]].filter(Boolean).join(" · "));
    }
    itens.push(item);
  });
  return itens;
}

// Orientação padrão ao cliente, em linguagem simples
export function orientacaoCliente(item) {
  if (item.tipo === "pericia") {
    return [
      `Esta é a perícia do seu processo${item.perito ? `, com ${item.perito}` : ""}${item.especialidade ? ` (${item.especialidade})` : ""}. Ela é decisiva para o resultado da ação.`,
      "Chegue com 30 minutos de antecedência e leve documento com foto, carteira de trabalho e todos os exames, laudos, atestados e receitas que você tiver, inclusive os mais antigos.",
      "Explique ao perito com sinceridade tudo o que você sente e as dificuldades que tem no dia a dia e no trabalho. Se não puder comparecer, avise o escritório imediatamente.",
    ].join(" ");
  }
  return [
    "Esta é a audiência do seu processo.",
    item.link ? "Ela será por videoconferência: entre no link alguns minutos antes, em local silencioso, com documento com foto em mãos." : "Chegue com 30 minutos de antecedência e leve documento com foto.",
    "Se não puder participar, avise o escritório imediatamente.",
  ].join(" ");
}
