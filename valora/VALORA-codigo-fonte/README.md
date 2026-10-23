# VALORA — Pipeline Bancário

Aplicação web para registrar atendimentos, acompanhar oportunidades de empréstimo, metas e retornos.
Roda de forma independente: só precisa de Node.js e de um banco MySQL/MariaDB. Não depende do Manus nem de nenhum serviço externo.

## Estrutura

- `client/` — interface React (páginas, componentes, logo em `client/public/assets/`).
- `server/` — servidor Express/tRPC, login, regras e acesso ao banco.
- `server/scripts/usuarios.ts` — comando para criar e administrar usuários.
- `shared/` — constantes e tipos compartilhados.
- `drizzle/` — schema e migrações SQL do banco.
- `docs/requisitos-do-sistema.md` — requisitos funcionais e não funcionais.

## Requisitos

- Node.js 22 ou mais recente.
- pnpm 10 (`npm install -g pnpm` ou `corepack enable`).
- MySQL 8 ou MariaDB 10.6+.

## Primeira instalação

1. Crie um banco de dados vazio, por exemplo `valora`.
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`. **Não publique nem compartilhe o `.env`.**
3. Instale as dependências e crie as tabelas:

   ```bash
   pnpm install
   pnpm db:migrate
   ```

4. Crie o super administrador do sistema (a senha é pedida no terminal):

   ```bash
   pnpm usuarios criar --email admin@suaempresa.com.br --nome "Administrador" --super-admin
   ```

   As demais pessoas podem se cadastrar pela tela (**Criar conta**) ou entrar por convite.

5. Inicie o servidor de desenvolvimento e abra http://localhost:3000:

   ```bash
   pnpm dev
   ```

## Login

Cada pessoa entra com **e-mail** e **senha**. O cadastro pede só nome, e-mail e senha, e o e-mail não diferencia maiúsculas de minúsculas. É o mesmo e-mail que recebe os convites das empresas.

- **Confirmação de e-mail:** depois do cadastro, o VALORA envia um código de 6 dígitos para o e-mail, e a conta só passa a funcionar depois que a pessoa digita esse código (vale 15 minutos e pode ser reenviado). Quem tenta entrar sem ter confirmado recebe um código novo. Cadastros feitos por convite já entram confirmados.
- Para configurar o e-mail sem editar o `.env` à mão, rode `C:\Projetos\Valora\configurar-email.ps1`: ele pede o e-mail e a senha de app (sem mostrar na tela), grava o `.env` e envia um teste. Para só testar: `pnpm email:teste --para voce@exemplo.com`, que mostra o erro exato e a provável causa.
- O envio usa o mesmo SMTP dos convites (`SMTP_*` no `.env`). **Sem SMTP, ninguém recebe o código:** ele aparece só no terminal do servidor (`[Mail] SMTP não configurado. Código de verificação de ...`). Para liberar alguém manualmente: `pnpm usuarios confirmar-email --email pessoa@exemplo.com`.

- As senhas são guardadas com hash `scrypt` (nunca em texto puro) e precisam ter 8+ caracteres, com letras e números.
- A sessão fica em um cookie HTTP-only e expira após `SESSION_HOURS` horas (padrão: 12).
- Após 5 senhas erradas seguidas, a conta fica bloqueada por 15 minutos.
- O avatar no canto superior direito abre o **menu da conta**: Perfil e metas, Mudar senha, Sair da conta e Excluir conta.
- Trocar a senha encerra as sessões abertas em outros aparelhos.
- **Esqueci minha senha** (na tela de entrada e na de convite): a pessoa informa o e-mail e recebe um código de 6 dígitos (vale 15 minutos, até 5 tentativas). Com o código, ela cria uma senha nova e já entra. As sessões em outros aparelhos são encerradas. A resposta é a mesma para e-mails que não existem, e um código de cadastro não serve para trocar senha.
- **Excluir conta** pede a senha e uma confirmação, e apaga de forma permanente o usuário, os atendimentos, as metas e o perfil dele.

## Empresas, equipes e perfis

Qualquer pessoa pode **criar uma conta** pela tela e trabalhar sozinha: ela vê e edita só os próprios atendimentos. A organização segue **Empresa › Agência › Equipe**, e cada pessoa pertence a no máximo uma empresa.

| Perfil | Quem é | O que aparece no menu |
| --- | --- | --- |
| **Super administrador** | Administrador do sistema, criado só pelo terminal | Além do menu do próprio cargo: **Usuários** (todas as contas, com **Ver como**) e **Relatos de erro** |
| **Administrador** | Dono da empresa (ou quem ele promover) | **Agências** (lista de agências; ao clicar numa, modos **Agência / Equipes / Funcionários**, só com números), **Autorizações e promoções** (aprovação final), **Minha empresa** (estrutura, pessoas, cargos, convites) e **Personalizar**. Não vê atendimentos nem pipeline |
| **Gerente da agência** | Responsável por uma agência | **Minha agência** (rendimento da agência, equipes e funcionários), **Pipeline da agência** (atendimentos de todos os funcionários, para cobrar e avaliar), **Autorizações e promoções**, além dos próprios atendimentos. Assume os casos técnicos |
| **Líder de grupo** | Representante de uma equipe | **Pipeline da equipe**, **Minha equipe** (rendimento e pedidos de promoção), **Promoções**, além dos próprios atendimentos |
| **Usuário** | Atendente | Visão geral, Atendimentos, Próximos contatos e Pipeline, só com os próprios clientes |

- Só quem registrou um atendimento pode editá-lo. Os atendimentos da equipe abrem em modo leitura.
- Gerentes e líderes alternam entre **Meus** e **Minha agência / Minha equipe** nos painéis (o padrão é a área toda). Metas e agenda são sempre pessoais.
- Colegas na **mesma posição** (dois líderes, dois gerentes, dois administradores) **não veem** os clientes um do outro: cada um vê os próprios e os de quem está abaixo dele.
- Tudo fica em **Minha empresa**, no menu: criar a empresa, agências e equipes, mudar o perfil e a lotação das pessoas, convidar, sair da empresa.
- A empresa sempre precisa de pelo menos um administrador. Quem é o único administrador não pode sair nem excluir a conta enquanto houver outras pessoas na empresa.

### Convites por e-mail

O administrador informa o e-mail, o perfil e a lotação. A pessoa recebe um link `/convite/...` válido por 7 dias e de uso único, que só pode ser aceito pelo mesmo e-mail: criando uma conta nova ou entrando numa conta existente.

- Com `SMTP_HOST` e os demais campos `SMTP_*` preenchidos no `.env`, o e-mail é enviado automaticamente.
- Sem SMTP, o convite é criado do mesmo jeito e a tela mostra o link para copiar e enviar manualmente.
- `APP_URL` define o endereço usado nos links. Em produção, coloque o endereço público, por exemplo `https://valora.suaempresa.com.br`.
- "Gerar novo link" (em Convites pendentes) invalida o link anterior e reenvia o e-mail.

