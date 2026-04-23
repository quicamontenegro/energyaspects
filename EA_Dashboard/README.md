# EA Dashboard + Supabase

Guia passo a passo para correr este projeto noutro Mac.

## O que este projeto faz

Este dashboard corre em HTML + JavaScript com Vite e guarda o estado no Supabase.

Atualmente sincroniza para a BD:
- invoicing
- RP Team
- IA Team
- Data Explorer
- RP & DE Team
- Milestones
- Sprints

Os dados ficam guardados na tabela `dashboard_state`, dentro de uma coluna `state` do tipo `jsonb`.

## 1) First step: o que instalar no outro Mac

Num Mac novo, instala isto primeiro:
- Node.js 20 ou superior
- npm
- Git

Nota: normalmente o `npm` vem junto com a instalacao do Node.js.

### Opcao recomendada

Instala:
1. Homebrew
2. Node.js
3. Git

Se o Homebrew ainda nao existir:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Depois instala Node e Git:

```bash
brew install node git
```

Isto instala:
- `node`
- `npm`
- `git`

Confirma:

```bash
node -v
npm -v
git --version
```

### Opcao alternativa

Podes instalar Node diretamente por aqui:
- https://nodejs.org/

Ao instalar o Node por esse metodo, o `npm` tambem fica instalado.

E Git por aqui:
- https://git-scm.com/download/mac

### Se o comando npm nao existir

Se `npm -v` der erro, instala ou reinstala o Node.js.

Com Homebrew:

```bash
brew install node
```

Ou, se ja tens Node mal instalado e queres atualizar:

```bash
brew upgrade node
```

Depois confirma de novo:

```bash
npm -v
```

## 2) Copiar o projeto para o outro Mac

Podes fazer de duas formas.

Opcao A: via Git

```bash
git clone <URL_DO_REPOSITORIO>
cd energyaspects/EA_Dashboard
```

Opcao B: copiar a pasta manualmente

Depois entra na pasta:

```bash
cd /caminho/para/EA_Dashboard
```

## 3) Instalar dependencias

```bash
npm install
```

Isto instala o Vite definido em [package.json](package.json#L1).

## 4) Supabase

A base de dados ja esta criada.

Por isso, no outro Mac so precisas de:
1. ter acesso ao projeto Supabase
2. copiar a URL e a anon key

## 5) Configurar as chaves do Supabase

Cria ou edita o ficheiro `.env.local` na pasta do projeto.

Podes copiar de [.env.example](.env.example) e preencher assim:

```bash
cp .env.example .env.local
```

Conteudo esperado:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

Onde encontrar estes valores no Supabase:
1. Entra no projeto
2. Vai a Settings
3. Vai a API
4. Copia:
- Project URL
- anon public key

O ficheiro `.env.local` esta no `.gitignore`, por isso as credenciais nao vao para o Git.

Se deixares estes valores vazios, o dashboard abre, mas sem sincronizacao remota.

## 6) Arrancar o projeto localmente

```bash
npm run dev
```

Por defeito, o Vite vai abrir algo como:

```bash
http://localhost:5173/
```

## 7) Abrir a app

URL principal:

```text
http://localhost:5173/
```

A raiz redireciona automaticamente para:

```text
/invoicing_dashboard.html#sprints
```

Outras paginas disponiveis:
- `http://localhost:5173/invoicing_dashboard.html`

## 8) Confirmar se a BD esta a receber dados

Faz isto:
1. Abre a app
2. Altera um valor editavel
3. Vai ao Supabase
4. Abre Table Editor
5. Verifica a tabela `dashboard_state`

Deves ver pelo menos uma linha com um `id` como:
- `invoicing_dashboard`

O estado fica dentro da coluna `state`.

## 9) Correr noutra maquina da mesma rede

Se quiseres abrir a app a partir de outro dispositivo na mesma rede, arranca o Vite com host publico:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

Depois descobre o IP local do Mac:

```bash
ipconfig getifaddr en0
```

Ou, se necessario:

```bash
ipconfig getifaddr en1
```

Depois abre noutro dispositivo:

```text
http://IP_DO_MAC:5173/
```

Exemplo:

```text
http://192.168.1.236:5173/
```

## 10) Build de producao

Se quiseres gerar build estatico:

```bash
npm run build
```

Para testar a build:

```bash
npm run preview
```

## Estrutura importante

Ficheiros principais:
- [invoicing_dashboard.html](invoicing_dashboard.html)
- [.env.example](.env.example)
- [supabase-schema.sql](supabase-schema.sql)
- [package.json](package.json)

## Resolucao de problemas

### A app abre mas nao grava na BD

Verifica:
1. se `.env.local` tem URL e key corretas
2. se a tabela `dashboard_state` existe
3. se as policies permitem `select`, `insert` e `update`

### O porto 5173 esta ocupado

Arranca com outro porto:

```bash
npm run dev -- --port 3001
```

### O outro dispositivo nao consegue abrir

Verifica:
1. se arrancaste com `--host 0.0.0.0`
2. se ambos os dispositivos estao na mesma rede
3. se o firewall do macOS nao esta a bloquear o Node

## Nota de seguranca

As policies atuais em [supabase-schema.sql](supabase-schema.sql) estao abertas para setup rapido.

Antes de usar em producao, o ideal e restringir acesso com autenticacao e policies mais especificas.
