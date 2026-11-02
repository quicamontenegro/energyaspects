# EA Dashboard

A versao principal e a v2, na pasta [EA_Dashboard](EA_Dashboard/README.md).

## Desenvolvimento

```sh
npm --prefix EA_Dashboard ci
npm --prefix EA_Dashboard run dev
```

Local: http://localhost:3000/

Producao: http://192.168.1.172:8082/ (PM2: `ea-dashboard`).

O ficheiro `EA_Dashboard/.env.local` continua local e nao deve ser publicado.
A pasta `EA_Dashboard_redesigned_v2` e o ZIP sao referencias da versao promovida, nao a entrada principal.

## Base de dados

Os dois ficheiros SQL descrevem fases da mesma base de dados em `public`:

- `supabase-schema.sql`: snapshot legado, apenas para migracoes antigas.
- `supabase-schema-v2.sql`: tabelas estruturadas usadas pela aplicacao.

Auditoria de 2026-11-02: as 13 tabelas e colunas necessarias existem; nao foi executada nenhuma migracao. Os titulos das shared notes sao guardados no JSON existente de `settings`.

Seguranca pendente: as politicas RLS atuais permitem escrita anonima. A revisao de autenticacao/politicas deve ser feita separadamente; voltar a executar os SQL nao resolve essa exposicao.