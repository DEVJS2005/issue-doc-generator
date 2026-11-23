# Instalação no servidor com Docker

Este guia sobe o Issue Doc Generator do zero, num servidor Linux ou numa máquina com Docker
Desktop. Tudo roda num container só, e os dados ficam num volume. A imagem vem pronta do GitHub
Container Registry (`ghcr.io/devjs2005/issue-doc-generator`): não há build no servidor.

## 1. Pré-requisitos

- Docker 24 ou mais novo, com o plugin Compose (`docker compose version`).
- A chave de API de pelo menos um provedor de IA: Anthropic, OpenAI ou Google (Gemini).
- Para produção: um domínio e um proxy com HTTPS (nginx, Traefik ou Caddy). Veja o passo 7.

No Windows, o Docker Desktop precisa do WSL 2. Antes de instalar o Docker Desktop, rode como
administrador e reinicie a máquina:

```powershell
wsl --install --no-distribution
```

Sem isso, o Docker Desktop instala, mas o motor não sobe: o `docker version` mostra o cliente e
falha ao falar com o servidor.

## 2. Baixar os dois arquivos de configuração

Não é preciso clonar o projeto: bastam o `docker-compose.yml` e o `.env.example`.

```bash
mkdir issue-doc-generator && cd issue-doc-generator
curl -fsSLO https://raw.githubusercontent.com/DEVJS2005/issue-doc-generator/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/DEVJS2005/issue-doc-generator/main/.env.example
```

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
docker compose pull
docker compose up -d
```

O `pull` baixa a última versão publicada (`latest`). Para fixar uma versão, use
`VERSAO_IMAGEM`, por exemplo `VERSAO_IMAGEM=1.2.0 docker compose up -d` (ou ponha
`VERSAO_IMAGEM=1.2.0` no `.env`). As versões estão na página de Releases do repositório.

Confira:

```bash
docker compose ps
curl http://localhost:3000/api/saude
```

O container passa a "healthy" em alguns segundos, porque o `HEALTHCHECK` chama `/api/saude`.

A imagem tem cerca de 400 MB. Com ela baixada, o container sobe em segundos.

Prefere construir a imagem a partir do código? Clone o repositório e rode
`docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build` (cerca de
1 minuto e meio numa máquina comum).

Para usar outra porta no servidor: `PORTA_HOST=8080 docker compose up -d`.

A porta fica aberta **só no próprio servidor** (`127.0.0.1`), para o proxy com HTTPS do passo 7.
Para abrir de outra máquina antes de ter o proxy, use um túnel SSH
(`ssh -L 3000:127.0.0.1:3000 usuario@servidor` e abra `http://localhost:3000`). Sem proxy nenhum,
para abrir para a rede, troque no `docker-compose.yml` a linha da porta por
`"${PORTA_HOST:-3000}:3000"` e deixe `CONFIAR_PROXY=false`.

## 5. Criar o primeiro administrador

Na primeira subida, com o banco vazio, o log mostra um link de uso único:

```bash
docker compose logs app | grep configurar
```

Abra o link no navegador (pelo túnel SSH ou, se já tiver o proxy, trocando `localhost:3000` pelo
endereço dele). Escolha o nome de
usuário, o e-mail e a senha. O link só funciona uma vez. Se o container reiniciar antes de alguém
usá-lo, aparece um link novo no log.

## 6. Configurar pela tela

Na aba **Administração**:

1. Escolha o **provedor** e o **modelo**. Só aparecem habilitados os provedores que têm chave no
   `.env`. Para os provedores sem modelo padrão (Gemini e OpenAI), a tela busca sozinha os modelos
   da chave: clique no campo Modelo e escolha um da lista (no Gemini, por exemplo,
   `gemini-2.5-flash`). Se quiser, escolha também um **modelo reserva**, usado quando o principal
   estiver sobrecarregado.
2. Ajuste três valores: o limite de gerações por pessoa por hora, o tempo limite (300 s é um bom
   padrão) e por quantos dias guardar o histórico.
3. Crie os usuários do time, com nome de usuário, e-mail e senha inicial.

Pronto. O time entra com o nome de usuário (ou o e-mail) e a senha.

## 7. Produção: HTTPS e proxy

Coloque um proxy com HTTPS na frente da porta 3000 e acrescente ao `.env`:

```env
CONFIAR_PROXY=true
```

