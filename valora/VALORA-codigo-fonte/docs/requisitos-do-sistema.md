# VALORA — Requisitos do sistema

**Produto:** VALORA — Pipeline Bancário  
**Versão do código documentada:** `9c694a7` + login próprio (sem Manus)  
**Data da documentação:** 16 de outubro de 2026  
**Finalidade:** organizar o registro de atendimentos e o acompanhamento de oportunidades de empréstimo, retornos, metas e vendas.

## 1. Objetivo e escopo

O VALORA é uma aplicação web para uso de atendentes que registram clientes, acompanham o andamento de oportunidades de empréstimo e organizam contatos futuros. O sistema apresenta indicadores comerciais, funil, classificação de produtos, metas mensais e uma agenda de retornos.

O produto registra informações inseridas pelo atendente. **Não consulta bureaus de crédito, não calcula elegibilidade, não verifica automaticamente limites bancários e não formaliza nem libera empréstimos.**

## 2. Usuário e acesso

- A pessoa acessa o painel informando **e-mail** e **senha**. O e-mail é normalizado (sem espaços nas pontas e em minúsculas) e é único no sistema.
- Qualquer pessoa pode criar uma conta pela tela informando só nome, e-mail e senha. O cadastro é limitado a 10 contas por hora por rede.
- **Confirmação de e-mail:** a conta criada pela tela só pode ser usada depois que a pessoa digita o código de 6 dígitos enviado ao e-mail. O código vale 15 minutos, aceita até 5 tentativas erradas e pode ser reenviado (no máximo 1 por minuto, 5 por hora por e-mail). Quem tenta entrar sem ter confirmado (com a senha certa) recebe um código novo. O servidor guarda só um hash do código. Cadastros por convite já entram confirmados, porque o link chegou ao e-mail. Um cadastro nunca confirmado não bloqueia o dono verdadeiro do e-mail: um novo cadastro o substitui. Sem SMTP configurado, o código aparece no log do servidor, e o administrador pode liberar a conta com `pnpm usuarios confirmar-email`.
- O super administrador é criado e promovido só pelo terminal (`pnpm usuarios ... --super-admin` / `promover`), que também permite redefinir senhas e desativar contas.
- A mensagem de erro de login é a mesma para e-mail inexistente e senha incorreta. Após 5 falhas seguidas, a conta fica bloqueada por 15 minutos.
- Senhas têm no mínimo 8 caracteres, com letras e números, e são armazenadas com hash scrypt.
- A sessão expira após 12 horas (configurável) e é encerrada em todos os aparelhos quando a senha muda.
- **Recuperação de senha:** em "Esqueci minha senha", a pessoa recebe no e-mail um código de 6 dígitos (15 minutos, 5 tentativas, limite de 5 pedidos por hora por e-mail) e define uma nova senha, que segue a mesma política. A troca também confirma o e-mail, encerra as outras sessões e já entra no app. O pedido responde igual para e-mails inexistentes. O código guarda a finalidade no hash, então um código de cadastro não troca senha.
- Os dados de clientes, metas e perfil são associados ao identificador interno do usuário autenticado.
- Alterações de atendimentos são restritas ao proprietário do registro. A leitura segue a hierarquia da empresa (RF-10). O navegador não escolhe nem envia o identificador de proprietário.
- A aplicação disponibiliza encerramento da sessão.

## 3. Requisitos funcionais

### RF-01 — Registrar e manter atendimentos

O usuário deve conseguir criar, consultar, editar e excluir registros de atendimento. O referencial é gerado pelo sistema no cadastro, em formato `VLR-<data>-<sufixo>`; a interface o mostra na ficha e nas listagens.

Cada registro armazena:

- nome do cliente (obrigatório; até 160 caracteres);
- contato, como telefone ou e-mail (opcional; até 100 caracteres);
- dia do contato (obrigatório);
- disponibilidade de limite: sim, não ou ainda não verificado;
- resultado: venda fechada, não fechou ou em andamento;
- último produto vendido e respectiva classe;
- se a pessoa já é cliente do banco: sim, não ou não informado;
- motivo principal da objeção e observação opcional;
- se há interesse no empréstimo sem limite disponível no momento;
- etapa atual do pipeline;
- data opcional do próximo contato.

### RF-02 — Validar coerência comercial

- Venda fechada exige o nome do produto e uma classe.
- A classe só pode ser informada quando há um nome de produto.
- O resultado de venda fechada exige a etapa “Venda realizada”; essa etapa não pode ser usada sem venda fechada.
- A etapa “Não fechou” exige resultado “Não fechou”.
- Um atendimento marcado como “Não fechou” exige motivo da objeção.
- “Interesse sem limite” exige limite indisponível e atendimento ainda não fechado.
- As regras são validadas no cliente e no servidor.

