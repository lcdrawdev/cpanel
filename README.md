# Painel Admin (MVP)

Painel próprio de gestão de dispositivos, com a organização funcional do painel de referência (Fase 2) e as cores-base do SFL. Arquitetura em `../docs/ARQUITETURA.md`; Design System em `../docs/DESIGN_SYSTEM.md`.

## Rodar localmente
```bash
npm install
cp .env.example .env.local   # preencha APP_ENCRYPTION_KEY
npm run dev                  # http://localhost:3000
```
Na primeira visita o painel abre a **Configuração inicial** para criar o administrador principal.
Em desenvolvimento o banco é embutido (PGlite) em `.data/pglite`. Para PostgreSQL, defina `DATABASE_URL`.
> A pasta do projeto está no OneDrive. Se o OneDrive travar arquivos do banco, aponte `PGLITE_DIR` para uma pasta fora dele.

## Scripts
| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | servidor Next.js (sincroniza os tokens antes) |
| `npm test` | testes dos serviços (banco em memória) |
| `npm run tokens:sync` | copia `../design-system/tokens/tokens.css` para `src/styles/` |
| `npm run db:generate` | gera migração SQL a partir de `src/server/db/schema.ts` |
| `npm run simulate:device -- --device <id> [--code XXXXXXXX] --url http://localhost:3000` | simula uma TV: ativa, imprime a configuração e consulta mudanças |
| `node scripts/screenshots.mjs [url]` | capturas desktop/celular em `../referencias/painel-admin-mvp/` (usa o Edge instalado) |
| `node scripts/check-hydration.mjs [url] [caminhos]` | abre as telas num Edge sem extensões e lista avisos de hidratação |
| `node scripts/e2e-groups.mjs [url]`, `node scripts/e2e-maintenance.mjs [url] on` (ou `off`) | testes de fumaça pelo navegador |
| simulador: `--report "Canal"`, `--sse 30` | envia um reporte de canal; escuta as mudanças em tempo real |

## API do dispositivo (v1)
Contrato completo em `../docs/ARQUITETURA.md`. Rotas: `activate`, `config` (ETag/304), `events` (SSE), `heartbeat`, `reports`, todas em `/api/v1/device/`.
Erros: `{ "error": { "code", "message" } }`.

## Estrutura
```
src/app/(auth)        login, configuração inicial, ações de sessão
src/app/(painel)      telas do painel (layout com sidebar) e server actions
src/app/api/v1/device rotas da API do dispositivo
src/components        UI (ui.tsx, forms.tsx, nav.tsx, modais)
src/server            banco (Drizzle), criptografia, sessão e serviços sem dependência do Next
src/shared/settings.ts configurações do player (usadas pelo painel e pela API)
drizzle/              migrações SQL
tests/                testes dos serviços
```
