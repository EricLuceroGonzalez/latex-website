# Plantillas LaTeX de ericlucero.dev

Cada plantilla vive en su carpeta y **compila sola**. `publish.mjs` las compila, comprueba que la versión descargable funciona aislada y las publica en la web junto con un manifest. `import-templates.mjs` convierte carpetas de plantillas por tamaño (A4, A5…) a este formato.

```
templates/
  milimetrada/
    milimetrada.tex      ← documento completo (\documentclass … \end{document})
    meta.json            ← título, descripción, categoría…
  cuadricula-5mm/        ← plantilla con variantes de tamaño
    A4.tex
    A5.tex
    meta.json            ← "variants": ["A4", "A5"]
  informe/
    informe.tex          ← puede usar \input, figuras y bibliografía
    content/intro.tex
    figures/fig.png
    refs.bib
    meta.json
tikz/latex-templates/contents/   ← origen para el importador
  A4/A4-cuadricula-5mm.tex
  A5/A5-cuadricula-5mm.tex
build/                   ← PDFs generados (para main.tex), no se versiona
main.tex                 ← catálogo para ti: reúne los PDFs de build/
publish.mjs
import-templates.mjs
```

## Requisitos

| Herramienta | Para qué | Instalación |
|---|---|---|
| Node ≥ 18 | ejecutar los scripts | ya lo tienes por Next.js |
| `latexmk` | compilar | TeX Live (`apt install texlive-full` / MacTeX) |
| `pdftoppm`, `pdfinfo` | miniatura y nº de páginas | `apt install poppler-utils` / `brew install poppler` |
| `latexpand` | aplanar `\input` en un solo `.tex` | viene con TeX Live |
| `zip` | plantillas con figuras / `.sty` / `.bib` | normalmente ya está |

Solo `latexmk` y `pdftoppm` son obligatorios. El script avisa si falta algo cuando una plantilla lo necesita.

## Importar plantillas por tamaño

Para plantillas organizadas en una subcarpeta por tamaño, con el tamaño como prefijo del nombre:

```
tikz/latex-templates/contents/
  A4/A4-cuadricula-5mm.tex   A4/A4-punteado-5mm.tex   …
  A5/A5-cuadricula-5mm.tex   A5/A5-punteado-5mm.tex   …
```

```bash
# 1. Ver qué haría, sin tocar nada
node import-templates.mjs tikz/latex-templates/contents/ --dry-run

# 2. Importar
node import-templates.mjs tikz/latex-templates/contents/
```

Salida:

```
9 plantillas en 2 variantes (A4, A5)

  + college-ruled: A4, A5
  + cornell-cuadricula: A4, A5
  + cuadricula-5mm: A4, A5
  …
```

Qué hace:

- **Agrupa por nombre,** quitando el prefijo de tamaño: `A4-cuadricula-5mm.tex` + `A5-cuadricula-5mm.tex` → `templates/cuadricula-5mm/A4.tex` y `A5.tex`. Si un diseño solo existe en un tamaño, lo avisa (`(sin A5)`) y crea la plantilla con ese tamaño.
- **El nombre de la carpeta** pierde acentos y espacios: `Cuadrícula 5 mm` → `cuadricula-5-mm`.
- **Copia `figures/`** de la carpeta de ese tamaño **solo si** el `.tex` usa `\includegraphics`. Si no, la plantilla se publicaría como `.zip` sin necesidad.
- **Crea un `meta.json` provisional** con `"status": "soon"`, título derivado del nombre, `category: "papel"` y un `pattern` deducido (`mm`, `dots`, `ruled` o `grid`). La plantilla no se publica hasta que lo revises.
- **No sobrescribe nada:** si `templates/<id>/` ya existe, la salta. Con `--force` sustituye los `.tex` y actualiza la lista de variantes, pero **respeta tu `meta.json`**.

Después de importar:

1. Completa en cada `templates/<id>/meta.json` el `title` y la `description` (`es` y `en`), y revisa `category`.
2. Borra la línea `"status": "soon"` de las que quieras publicar.
3. Publica (siguiente sección).

## Publicar

```bash
# Todas las plantillas
node publish.mjs ~/dev/EricLuceroGonzalez.github.io

# Solo algunas
node publish.mjs ~/dev/EricLuceroGonzalez.github.io milimetrada cuadricula-5mm

# Probar sin tocar la web
node publish.mjs ~/dev/EricLuceroGonzalez.github.io --dry-run
```

Para no escribir la ruta cada vez, crea un alias:

```bash
alias publish-latex='node "$DEV/playground/tutorials/ericlucerodev/publish.mjs" "$DEV/EricLuceroGonzalez.github.io"'
```

## Qué hace, por plantilla

