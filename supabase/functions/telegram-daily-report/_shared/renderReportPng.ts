import satori from "https://esm.sh/satori@0.12.2";
import { initWasm, Resvg } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import type { TelegramReportPayload } from "./telegramReportTypes.ts";
import {
  buildTelegramReportElement,
  estimateReportHeight,
  REPORT_IMAGE_WIDTH,
} from "./telegramReportCard.ts";

const FONT_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans-Regular.ttf";
const FONT_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans-Bold.ttf";

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

export async function renderTelegramReportPng(payload: TelegramReportPayload): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await loadFonts();
  const height = estimateReportHeight(payload);
  const element = buildTelegramReportElement(payload);

  const svg = await satori(element, {
    width: REPORT_IMAGE_WIDTH,
    height,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: REPORT_IMAGE_WIDTH },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return png;
}
