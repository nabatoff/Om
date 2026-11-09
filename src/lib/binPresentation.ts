import type {
  BinCodesSource,
  BinEnsTruCodeResult,
  BinPurchaseMethodStat,
  BinSeasonality,
  BinShareTotals,
  BinSupplierStats,
} from './binEnsTruCheckApi';
import { SEASONALITY_MIN_CONTRACTS } from './binCheckConfig';

export type BinPresentationInput = {
  bin: string;
  year: number | null;
  maxContractPrice: number | null;
  supplier: BinSupplierStats | null;
  companyName?: string;
  methods: BinPurchaseMethodStat[];
  codesSource: BinCodesSource;
  share: BinShareTotals | null;
  seasonality: BinSeasonality | null;
  /** Только коды с посчитанной суммой (без превышений лимита и ошибок). */
  codes: BinEnsTruCodeResult[];
};

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const MONTH_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const money = (n: number) => nf.format(Math.round(n)).replace(/\s/g, ' ');
const int = (n: number) => nf.format(n).replace(/\s/g, ' ');

function pct(part: number, total: number): string {
  if (!(total > 0)) return '0%';
  const v = (part / total) * 100;
  return `${(v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',')}%`;
}

/** Сумма в «млн ₸» для крупных чисел (иначе — в ₸). */
function millions(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')} млрд`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} млн`;
  return money(n);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
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

export function buildBinPresentationHtml(d: BinPresentationInput): string {
  const year = d.year ?? new Date().getFullYear() - 1;
  const company = d.supplier?.name?.trim() || d.companyName?.trim() || `БИН ${d.bin}`;
  const codesAll = d.codes;
  const marketSum = d.share?.marketSum ?? codesAll.reduce((a, c) => a + (c.contractSum ?? 0), 0);
  const marketCount = codesAll.reduce((a, c) => a + c.contractCount, 0);
  const supplierSum = d.share?.supplierSum ?? 0;
  const codesN = codesAll.length;
  const limitTxt = d.maxContractPrice != null ? `, договоры до ${money(d.maxContractPrice)} ₸` : '';
  const sharePct = pct(supplierSum, marketSum);
  const fromKtp = d.codesSource === 'ktp';
  const slides: Slide[] = [];

  // 1. Титул
  slides.push(
    slide(
      `<div class="center">
        <p class="eyebrow">Предложение о сотрудничестве</p>
        <h1 class="huge">${esc(company)}</h1>
        <p class="lead">Анализ рынка государственных закупок<br>по кодам ЕНС ТРУ</p>
        <p class="muted">Рост продаж на ГЗ через Omarket.kz</p>
        <p class="muted small">Данные за ${year} год${limitTxt}</p>
      </div>`,
    ),
  );

  // 2. Доля и возможность
  const scen = (p: number, strong: boolean) =>
    `<div class="card${strong ? ' blue' : ''}"><p class="cl">${p}% рынка</p><p class="big">≈ ${millions((marketSum * p) / 100)} ₸</p><p class="sm">в год</p></div>`;
  const sourceTxt = fromKtp
    ? `${esc(company)} значится в реестре КТП по ${int(codesN)} кодам ЕНС ТРУ.`
    : `По договорам ${esc(company)} определено ${int(codesN)} кодов ЕНС ТРУ.`;
  const ownTxt =
    supplierSum > 0
      ? `Ваши договоры составляют ${money(supplierSum)} ₸ из этого объёма.`
      : 'Среди них нет ваших.';
  slides.push(
    slide(
      `<h2>Ваша доля на этом рынке: ${sharePct}</h2>
      <p class="text">${sourceTxt} В ${year} году по этим кодам заключено ${int(marketCount)} договоров на ${money(marketSum)} ₸. ${ownTxt}</p>
      <div class="row">${scen(1, false)}${scen(3, false)}${scen(5, true)}</div>
      <p class="note">Расчёт: доля × рынок ${year} года (${money(marketSum)} ₸). Это иллюстрация, а не прогноз.</p>`,
    ),
  );

  // 3. Рынок
  slides.push(
    slide(
      `<h2>Рынок ваших кодов в ${year} году: ${millions(marketSum)} ₸</h2>
      <div class="grid2">
        <div class="card"><p class="big">${money(marketSum)}&nbsp;₸</p><p class="sm">сумма договоров по ${int(codesN)} кодам ЕНС ТРУ</p></div>
        <div class="card"><p class="big">${int(marketCount)}</p><p class="sm">договоров заключено за ${year} год</p></div>
        <div class="card"><p class="big">${int(codesN)}</p><p class="sm">${fromKtp ? 'кодов ЕНС ТРУ из реестра КТП' : 'кодов ЕНС ТРУ из договоров поставщика'}</p></div>
        <div class="card blue"><p class="big w">${sharePct}</p><p class="sm w">доля поставщика на рынке этих кодов, сумма поставщика ${money(supplierSum)}&nbsp;₸</p></div>
      </div>
      ${d.maxContractPrice != null ? `<p class="note">Учитываются договоры стоимостью до ${money(d.maxContractPrice)}&nbsp;₸.</p>` : ''}`,
    ),
  );

  // 4. Способы закупки
  const methods = [...d.methods].sort((a, b) => b.sum - a.sum);
  const mSum = methods.reduce((a, m) => a + m.sum, 0);
  const mCount = methods.reduce((a, m) => a + m.count, 0);
  if (methods.length > 0 && mSum > 0) {
    const head = methods.slice(0, 6);
    const rest = methods.slice(6);
    const rows = [...head];
    if (rest.length > 0) {
      rows.push({ name: 'Прочие способы', count: rest.reduce((a, m) => a + m.count, 0), sum: rest.reduce((a, m) => a + m.sum, 0) });
    }
    const topByCount = [...methods].sort((a, b) => b.count - a.count)[0];
    const em = methods.find((m) => /электронный магазин/i.test(m.name));
    const body = rows
      .map(
        (m, i) =>
          `<tr class="${i % 2 ? 'odd' : 'even'}"><td class="l">${esc(cut(m.name, 70))}</td><td>${int(m.count)}</td><td>${pct(m.count, mCount)}</td><td>${money(m.sum)}</td><td>${pct(m.sum, mSum)}</td></tr>`,
      )
      .join('');
    slides.push(
      slide(
        `<h2>${pct(topByCount.count, mCount)} договоров: ${esc(cut(topByCount.name, 60))}</h2>
        <table>
          <tr class="th"><th class="l" style="width:44%">Способ закупки</th><th style="width:14%">Договоров</th><th style="width:14%">Доля по кол-ву</th><th style="width:16%">Сумма, ₸</th><th style="width:12%">Доля по сумме</th></tr>
          ${body}
          <tr class="total"><td class="l"><b>Итого</b></td><td><b>${int(mCount)}</b></td><td><b>100%</b></td><td><b>${money(mSum)}</b></td><td><b>100%</b></td></tr>
        </table>
        <p class="hl">${esc(methods[0].name)} даёт ${pct(methods[0].sum, mSum)} суммы.${em && em !== methods[0] ? ` Электронный магазин: ${pct(em.sum, mSum)}.` : ''}</p>`,
      ),
    );
  }

  // 5. Топ кодов
  const top = [...codesAll].filter((c) => (c.contractSum ?? 0) > 0).sort((a, b) => (b.contractSum ?? 0) - (a.contractSum ?? 0)).slice(0, 8);
  if (top.length > 0) {
    const topSum = top.reduce((a, c) => a + (c.contractSum ?? 0), 0);
    const topCnt = top.reduce((a, c) => a + c.contractCount, 0);
    const rows = top
      .map((c, i) => {
        const name = c.canonicalName || c.names[0] || '';
        return `<tr class="${i % 2 ? 'odd' : 'even'}"><td class="l">${esc(c.code)}</td><td class="l">${esc(cut(name, 64))}</td><td>${int(c.contractCount)}</td><td>${money(c.contractSum ?? 0)}</td></tr>`;
      })
      .join('');
    slides.push(
      slide(
        `<h2>Где деньги: ${top.length} ${top.length === 1 ? 'код дает' : 'кодов дают'} ${Math.round((topSum / marketSum) * 100)}% рынка</h2>
        <table>
          <tr class="th"><th class="l" style="width:20%">Код ЕНС ТРУ</th><th class="l" style="width:52%">Наименование</th><th style="width:12%">Договоров</th><th style="width:16%">Сумма, ₸</th></tr>
          ${rows}
        </table>
        <p class="hl">${top.length === codesN ? 'Все коды' : `${top.length} кодов из ${int(codesN)}`} — ${pct(topSum, marketSum)} суммы рынка: ${money(topSum)}&nbsp;₸ и ${int(topCnt)} договоров.</p>`,
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
    const peakTxt =
      p1 !== undefined && p2 !== undefined
        ? `Пик: ${MONTH_NOM[p1]} и ${MONTH_NOM[p2]} — ${int(f.counts[p1])} и ${int(f.counts[p2])} договоров (${f.peakShare.toFixed(1).replace('.', ',')}% года). Минимум: ${MONTH_NOM[f.low.i]} (${int(f.low.c)}). Выходить на рынок стоит ${f.prepare}.`
        : '';
    const few = s.count < SEASONALITY_MIN_CONTRACTS ? ` Данных мало (${int(s.count)} дог.), картина может быть неточной.` : '';
    slides.push(
      slide(
        `<h2>Когда покупают: пик в ${p1 !== undefined && p2 !== undefined ? `${MONTH_PREP[p1]} и ${MONTH_PREP[p2]}` : ''}</h2>
        <p class="hl">${esc(peakTxt)}${esc(few)}</p>
        <div class="bars">${bars}</div>
        <p class="note">Количество договоров по месяцам, по дате заключения. Всего в расчёте ${int(s.count)} договоров.</p>`,
      ),
    );
  }

  // 7. Сравнение процедур
  const em = methods.find((m) => /электронный магазин/i.test(m.name));
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
      ${em && mSum > 0 ? `<p class="hl">В ${year} году на Электронный магазин пришлось ${pct(em.sum, mSum)} суммы рынка этих кодов.</p>` : ''}`,
    ),
  );

  // 8. Следующий шаг
  const topShare = top.length > 0 ? pct(top.slice(0, 3).reduce((a, c) => a + (c.contractSum ?? 0), 0), marketSum) : '';
  slides.push(
    slide(
      `<div class="center">
        <p class="eyebrow light">Следующий шаг</p>
        <h1 class="huge">Готовы к интеграции?</h1>
        <p class="lead light">Давайте обсудим детали и запустим продажи.</p>
        <div class="row steps">
          <div class="card dk"><p class="st">1. Подключение</p><p class="sd">Выставляем ваш каталог в Электронном магазине</p></div>
          <div class="card dk"><p class="st">2. Старт</p><p class="sd">${topShare ? `Начинаем с кодов-лидеров: три крупнейших дают ${topShare} суммы рынка` : 'Начинаем с кодов-лидеров рынка'}</p></div>
          <div class="card dk"><p class="st">3. Сезон</p><p class="sd">${prepareText ? `Успеваем ${esc(prepareText)}, когда рынок начинает расти` : 'Успеваем к началу сезона закупок'}</p></div>
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
.slide { width: 1920px; height: 1080px; overflow: hidden; background: #FBFCFE; padding: 128px 128px 112px; display: flex; flex-direction: column; gap: 40px; page-break-after: always; break-after: page; position: relative; }
.slide:last-child { page-break-after: auto; break-after: auto; }
.slide.dark { background: #14213D; color: #F4F7FB; }
h1, h2, h3, p { line-height: 1.2; }
h2 { font-size: 64px; font-weight: 700; line-height: 1.1; }
h3 { font-size: 40px; font-weight: 700; }
.center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; text-align: center; }
.huge { font-size: 96px; font-weight: 700; line-height: 1.1; }
.eyebrow { font-size: 40px; font-weight: 600; color: #0B57D0; }
.eyebrow.light { font-size: 36px; color: #8AB4FF; }
.lead { font-size: 44px; font-weight: 500; line-height: 1.25; }
.lead.light { color: #C9D6EC; }
.muted { font-size: 32px; color: #4A5A75; }
.muted.small { font-size: 28px; }
.text { font-size: 36px; line-height: 1.4; }
.note { font-size: 26px; color: #4A5A75; }
.hl { font-size: 28px; font-weight: 600; color: #0B57D0; line-height: 1.35; }
.row { display: flex; gap: 32px; }
.row > .card { flex: 1; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.card { display: flex; flex-direction: column; gap: 12px; background: #EEF3FA; padding: 40px; border-radius: 16px; }
.card.blue { background: #0B57D0; color: #fff; }
.card.dk { background: #1F3158; text-align: left; }
.big-card { gap: 24px; padding: 48px; }
.cl { font-size: 30px; font-weight: 600; color: #4A5A75; }
.card.blue .cl { color: #DCE6F5; }
.big { font-size: 72px; font-weight: 700; line-height: 1.1; color: #0B57D0; }
.row .big { font-size: 64px; }
.big.w, .w { color: #fff; }
.w2 { color: #DCE6F5; }
.sm { font-size: 28px; line-height: 1.35; color: #4A5A75; }
.card.blue .sm { color: #DCE6F5; }
.card.blue .sm.w { color: #fff; }
.v { font-size: 32px; font-weight: 600; }
.st { font-size: 32px; font-weight: 700; color: #8AB4FF; }
.sd { font-size: 30px; line-height: 1.35; color: #F4F7FB; }
.steps { text-align: left; width: 100%; }
table { width: 100%; border-collapse: collapse; font-size: 26px; table-layout: fixed; }
td, th { padding: 14px 16px; text-align: right; vertical-align: middle; }
td.l, th.l { text-align: left; }
tr.th { background: #14213D; color: #F4F7FB; }
tr.even { background: #EEF3FA; }
tr.odd { background: #FBFCFE; }
tr.total { background: #DCE6F5; }
.bars { display: flex; align-items: flex-end; gap: 16px; border-bottom: 2px solid #B6C8E6; height: 440px; }
.bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; }
.bv, .bm { font-size: 26px; color: #4A5A75; }
.bm { color: #14213D; }
.bv.pk, .bm.pk { color: #14213D; font-weight: 700; }
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

/** Открывает презентацию в новой вкладке и вызывает печать (в диалоге выбирается «Сохранить как PDF»). */
export function openBinPresentation(d: BinPresentationInput): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(buildBinPresentationHtml(d));
  w.document.close();
  const go = () => setTimeout(() => w.print(), 400);
  const fonts = (w.document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fonts?.ready) void fonts.ready.then(go, go);
  else w.addEventListener('load', go);
  return true;
}
