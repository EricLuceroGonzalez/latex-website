# Plantillas LaTeX de ericlucero.dev

Cada plantilla vive en su carpeta y **compila sola**. `publish.mjs` las compila, comprueba que la versión descargable funciona aislada y las publica en la web junto con un manifest.

```
templates/
  milimetrada/
    milimetrada.tex      ← documento completo (\documentclass … \end{document})
    meta.json            ← título, descripción, categoría…
  informe/
    informe.tex          ← puede usar \input, figuras y bibliografía
    content/intro.tex
    figures/fig.png
    refs.bib
    meta.json
build/                   ← PDFs generados (para main.tex), no se versiona
main.tex                 ← catálogo para ti: reúne los PDFs de build/
publish.mjs
```

## Requisitos

| Herramienta | Para qué | Instalación |
|---|---|---|
| Node ≥ 18 | ejecutar el script | ya lo tienes por Next.js |
| `latexmk` | compilar | TeX Live (`apt install texlive-full` / MacTeX) |
| `pdftoppm`, `pdfinfo` | miniatura y nº de páginas | `apt install poppler-utils` / `brew install poppler` |
| `latexpand` | aplanar `\input` en un solo `.tex` | viene con TeX Live |
| `zip` | plantillas con figuras / `.sty` / `.bib` | normalmente ya está |

Solo `latexmk` y `pdftoppm` son obligatorios. El script avisa si falta algo cuando una plantilla lo necesita.

## Uso

```bash
# Todas las plantillas
node publish.mjs ~/dev/EricLuceroGonzalez.github.io

# Solo algunas
node publish.mjs ~/dev/EricLuceroGonzalez.github.io milimetrada recta_real

# Probar sin tocar la web
node publish.mjs ~/dev/EricLuceroGonzalez.github.io --dry-run
```

Para no escribir la ruta cada vez, crea un alias:

```bash
alias publish-latex='node "$DEV/playground/tutorials/ericlucerodev/publish.mjs" "$DEV/EricLuceroGonzalez.github.io"'
```

## Qué hace, por plantilla

1. **Compila** `templates/<id>/<id>.tex` en su carpeta, con `\input`, figuras y bibliografía.
2. **Aplana** con `latexpand` en un solo `.tex`: inserta los `\input`, conserva los comentarios e incrusta la bibliografía ya procesada (BibTeX).
3. **Copia los recursos** que no son `.tex`: figuras, `.sty`, `.cls`, `.bib` si usas biblatex…
4. **Compila otra vez, aislada**, en una carpeta temporal con solo esos archivos. Si falla, la plantilla **no se publica**: lo que ve el visitante funcionaría en tu ordenador pero no en el suyo.
5. Genera la **miniatura** (PNG de 480px de la primera página).
6. Publica en `<web>/public/latex/<id>/`:
   - `<id>.tex`, o `<id>.zip` si hay recursos;
   - `<id>.pdf`, el PDF compilado **desde el archivo descargable**: lo que ves es lo que descargas;
   - `<id>.png`.
7. Actualiza `<web>/app/lib/latex-manifest.json`.

Si una plantilla falla, **se mantiene su versión publicada anterior** y el script termina con código 1 tras procesar las demás.

## `meta.json`

```json
{
  "order": 1,
  "category": "papel",
  "pattern": "mm",
  "fit": "contain",
  "meta": "A4 · 18 × 25 cm",
  "engine": "pdflatex",
  "status": "soon",
  "title": { "es": "Papel milimetrado", "en": "Millimetre paper" },
  "description": { "es": "…", "en": "…" }
}
```

| Campo | Obligatorio | Valores |
|---|---|---|
| `title`, `description` | sí | objetos con `es` y `en` |
| `category` | sí | `papel`, `musica`, `tikz`… (debe existir en `latex_categories` de los `messages`) |
| `order` | no | posición en la web (menor = antes) |
| `pattern` | no | patrón si falta la miniatura: `grid`, `mm`, `staff`, `figure` |
| `fit` | no | `contain` para figuras no A4 (no recorta la miniatura) |
| `meta` | no | línea corta bajo el título |
| `engine` | no | `pdflatex` (por defecto), `xelatex`, `lualatex` |
| `status` | no | `soon`: aparece como "Próximamente", sin compilar ni archivos |

El nombre de la carpeta es el `id`: solo `a-z`, `0-9`, `-` y `_`. El `.tex` principal se llama igual que la carpeta.

> **`engine` y Overleaf:** el botón "Overleaf" abre el proyecto con pdfLaTeX. Si una plantilla necesita XeLaTeX (por ejemplo, por `fontspec`), quien la abra tendrá que cambiar el compilador en *Menu → Compiler*. Indícalo en la descripción.

## Catálogo (`main.tex`)

Con las plantillas autónomas, `main.tex` ya no las incluye con `\input`: junta los PDFs que deja `publish.mjs` en `build/`:

```latex
\documentclass[a4paper]{article}
\usepackage{pdfpages}
\begin{document}
\includepdf[pages=-]{build/milimetrada.pdf}
\includepdf[pages=-, fitpaper]{build/recta_real.pdf}  % standalone: tamaño propio
\end{document}
```

Usa `--dry-run` para regenerar `build/` sin publicar.

## `.gitignore`

```
build/
*.aux
*.log
*.fls
*.fdb_latexmk
*.synctex.gz
*.bbl
*.blg
*.bcf
*.run.xml
```

No ignores `*.pdf` de forma general: una figura en PDF dentro de una plantilla es un recurso que hay que versionar. Si compilas a mano dentro de `templates/<id>/`, el `<id>.pdf` resultante no se publica (el script lo descarta), pero conviene no subirlo al repo.
