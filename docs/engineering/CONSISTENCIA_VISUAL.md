# CONSISTENCIA VISUAL — Ninja AI Framework

> **Única fuente de verdad estética.** Leer ANTES de CUALQUIER cambio en `.tsx`/`.css` de
> `apps/forge-console`, `packages/office-grid`, `packages/ui-kit`, `packages/app-shell`.
> **Protocolo:** cambio visual sin entrada aquí = rechazo en auditoría. Token/componente nuevo
> se registra PRIMERO, se implementa DESPUÉS, en el mismo commit.
> **Versión:** 1.0.0 · **Fecha:** 2026-09-10 · **Origen:** relevamiento directo del código (no claims).

## 1. Stack visual y dónde vive cada sistema

| Sistema                               | Formato                      | Archivo canónico                                                                                             | Alcance                                                    |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Variables OKLCH `:root` (`--ninja-*`) | CSS custom props             | `apps/forge-console/app/globals.css:11-48`                                                                   | Solo forge-console (glass, utilidades, `pro/*`)            |
| `ninjaColors` + escalas               | TS object                    | `packages/ui-kit/src/styles/theme.ts`                                                                        | **Canónico para código nuevo** (ver §6)                    |
| Clases `ninja-*` (Tailwind preset)    | Tailwind preset              | `packages/ui-kit/src/styles/tailwind.config.ts` + `apps/forge-console/tailwind.config.ts` (preset consumido) | Clases `ninja-bg-*`, `ninja-fg-*`, `rounded-ninja-*`, etc. |
| Fuentes display/body/mono             | `next/font` vars + fallbacks | `apps/forge-console/app/globals.css:70-94,149-154`                                                           | Ver deuda V-9 (provider ausente)                           |

Fuentes: display `Outfit` (`h1-h6`, `.font-display`, tracking `-0.03em`, w600) · body
`Geist Sans`/`system-ui` (párrafos `max-width 70ch`, `line-height 1.6`) · datos
`Geist Mono` (`.font-mono-data`, `0.8125rem`, `tabular-nums`) · fallback kit: `Inter`,
`JetBrains Mono` (`theme.ts:109-111`, no inyectadas — ver V-9).

## 2. Tokens vigentes

### 2.1 Superficies, bordes, texto, acentos y semántica

| Token HEX (canónico)                         | Valor                                         | Token OKLCH (legacy-scope)              | Valor                             |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------- | --------------------------------- |
| `background.primary/secondary/tertiary`      | `#0a0e17` / `#111827` / `#1a2233`             | `--ninja-bg-primary/secondary/tertiary` | `oklch(0.18/0.22/0.28 ... 250)`   |
| `surface.DEFAULT/hover/active/elevated`      | `#1e293b` / `#253347` / `#2d3d53` / `#283548` | `--ninja-surface` / `-hover`            | `oklch(0.25/0.30 ... 250)`        |
| `border.DEFAULT/subtle/strong`               | `#334155` / `#1e293b` / `#475569`             | `--ninja-border/-subtle/-strong`        | `oklch(0.28/0.23/0.35 ... 250)`   |
| `foreground.primary/secondary/muted/inverse` | `#f1f5f9` / `#94a3b8` / `#64748b` / `#0f172a` | `--ninja-text-primary/secondary/muted`  | `oklch(0.95/0.75/0.60 ... 250)`   |
| `accent.primary/primaryHover`                | `#6366f1` / `#818cf8` (índigo)                | `--ninja-accent/-hover`                 | `oklch(0.75/0.85 ... 210)` (cyan) |
| `accent.secondary/secondaryHover`            | `#22d3ee` / `#67e8f9`                         | —                                       | —                                 |
| `success/warning/danger/info` (+`*Muted`)    | `#10b981` / `#f59e0b` / `#ef4444` / `#3b82f6` | `--ninja-success/warning/danger/info`   | `oklch(0.70/0.75/0.65/0.60 ...)`  |

### 2.2 Semántica de dominio (usar SIEMPRE estos valores, nunca inventar)

