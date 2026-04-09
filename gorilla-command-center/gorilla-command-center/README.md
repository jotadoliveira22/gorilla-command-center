# 🦍 Gorilla Command Center

Plataforma de gestión de contenido para **@gorillagency** — 5 módulos integrados.

## Módulos

| Tab | Función |
|-----|---------|
| Dashboard | KPIs de Instagram en tiempo real |
| Creador Contenido | Generador estratégico con framework 3E + 70-20-10 |
| Generador Carruseles | Diseño de carruseles para exportar como JPG |
| Calendario | Scheduling + Auto-post a Instagram |
| DMs & Comentarios | Respuestas automáticas con IA |

## Setup

```bash
npm install
npm run dev
```

## Deploy en Vercel

1. Sube este repo a GitHub
2. Importa en [vercel.com](https://vercel.com)
3. Deploy automático ✓

## Configuración

Al abrir la app por primera vez:

1. **Anthropic API Key** — [console.anthropic.com](https://console.anthropic.com)
2. **Instagram** — Meta Graph API Explorer → token con permisos: `instagram_basic`, `pages_show_list`, `instagram_manage_insights`, `instagram_content_publish`

Ambas credenciales se guardan en localStorage del navegador.

## Stack

- React 18 + Vite
- Anthropic Claude API (claude-sonnet-4)
- Meta Graph API v19