### Administrar usuários pelo terminal

```bash
pnpm usuarios listar
pnpm usuarios criar --email maria@banco.com --nome "Maria Silva"
pnpm usuarios promover --email maria@banco.com
pnpm usuarios rebaixar --email maria@banco.com
pnpm usuarios senha --email maria@banco.com
pnpm usuarios desativar --email maria@banco.com
pnpm usuarios ativar --email maria@banco.com
pnpm usuarios definir-email --open-id <openId> --email maria@banco.com
pnpm usuarios confirmar-email --email maria@banco.com
```

`confirmar-email` libera uma conta que não recebeu o código de confirmação. `promover` torna a pessoa super administradora; `rebaixar` volta para usuário comum. `definir-email` dá (ou troca) o e-mail de entrada de uma conta; o `openId` aparece em `pnpm usuarios listar`. Contas antigas sem e-mail não conseguem entrar até receberem um.

## Conhecendo o app com dados de exemplo

```bash
pnpm demo --arquivo contas-demo.txt
```

O comando cria o **Banco Exemplo S.A.**: 2 agências, 3 equipes, cargos, uma conta para cada cargo (diretoria, gerentes, supervisores e atendentes), cerca de 90 clientes em todas as etapas, metas, cobranças, avaliações, casos técnicos e um pedido de promoção em andamento. Os e-mails e a senha (igual para todas as contas) ficam no arquivo indicado, nunca no terminal. Rodar de novo apaga e recria tudo. As contas usam o domínio `@banco-demo.com.br`.

## Cobrar, avaliar e promover

- **Cobrar e avaliar:** na ficha de um atendimento da equipe, líderes e gerentes podem **Cobrar** o funcionário, **Avaliar** o atendimento (1 a 5 estrelas) ou **Comentar**. A pessoa recebe o aviso no sino, com o link da ficha, e pode responder. A média das avaliações aparece no painel de agências.
- **Promoções:** o líder pede em **Minha equipe › Funcionários › Pedir promoção** (novo cargo, motivo e aumento proposto). O pedido vai para o **gerente da agência**, que aprova ou recusa, e depois para a **administração**, que dá a palavra final. Ao aprovar, o cargo e o nível de acesso mudam na hora. Pedidos de gerentes vão direto para a administração. Cada etapa avisa quem precisa agir.
- **Avisos:** cobranças, avaliações, respostas, promoções e relatos chegam no sino do topo.