| Dominio           | Mapeo                                                                                                                                                                                                                      | Fuente                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Estado agente     | idle `#64748b` · working `#22d3ee` · failed `#ef4444` · completed `#10b981`                                                                                                                                                | `theme.ts:49-52` (+ clases `ninja-agent-*`)  |
| Capa memoria      | hot `#f97316` · warm `#eab308` · cold `#3b82f6` · frozen `#a855f7`                                                                                                                                                         | `theme.ts:55-58` (+ clases `ninja-memory-*`) |
| Conexión WS       | connected `#10b981` · reconnecting `#f59e0b` · disconnected `#ef4444`                                                                                                                                                      | `office-grid/grid-logic.ts:23-27`            |
| Actividad oficina | idle `#64748b` · thinking `#22d3ee` · working `#10b981` · error `#ef4444` · offline `#1e293b` · blocked `#f59e0b`                                                                                                          | `office-grid/grid-logic.ts:92-99`            |
| Departamento      | Planning `#818cf8` · Library `#f59e0b` · Data `#22d3ee` · Backend `#3b82f6` · Integration `#a78bfa` · Design `#ec4899` · Test `#10b981` · Quality `#14b8a6` · Security `#ef4444` · Recovery `#f97316` · fallback `#64748b` | `office-grid/grid-logic.ts:173-187`          |

### 2.3 Radios, sombras, transiciones, z-index, foco

Radios: `none 0` · `sm 4px` · `md 8px` · `lg 12px` · `xl 16px` · `2xl 24px` · `full 9999px`
(`theme.ts:84-92`; clases `rounded-ninja-*`). Sombras: `sm/md/lg/xl` negras 0.3–0.5 +
`glow #6366f1` / `glowCyan #22d3ee` 15px + `inner` (`theme.ts:96-104`). Transiciones:
`fast 150ms` · `normal 250ms` · `slow 350ms` · `spring 500ms cubic-bezier(0.34,1.56,0.64,1)`.
Z: base 0 · dropdown 1000 · sticky 1100 · modal 1200 · popover 1300 · tooltip 1400 · toast 1500.
Foco global: `outline 2px var(--ninja-accent), offset 4px` (`globals.css:102-106`).

## 3. Clases Tailwind canónicas (preset `ninja-*` — usar estas, no HEX sueltos)

`ninja-bg-primary/secondary/tertiary` · `ninja-surface[/hover/active/elevated]` ·
`ninja-border[/subtle/strong]` · `ninja-fg-primary/secondary/muted/inverse` ·
`ninja-accent[/hover/secondary/secondary-hover]` · `ninja-success/warning/danger/info[/muted]` ·
`ninja-agent-idle/working/failed/completed` · `ninja-memory-hot/warm/cold/frozen` ·
`rounded-ninja/sm/lg/xl` · `shadow-ninja-sm/md/lg/glow/glow-cyan`.
Utilidades `globals.css`: `.glass-card` (blur 12px) · `.skeleton` (shimmer 2s) · `.bg-grid`
(32px) · `.font-display` · `.font-mono-data` · `.status-pulse`.

## 4. Componentes — cuándo usar cuál

| Componente                                                                                                              | Ruta                                   | Cuándo usarlo                                                |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| `Button` (`primary\|secondary\|ghost\|danger`, `sm\|md\|lg`, `loading`)                                                 | `ui-kit/components/base/Button.tsx`    | Toda acción; `loading` retiene children + spinner            |
| `Card` (`hoverable` solo si clicable)                                                                                   | `ui-kit/components/base/Card.tsx`      | Contenedor genérico                                          |
| `Badge` (`default\|success\|warning\|danger\|info\|accent`, `pulse?`)                                                   | `ui-kit/components/base/Badge.tsx`     | Etiquetas de estado/contador                                 |
| `Input` / `Select` (con `label/error/helperText`)                                                                       | `ui-kit/components/base/`              | Formularios; error = borde `#ef4444` + texto                 |
| `Spinner` / `Divider`                                                                                                   | `ui-kit/components/base/`              | Carga inline / separar secciones                             |
| `Metric` (valor + `delta up\|down\|flat`) · `Tracker` · `BarList`                                                       | `ui-kit/components/pro/`               | KPIs, uptime por bloques, rankings                           |
| `PageHeader` (title + breadcrumbs) · `ProTable` (con `EmptyState`)                                                      | `ui-kit/components/pro/`               | Cabeceras enterprise, tablas de datos                        |
| `EmptyState` (Ghost + CTA opcional)                                                                                     | `ui-kit/components/pro/EmptyState.tsx` | **Patrón canónico de vacío** — no inventar otros             |
| `TokenMeter` · `SessionTimer` · `AgentStatus` · `ContextDepth`                                                          | `ui-kit/components/widgets/`           | Telemetría (umbrales ContextDepth: 50/80/95, crítico ≥95)    |
| `OfficeCanvas` · `AgentCard` · `DepartmentZone/Grid` · `ActivityBadge/Pulse/Avatar`                                     | `office-grid/components/`              | Vista Office; avatar = iniciales del rol                     |
| `ShellLayout` (aside 240 + header h-14 + rightRail 300) · `Sidebar` (4 secciones fijas) · `ContextPanel` (**canónico**) | `app-shell/`                           | Layout global, navegación, rail de observabilidad            |
| `CommandPalette` (`Ctrl/Cmd+K`) · `ConfirmDialog` · `IntentBar` · `LiveTimeline` · `Workspace*` · `Overlays`            | `forge-console/components/`            | Superficie UCC/legacy — ver deuda V-7/V-11 antes de extender |

