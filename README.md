# Plataforma de Processamento de Pedidos

Solucao para o caso de teste **NodeJS + Filas + NoSQL**. A aplicacao simula uma plataforma de e-commerce que gera 1 milhao de pedidos, processa-os em filas com prioridades diferentes, persiste as informacoes em MongoDB e expoe uma API e uma interface web para acompanhamento em tempo real.

## Arquitetura

- **Node.js + TypeScript** como base da aplicacao.
- **Express** para expor a API REST e servir a interface estatica.
- **MongoDB** para armazenar pedidos e metadados das execucoes.
- **BullMQ + Redis** para orquestrar o processamento em fila, com priorizacao dos pedidos VIP.
- **Pino** para logging estruturado, distribuido via **Server Sent Events** para a interface web.
- **Docker Compose** para provisionar MongoDB e Redis em desenvolvimento.

## Pre-requisitos

| Componente | Versao sugerida | Observacoes                                   |
| ---------- | --------------- | --------------------------------------------- |
| Node.js    | >= 18 LTS       | Necessario para rodar scripts, build e testes |
| npm        | >= 9            | Ou yarn/pnpm, conforme preferir               |
| Docker     | >= 24           | Utilizado para subir MongoDB e Redis          |

> Copie `.env.example` para `.env` e ajuste as variaveis conforme necessario. Para desenvolvimento local, ajuste `ORDER_COUNT` para um valor menor (ex.: 100_000) se quiser encurtar a execucao.

## Inicializacao rapida

1. **Instale dependencias** (inclui devDependencies)
   ```bash
   npm install --include=dev --ignore-scripts
   ```
   > Se preferir deixar o postinstall automatico do `mongodb-memory-server`, remova o flag `--ignore-scripts`.
2. **Suba os servicos de apoio**
   ```bash
   docker compose up -d
   ```
3. **Execute em modo desenvolvimento**
   ```bash
   npm run dev
   ```
4. A interface web fica disponivel em `http://localhost:3000`. Se a porta estiver ocupada, exporte `PORT=3001` antes de rodar o script ou ajuste a variavel no `.env`.

## Fluxo de execucao

1. Clique em **Executar** na interface ou envie `POST /run`.
2. A geracao de 1 milhao de pedidos e feita em lotes (padrao 10.000). Pedidos VIP (DIAMANTE) sao processados primeiro; somente depois entram os pedidos normais.
3. Logs aparecem em tempo real (SSE) e o resumo e atualizado automaticamente.
4. Utilize **Reset** ou `POST /reset` para limpar o banco e repetir o teste.

## API

| Metodo | Endpoint           | Descricao                                                   |
| ------ | ------------------ | ----------------------------------------------------------- |
| `POST` | `/run`             | Inicia a geracao e processamento (202 Accepted).            |
| `POST` | `/reset`           | Limpa banco, fila e estado da execucao atual.               |
| `GET`  | `/pedidos`         | Retorna o resumo da ultima execucao (204 caso inexistente). |
| `GET`  | `/api/logs/stream` | Stream (SSE) com logs estruturados em tempo real.           |

### Exemplo de resposta `GET /pedidos`

```json
{
  "runId": "66fd...",
  "status": "COMPLETED",
  "generation": {
    "totalOrders": 1000000,
    "vipOrders": 250381,
    "normalOrders": 749619,
    "batchSize": 10000,
    "startedAt": "2025-09-26T18:20:10.210Z",
    "completedAt": "2025-09-26T18:20:56.844Z",
    "durationMs": 46634
  },
  "processing": {
    "vip": {
      "processedCount": 250381,
      "startedAt": "2025-09-26T18:20:57.112Z",
      "completedAt": "2025-09-26T18:22:45.338Z",
      "durationMs": 108226
    },
    "normal": {
      "processedCount": 749619,
      "startedAt": "2025-09-26T18:22:45.889Z",
      "completedAt": "2025-09-26T18:29:03.441Z",
      "durationMs": 377552
    },
    "totalDurationMs": 485778
  },
  "totalDurationMs": 545412
}
```

## Estrutura de Pastas (resumida)

```
docker-compose.yml
public/             # Interface estatica (HTML/CSS/JS)
src/
   app.ts          # Configuracao do Express
   server.ts       # Bootstrap do servidor
   config/
   controllers/
   db/
   queues/
   services/
   utils/
   __tests__/      # Testes unitarios e integrados (Jest)
README.md
```

## Testes

1. Se instalou dependencias com `--ignore-scripts`, habilite o download do Mongo em memoria:
   ```bash
   npm rebuild mongodb-memory-server
   ```
2. Rode a suite:
   ```bash
   npm test
   ```

A suite utiliza `jest` + `ts-jest`. Engloba utilitarios, gerador de pedidos com `mongodb-memory-server` e helpers de conexao Mongo.

## Scripts uteis

| Script          | Descricao                                              |
| --------------- | ------------------------------------------------------ |
| `npm run dev`   | Sobe API + interface com recarregamento automatico.    |
| `npm run build` | Compila TypeScript para `dist/`.                       |
| `npm run start` | Executa versao compilada a partir de `dist/server.js`. |
| `npm run lint`  | Roda ESLint nos arquivos `.ts`.                        |

## Monitoramento e Observabilidade

- Logs estruturados via **Pino**, com streaming SSE (`/api/logs/stream`).
- Endpoint `/metrics` exposto no formato Prometheus com duracoes, contadores e estado da fila.
- Endpoint `/health` responde com status de Mongo e Redis para orquestradores.
- Metricas de tempo registradas em banco (inicio, fim e duracao) por prioridade e total.
- Interface apresenta os ultimos 400 logs, resumo consolidado e status da execucao.

## Reset de Ambiente

O endpoint `POST /reset` limpa:

- Colecao `orders`
- Colecao `processing_runs`
- Filas e jobs BullMQ

Esse recurso garante que o teste possa ser reexecutado sem interferencia de execucoes anteriores.

## Integracao continua

- Workflow GitHub Actions (`.github/workflows/ci.yml`) executa lint e testes a cada push ou pull request para `main`.