1. **Compila** cada documento en su carpeta, con `\input`, figuras y bibliografía: `<id>.tex` o, con variantes, `A4.tex`, `A5.tex`…
2. **Aplana** con `latexpand` en un solo `.tex`: inserta los `\input`, conserva los comentarios e incrusta la bibliografía ya procesada (BibTeX).
3. **Copia los recursos** que no son `.tex`: figuras, `.sty`, `.cls`, `.bib` si usas biblatex…
4. **Compila otra vez, aislada**, en una carpeta temporal con solo esos archivos. Si falla, la plantilla **no se publica**: lo que ve el visitante funcionaría en tu ordenador pero no en el suyo. Con variantes, si falla una, no se publica ninguna de esa plantilla, para que la web no quede a medias.
5. Genera la **miniatura** (PNG de 480 px de la primera página).
6. Publica en `<web>/public/latex/<id>/`:
   - `<id>.tex`, o `<id>.zip` si hay recursos;
   - `<id>.pdf`, el PDF compilado **desde el archivo descargable**: lo que ves es lo que descargas;
   - `<id>.png`.

   Con variantes, los nombres llevan el tamaño: `cuadricula-5mm-A4.pdf`, `cuadricula-5mm-A5.pdf`…
7. Actualiza `<web>/app/lib/latex-manifest.json`. Con variantes, la entrada lleva la lista en `variants` y la web muestra un selector A4 / A5.

Si una plantilla falla, **se mantiene su versión publicada anterior** y el script termina con código 1 tras procesar las demás.

### Aviso de páginas

```
  ✔ cuadricula-5mm-A4: tex · pdf (2 pág.) · png
    ⚠ 2 páginas: si es una sola hoja, el contenido se desborda y la miniatura puede salir en blanco
```

En papel de una hoja, 2 páginas casi siempre significa que el dibujo no cabe y salta a la página 2, y la miniatura (página 1) sale en blanco. Ajusta los márgenes con `geometry` o el tamaño del dibujo.

## `meta.json`

```json
{
  "order": 1,
  "category": "papel",
  "pattern": "mm",
  "fit": "contain",
  "meta": "A4 · 18 × 25 cm",
  "engine": "pdflatex",
  "variants": ["A4", "A5"],
  "overleaf": "https://www.overleaf.com/read/…",
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
| `pattern` | no | patrón si falta la miniatura: `grid`, `mm`, `dots`, `ruled`, `staff`, `figure` |
| `fit` | no | `contain` para figuras no A4 (no recorta la miniatura) |
| `meta` | no | línea corta bajo el título. Con variantes, si no lo pones, es la lista: `A4 · A5` |
| `engine` | no | `pdflatex` (por defecto), `xelatex`, `lualatex` |
| `variants` | no | lista de tamaños o versiones, p. ej. `["A4", "A5"]`. Cada uno es un `<nombre>.tex` en la carpeta. Nombres: letras, números, `-` y `_` (máx. 16) |
| `overleaf` | no | enlace de solo lectura a tu proyecto en Overleaf (`https://www.overleaf.com/…`). Sin variantes sustituye al botón que abre una copia; con variantes no se usa |
| `status` | no | `soon`: aparece como "Próximamente", sin compilar ni archivos |

El nombre de la carpeta es el `id`: solo `a-z`, `0-9`, `-` y `_`. Sin `variants`, el `.tex` principal se llama igual que la carpeta; con `variants`, hay uno por variante (`A4.tex`, `A5.tex`).

> **`engine` y Overleaf:** el botón "Overleaf" abre el proyecto con pdfLaTeX. Si una plantilla necesita XeLaTeX (por ejemplo, por `fontspec`), quien la abra tendrá que cambiar el compilador en *Menu → Compiler*. Indícalo en la descripción.

## Catálogo (`main.tex`)

Con las plantillas autónomas, `main.tex` ya no las incluye con `\input`: junta los PDFs que deja `publish.mjs` en `build/`, que llevan el mismo nombre que en la web:

```latex
\documentclass[a4paper]{article}
\usepackage{pdfpages}
\begin{document}
\includepdf[pages=-]{build/milimetrada.pdf}
\includepdf[pages=-, fitpaper]{build/recta_real.pdf}         % standalone: tamaño propio
\includepdf[pages=-]{build/cuadricula-5mm-A4.pdf}
\includepdf[pages=-, fitpaper]{build/cuadricula-5mm-A5.pdf}  % A5 a su tamaño
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

No ignores `*.pdf` de forma general: una figura en PDF dentro de una plantilla es un recurso que hay que versionar. Si compilas a mano dentro de `templates/<id>/`, el PDF resultante (`<id>.pdf`, o `A4.pdf`, `A5.pdf`…) no se publica (el script lo descarta), pero conviene no subirlo al repo.
