# Fichas B3

Fichas de ações da B3 a partir dos balanços entregues à CVM: receita, lucro, margens, ROE, P/L, P/VP, dividendos, endividamento e geração de caixa, por ano e por trimestre.

O site é estático (HTML e JavaScript, sem servidor). Ele lê os dados direto do banco **fichas-b3** no Supabase, com a chave publicável, que só permite leitura. O cálculo da ficha (`ficha.js`) é o mesmo do app FichaB3Completa (`ficha.go`).

## De onde vêm os dados

O próprio Supabase mantém o banco atualizado:

- **Demonstrações financeiras (DFP e ITR):**
  - portal de dados abertos da CVM, toda semana;
  - Empresas.NET (RAD da CVM), a cada 30 minutos, no mesmo dia da entrega.
- **Cotações:** Yahoo Finance, todo dia útil depois do pregão.
  - Série mensal desde o início da negociação, com proventos e desdobramentos.
  - Série diária dos últimos 5 anos.

## Arquivos

| arquivo | o que faz |
|---|---|
| `index.html` | página única: lista de empresas (`./`) e ficha (`./?t=TICKER`) |
| `ficha.js` | lê o Supabase (PostgREST) e monta a ficha |
| `app.js` | desenha as páginas |
| `graficos.js` | gráficos SVG, sem dependências |
| `estilo.css` | estilo |

## Publicar

Em **Settings → Pages**, escolha *Deploy from a branch*, a branch `main` e a pasta `/ (root)`.

Não é recomendação de investimento.