## Personalizar (dono da empresa)

Em **Personalizar**, o administrador define:
- **nome exibido e logo** no topo (no lugar da marca VALORA);
- **cores do app**: modelos prontos ou escolha livre, com prévia na hora; valem para todos da empresa;
- **nomes dos perfis** (ex.: "Líder de grupo" → "Supervisor");
- **nomes das etapas** do pipeline;
- **cargos** (ex.: Atendente, Consultor Sênior, Supervisor), cada um com um nível de acesso. O cargo de cada pessoa é escolhido em Minha empresa ou por promoção.

## Relatar erro

Qualquer pessoa pode usar **Relatar erro** (menu da conta, ou "Relatar um problema" na tela de entrada). Se a pessoa permitir, o relato leva informações técnicas: página, tamanho da tela e os últimos erros registrados na página, sem dados de clientes. Os super administradores recebem o aviso e acompanham em **Relatos de erro**, marcando cada um como novo, em análise ou resolvido.

## Usando o app

- **Cada cargo vê só o que precisa:** veja a tabela de perfis acima. Administradores e gerentes começam na tela da agência; os demais, na visão geral.
- **Menu:** a barra lateral fica escondida. Ela abre pelo botão **Menu** (três barrinhas) no canto superior direito e fecha ao escolher uma seção, ao clicar fora ou com Esc.
- **Pipeline:** arraste os cartões com o mouse de uma etapa para outra. Ao pegar um cartão, as etapas permitidas ficam destacadas e as impossíveis aparecem apagadas (por exemplo, "Venda realizada" só aceita quem teve a venda marcada como fechada na ficha).
- **Caso técnico:** etapa para atendimentos em andamento que precisam da gerência. Ao mover um cliente para ela, os gerentes da agência de quem atendeu passam a poder editar o caso e movê-lo de etapa. Quem atendeu continua acompanhando e também pode editar. Quando o caso sai dessa etapa, o gerente volta a só visualizar. O painel de agências conta os casos técnicos em aberto.
- **Painel de agências:** escolha o mês e veja, por agência, cada funcionário com perfil, equipe, clientes atendidos e vendas comparados com a meta, a conversão e os casos técnicos. Só números: nenhum nome, contato ou detalhe de cliente aparece.
- **Atendimentos:** os blocos do topo mostram **Esperando retorno** (em andamento), **Retorno com sucesso** (venda concluída), **Retorno falho** (não concluiu em venda) e **Deve retornar de novo** (cliente indeciso: objeção "Vai pensar" ou "Retornar em outro momento"). Clicar num bloco filtra a lista.
- **Lembrete de 3 dias:** quando um cliente seu está em andamento ou indeciso, sem data de próximo contato, e o último contato foi há 3 dias ou mais, aparece o aviso "Opa, não esqueça de ligar para Fulano!". Ele surge ao abrir o app e fica no sino do topo. "Abrir ficha" leva à página do cliente (o link `/?atendimento=ID` também pode ser copiado). "Lembrar em 3 dias" adia o aviso, e marcar uma data de próximo contato o encerra.
- **Ver como (super administrador):** em **Usuários**, o botão **Ver como** abre o app exatamente como aquela pessoa enxerga (administrador, gerente, líder ou usuário), somente para leitura. Uma faixa no topo mostra quem está sendo visto e tem o botão para voltar. O servidor recusa qualquer alteração nesse modo e ignora o pedido vindo de quem não é super administrador.

### Migrando dados da versão Manus

Se você já tem um banco com atendimentos criados pelo login antigo do Manus, rode `pnpm db:migrate`, depois `pnpm usuarios listar` para ver o `openId` de cada pessoa e defina o login dela sem perder os registros:

```bash
pnpm usuarios definir-email --open-id <openId> --email maria@banco.com
pnpm usuarios senha --email maria@banco.com
```

## Produção

```bash
pnpm build
pnpm start
```

Coloque o servidor atrás de HTTPS (Nginx, Caddy, IIS ou o balanceador da sua hospedagem). Com HTTPS, o cookie de sessão passa a ser `Secure` automaticamente; para forçar, use `COOKIE_SECURE=true`.

Também há um `Dockerfile`:

```bash
docker build -t valora .
docker run --env-file .env -p 3000:3000 valora
```

## Verificação

```bash
pnpm check
pnpm test
pnpm build
```
