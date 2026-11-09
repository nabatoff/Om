import type {
  BinCodesSource,
  BinEnsTruCodeResult,
  BinPurchaseMethodStat,
  BinPurchaseStats,
  BinSeasonality,
  BinShareTotals,
  BinSupplierStats,
} from './binEnsTruCheckApi';
import { SEASONALITY_MIN_CONTRACTS } from './binCheckConfig';

export type BinPresentationInput = {
  bin: string;
  /** Базовый год анализа (рынок, коды, сезонность). */
  year: number | null;
  maxContractPrice: number | null;
  supplier: BinSupplierStats | null;
  companyName?: string;
  codesSource: BinCodesSource;
  share: BinShareTotals | null;
  seasonality: BinSeasonality | null;
  codes: BinEnsTruCodeResult[];
  /** Основные договоры базового года по способам закупки (слайд «Способы закупки»). */
  purchase: BinPurchaseStats | null;
  /** Договоры следующего (неполного) года — слайд «Закупки 2026 года»; null — данных нет. */
  current: BinPurchaseStats | null;
};

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

const NB = ' ';
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
/** Разделитель тысяч — неразрывный пробел: 5 179 214 079. */
const int = (n: number) => nf.format(Math.round(n)).replace(/[\s ]/g, NB);
const money = int;
const tg = (n: number) => `${money(n)}${NB}₸`;

/** Доля в процентах с запятой: 85,3% (меньше 1% — два знака, чтобы не получить 0,0%). */
function pctNum(part: number, total: number): string {
  if (!(total > 0)) return '0%';
  const v = (part / total) * 100;
  return `${(v >= 1 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',')}%`;
}

/** Сумма для крупных чисел: «5,2 млрд ₸», «324 млн ₸» (иначе полностью). */
function millions(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')}${NB}млрд${NB}₸`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}${NB}млн${NB}₸`;
  return tg(n);
}

/** «1 код», «4 кода», «8 кодов». */
function codesNom(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return `${n}${NB}код`;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return `${n}${NB}кода`;
  return `${n}${NB}кодов`;
}

/** Родительный падеж для «начните с …»: «1 кода», «3 кодов». */
function codesGen(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? `${n}${NB}кода` : `${n}${NB}кодов`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

type Slide = string;

function slide(inner: string, dark = false): Slide {
  return `<section class="slide${dark ? ' dark' : ''}">${inner}</section>`;
}

/** Пиковые месяцы по количеству договоров и подсказка, до какого месяца выходить на рынок. */
function seasonFacts(s: BinSeasonality) {
  const counts = s.months.map((m) => m.count);
  const order = counts.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c);
  const peaks = order.slice(0, 2).map((x) => x.i).sort((a, b) => a - b);
  const low = [...order].reverse()[0];
  const peakShare = s.count > 0 ? (peaks.reduce((a, i) => a + counts[i], 0) / s.count) * 100 : 0;
  const first = peaks[0];
  const prepare = first >= 2 ? `до ${MONTH_GEN[first - 2]}` : 'заранее, до начала года';
  return { peaks, low, peakShare, prepare, counts };
}

const EM_RE = /электронный магазин/i;

/** Способы закупки для слайдов: ЗЦП, Электронный магазин, остальные; «Запрос ценовых предложений (не ГЗ new)» не показываем. */
function classifyMethods(methods: BinPurchaseMethodStat[]) {
  const z = { count: 0, sum: 0 };
  const em = { count: 0, sum: 0 };
  const other = { count: 0, sum: 0 };
  let total = 0;
  let totalCount = 0;
  for (const m of methods) {
    total += m.sum;
    totalCount += m.count;
    if (/не\s*гз/i.test(m.name)) continue;
    const t = EM_RE.test(m.name) ? em : /^запрос ценовых предложений/i.test(m.name.trim()) ? z : other;
    t.count += m.count;
    t.sum += m.sum;
  }
  return { zcp: z, em, other, total, totalCount };
}