### RF-03 — Classificar produto vendido

O usuário escolhe uma classe para cada venda registrada:

1. Empréstimo consignado;
2. Empréstimo pessoal;
3. Cartão consignado / saque;
4. Refinanciamento / portabilidade;
5. Outros.

A tela identifica produtos sem classe e oferece filtro para encontrá-los. Registros sem produto não são tratados como vendas não classificadas.

### RF-04 — Acompanhar pipeline

Os registros podem ser acompanhados nas etapas: Novo atendimento, Em atendimento, Em negociação, Aguardando limite, Caso técnico, Venda realizada e Não fechou. A etapa muda pela ficha, pela lista ou arrastando o cartão no pipeline (RF-16). A interface permite mudar etapas compatíveis com o resultado; o servidor rejeita transições inconsistentes.

### RF-05 — Consultar painel e metas

A visão inicial exibe indicadores do período — atendimentos, vendas, conversão, interesse sem limite e retornos —, progresso das metas do mês e resumo das objeções/classes. O período dos indicadores pode ser ajustado para 7, 30 ou 90 dias ou todo o período.

Cada usuário pode configurar metas mensais de atendimentos e vendas fechadas. O padrão é 100 atendimentos e 20 vendas. Os valores devem ser inteiros entre 1 e 100.000; o progresso é calculado com os registros do mês corrente.

### RF-06 — Pesquisar e filtrar

A lista permite pesquisar por nome, referencial, contato, produto e classe, bem como combinar filtros por período/datas, limite, resultado da venda, relacionamento com o banco, objeção e classe de produto.

### RF-07 — Exportar CSV

O usuário pode exportar os registros atualmente filtrados. O arquivo inclui referencial, dados de contato, informações comerciais, classe, objeção, etapa e data do próximo contato. Nenhum arquivo de exportação é enviado automaticamente a terceiros.

### RF-12 — Blocos de retorno em Atendimentos

A tela Atendimentos mostra quatro blocos, clicáveis para filtrar a lista: **Esperando retorno** (em andamento), **Retorno com sucesso** (venda concluída), **Retorno falho** (não concluiu em venda) e **Deve retornar de novo** (cliente indeciso, com a objeção "Vai pensar" ou "Retornar em outro momento", que pode ser marcada também em atendimentos em andamento).

### RF-13 — Lembrete de ligação após 3 dias

Quando um atendimento próprio está em andamento ou indeciso, sem data de próximo contato, e o último contato foi há 3 dias ou mais, o app mostra o aviso "Opa, não esqueça de ligar para <cliente>!". O aviso aparece ao abrir o app e fica no sino do topo, com o link `/?atendimento=<id>`, que abre a ficha do cliente. "Lembrar em 3 dias" adia o aviso; marcar uma data de próximo contato ou fechar o atendimento o encerra. O lembrete é só dentro do app: não há envio de e-mail, SMS ou notificação push.

### RF-15 — Painel de agências

O administrador vê a lista de agências da empresa e o gerente vê a sua agência. Em cada agência aparecem os funcionários com perfil, equipe, clientes atendidos e vendas realizadas no mês escolhido, comparados com as metas mensais de cada um, além da conversão e dos casos técnicos em aberto. O painel não traz nomes, contatos nem detalhes de clientes. Usuários e líderes não têm acesso ao painel.

### RF-16 — Caso técnico e movimentação no pipeline

- A etapa **Caso técnico** vale só para atendimentos em andamento. Nela, os gerentes da agência de quem registrou o atendimento podem editá-lo e mudá-lo de etapa. O dono continua sendo quem atendeu, que também pode editar. Fora dessa etapa, o gerente apenas visualiza.
- No pipeline, os cartões podem ser arrastados com o mouse entre as etapas. O app destaca as etapas permitidas e recusa as impossíveis (Venda realizada exige venda fechada; Não fechou exige esse resultado; venda realizada não sai da etapa). O servidor aplica as mesmas regras.

### RF-17 — Telas por cargo

Cada cargo vê apenas o que precisa:
- **Administrador:** Agências (lista; ao abrir uma, modos Agência, Equipes e Funcionários, só com números), Autorizações e promoções, Minha empresa e Personalizar. Não vê atendimentos, agenda nem pipeline.
- **Gerente da agência:** começa em Minha agência; tem o Pipeline da agência com os atendimentos de todos os funcionários dela, Autorizações e promoções e os próprios atendimentos.
- **Líder de grupo:** Pipeline da equipe, Minha equipe (rendimento e pedidos de promoção), Promoções e os próprios atendimentos.
- **Usuário:** Visão geral, Atendimentos, Próximos contatos e Pipeline, só com os próprios clientes. Não vê Agências nem Minha empresa.
- **Independente (sem empresa):** igual ao usuário, mais Minha empresa para criar uma empresa.

