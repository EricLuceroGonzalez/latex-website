#!/usr/bin/env node
// Importa plantillas organizadas por tamaño a templates/<id>/, con variantes.
//
// Uso:
//   node import-templates.mjs <carpeta> [--dry-run] [--force]
//
// <carpeta> contiene una subcarpeta por variante, y en cada una archivos
// <VARIANTE>-<nombre>.tex:
//
//   contents/A4/A4-cuadricula-5mm.tex     →  templates/cuadricula-5mm/A4.tex
//   contents/A5/A5-cuadricula-5mm.tex     →  templates/cuadricula-5mm/A5.tex
//                                             templates/cuadricula-5mm/meta.json
//
// Si un documento usa \includegraphics, se copia también la carpeta figures/
// de su variante.
// El meta.json se crea con status "soon" (no se publica) y textos
// provisionales: revísalo, quita "status" y ejecuta publish.mjs.
// Sin --force no toca plantillas que ya existen.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(ROOT, "templates");
const VARIANT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const [srcArg] = args.filter((a) => !a.startsWith("--"));

const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};
if (!srcArg) fail("Uso: node import-templates.mjs <carpeta> [--dry-run] [--force]");
const src = path.resolve(srcArg);
if (!fs.existsSync(src)) fail(`No existe ${src}`);

// "Cuadrícula 5 mm" → "cuadricula-5-mm"
const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// "cuadricula-5mm" → "Cuadricula 5mm"
const humanize = (id) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

// Patrón de respaldo para la miniatura mientras no hay PDF (ver LatexBlock).
function guessPattern(id) {
  if (/milimetr|graph/.test(id)) return "mm";
  if (/punte|dot/.test(id)) return "dots";
  if (/ruled|rayad|college|underlay|pauta/.test(id)) return "ruled";
  return "grid";
}

const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// variante → { id → ruta del .tex }
const variants = fs.readdirSync(src, { withFileTypes: true })
  .filter((e) => e.isDirectory() && VARIANT_RE.test(e.name))
  .map((e) => e.name)
  .sort(naturalSort);
if (!variants.length) fail(`${src} no tiene subcarpetas de variante (p. ej. A4/, A5/)`);

const byId = new Map(); // id → Map(variante → archivo)
for (const v of variants) {
  const vdir = path.join(src, v);
  for (const file of fs.readdirSync(vdir).filter((f) => f.endsWith(".tex")).sort()) {
    const base = path.basename(file, ".tex");
    const prefix = `${v}-`;
    const name = base.startsWith(prefix) ? base.slice(prefix.length) : base;
    const id = slugify(name);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, new Map());
    byId.get(id).set(v, path.join(vdir, file));
  }
}
if (!byId.size) fail("No se encontró ningún .tex");

const existingOrders = fs.existsSync(TEMPLATES_DIR)
  ? fs.readdirSync(TEMPLATES_DIR)
      .map((d) => path.join(TEMPLATES_DIR, d, "meta.json"))
      .filter((f) => fs.existsSync(f))
      .map((f) => JSON.parse(fs.readFileSync(f, "utf8")).order ?? 0)
  : [];
let order = Math.max(0, ...existingOrders) + 1;

console.log(`${byId.size} plantillas en ${variants.length} variantes (${variants.join(", ")})${dryRun ? " [dry-run]" : ""}\n`);

let created = 0;
let skipped = 0;
for (const id of [...byId.keys()].sort(naturalSort)) {
  const files = byId.get(id);
  const vs = [...files.keys()].sort(naturalSort);
  const dest = path.join(TEMPLATES_DIR, id);
  const exists = fs.existsSync(dest);
  const missing = variants.filter((v) => !files.has(v));

  if (exists && !force) {
    console.log(`  – ${id}: ya existe (usa --force para sobrescribir los .tex)`);
    skipped++;
    continue;
  }

  console.log(`  ${exists ? "↻" : "+"} ${id}: ${vs.join(", ")}${missing.length ? `   (sin ${missing.join(", ")})` : ""}`);
  if (dryRun) continue;

  fs.mkdirSync(dest, { recursive: true });
  for (const [v, file] of files) {
    fs.copyFileSync(file, path.join(dest, `${v}.tex`));
    // figures/ solo si el documento usa imágenes: si no, la plantilla se
    // publicaría como .zip sin necesidad.
    const figures = path.join(path.dirname(file), "figures");
    const usesImages = /\\includegraphics/.test(fs.readFileSync(file, "utf8").replace(/%.*$/gm, ""));
    if (usesImages && fs.existsSync(figures)) {
      fs.cpSync(figures, path.join(dest, "figures"), { recursive: true });
    }
  }

  // El meta.json existente se respeta (con --force solo se actualizan los .tex
  // y la lista de variantes).
  const metaFile = path.join(dest, "meta.json");
  const meta = fs.existsSync(metaFile)
    ? JSON.parse(fs.readFileSync(metaFile, "utf8"))
    : {
        status: "soon",
        order: order++,
        category: "papel",
        pattern: guessPattern(id),
        title: { es: humanize(id), en: humanize(id) },
        description: { es: "PENDIENTE: describe la plantilla.", en: "TODO: describe the template." },
      };
  meta.variants = vs;
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  created++;
}

console.log(`\n${created} importadas, ${skipped} omitidas.`);
if (created && !dryRun) {
  console.log("Siguiente paso: revisa title/description en cada templates/<id>/meta.json,");
  console.log('quita "status": "soon" y ejecuta: node publish.mjs <ruta-web> <id>');
}
