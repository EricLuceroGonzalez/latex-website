#!/usr/bin/env node
// Publica las plantillas de templates/<id>/ en la web.
//
// Uso:
//   node publish.mjs <ruta-al-repo-web> [id ...] [--dry-run]
//
// Requiere: latexmk, pdftoppm (poppler). Opcional: latexpand, zip, pdfinfo.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(ROOT, "templates");
const CATALOG_DIR = path.join(ROOT, "build");
const PUBLIC_PREFIX = "/latex";
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

const ENGINES = { pdflatex: "-pdf", xelatex: "-xelatex", lualatex: "-lualatex" };

// Restos de compilación: nunca forman parte de una plantilla publicada.
const BUILD_EXT = new Set([
  ".aux", ".log", ".fls", ".fdb_latexmk", ".out", ".toc", ".lof", ".lot",
  ".bbl", ".blg", ".bcf", ".nav", ".snm", ".vrb", ".xdv", ".synctex", ".gz",
]);
const IGNORED_NAMES = new Set(["meta.json", "README.md", "build"]);

// <id>.pdf es la salida de compilar; otros .pdf (figuras) sí se publican.
const isBuildArtifact = (name, id) => {
  const ext = path.extname(name).toLowerCase();
  return BUILD_EXT.has(ext) || name.endsWith(".run.xml") || name === `${id}.pdf`;
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

function has(cmd) {
  return spawnSync("sh", ["-c", 'command -v "$1"', "sh", cmd]).status === 0;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function tail(text, n = 25) {
  return text.trim().split("\n").slice(-n).join("\n");
}

function walk(dir, id, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORED_NAMES.has(e.name) || e.name.startsWith(".")) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, id, base);
    if (isBuildArtifact(e.name, id)) return [];
    return [path.relative(base, full)];
  });
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`No puedo leer ${path.relative(ROOT, file)}: ${e.message}`);
  }
}

function compile(engine, file, cwd, outdir) {
  return run(
    "latexmk",
    [ENGINES[engine], "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", `-outdir=${outdir}`, file],
    cwd,
  );
}

function validateMeta(id, meta) {
  const missing = ["title", "description", "category"].filter((k) => !meta[k]);
  for (const k of ["title", "description"]) {
    if (meta[k] && (!meta[k].es || !meta[k].en)) missing.push(`${k}.es/${k}.en`);
  }
  if (meta.engine && !ENGINES[meta.engine]) missing.push(`engine (${Object.keys(ENGINES).join("|")})`);
  if (missing.length) fail(`templates/${id}/meta.json: faltan o son inválidos: ${missing.join(", ")}`);
}

const publicMeta = (id, meta) => ({
  id,
  order: meta.order ?? 999,
  category: meta.category,
  pattern: meta.pattern ?? "grid",
  fit: meta.fit ?? null,
  meta: meta.meta ?? "",
  title: meta.title,
  description: meta.description,
});

// ── Publicar una plantilla ────────────────────────────────────────────────────