## 5. Estados obligatorios (resumen — la matriz completa vive en el relevamiento E-5)

Botones: hover por variante + glow índigo, foco `ring-2 #6366f1`, disabled `opacity-50`.
Inputs: foco borde+ring `#6366f1`, error borde+ring `#ef4444` + mensaje. Tablas: fila
`hover:bg-surface-hover`, loading `Spinner lg` en `min-h 240px`, vacío → `EmptyState`.
Tarjetas oficina: 11× `SkeletonCard` en carga, `ErrorState` + `Retry Connection` en error,
`Approve/Reject` solo con `awaiting_approval`. Todo interactivo nuevo replica estos patrones.

## 6. DECISIÓN INTERINA — conflicto de doble sistema (deuda V-1)

**Hecho:** coexisten OKLCH (`globals.css`, acento cyan) y HEX (`theme.ts`, acento índigo
`#6366f1`) con valores distintos para el mismo semántico. **Regla hasta ADR de unificación:**
código nuevo usa **exclusivamente** preset `ninja-*` o `ninjaColors`; prohibido añadir HEX
literales, nuevas vars OKLCH, paletas `zinc/emerald/rose` sueltas o `style={{color}}`.
La unificación (elegir sistema canónico y migrar `base/*`, widgets, office-grid, UCC legacy)
es candidata a ADR — no migrar a ciegas por WP.

## 7. PROHIBIDO

1. HEX/RGB/OKLCH literales en componentes (usar §2–§3). 2. Paletas ajenas (`zinc-*`,
   `emerald-*`, `gray-700`, `blue-500`) fuera de §2. 3. `style={{backgroundColor/color}}`.
2. Duplicar: existe UN `ContextPanel` canónico (`app-shell`), UN patrón `EmptyState`, UN
   `Tooltip` por componer. 5. Clases sin definición (`interactive-card`, `custom-scroll`,
   `hover:bg-zinc-850`) ni animaciones sin plugin (`tailwindcss-animate` no declarado).
3. Páginas nuevas en `zinc-950/emerald-600` estilo legacy (V-7/V-8). 7. Texto de datos sin
   `.font-mono-data`/`tabular-nums`.

## 8. Deuda visual registrada (del relevamiento 2026-09-10 — severidad y plan)

| #         | Deuda                                                                                     | Severidad | Plan                                            |
| --------- | ----------------------------------------------------------------------------------------- | --------- | ----------------------------------------------- |
| V-1       | Doble sistema OKLCH↔HEX (§6)                                                              | Alta      | ADR de unificación, luego migración por WP      |
| V-2       | `base/*` hardcodea HEX (7 archivos)                                                       | Alta      | Migrar a `var(--ninja-*)`/preset en WP visual   |
| V-7/V-8   | Superficie UCC legacy en zinc/emerald (múltiples páginas)                                 | Media     | Congelar legacy; páginas nuevas con §2–§3       |
| V-9       | Fuentes `Geist/Outfit` referenciadas sin provider `next/font`                             | Media     | Añadir provider o corregir a Inter/JetBrains    |
| V-11      | Duplicados: 2×ContextPanel, 2×Tooltip, 2×formatElapsed, 2×agentInitials, `Topbar` muerto  | Media     | Unificar al tocar cada área (regla 80%)         |
| V-12      | `content` de Tailwind no cubre `office-grid/src`; preset `rounded/shadow-ninja-*` sin uso | Baja      | Ampliar `content`, adoptar clases del preset    |
| V-10/V-13 | Clases/animaciones indefinidas, `style={{}}` + SVG fills sueltos                          | Baja      | Barrido en WP de frontend (T6.5 toca esta área) |

## 9. Registro de cambios (append-only)

| Fecha      | SHA | Qué cambió                                                                    | Aprobó      |
| ---------- | --- | ----------------------------------------------------------------------------- | ----------- |
| 2026-09-10 | —   | v1.0.0 relevamiento inicial desde código (tokens, 40+ componentes, 13 deudas) | Orquestador |
