# SaverR — Design System

> Source: ui-ux-pro-max skill (Minimalism/Swiss match) + frontend-design skill calibration.
> Ye tokens `static/style.css` ke `:root` mein defined hain. Change here first, then CSS.

## Color Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#0f172a` | Page background (slate-900) |
| `--card` | `#111827` | Cards, sheet, bottom nav (gray-900) |
| `--muted` | `#1e293b` | Inputs, chips, bars (slate-800 surface) |
| `--border` | `#334155` | All borders (slate-700) |
| `--text` | `#f8fafc` | Primary text (slate-50) |
| `--muted-fg` | `#cbd5e1` | Secondary text (slate-300) |
| `--faint-fg` | `#94a3b8` | Tertiary/empty-state text (slate-400) |
| `--accent` | `#dc2626` | Primary CTA, active chips, nav active (red-600) |
| `--accent-hover` | `#b91c1c` | Hover state (red-700) |
| `--green` | `#22c55e` | Success (done bar, LAN dot) |
| Error text | `#f87171` | Error msg, delete button (red-400, dark bg pe) |

## Typography

| Face | Role |
|------|------|
| **Inter** | UI text, headings, buttons (system fallback stack included) |
| **JetBrains Mono** | URLs, numbers, progress %, file meta, sizes |

Scale: page title 20/800 · card h2 15/600 · body 16/400 · labels 13/600 ·
meta 12/400 · badge 10/700 uppercase. Line-height 1.5 body, 1.35 titles.

## Components

- **Card**: `--card` bg, `--border` 1px, 14px radius, 16px padding
- **Chip**: pill, muted bg; active = accent bg + white text + 700 weight
- **Primary button**: accent bg, white text, 12px radius, hover darkens, active scale(.98)
- **Mode toggle**: 2-up segmented, active = accent
- **Progress bar**: 6px, rounded, accent fill; done=green, error=red-400
- **Bottom nav**: 60px + safe-area, blur backdrop, active = accent icon+label
- **Player sheet**: bottom sheet, 20px top radius, handle bar, backdrop rgba(0,0,0,.65)
- **Icons**: inline SVG (Lucide paths), `stroke=currentColor`, 2px stroke — **never emoji**

## Motion

- View switch: fadein 180ms (opacity + 4px translate)
- Sheet: slideup 220ms
- Bars/buttons: 150ms transitions
- `prefers-reduced-motion: reduce` → sab animations 0.01ms (CSS mein handled)

## Accessibility (non-negotiable)

- `:focus-visible` 2px accent ring everywhere
- Touch targets ≥ 44px (buttons, chips 36px visual but padded area OK for filters)
- `aria-live="polite"` on download status message
- `aria-label` on icon-only buttons (paste, nav)
- Contrast: text tokens vs bg sab 4.5:1+ pass

## Layout

- Mobile-first, single column, `.view` sections toggled by JS
- Grid: `repeat(auto-fill, minmax(150px, 1fr))`, 12px gap
- Safe areas: topbar `env(safe-area-inset-top)`, nav/sheet bottom insets
- Max content width: none (mobile), desktop pe bhi grid scale karta hai

## Planned v1.5 views

- **Feed**: full-screen vertical scroll-snap (100dvh each), muted autoplay on visible,
  overlay meta bottom-left, side action rail (save offline / tags)
- **Browse (Jellyfin)**: breadcrumb header + folder rows (folder icon, name, count) +
  file grid — filesystem hierarchy preserved, dashboard pe flat spread NAHI