function publish(id, { web, dryRun, tools }) {
  const dir = path.join(TEMPLATES_DIR, id);
  const meta = readJSON(path.join(dir, "meta.json"));
  validateMeta(id, meta);

  if (meta.status === "soon") {
    log(`• ${id}: próximamente (no se compila)`);
    return { ...publicMeta(id, meta), source: null, sourceType: null, pdf: null, thumb: null };
  }

  const mainFile = `${id}.tex`;
  if (!fs.existsSync(path.join(dir, mainFile))) fail(`Falta templates/${id}/${mainFile}`);
  const engine = meta.engine ?? "pdflatex";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tpl-${id}-`));
  const dist = path.join(tmp, "dist");
  fs.mkdirSync(dist);

  try {
    // 1. Compila en tu carpeta de trabajo (con \input, bib, figuras…).
    log(`• ${id}: compilando (${engine})…`);
    const first = compile(engine, mainFile, dir, path.join(tmp, "work"));
    if (!first.ok) {
      console.error(tail(first.out));
      return { error: `${id}: no compila en templates/${id}/` };
    }

    // 2. Aplana a un solo .tex.
    const sources = walk(dir, id);
    const extraTex = sources.filter((f) => f.endsWith(".tex") && f !== mainFile);
    const bbl = path.join(tmp, "work", `${id}.bbl`);
    // Con biblatex/biber (.bcf) el .bbl no se puede incrustar de forma fiable:
    // en ese caso se publica el .bib dentro del zip.
    const usesBiber = fs.existsSync(path.join(tmp, "work", `${id}.bcf`));
    let bblExpanded = false;

    if (tools.latexpand) {
      const args = ["--keep-comments", mainFile];
      if (fs.existsSync(bbl) && !usesBiber) {
        args.unshift("--expand-bbl", bbl);
        bblExpanded = true;
      }
      fs.writeFileSync(path.join(dist, mainFile), execFileSync("latexpand", args, { cwd: dir }));
    } else if (extraTex.length) {
      return { error: `${id}: usa ${extraTex.join(", ")}; instala latexpand para aplanarlo` };
    } else {
      fs.copyFileSync(path.join(dir, mainFile), path.join(dist, mainFile));
    }

    // 3. Copia los recursos que no son .tex (figuras, .sty, .cls, .bib…).
    const assets = sources.filter(
      (f) => !f.endsWith(".tex") && !(bblExpanded && f.endsWith(".bib")),
    );
    for (const rel of assets) {
      fs.mkdirSync(path.join(dist, path.dirname(rel)), { recursive: true });
      fs.copyFileSync(path.join(dir, rel), path.join(dist, rel));
    }

    // 4. Compila la versión descargable, AISLADA. Es la garantía de que
    //    quien la descargue (o la abra en Overleaf) podrá compilarla.
    const isolated = compile(engine, mainFile, dist, path.join(tmp, "check"));
    if (!isolated.ok) {
      console.error(tail(isolated.out));
      return { error: `${id}: compila en tu repo pero NO aislada (¿falta un archivo o un \\input fuera de la carpeta?)` };
    }
    const pdf = path.join(tmp, "check", `${id}.pdf`);

    // 5. Miniatura de la primera página.
    const thumbBase = path.join(tmp, id);
    execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-scale-to-x", "480", "-scale-to-y", "-1", "-singlefile", pdf, thumbBase]);

    // 6. Paquete: .tex suelto o .zip si hay recursos.
    const sourceType = assets.length ? "zip" : "tex";
    const sourceFile = path.join(tmp, `${id}.${sourceType}`);
    if (sourceType === "zip") {
      if (!tools.zip) return { error: `${id}: tiene recursos (${assets.join(", ")}); instala zip` };
      execFileSync("zip", ["-q", "-r", "-X", sourceFile, mainFile, ...assets], { cwd: dist });
    } else {
      fs.copyFileSync(path.join(dist, mainFile), sourceFile);
    }

    let pages = null;
    if (tools.pdfinfo) {
      const m = run("pdfinfo", [pdf]).out.match(/^Pages:\s+(\d+)/m);
      pages = m ? Number(m[1]) : null;
    }

    // PDF también en build/ para el catálogo (main.tex con \includepdf).
    fs.mkdirSync(CATALOG_DIR, { recursive: true });
    fs.copyFileSync(pdf, path.join(CATALOG_DIR, `${id}.pdf`));

    const url = (ext) => `${PUBLIC_PREFIX}/${id}/${id}.${ext}`;
    const entry = {
      ...publicMeta(id, meta),
      source: url(sourceType),
      sourceType,
      pdf: url("pdf"),
      thumb: url("png"),
      pages,
      bytes: { source: fs.statSync(sourceFile).size, pdf: fs.statSync(pdf).size },
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    if (!dryRun) {
      const out = path.join(web, "public", "latex", id);
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(out, { recursive: true });
      fs.copyFileSync(sourceFile, path.join(out, `${id}.${sourceType}`));
      fs.copyFileSync(pdf, path.join(out, `${id}.pdf`));
      fs.copyFileSync(`${thumbBase}.png`, path.join(out, `${id}.png`));
    }
    log(`  ✔ ${sourceType}${assets.length ? ` (${assets.length} recursos)` : ""} · pdf${pages ? ` (${pages} pág.)` : ""} · png`);
    return entry;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [webArg, ...only] = args.filter((a) => !a.startsWith("--"));

if (!webArg) fail("Uso: node publish.mjs <ruta-al-repo-web> [id ...] [--dry-run]");
const web = path.resolve(webArg);
if (!fs.existsSync(path.join(web, "package.json")) || !fs.existsSync(path.join(web, "public"))) {
  fail(`${web} no parece el repo de la web (falta package.json o public/)`);
}
if (!fs.existsSync(TEMPLATES_DIR)) fail("No existe templates/ junto a publish.mjs");

for (const cmd of ["latexmk", "pdftoppm"]) {
  if (!has(cmd)) fail(`Falta ${cmd}. Instala TeX Live (latexmk) y poppler (pdftoppm).`);
}
const tools = { latexpand: has("latexpand"), zip: has("zip"), pdfinfo: has("pdfinfo") };

const all = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const bad = all.filter((id) => !ID_RE.test(id));
if (bad.length) fail(`Nombres de carpeta inválidos (usa a-z, 0-9, - y _): ${bad.join(", ")}`);

const unknown = only.filter((id) => !all.includes(id));
if (unknown.length) fail(`No existen en templates/: ${unknown.join(", ")}`);
const ids = only.length ? only : all;

const manifestFile = path.join(web, "app", "lib", "latex-manifest.json");
const previous = fs.existsSync(manifestFile) ? readJSON(manifestFile).templates ?? [] : [];
const byId = new Map(previous.filter((t) => all.includes(t.id)).map((t) => [t.id, t]));

log(`Publicando ${ids.length} plantilla(s)${dryRun ? " [dry-run]" : ""} → ${web}\n`);
const errors = [];
for (const id of ids) {
  const result = publish(id, { web, dryRun, tools });
  if (result.error) {
    errors.push(result.error);
    log(`  ✖ ${result.error}${byId.has(id) ? " — se mantiene la versión publicada anterior" : ""}`);
  } else {
    byId.set(id, result);
  }
}

const templates = [...byId.values()].sort(
  (a, b) => a.order - b.order || a.title.es.localeCompare(b.title.es),
);
const manifest = { generatedAt: new Date().toISOString(), templates };

if (dryRun) {
  log(`\n[dry-run] Manifest que se escribiría:\n${JSON.stringify(manifest, null, 2)}`);
} else {
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`\nManifest: ${path.relative(web, manifestFile)} (${templates.length} plantillas)`);
}

if (errors.length) {
  console.error(`\n${errors.length} error(es):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
