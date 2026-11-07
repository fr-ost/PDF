/** Applies editor objects (text, drawings, shapes, images, signatures) to a PDF. */
import { BlendMode, LineCapStyle, type PDFImage, type PDFPage } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { FONT_ASCENT, LINE_HEIGHT, toWinAnsi } from '../winAnsi';
import { arrowHeadPath, arrowShaftEnd, pointsToSvgPath, signatureToPoints, type EditorAsset, type EditorObject } from './annotations';
import type { ProgressFn } from './assemble';
import { FontCache, clamp, parseHexColor, withDisplaySpace } from './drawing';
import { loadPdf, savePdf, type PdfSource } from './load';

export async function applyEditorObjects(
  source: PdfSource,
  objects: EditorObject[],
  assets: Record<string, EditorAsset>,
  progress: ProgressFn = () => undefined,
): Promise<Uint8Array> {
  const { doc } = await loadPdf(source);
  const pages = doc.getPages();
  const fonts = new FontCache(doc);
  const images = new Map<string, PDFImage>();

  const byPage = new Map<number, EditorObject[]>();
  for (const obj of objects) {
    if (obj.page < 0 || obj.page >= pages.length) continue;
    const list = byPage.get(obj.page) ?? [];
    list.push(obj);
    byPage.set(obj.page, list);
  }

  // Embed images first (async), then draw synchronously per page.
  for (const obj of objects) {
    if (obj.type !== 'image' || images.has(obj.assetId)) continue;
    const asset = assets[obj.assetId];
    if (!asset) throw new PdfToolError('INVALID_INPUT', 'An inserted image is missing.');
    images.set(obj.assetId, asset.kind === 'png' ? await doc.embedPng(asset.bytes) : await doc.embedJpg(asset.bytes));
  }
  const fontFor = new Map<string, Awaited<ReturnType<FontCache['get']>>>();
  for (const obj of objects) {
    if (obj.type !== 'text') continue;
    const key = `${obj.font}-${obj.bold}-${obj.italic}`;
    if (!fontFor.has(key)) fontFor.set(key, await fonts.get(obj.font, obj.bold, obj.italic));
  }

  let done = 0;
  for (const [pageIndex, list] of byPage) {
    const page = pages[pageIndex]!;
    withDisplaySpace(page, (g) => {
      for (const obj of list) drawObjectOnPage(page, g.height, obj, images, fontFor);
    });
    done++;
    progress(done / byPage.size);
  }
  return savePdf(doc);
}

function drawObjectOnPage(
  page: PDFPage,
  H: number,
  obj: EditorObject,
  images: Map<string, PDFImage>,
  fonts: Map<string, Awaited<ReturnType<FontCache['get']>>>,
): void {
  const opacity = clamp(obj.opacity ?? 1, 0.05, 1);
  switch (obj.type) {
    case 'text': {
      const font = fonts.get(`${obj.font}-${obj.bold}-${obj.italic}`)!;
      const color = parseHexColor(obj.color);
      const size = clamp(obj.size, 2, 400);
      const lines = toWinAnsi(obj.text).split('\n');
      lines.forEach((line, i) => {
        const baselineDown = obj.y + size * FONT_ASCENT[obj.font] + i * size * LINE_HEIGHT;
        const y = H - baselineDown;
        if (line.length > 0) page.drawText(line, { x: obj.x, y, size, font, color, opacity });
        if (obj.underline && line.trim()) {
          const width = font.widthOfTextAtSize(line, size);
          const uy = y - size * 0.12;
          page.drawLine({ start: { x: obj.x, y: uy }, end: { x: obj.x + width, y: uy }, thickness: Math.max(0.5, size * 0.06), color, opacity });
        }
      });
      break;
    }
    case 'draw': {
      const path = pointsToSvgPath(obj.points);
      if (path) page.drawSvgPath(path, { x: 0, y: H, borderColor: parseHexColor(obj.color), borderWidth: clamp(obj.width, 0.25, 100), borderOpacity: opacity, borderLineCap: LineCapStyle.Round });
      break;
    }
    case 'signature': {
      const color = parseHexColor(obj.color);
      const width = Math.max(0.4, obj.h * obj.strokeRatio);
      for (const stroke of obj.strokes) {
        const path = pointsToSvgPath(signatureToPoints(obj, stroke));
        if (path) page.drawSvgPath(path, { x: 0, y: H, borderColor: color, borderWidth: width, borderOpacity: opacity, borderLineCap: LineCapStyle.Round });
      }
      break;
    }
    case 'rect': {
      page.drawRectangle({
        x: obj.x,
        y: H - obj.y - obj.h,
        width: obj.w,
        height: obj.h,
        ...(obj.fill ? { color: parseHexColor(obj.fill), opacity } : {}),
        ...(obj.stroke ? { borderColor: parseHexColor(obj.stroke), borderWidth: clamp(obj.strokeWidth, 0.25, 100), borderOpacity: opacity } : { borderWidth: 0 }),
      });
      break;
    }
    case 'ellipse': {
      page.drawEllipse({
        x: obj.x + obj.w / 2,
        y: H - obj.y - obj.h / 2,
        xScale: obj.w / 2,
        yScale: obj.h / 2,
        ...(obj.fill ? { color: parseHexColor(obj.fill), opacity } : {}),
        ...(obj.stroke ? { borderColor: parseHexColor(obj.stroke), borderWidth: clamp(obj.strokeWidth, 0.25, 100), borderOpacity: opacity } : { borderWidth: 0 }),
      });
      break;
    }
    case 'line':
    case 'arrow': {
      const color = parseHexColor(obj.color);
      const thickness = clamp(obj.width, 0.25, 100);
      const [ex, ey] = obj.type === 'arrow' ? arrowShaftEnd(obj) : [obj.x2, obj.y2];
      page.drawLine({ start: { x: obj.x1, y: H - obj.y1 }, end: { x: ex, y: H - ey }, thickness, color, opacity, lineCap: LineCapStyle.Round });
      if (obj.type === 'arrow') page.drawSvgPath(arrowHeadPath(obj), { x: 0, y: H, color, opacity });
      break;
    }
    case 'highlight': {
      page.drawRectangle({ x: obj.x, y: H - obj.y - obj.h, width: obj.w, height: obj.h, color: parseHexColor(obj.color, parseHexColor('#ffe066')), opacity, blendMode: BlendMode.Multiply, borderWidth: 0 });
      break;
    }
    case 'image': {
      const image = images.get(obj.assetId);
      if (image) page.drawImage(image, { x: obj.x, y: H - obj.y - obj.h, width: obj.w, height: obj.h, opacity });
      break;
    }
  }
}
