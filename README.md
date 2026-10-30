# cuadricula

Eric Lucero González · Universidad Politécnica de Madrid

## Compilar

```bash
latexmk          # una vez
latexmk -pvc     # recompila al guardar
latexmk -c       # limpia los auxiliares
```

El PDF queda en `main.pdf`; los auxiliares, en `build/` (ignorada por Git).

## Estructura

```text
main.tex      # documento
refs.bib      # bibliografía (biblatex + biber)
figures/      # imágenes
```