export function buildBinPresentationHtml(d: BinPresentationInput): string {
  const year = d.year ?? 2025;
  const company = d.supplier?.name?.trim() || d.companyName?.trim() || `БИН ${d.bin}`;
  const codesAll = d.codes;
  const marketSum = d.share?.marketSum ?? codesAll.reduce((a, c) => a + (c.contractSum ?? 0), 0);
  const marketCount = codesAll.reduce((a, c) => a + c.contractCount, 0);
  const supplierSum = d.share?.supplierSum ?? 0;
  const limitTxt = d.maxContractPrice != null ? `, договоры до ${tg(d.maxContractPrice)}` : '';
  const sharePct = pctNum(supplierSum, marketSum);
  const base = d.purchase ? classifyMethods(d.purchase.methods) : null;
  const cur = d.current ? classifyMethods(d.current.methods) : null;
  const hasCur = !!d.current && !!cur && cur.totalCount > 0;
  const baseEmShare = base && base.total > 0 ? (base.em.sum / base.total) * 100 : null;
  const curEmShare = hasCur && cur && cur.total > 0 ? (cur.em.sum / cur.total) * 100 : null;
  const fmtP = (v: number) => `${(v >= 1 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',')}%`;
  const slides: Slide[] = [];

  // 1. Титул
  slides.push(
    slide(
      `<div class="center">
        <p class="eyebrow">Предложение о сотрудничестве</p>
        <h1 class="huge${company.length > 60 ? ' long' : ''}">${esc(company)}</h1>
        <p class="lead">${millions(marketSum)} госзакупок по вашим кодам.<br>Пора занять в них своё место</p>
        <p class="muted">Рост продаж на ГЗ через Omarket.kz</p>
        <p class="muted small">Данные за ${year} год${limitTxt}</p>
      </div>`,
    ),
  );

  // 2. Рынок
  const scen = (p: number, strong: boolean) =>
    `<div class="card${strong ? ' blue' : ''}"><p class="cl">${p}% рынка</p><p class="big">≈${NB}${millions((marketSum * p) / 100)}</p><p class="sm">в год</p></div>`;
  slides.push(
    slide(
      `<h2>Рынок на ${millions(marketSum)} уже есть. Ваша доля в нём ${sharePct}</h2>
      <div class="row">
        <div class="card"><p class="cl">Сумма договоров ${year} года</p><p class="big">${millions(marketSum)}</p><p class="sm">${tg(marketSum)}</p></div>
        <div class="card"><p class="cl">Число договоров</p><p class="big">${int(marketCount)}</p><p class="sm">по ${codesNom(codesAll.length)} ЕНС${NB}ТРУ</p></div>
        <div class="card blue"><p class="cl">Ваша доля</p><p class="big">${sharePct}</p><p class="sm">${tg(supplierSum)} из рынка</p></div>
      </div>
      <h3>Что даст даже небольшая доля</h3>
      <div class="row">${scen(1, false)}${scen(3, false)}${scen(5, true)}</div>
      <p class="note">Расчёт: доля × рынок ${year} года (${tg(marketSum)}). Это иллюстрация, а не прогноз.</p>`,
    ),
  );

  // 3. Способы закупки
  if (base && base.total > 0 && d.purchase) {
    const rowsDef: Array<{ key: 'zcp' | 'em' | 'other'; label: string }> = [
      { key: 'zcp', label: 'Запрос ценовых предложений (ЗЦП)' },
      { key: 'em', label: 'Электронный магазин' },
      { key: 'other', label: 'Остальные способы' },
    ];
    const body = rowsDef
      .map(({ key, label }, i) => {
        const b = base[key];
        const c = hasCur && cur ? cur[key] : null;
        const cells = `<td>${int(b.count)}</td><td>${pctNum(b.sum, base.total)}</td>${
          c && cur ? `<td>${int(c.count)}</td><td>${pctNum(c.sum, cur.total)}</td>` : ''
        }`;
        return `<tr class="${i % 2 ? 'odd' : 'even'}${key === 'em' ? ' em' : ''}"><td class="l">${label}</td>${cells}</tr>`;
      })
      .join('');
    const grew = baseEmShare != null && curEmShare != null && curEmShare > baseEmShare;
    const title = grew
      ? 'Рынок переходит в Электронный магазин, и быстро'
      : baseEmShare != null
        ? `Электронный магазин: ${fmtP(baseEmShare)} суммы рынка в ${year} году`
        : 'Способы закупки по вашим кодам';
    const curYear = d.current?.year ?? year + 1;
    const concl =
      baseEmShare != null && curEmShare != null
        ? grew
          ? `Доля Электронного магазина в сумме выросла с ${fmtP(baseEmShare)} в ${year} до ${fmtP(curEmShare)} в ${curYear} году.`
          : `Доля Электронного магазина в сумме: ${fmtP(baseEmShare)} в ${year} и ${fmtP(curEmShare)} в ${curYear} году.`
        : baseEmShare != null
          ? `Электронный магазин: ${fmtP(baseEmShare)} суммы закупок по вашим кодам в ${year} году.`
          : '';
    const w = hasCur ? '16%' : '24%';
    slides.push(
      slide(
        `<h2>${esc(title)}</h2>
        <table>
          <tr class="th"><th class="l" style="width:${hasCur ? '36%' : '52%'}">Способ закупки</th><th style="width:${w}">${year}: договоров</th><th style="width:${w}">${year}: доля суммы</th>${
            hasCur ? `<th style="width:16%">${curYear}: договоров</th><th style="width:16%">${curYear}: доля суммы</th>` : ''
          }</tr>
          ${body}
        </table>
        <p class="hl">${esc(concl)}</p>
        <p class="note">Основные договоры${d.maxContractPrice != null ? ` до ${tg(d.maxContractPrice)}` : ''}, дата заключения в году. Доли не дают ровно 100%: часть способов закупки в таблице не показана.${
          hasCur && d.current ? ` Данные ${curYear} года неполные, на ${ruDate(d.current.asOf)}.` : ''
        }</p>`,
      ),
    );
  }

  // 4. Закупки текущего года
  if (hasCur && d.current && cur) {
    const c = d.current;
    const customers = c.emCustomers.slice(0, 5);
    const title = cur.em.sum > 0 ? `${c.year} год: через ЭМ уже прошло ${millions(cur.em.sum)}` : `${c.year} год: закупки по вашим кодам`;
    const tbl =
      customers.length > 0
        ? `<h3>Заказчики, которые уже покупают через ЭМ</h3>
        <table>
          <tr class="th"><th class="l" style="width:62%">Заказчик</th><th style="width:14%">Договоров</th><th style="width:24%">Сумма, ₸</th></tr>
          ${customers
            .map(
              (m, i) =>
                `<tr class="${i % 2 ? 'odd' : 'even'}"><td class="l">${esc(cut(m.name, 80))}</td><td>${int(m.count)}</td><td>${money(m.sum)}</td></tr>`,
            )
            .join('')}
        </table>`
        : '';
    slides.push(
      slide(
        `<h2>${esc(title)}</h2>
        <div class="row">
          <div class="card"><p class="cl">Все договоры ${c.year}</p><p class="big">${millions(cur.total)}</p><p class="sm">${int(cur.totalCount)} договоров</p></div>
          <div class="card"><p class="cl">Через Электронный магазин</p><p class="big">${millions(cur.em.sum)}</p><p class="sm">${int(cur.em.count)} договоров</p></div>
          <div class="card blue"><p class="cl">Доля ЭМ в сумме</p><p class="big">${curEmShare != null ? fmtP(curEmShare) : '—'}</p><p class="sm">${baseEmShare != null ? `в ${year} году: ${fmtP(baseEmShare)}` : ''}</p></div>
        </div>
        ${tbl}
        <p class="note">Год неполный, данные на ${ruDate(c.asOf)}. Основные договоры${d.maxContractPrice != null ? ` до ${tg(d.maxContractPrice)}` : ''} по вашим кодам. Запрос ценовых предложений: ${int(cur.zcp.count)} договоров, ${tg(cur.zcp.sum)}, ${pctNum(cur.zcp.sum, cur.total)} суммы. Заказчиков ЭМ: ${int(c.emCustomersTotal)}.</p>`,
      ),
    );
  }

  // 5. Коды
  const top = [...codesAll]
    .filter((c) => (c.contractSum ?? 0) > 0)
    .sort((a, b) => (b.contractSum ?? 0) - (a.contractSum ?? 0))
    .slice(0, 3);
  const topSum = top.reduce((a, c) => a + (c.contractSum ?? 0), 0);
  if (top.length > 0) {
    const topCnt = top.reduce((a, c) => a + c.contractCount, 0);
    const rows = top
      .map((c, i) => {
        const name = c.canonicalName || c.names[0] || '';
        return `<tr class="${i % 2 ? 'odd' : 'even'}"><td class="l">${esc(c.code)}</td><td class="l">${esc(cut(name, 64))}</td><td>${int(c.contractCount)}</td><td>${money(c.contractSum ?? 0)}</td><td>${pctNum(c.contractSum ?? 0, marketSum)}</td></tr>`;
      })
      .join('');
    slides.push(
      slide(
        `<h2>Начните с ${codesGen(top.length)}: в ${top.length === 1 ? 'нём' : 'них'} ${pctNum(topSum, marketSum)} рынка</h2>
        <table>
          <tr class="th"><th class="l" style="width:18%">Код ЕНС ТРУ</th><th class="l" style="width:40%">Наименование</th><th style="width:12%">Договоров</th><th style="width:18%">Сумма, ₸</th><th style="width:12%">Доля</th></tr>
          ${rows}
        </table>
        <p class="hl">${codesNom(top.length)} из ${int(codesAll.length)}: ${tg(topSum)} и ${int(topCnt)} договоров — ${pctNum(topSum, marketSum)} суммы рынка.</p>`,
      ),
    );
  }

  // 6. Сезонность
  let prepareText = '';
  const s = d.seasonality;
  if (s && s.count > 0) {
    const f = seasonFacts(s);
    prepareText = f.prepare;
    const maxC = Math.max(...f.counts, 1);
    const bars = f.counts
      .map((c, i) => {
        const peak = f.peaks.includes(i);
        const h = Math.max(6, Math.round((c / maxC) * 340));
        return `<div class="bar"><p class="bv${peak ? ' pk' : ''}">${int(c)}</p><div class="bb${peak ? ' pk' : ''}" style="height:${h}px"></div><p class="bm${peak ? ' pk' : ''}">${MONTH_SHORT[i]}</p></div>`;
      })
      .join('');
    const [p1, p2] = f.peaks;
    const peaksNom = p2 !== undefined ? `${MONTH_NOM[p1]} и ${MONTH_NOM[p2]}` : MONTH_NOM[p1];
    const peaksPrep = p2 !== undefined ? `${MONTH_PREP[p1]} и ${MONTH_PREP[p2]}` : MONTH_PREP[p1];
    const few = s.count < SEASONALITY_MIN_CONTRACTS ? ` Данных мало (${int(s.count)} дог.), картина может быть неточной.` : '';
    slides.push(
      slide(
        `<h2>Успейте к сезону: пик в ${peaksPrep}</h2>
        <p class="hl">${esc(
          `${peaksNom[0].toUpperCase()}${peaksNom.slice(1)} — ${fmtP(f.peakShare)} договоров года. Минимум — ${MONTH_NOM[f.low.i]} (${int(f.low.c)} договоров). Выходить на рынок стоит ${f.prepare}.${few}`,
        )}</p>
        <div class="bars">${bars}</div>
        <p class="note">Количество договоров по месяцам ${year} года (по дате заключения), всего ${int(s.count)}. Два месяца-лидера выделены цветом.</p>`,
      ),
    );
  }

  // 7. ЭМ быстрее и проще
  const emLine =
    baseEmShare != null && curEmShare != null && d.current
      ? `Доля Электронного магазина в сумме закупок по вашим кодам: ${fmtP(baseEmShare)} в ${year} году → ${fmtP(curEmShare)} в ${d.current.year} году.`
      : baseEmShare != null
        ? `В ${year} году на Электронный магазин пришлось ${fmtP(baseEmShare)} суммы закупок по вашим кодам.`
        : '';
  slides.push(
    slide(
      `<h2>Электронный магазин быстрее и проще</h2>
      <div class="row">
        <div class="card big-card"><h3>Классические ОК / ЗЦП</h3>
          <div><p class="sm">Срок процедуры</p><p class="v">20–35 дней</p></div>
          <div><p class="sm">Документы</p><p class="v">Большой тендерный пакет</p></div>
          <div><p class="sm">Риск отмены</p><p class="v">Присутствует</p></div>
        </div>
        <div class="card blue big-card"><h3 class="w">Электронный магазин (ЭМ)</h3>
          <div><p class="sm w2">Срок процедуры</p><p class="v w">Реальное время (ответ 3 часа)</p></div>
          <div><p class="sm w2">Документы</p><p class="v w">Только подтверждение цены</p></div>
          <div><p class="sm w2">Риск отмены</p><p class="v w">Нет, бюджет выделен и заблокирован</p></div>
        </div>
      </div>
      ${emLine ? `<p class="hl">${esc(emLine)}</p>` : ''}`,
    ),
  );

  // 8. Сопровождение
  const sup = (t: string, x: string) => `<div class="card"><p class="v">${t}</p><p class="sm">${x}</p></div>`;
  slides.push(
    slide(
      `<h2>Комплексное сопровождение: от карточки до заявки</h2>
      <div class="grid2">
        ${sup('1. Консультация', 'По карточкам товаров и прохождению модерации')}
        ${sup('2. Заявки', 'Передаём заявки отделу продаж')}
        ${sup('3. Целевые заказчики', 'Подбираем целевых заказчиков и выгружаем базу')}
        ${sup('4. Обучение', 'Учим алгоритму закупки через Omarket')}
      </div>`,
    ),
  );

  // 9. Финал
  slides.push(
    slide(
      `<div class="center">
        <h1 class="huge">Готовы к запуску?</h1>
        <div class="row steps">
          <div class="card dk"><p class="st">1. Каталог</p><p class="sd">Выставляем ваш каталог на Omarket</p></div>
          <div class="card dk"><p class="st">2. Старт</p><p class="sd">Начинаем с кодов-лидеров${top.length > 0 ? `: ${codesNom(top.length)} дают ${pctNum(topSum, marketSum)} рынка` : ''}</p></div>
          <div class="card dk"><p class="st">3. Сезон</p><p class="sd">${prepareText.startsWith('до') ? `Успеваем ${esc(prepareText)}` : 'Успеваем к началу сезона закупок'}</p></div>
        </div>
      </div>`,
      true,
    ),
  );

  const css = `
@page { size: 1920px 1080px; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #FBFCFE; }
body { font-family: 'Inter', Arial, sans-serif; color: #14213D; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.slide { width: 1920px; height: 1080px; overflow: hidden; background: #FBFCFE; padding: 96px 128px 80px; display: flex; flex-direction: column; gap: 32px; page-break-after: always; break-after: page; position: relative; }
.slide:last-child { page-break-after: auto; break-after: auto; }
.slide.dark { background: #14213D; color: #F4F7FB; }
h1, h2, h3, p { line-height: 1.2; }
h2 { font-size: 60px; font-weight: 700; line-height: 1.1; }
h3 { font-size: 40px; font-weight: 700; }
.center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; text-align: center; }
.huge { font-size: 96px; font-weight: 700; line-height: 1.1; }
.huge.long { font-size: 72px; }
.eyebrow { font-size: 40px; font-weight: 600; color: #0B57D0; }
.lead { font-size: 44px; font-weight: 500; line-height: 1.25; }
.muted { font-size: 32px; color: #4A5A75; }
.muted.small { font-size: 28px; }
.note { font-size: 26px; color: #4A5A75; line-height: 1.35; }
.hl { font-size: 30px; font-weight: 600; color: #0B57D0; line-height: 1.35; }
.row { display: flex; gap: 32px; }
.row > .card { flex: 1; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.card { display: flex; flex-direction: column; gap: 12px; background: #EEF3FA; padding: 32px 40px; border-radius: 16px; }
.card.blue { background: #0B57D0; color: #fff; }
.card.dk { background: #1F3158; text-align: left; }
.big-card { gap: 24px; padding: 48px; }
.cl { font-size: 28px; font-weight: 600; color: #4A5A75; }
.card.blue .cl { color: #DCE6F5; }
.big { font-size: 64px; font-weight: 700; line-height: 1.1; color: #0B57D0; }
.card.blue .big { color: #fff; }
.w { color: #fff; }
.w2 { color: #DCE6F5; }
.sm { font-size: 28px; line-height: 1.35; color: #4A5A75; }
.card.blue .sm { color: #DCE6F5; }
.v { font-size: 34px; font-weight: 600; }
.st { font-size: 34px; font-weight: 700; color: #8AB4FF; }
.sd { font-size: 30px; line-height: 1.35; color: #F4F7FB; }
.steps { text-align: left; width: 100%; }
table { width: 100%; border-collapse: collapse; font-size: 28px; table-layout: fixed; }
td, th { padding: 18px 16px; text-align: right; vertical-align: middle; }
td.l, th.l { text-align: left; }
tr.th { background: #14213D; color: #F4F7FB; }
tr.even { background: #EEF3FA; }
tr.odd { background: #FBFCFE; }
tr.em td { font-weight: 700; color: #0B57D0; }
.bars { display: flex; align-items: flex-end; gap: 16px; border-bottom: 2px solid #B6C8E6; height: 440px; }
.bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; }
.bv, .bm { font-size: 26px; color: #4A5A75; }
.bm { color: #14213D; }
.bv.pk, .bm.pk { color: #0B57D0; font-weight: 700; }
.bb { width: 100%; background: #B6C8E6; border-radius: 8px 8px 0 0; }
.bb.pk { background: #0B57D0; }
.toolbar { display: none; }
@media screen {
  body { background: #5b6477; }
  .slide { zoom: 0.5; margin: 16px auto; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
  .toolbar { display: flex; position: fixed; top: 12px; right: 12px; gap: 8px; z-index: 10; }
  .toolbar button { font: 600 14px Inter, Arial, sans-serif; padding: 10px 16px; border-radius: 10px; border: 0; background: #0B57D0; color: #fff; cursor: pointer; }
}`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(company)} — анализ рынка ГЗ</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head><body>
<div class="toolbar"><button onclick="window.print()">Сохранить как PDF</button></div>
${slides.join('\n')}
</body></html>`;
}

/** Открывает пустую вкладку (вызывать сразу по клику, до асинхронной загрузки данных — иначе блокировщик всплывающих окон). */
export function openPresentationWindow(): Window | null {
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write('<!doctype html><meta charset="utf-8"><title>Презентация…</title><p style="font:24px Arial;padding:40px">Собираем данные для презентации…</p>');
    w.document.close();
  }
  return w;
}

/** Рисует презентацию в уже открытой вкладке и вызывает печать (в диалоге выбирается «Сохранить как PDF»). */
export function renderBinPresentation(w: Window, d: BinPresentationInput): void {
  w.document.open();
  w.document.write(buildBinPresentationHtml(d));
  w.document.close();
  const go = () => setTimeout(() => w.print(), 400);
  const fonts = (w.document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fonts?.ready) void fonts.ready.then(go, go);
  else w.addEventListener('load', go);
}
