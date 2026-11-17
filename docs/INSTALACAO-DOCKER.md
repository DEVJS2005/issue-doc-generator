# Instalação no servidor com Docker

Este guia sobe o Issue Doc Generator do zero, num servidor Linux ou numa máquina com Docker
Desktop. Tudo roda num container só, e os dados ficam num volume.

## 1. Pré-requisitos

- Docker 24 ou mais novo, com o plugin Compose (`docker compose version`).
- Git.
- A chave de API de pelo menos um provedor de IA: Anthropic, OpenAI ou Google (Gemini).
- Para produção: um domínio e um proxy com HTTPS (nginx, Traefik ou Caddy). Veja o passo 7.

No Windows, o Docker Desktop precisa do WSL 2. Rode `wsl --install` como administrador e reinicie
a máquina.

## 2. Baixar o projeto

```bash
git clone https://github.com/DEVJS2005/issue-doc-generator.git
cd issue-doc-generator
```

O submódulo do ISTQB não é necessário para rodar, porque o resumo usado no prompt já vem no
repositório.

## 3. Criar o `.env`

```bash
cp .env.example .env
```

Preencha **só** o que é segredo ou infraestrutura:

```env
# Pelo menos uma chave. A Administração só deixa escolher provedores que têm chave.
GEMINI_API_KEY=sua-chave
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=

# Valor longo e aleatório. Para gerar:
#   docker run --rm node:24-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SEGREDO_SESSAO=cole-aqui-o-valor-gerado
```

Provedor, modelo, limites e usuários **não** ficam no `.env`. Você configura tudo isso na tela de
Administração, e fica guardado no banco.

## 4. Subir

```bash
docker compose up -d --build
```

Confira:

```bash
docker compose ps
curl http://localhost:3000/api/saude
```

O container passa a "healthy" em alguns segundos, porque o `HEALTHCHECK` chama `/api/saude`.

Para usar outra porta no servidor: `PORTA_HOST=8080 docker compose up -d`.

## 5. Criar o primeiro administrador

Na primeira subida, com o banco vazio, o log mostra um link de uso único:

```bash
docker compose logs app | grep configurar
```

Abra o link no navegador, trocando `localhost:3000` pelo endereço do servidor. Escolha o nome de
usuário, o e-mail e a senha. O link só funciona uma vez. Se o container reiniciar antes de alguém
usá-lo, aparece um link novo no log.

## 6. Configurar pela tela

Na aba **Administração**:

1. Escolha o **provedor** e o **modelo**. O botão "Buscar modelos da chave" lista os modelos
   disponíveis. Se quiser, escolha também um **modelo reserva**, usado quando o principal estiver
   sobrecarregado.
2. Ajuste três valores: o limite de gerações por pessoa por hora, o tempo limite (300 s é um bom
   padrão) e por quantos dias guardar o histórico.
3. Crie os usuários do time, com nome de usuário, e-mail e senha inicial.

Pronto. O time entra com o nome de usuário (ou o e-mail) e a senha.

## 7. Produção: HTTPS e proxy

Coloque um proxy com HTTPS na frente da porta 3000 e acrescente ao `.env`:

```env
CONFIAR_PROXY=true
```

Com isso, o cookie de sessão sai com `Secure`, e o limite de tentativas de login passa a usar o IP
real de quem acessa.

A geração usa streaming (SSE), então o proxy **não pode** segurar a resposta. Exemplo de
configuração para o nginx:

```nginx
server {
  server_name issues.suaempresa.com.br;
  # ... certificados TLS ...

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # streaming da geração
    proxy_read_timeout 360s;      # acima do tempo limite da Administração
  }
}
```

Rode **uma instância só**. O banco é um arquivo SQLite, e o limite por hora fica na memória.

## 8. Login único (opcional)

Para o time entrar com a conta da empresa (Microsoft Entra ID, Google Workspace, Keycloak, Okta…),
preencha estas variáveis no `.env` e recrie o container:

- `OIDC_EMISSOR`
- `OIDC_CLIENTE_ID`
- `OIDC_CLIENTE_SEGREDO`
- `OIDC_URL_RETORNO`: `https://seu-dominio/api/sso/retorno`, igual ao endereço cadastrado no
  provedor.

Os detalhes estão na seção "Login único (SSO)" do README.

## Atualizar

```bash
git pull
docker compose up -d --build
```

As migrações do banco rodam sozinhas ao subir, e o volume `dados` é mantido.

## Backup e restauração

O banco é um arquivo dentro do volume `issue-doc-generator-dados`. A aplicação fica parada por
alguns segundos durante a cópia, para o arquivo ficar consistente.

```bash
# Backup
docker compose stop app
docker run --rm -v issue-doc-generator-dados:/dados -v "$PWD":/backup alpine \
  cp /dados/issue-doc-generator.db /backup/issue-doc-generator-$(date +%F).db
docker compose start app

# Restauração
docker compose stop app
docker run --rm -v issue-doc-generator-dados:/dados -v "$PWD":/backup alpine \
  cp /backup/issue-doc-generator-AAAA-MM-DD.db /dados/issue-doc-generator.db
docker compose start app
```

## Começar do zero

Este comando apaga o container **e o banco**: usuários, configuração e histórico.

```bash
docker compose down -v
docker compose up -d --build
```

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `port is already allocated` | A porta 3000 já está em uso. Use `PORTA_HOST=8080 docker compose up -d`. |
| Não acho o link do 1º admin | Rode `docker compose logs app \| grep configurar`. Se alguém já criou o admin, o link não aparece mais: entre com o usuário criado. |
| "Nenhum provedor de IA está configurado" | Falta a chave no `.env`, ou falta escolher o provedor e o modelo na Administração. Depois de mudar o `.env`, rode `docker compose up -d` de novo. |
| "O provedor de IA está instável" | O provedor está sobrecarregado (erro 503). Tente de novo ou configure um modelo reserva. |
| A geração para no meio quando passa pelo proxy | Faltam `proxy_buffering off` e um `proxy_read_timeout` maior no proxy (passo 7). |
| Todos precisam entrar de novo a cada reinício | O `SEGREDO_SESSAO` está vazio no `.env`. |
| `ExperimentalWarning: SQLite is an experimental feature` no log | É só um aviso do Node e pode ser ignorado. |
