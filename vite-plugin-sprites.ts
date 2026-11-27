import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { PNG } from 'pngjs';
import { GifReader, GifWriter } from 'omggif';

const VIRTUAL_MODULE_ID = 'virtual:sprites';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_MODULE_ID}`;
const SUPPORTED_EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif']);
const MIN_CRISP_HEIGHT = 256;
const TARGET_CRISP_HEIGHT = 320;

interface DiscoveredSprite {
  id: string;
  label: string;
  src: string;
  side: 'hero' | 'villain';
  width: number;
  height: number;
  fileName: string;
  folder: 'heroes' | 'villains';
  mime: string;
  buffer: Uint8Array;
  upscaled: boolean;
}

function formatLabel(baseName: string): string {
  const withoutPrefix = baseName.replace(/^\d+[_\-\s]+/, '');
  const cleaned = (withoutPrefix || baseName).replace(/[_\-]+/g, ' ').trim();
  return cleaned
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function getMimeType(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function upscaleRgbaNearestNeighbor(
  srcData: Uint8Array,
  srcW: number,
  srcH: number,
  scale: number,
): Uint8Array {
  const outW = srcW * scale;
  const outH = srcH * scale;
  const outData = new Uint8Array(outW * outH * 4);

  for (let y = 0; y < srcH; y += 1) {
    for (let x = 0; x < srcW; x += 1) {
      const srcIdx = (y * srcW + x) * 4;
      const r = srcData[srcIdx];
      const g = srcData[srcIdx + 1];
      const b = srcData[srcIdx + 2];
      const a = srcData[srcIdx + 3];

      const baseY = y * scale;
      const baseX = x * scale;

      for (let dy = 0; dy < scale; dy += 1) {
        const rowOffset = (baseY + dy) * outW;
        for (let dx = 0; dx < scale; dx += 1) {
          const dstIdx = (rowOffset + baseX + dx) * 4;
          outData[dstIdx] = r;
          outData[dstIdx + 1] = g;
          outData[dstIdx + 2] = b;
          outData[dstIdx + 3] = a;
        }
      }
    }
  }

  return outData;
}

function upscalePngNearestNeighbor(src: PNG, scale: number): PNG {
  const out = new PNG({
    width: src.width * scale,
    height: src.height * scale,
  });
  out.data = Buffer.from(
    upscaleRgbaNearestNeighbor(src.data, src.width, src.height, scale),
  );
  return out;
}

function nextPowerOfTwo(n: number): number {
  let p = 2;
  while (p < n && p < 256) p <<= 1;
  return p;
}

function findNearestColorIndex(palette: number[], r: number, g: number, b: number): number {
  let bestIdx = 1;
  let bestDist = Infinity;
  for (let i = 1; i < palette.length; i += 1) {
    const c = palette[i];
    const dr = ((c >> 16) & 0xff) - r;
    const dg = ((c >> 8) & 0xff) - g;
    const db = (c & 0xff) - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function quantizeFrameToIndexed(
  rgba: Uint8Array,
  pixelCount: number,
): { indexed: number[]; palette: number[] } {
  const colorToIndex = new Map<number, number>();
  // Index 0 is reserved for transparency.
  const palette: number[] = [0x000000];
  const indexed = new Array<number>(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const a = rgba[off + 3];
    if (a < 128) {
      indexed[i] = 0;
      continue;
    }

    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];
    const rgb = (r << 16) | (g << 8) | b;

    let idx = colorToIndex.get(rgb);
    if (idx === undefined) {
      if (palette.length < 256) {
        idx = palette.length;
        palette.push(rgb);
        colorToIndex.set(rgb, idx);
      } else {
        idx = findNearestColorIndex(palette, r, g, b);
      }
    }
    indexed[i] = idx;
  }

  const targetLen = nextPowerOfTwo(palette.length);
  while (palette.length < targetLen) {
    palette.push(0x000000);
  }

  return { indexed, palette };
}

function processGifBuffer(rawBuffer: Buffer): {
  width: number;
  height: number;
  buffer: Uint8Array;
  upscaled: boolean;
} {
  const reader = new GifReader(rawBuffer);
  const srcW = reader.width;
  const srcH = reader.height;
  const numFrames = reader.numFrames();

  if (srcW <= 0 || srcH <= 0 || numFrames <= 0 || srcH >= MIN_CRISP_HEIGHT) {
    return { width: srcW, height: srcH, buffer: rawBuffer, upscaled: false };
  }

  const scale = Math.max(2, Math.ceil(TARGET_CRISP_HEIGHT / srcH));
  const outW = srcW * scale;
  const outH = srcH * scale;

  const canvas = new Uint8Array(srcW * srcH * 4);
  const compositedFrames: Array<{ rgba: Uint8Array; delay: number }> = [];

  for (let f = 0; f < numFrames; f += 1) {
    const info = reader.frameInfo(f);
    const snapshot = info.disposal === 3 ? canvas.slice() : null;

    reader.decodeAndBlitFrameRGBA(f, canvas);
    compositedFrames.push({
      rgba: canvas.slice(),
      delay: info.delay > 0 ? info.delay : numFrames > 1 ? 10 : 0,
    });

    if (info.disposal === 2) {
      for (let ry = 0; ry < info.height; ry += 1) {
        const y = info.y + ry;
        if (y < 0 || y >= srcH) continue;
        for (let rx = 0; rx < info.width; rx += 1) {
          const x = info.x + rx;
          if (x < 0 || x >= srcW) continue;
          const idx = (y * srcW + x) * 4;
          canvas[idx] = 0;
          canvas[idx + 1] = 0;
          canvas[idx + 2] = 0;
          canvas[idx + 3] = 0;
        }
      }
    } else if (info.disposal === 3 && snapshot) {
      canvas.set(snapshot);
    }
  }

  const estimatedBytes = compositedFrames.length * (outW * outH * 2 + 1024) + 4096;
  const outBuf = new Uint8Array(estimatedBytes);
  const writer = new GifWriter(
    outBuf,
    outW,
    outH,
    compositedFrames.length > 1 ? { loop: 0 } : undefined,
  );

  for (const frame of compositedFrames) {
    const upscaledRgba = upscaleRgbaNearestNeighbor(frame.rgba, srcW, srcH, scale);
    const { indexed, palette } = quantizeFrameToIndexed(upscaledRgba, outW * outH);
    writer.addFrame(0, 0, outW, outH, indexed, {
      palette,
      delay: frame.delay,
      disposal: 2,
      transparent: 0,
    });
  }

  const finalSize = writer.end();
  return {
    width: outW,
    height: outH,
    buffer: outBuf.slice(0, finalSize),
    upscaled: true,
  };
}

function processSpriteFile(
  filePath: string,
  fileName: string,
  folder: 'heroes' | 'villains',
  side: 'hero' | 'villain',
): DiscoveredSprite {
  const ext = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, ext);
  const rawBuffer = fs.readFileSync(filePath);
  const mime = getMimeType(ext);

  let width = 256;
  let height = 384;
  let buffer: Uint8Array = rawBuffer;
  let upscaled = false;

  if (ext === '.png') {
    const parsed = PNG.sync.read(rawBuffer);
    if (parsed.height > 0 && parsed.height < MIN_CRISP_HEIGHT) {
      const scale = Math.max(2, Math.ceil(TARGET_CRISP_HEIGHT / parsed.height));
      const resized = upscalePngNearestNeighbor(parsed, scale);
      width = resized.width;
      height = resized.height;
      buffer = PNG.sync.write(resized);
      upscaled = true;
    } else {
      width = parsed.width;
      height = parsed.height;
    }
  } else if (ext === '.gif') {
    const processed = processGifBuffer(rawBuffer);
    width = processed.width;
    height = processed.height;
    buffer = processed.buffer;
    upscaled = processed.upscaled;
  }

  return {
    id: baseName,
    label: formatLabel(baseName),
    src: `/assets/sprites/${folder}/${encodeURIComponent(fileName)}`,
    side,
    width,
    height,
    fileName,
    folder,
    mime,
    buffer,
    upscaled,
  };
}

function scanFolder(
  dirPath: string,
  folder: 'heroes' | 'villains',
  side: 'hero' | 'villain',
): DiscoveredSprite[] {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isFile()) return false;
      const ext = path.extname(entry.name).toLowerCase();
      return SUPPORTED_EXTS.has(ext);
    })
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return entries.map((fileName) =>
    processSpriteFile(path.join(dirPath, fileName), fileName, folder, side),
  );
}

/**
 * Automatically discovers hero and villain sprites from
 * `public/assets/sprites/heroes/` and `public/assets/sprites/villains/`,
 * upscales small pixel-art PNGs and GIFs with NearestNeighbor so they stay
 * crisp on Owlbear Rodeo's WebGL canvas, and exposes them via `virtual:sprites`.
 */
export function spriteCatalogPlugin(): Plugin {
  let rootDir = process.cwd();
  let publicDir = path.join(rootDir, 'public');
  let outDir = path.join(rootDir, 'dist');
  let cached: {
    heroes: DiscoveredSprite[];
    villains: DiscoveredSprite[];
    byUrl: Map<string, DiscoveredSprite>;
  } | null = null;

  const getDirs = () => ({
    heroesDir: path.join(publicDir, 'assets', 'sprites', 'heroes'),
    villainsDir: path.join(publicDir, 'assets', 'sprites', 'villains'),
  });

  const loadCatalog = () => {
    if (cached) return cached;
    const { heroesDir, villainsDir } = getDirs();
    const heroes = scanFolder(heroesDir, 'heroes', 'hero');
    const villains = scanFolder(villainsDir, 'villains', 'villain');
    const byUrl = new Map<string, DiscoveredSprite>();

    for (const item of [...heroes, ...villains]) {
      byUrl.set(item.src, item);
    }

    cached = { heroes, villains, byUrl };
    return cached;
  };

  const invalidate = () => {
    cached = null;
  };

  return {
    name: 'ultitracker-sprite-catalog',
    configResolved(config: ResolvedConfig) {
      rootDir = config.root;
      publicDir = config.publicDir;
      outDir = path.resolve(config.root, config.build.outDir);
      invalidate();
    },
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_ID;
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return undefined;
      const { heroes, villains } = loadCatalog();
      const serialize = (list: DiscoveredSprite[]) =>
        list.map(({ id: spriteId, label, src, side, width, height }) => ({
          id: spriteId,
          label,
          src,
          side,
          width,
          height,
        }));

      return [
        `export const HERO_SPRITES = ${JSON.stringify(serialize(heroes), null, 2)};`,
        `export const VILLAIN_SPRITES = ${JSON.stringify(serialize(villains), null, 2)};`,
      ].join('\n');
    },
    configureServer(server) {
      const { heroesDir, villainsDir } = getDirs();
      server.watcher.add([heroesDir, villainsDir]);

      const isSpriteFolderPath = (changedPath: string) => {
        const normalized = path.resolve(changedPath);
        return (
          normalized.startsWith(path.resolve(heroesDir)) ||
          normalized.startsWith(path.resolve(villainsDir))
        );
      };

      const handleFsEvent = (changedPath: string) => {
        if (!isSpriteFolderPath(changedPath)) return;
        invalidate();
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };

      server.watcher.on('add', handleFsEvent);
      server.watcher.on('change', handleFsEvent);
      server.watcher.on('unlink', handleFsEvent);

      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }
        const pathname = req.url.split('?')[0];
        if (
          !pathname.startsWith('/assets/sprites/heroes/') &&
          !pathname.startsWith('/assets/sprites/villains/')
        ) {
          next();
          return;
        }

        const { byUrl } = loadCatalog();
        const match = byUrl.get(pathname);
        if (!match) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', match.mime);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(match.buffer);
      });
    },
    closeBundle() {
      const { heroes, villains } = loadCatalog();
      for (const item of [...heroes, ...villains]) {
        if (!item.upscaled) continue;
        const targetDir = path.join(outDir, 'assets', 'sprites', item.folder);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(path.join(targetDir, item.fileName), item.buffer);
      }
    },
  };
}