Com isso, o cookie de sessão sai com `Secure`, e o limite de tentativas de login e a auditoria
passam a usar o IP real de quem acessa. `true` quer dizer **um** proxy na frente. Com mais de um
(por exemplo, CDN + nginx), use o número: `CONFIAR_PROXY=2`. Se os IPs dos proxies forem fixos, a
opção mais segura é listá-los: `CONFIAR_PROXY=127.0.0.1,10.0.0.0/8`.

**Não deixe a porta 3000 aberta para a rede** com `CONFIAR_PROXY` ligado: quem falar direto com
ela escreve o `X-Forwarded-For` que quiser. O `docker-compose.yml` já publica a porta só em
`127.0.0.1`, para o proxy no mesmo servidor. Com o proxy em outra máquina, publique só para ela
(firewall) e liste o IP dela em `CONFIAR_PROXY`.

O proxy deve **substituir** o `X-Forwarded-For` pelo IP que ele viu, e não acrescentar ao que veio
do navegador.

A geração usa streaming (SSE), então o proxy **não pode** segurar a resposta. Exemplo de
configuração para o nginx:

```nginx
server {
  server_name issues.suaempresa.com.br;
  # ... certificados TLS ...

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # streaming da geração
    proxy_read_timeout 360s;      # acima do tempo limite da Administração
  }
}
```

No Caddy, o `reverse_proxy` já faz isso; no Traefik, não marque `forwardedHeaders.insecure` nem
ponha IPs em `trustedIPs` do entrypoint, a não ser os de outro proxy seu na frente dele.

```caddy
issues.suaempresa.com.br {
  reverse_proxy 127.0.0.1:3000 {
    flush_interval -1   # streaming da geração
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

## 9. Jira (opcional)

Para o botão **Criar no Jira**, preencha `JIRA_URL`, `JIRA_EMAIL` e `JIRA_TOKEN` no `.env` (no
Jira Data Center, deixe `JIRA_EMAIL` vazio e use um token de acesso pessoal) e rode
`docker compose up -d`. O servidor precisa alcançar o endereço do Jira. Detalhes na seção
"Criar a issue no Jira" do README.

## Atualizar

```bash
docker compose pull
docker compose up -d
```

Com `VERSAO_IMAGEM` fixa, troque o número pela versão nova antes do `pull`.

As migrações do banco rodam sozinhas ao subir, e o volume `dados` é mantido.

## Backup e restauração

O servidor faz sozinho um backup por dia, na pasta `backups` dentro do volume, e guarda as cópias
mais novas (7 por padrão; o número muda na Administração). Na Administração dá para fazer um backup
na hora e baixar qualquer um. O arquivo tem os usuários (senhas só como hash) e o histórico:
guarde-o com cuidado.

Para uma cópia manual do arquivo inteiro:

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
docker compose up -d
```

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `denied` ou `unauthorized` no `docker compose pull` | A imagem ainda não é pública. Peça a quem administra o repositório para torná-la pública, ou entre com `docker login ghcr.io` (usuário do GitHub e um token com `read:packages`). |
| `manifest unknown` no `docker compose pull` | A versão pedida em `VERSAO_IMAGEM` não existe. Confira as versões na página de Releases. |
| `port is already allocated` | A porta 3000 já está em uso. Use `PORTA_HOST=8080 docker compose up -d`. |
| Não acho o link do 1º admin | Rode `docker compose logs app \| grep configurar`. Se alguém já criou o admin, o link não aparece mais: entre com o usuário criado. |
| "Nenhum provedor de IA está configurado" | Falta a chave no `.env`, ou falta escolher o provedor e o modelo na Administração. Depois de mudar o `.env`, rode `docker compose up -d` de novo. |
| "O provedor de IA recusou o pedido por configuração inválida" | O modelo escolhido não aceita algum parâmetro. Veja o motivo exato com `docker compose logs app \| grep gerar_falhou` e troque o modelo na Administração. |
| `docker version` mostra só o cliente (Windows) | Falta o WSL 2 ou o Docker Desktop ainda está iniciando. Veja o passo 1. |
| "O provedor de IA está instável" | O provedor está sobrecarregado (erro 503). Tente de novo ou configure um modelo reserva. |
| A geração para no meio quando passa pelo proxy | Faltam `proxy_buffering off` e um `proxy_read_timeout` maior no proxy (passo 7). |
| Todos precisam entrar de novo a cada reinício | O `SEGREDO_SESSAO` está vazio no `.env`. |
| `ExperimentalWarning: SQLite is an experimental feature` no log | É só um aviso do Node e pode ser ignorado. |