### RF-18 — Cobrar e avaliar atendimentos

Na ficha de um atendimento de alguém abaixo dele, o líder ou gerente pode **cobrar**, **avaliar** (nota de 1 a 5) ou **comentar**. O dono recebe o aviso no sino, com o link da ficha, e pode responder. Ninguém cobra nem avalia os próprios atendimentos. A média das avaliações aparece no painel de agências.

### RF-19 — Promoções

O líder (ou gerente) pede a promoção de alguém da sua área para um cargo, com motivo e aumento proposto (texto livre). Fluxo: pedido do líder → aprovação do gerente da agência → aprovação final da administração. Pedidos de gerentes ou de agências sem gerente vão direto à administração. Ao aprovar, o cargo e o nível de acesso mudam e as pessoas envolvidas são avisadas. Quem pediu pode cancelar enquanto o pedido estiver em andamento. O app não processa salários: o aumento é apenas registrado no pedido.

### RF-20 — Personalização da empresa

O administrador define o nome exibido, a logo (JPG, PNG ou WebP de até 300 KB), as cores do app (modelos prontos ou livres), os nomes dos perfis, os nomes das etapas do pipeline e os cargos da empresa, cada um ligado a um nível de acesso. As mudanças valem para todas as pessoas da empresa.

### RF-21 — Relatar erro

Qualquer pessoa, conectada ou não, pode relatar um erro ou sugestão, escolhendo um tipo e descrevendo o problema. Se ela permitir, o relato inclui informações técnicas (página, tamanho da tela e últimos erros da página), sem dados de clientes. Super administradores são avisados e acompanham os relatos com as situações novo, em análise e resolvido. O envio é limitado a 20 relatos por hora por rede.

### RF-14 — Navegação

A barra lateral fica escondida e abre pelo botão Menu (três barrinhas) no canto superior direito. Ela fecha ao escolher uma seção, ao clicar fora ou com Esc.

### RF-08 — Organizar próximos contatos

A seção “Próximos contatos” organiza retornos atrasados, programados para hoje e futuros. O horizonte futuro pode ser ajustado para 7, 15 ou 30 dias. Cada cartão mostra cliente, referencial, contato, etapa, situação de limite, data e, se houver, objeção.

Quando o contato é um telefone validado, a interface oferece ação de ligação; quando é um e-mail válido, oferece ação de e-mail. A ação “Revisar ou reagendar” abre o atendimento para atualizar a data. A navegação mostra a quantidade de retornos vencidos ou de hoje.

A agenda é alimentada pela data de próximo contato do atendimento. Não há envio automático de SMS, WhatsApp, e-mail ou notificação push.

### RF-09 — Configurar conta e perfil

Ao clicar no avatar/ícone de conta, o usuário abre o menu da conta com as opções Perfil e metas, Mudar senha, Sair da conta e Excluir conta. As configurações têm abas de Perfil, Metas e Senha; a aba Senha exige a senha atual para definir uma nova. Excluir conta exige a senha atual e a confirmação de que a ação é irreversível, e remove o usuário com todos os seus atendimentos, metas e perfil. Perfil permite editar nome de exibição, função/cargo na empresa e foto. A foto aceita JPG, PNG ou WebP de até 8 MB na origem; o navegador reduz a imagem para no máximo 512 px e a comprime antes de salvar. O nome usa como padrão o nome informado no cadastro do usuário.

### RF-10 — Empresas, agências, equipes e perfis

- A organização segue Empresa › Agência › Equipe. Cada usuário pertence a no máximo uma empresa; sem empresa, trabalha de forma independente.
- Perfis da empresa: **Administrador** (vê o painel de agências só com números, sem dados de clientes, e gerencia agências, equipes, pessoas e convites), **Gerente da agência** (vê os atendimentos da agência), **Líder de grupo** (vê os da equipe) e **Usuário** (vê só os próprios).
- Perfil do sistema: **Super administrador**, que vê todos os usuários e empresas e pode ativar ou desativar contas. Com **Ver como**, ele abre o app exatamente como uma pessoa enxerga, sempre só para leitura: o servidor recusa qualquer alteração e ignora o pedido de quem não é super administrador.
- Cada pessoa vê os próprios atendimentos e os de quem está **abaixo** dela na sua área. Colegas na mesma posição (por exemplo, dois líderes da mesma equipe ou dois gerentes da mesma agência) não veem os clientes um do outro.
- Quem cria a empresa vira administrador. Gerentes exigem uma agência; líderes, uma equipe; usuários podem ficar sem equipe. A empresa sempre mantém pelo menos um administrador.
- Ao trocar a lotação ou o perfil de alguém, a visibilidade muda na hora. Quem sai da empresa mantém os próprios atendimentos e volta a trabalhar sozinho.
- Gerentes, líderes e administradores alternam nos painéis entre "Meus" e a sua área. Atendimentos de outras pessoas aparecem com o responsável e abrem só para leitura. Metas e agenda continuam pessoais.

