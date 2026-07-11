import satori from "https://esm.sh/satori@0.12.2";
import { initWasm, Resvg } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import type { TelegramReportPayload } from "./telegramReportTypes.ts";
import {
  buildTelegramReportElement,
  estimateReportHeight,
  REPORT_IMAGE_WIDTH,
} from "./telegramReportCard.ts";

const FONT_REGULAR_URL =
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
const FONT_BOLD_URL =
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf";

/** Фон страницы (slate-50) — по нему режем пустой низ. */
const PAGE_BG = { r: 0xf8, g: 0xfa, b: 0xfc };
const CROP_PAD = 28;

let wasmReady: Promise<void> | null = null;
let fontsReady: Promise<Array<{ name: string; data: ArrayBuffer; weight: number; style: "normal" }>> | null =
  null;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const wasmRes = await fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
      if (!wasmRes.ok) throw new Error(`resvg wasm fetch failed: ${wasmRes.status}`);
      await initWasm(await wasmRes.arrayBuffer());
    })();
  }
  await wasmReady;
}

async function loadFonts(): Promise<Array<{ name: string; data: ArrayBuffer; weight: number; style: "normal" }>> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const [regularRes, boldRes] = await Promise.all([
        fetch(FONT_REGULAR_URL),
        fetch(FONT_BOLD_URL),
      ]);
      if (!regularRes.ok) throw new Error(`font regular fetch failed: ${regularRes.status}`);
      if (!boldRes.ok) throw new Error(`font bold fetch failed: ${boldRes.status}`);
      const [regular, bold] = await Promise.all([regularRes.arrayBuffer(), boldRes.arrayBuffer()]);
      return [
        { name: "Noto Sans", data: regular, weight: 400, style: "normal" as const },
        { name: "Noto Sans", data: bold, weight: 700, style: "normal" as const },
      ];
    })();
  }
  return fontsReady;
}

function isBgPixel(pixels: Uint8Array, offset: number): boolean {
  const r = pixels[offset];
  const g = pixels[offset + 1];
  const b = pixels[offset + 2];
  const a = pixels[offset + 3];
  if (a < 8) return true;
  return (
    Math.abs(r - PAGE_BG.r) <= 3 &&
    Math.abs(g - PAGE_BG.g) <= 3 &&
    Math.abs(b - PAGE_BG.b) <= 3
  );
}

function measureContentHeight(width: number, height: number, pixels: Uint8Array): number {
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (!isBgPixel(pixels, row + x * 4)) {
        return Math.min(height, y + 1 + CROP_PAD);
      }
    }
  }
  return height;
}

async function svgToPng(svg: string): Promise<{ png: Uint8Array; width: number; height: number; pixels: Uint8Array }> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: REPORT_IMAGE_WIDTH },
  });
  const rendered = resvg.render();
  const width = rendered.width;
  const height = rendered.height;
  const pixels = new Uint8Array(rendered.pixels);
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return { png, width, height, pixels };
}

export async function renderTelegramReportPng(payload: TelegramReportPayload): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await loadFonts();
  const element = buildTelegramReportElement(payload);

  // 1) черновик с запасом
  const draftH = estimateReportHeight(payload) + 120;
  const draftSvg = await satori(element, {
    width: REPORT_IMAGE_WIDTH,
    height: draftH,
    fonts,
  });
  const draft = await svgToPng(draftSvg);
  const contentH = measureContentHeight(draft.width, draft.height, draft.pixels);

  // 2) если низ пустой — перерендер ровно по контенту
  if (contentH < draft.height - 8) {
    const finalSvg = await satori(element, {
      width: REPORT_IMAGE_WIDTH,
      height: contentH,
      fonts,
    });
    const final = await svgToPng(finalSvg);
    return final.png;
  }

  return draft.png;
}
