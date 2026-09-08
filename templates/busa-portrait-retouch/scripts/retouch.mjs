#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";

const execFileAsync = promisify(execFile);
const PRESETS = {
  natural: { brightness: 1.018, saturation: 1.015, smooth: 0.34, sharpen: 0.42 },
  fresh: { brightness: 1.035, saturation: 1.055, smooth: 0.38, sharpen: 0.34 },
  studio: { brightness: 1.012, saturation: 0.995, smooth: 0.27, sharpen: 0.62 },
};

function usage() {
  return `Busa Portrait Retouch

Usage:
  node scripts/retouch.mjs INPUT [options]

Options:
  -o, --output PATH       Output image (default: INPUT_retouched.ext)
  --compare PATH          Write a side-by-side proof image
  --summary PATH          Write the machine-readable processing result to a file
  --preset NAME           natural | fresh | studio (default: natural)
  --strength NUMBER       0-100 (default: 35)
  --face X,Y,W,H          Face rectangle in oriented image pixels; repeatable
  --no-face-detect        Skip macOS Vision auto-detection
  --keep-metadata         Preserve source metadata (GPS may be included)
  --overwrite             Permit replacing an existing output file
  --json                  Print only the machine-readable result
  -h, --help              Show this help
`;
}

function parseArgs(argv) {
  const options = { faces: [], preset: "natural", strength: 35, detectFaces: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-o" || arg === "--output") options.output = argv[++index];
    else if (arg === "--compare") options.compare = argv[++index];
    else if (arg === "--summary") options.summary = argv[++index];
    else if (arg === "--preset") options.preset = argv[++index];
    else if (arg === "--strength") options.strength = Number(argv[++index]);
    else if (arg === "--face") options.faces.push(parseFace(argv[++index]));
    else if (arg === "--no-face-detect") options.detectFaces = false;
    else if (arg === "--keep-metadata") options.keepMetadata = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!options.input) options.input = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
}

function parseFace(value) {
  const values = String(value || "")
    .split(",")
    .map(Number);
  if (values.length !== 4 || values.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new Error(`Invalid face rectangle: ${value}`);
  }
  const [x, y, width, height] = values;
  if (!width || !height) throw new Error("Face width and height must be greater than zero");
  return { x, y, width, height, source: "manual" };
}

function defaultOutput(input) {
  const parsed = path.parse(input);
  return path.join(parsed.dir, `${parsed.name}_retouched${parsed.ext || ".jpg"}`);
}

async function assertWritableTarget(target, overwrite) {
  if (!target) return;
  try {
    await access(target);
    if (!overwrite) throw new Error(`Refusing to overwrite existing file: ${target}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function detectFaces(input, width, height) {
  if (process.platform !== "darwin") return [];
  const script = path.join(import.meta.dirname, "detect-faces.swift");
  try {
    const { stdout } = await execFileAsync("swift", [script, input], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout).map((box) => ({
      x: Math.max(0, Math.round((box.x - box.width * 0.12) * width)),
      y: Math.max(0, Math.round((1 - box.y - box.height - box.height * 0.16) * height)),
      width: Math.min(width, Math.round(box.width * 1.24 * width)),
      height: Math.min(height, Math.round(box.height * 1.32 * height)),
      source: "macos-vision",
    }));
  } catch {
    return [];
  }
}

function faceMaskSvg(width, height, faces, opacity) {
  const ellipses = faces
    .map((face) => {
      const cx = face.x + face.width / 2;
      const cy = face.y + face.height / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${face.width / 2}" ry="${face.height / 2}" fill="white" fill-opacity="${opacity}"/>`;
    })
    .join("");
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black" fill-opacity="0"/>${ellipses}</svg>`,
  );
}

async function renderCandidate(input, options) {
  const oriented = await sharp(input).autoOrient().toBuffer();
  const metadata = await sharp(oriented).metadata();
  const { width, height } = metadata;
  if (!width || !height) throw new Error("Could not determine oriented image dimensions");

  const preset = PRESETS[options.preset];
  const factor = options.strength / 100;
  const detected = options.faces.length
    ? options.faces
    : options.detectFaces
      ? await detectFaces(input, width, height)
      : [];

  let working = oriented;
  if (detected.length && options.strength > 0) {
    const sigma = 0.6 + 2.4 * factor;
    const softened = await sharp(oriented).blur(sigma).toBuffer();
    const mask = await sharp(faceMaskSvg(width, height, detected, preset.smooth * factor))
      .png()
      .toBuffer();
    const masked = await sharp(softened)
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    working = await sharp(oriented)
      .ensureAlpha()
      .composite([{ input: masked, blend: "over" }])
      .toBuffer();
  }

  let pipeline = sharp(working)
    .modulate({
      brightness: 1 + (preset.brightness - 1) * factor,
      saturation: 1 + (preset.saturation - 1) * factor,
    })
    .sharpen({ sigma: 0.35 + preset.sharpen * factor, m1: 0.35, m2: 0.7 });
  if (options.keepMetadata) pipeline = pipeline.withMetadata();
  const extension = path.extname(options.output).toLowerCase();
  if ([".jpg", ".jpeg"].includes(extension)) pipeline = pipeline.jpeg({ quality: 94, chromaSubsampling: "4:4:4" });
  else if (extension === ".png") pipeline = pipeline.png({ compressionLevel: 7 });
  else if (extension === ".webp") pipeline = pipeline.webp({ quality: 94, smartSubsample: true });
  await pipeline.toFile(options.output);

  if (options.compare) {
    const candidate = await sharp(options.output).toBuffer();
    await sharp({ create: { width: width * 2, height, channels: 3, background: "#f3f4f6" } })
      .composite([
        { input: oriented, left: 0, top: 0 },
        { input: candidate, left: width, top: 0 },
      ])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toFile(options.compare);
  }

  return {
    engine_version: "sharp-natural-v1",
    input: path.resolve(input),
    output: path.resolve(options.output),
    comparison: options.compare ? path.resolve(options.compare) : null,
    preset: options.preset,
    strength: options.strength,
    dimensions: { width, height },
    faces: detected,
    face_processing: detected.length ? "masked" : "none",
    metadata: options.keepMetadata ? "preserved" : "stripped",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.input) throw new Error(`Input image required.\n\n${usage()}`);
  if (!PRESETS[options.preset]) throw new Error(`Unknown preset: ${options.preset}`);
  if (!Number.isFinite(options.strength) || options.strength < 0 || options.strength > 100) {
    throw new Error("Strength must be a number from 0 to 100");
  }
  await access(options.input);
  options.output = options.output || defaultOutput(options.input);
  if (path.resolve(options.input) === path.resolve(options.output) && !options.overwrite) {
    throw new Error("Output cannot replace the input unless --overwrite is provided");
  }
  await assertWritableTarget(options.output, options.overwrite);
  await assertWritableTarget(options.compare, options.overwrite);
  const result = await renderCandidate(options.input, options);
  if (options.summary) {
    await assertWritableTarget(options.summary, options.overwrite);
    await writeFile(options.summary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  if (options.json) console.log(JSON.stringify(result));
  else {
    console.log(`Retouched: ${result.output}`);
    if (result.comparison) console.log(`Comparison: ${result.comparison}`);
    console.log(`Preset: ${result.preset} · strength ${result.strength} · faces ${result.faces.length}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