### RF-11 — Convites por e-mail

- O administrador convida por e-mail, definindo perfil e lotação. O convite vale 7 dias, é de uso único e só pode ser aceito por uma conta com o mesmo e-mail (nova ou existente).
- O token do convite não fica gravado: o banco guarda apenas o hash SHA-256. "Gerar novo link" substitui o token e invalida o anterior; convites podem ser cancelados.
- Com SMTP configurado (`SMTP_*`), o e-mail é enviado. Sem SMTP, a tela mostra o link para envio manual.
- Não é possível convidar quem já faz parte de outra empresa.

## 4. Requisitos não funcionais

- **Segurança e privacidade:** APIs de clientes, metas e perfil requerem autenticação; registros são filtrados pelo identificador do proprietário. Entradas passam por validação de esquema no servidor.
- **Integridade:** índices de banco ajudam a localizar atendimentos por proprietário/data e por proprietário/etapa; referências de atendimento são únicas.
- **Usabilidade:** interface em português brasileiro, com navegação, feedback, mensagens de erro e estados vazios.
- **Responsividade:** as principais telas e ações de navegação devem funcionar em desktop e celular.
- **Compatibilidade técnica:** projeto TypeScript com execução via Node.js e gerenciador pnpm; schema e migrações são versionados.
- **Verificação automatizada:** o repositório fornece os comandos de checagem de tipos, testes e build descritos no README do pacote.

## 5. Dados principais

- `users`: usuários do sistema — e-mail (usado para entrar), nome, hash da senha, perfil do sistema (usuário/super administrador) e situação (ativo/inativo). Os campos antigos de código da agência e ID de usuário ficam vazios nas contas novas.
- `companies`, `agencies`, `teams`: estrutura Empresa › Agência › Equipe.
- `company_members`: vínculo de cada usuário à empresa, com perfil (administrador, gerente, líder, usuário), agência e equipe.
- `invitations`: convites com e-mail, perfil, lotação, hash do token, validade e situação (aceito/cancelado).
- `client_records`: atendimentos, oportunidade, produto, etapa, data de retorno e data do "lembrar depois" (`remind_after`); inclui `owner_open_id` para isolamento por usuário.
- `user_goals`: metas mensais por usuário.
- `user_profiles`: nome de exibição, cargo e foto compactada por usuário.
- `company_settings`: nome exibido, cores, logo e nomes personalizados de perfis e etapas.
- `company_positions`: cargos da empresa e o nível de acesso de cada um; `company_members.position_id` liga a pessoa ao cargo.
- `promotion_requests`: pedidos de promoção com motivo, aumento proposto e as decisões do gerente e da administração.
- `record_notes`: cobranças, avaliações (nota de 1 a 5) e comentários sobre atendimentos.
- `notifications`: avisos do sino (lido ou não).
- `bug_reports`: relatos de erro com descrição, página, informações técnicas e situação.

O código-fonte entregue não contém credenciais, banco de dados, cadastros de clientes nem os dados de teste do Sandbox.

## 6. Arquitetura e tecnologias

- **Front-end:** React 19, TypeScript, Vite, Tailwind CSS, componentes Radix UI, React Query/tRPC e Recharts.
- **Back-end:** Node.js, Express e tRPC.
- **Banco:** MySQL compatível, Drizzle ORM e migrações SQL no diretório `drizzle/`.
- **Autenticação:** login próprio com e-mail + senha (scrypt), sessão JWT em cookie HTTP-only e operações protegidas.
- **Validação/testes:** Zod, TypeScript e Vitest.

## 7. Limites e decisões fora do escopo

- Não há integração com sistemas bancários, bureaus, APIs de análise de crédito ou motores de elegibilidade.
- Não há envio de lembretes externos; a agenda é uma lista operacional dentro do app. O único e-mail enviado é o de convite, e só quando o SMTP está configurado.
- Não há contratação, assinatura, desembolso ou cobrança de empréstimos.
- O sistema não depende do Manus nem de serviços externos de IA, armazenamento ou login.

## 8. Execução local do código entregue

Consulte `README.md` dentro do ZIP. Em linhas gerais, é necessário instalar Node.js e pnpm, criar um banco MySQL/MariaDB vazio, preencher o `.env` sem compartilhá-lo, instalar dependências, aplicar as migrações, criar o primeiro usuário com `pnpm usuarios criar` e iniciar o servidor.
