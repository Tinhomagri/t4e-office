# Reuniões com experiência semelhante ao Meet

## Objetivo

Permitir que a chamada de vídeo continue ativa enquanto a pessoa navega pelo T4E Office, com controles de sala para o organizador e chat em tempo real.

## Escopo aprovado

- Painel de chamada persistente, flutuante, arrastável e minimizável.
- Navegação normal pelo restante do aplicativo durante a chamada.
- Controles próprios: microfone, câmera, compartilhamento de tela, saída e encerramento para todos.
- Lista de participantes com estado de áudio/vídeo.
- Organizador/admin pode mutar, desligar câmera e remover participante.
- Chat de reunião em tempo real via mensagens de dados do LiveKit.
- Estados de conexão, permissão de dispositivos e participante removido apresentados claramente.

## Decisões técnicas

O LiveKit continuará sendo o transporte de mídia e mensagens. O chat será efêmero à sessão ativa, sem nova tabela, para reduzir latência e complexidade. A moderação será executada por endpoints autenticados no backend; o frontend nunca receberá segredo administrativo do LiveKit.

O token de entrada carregará uma indicação de organizador quando o usuário for o criador da sala ou admin do workspace. O backend validará novamente a permissão em cada comando de moderação. Operações administrativas usarão a Room Service API do LiveKit para atualizar o estado remoto ou remover uma identidade.

## Componentes

- `MeetingCallShell`: estado global/local da chamada e painel persistente.
- `MeetingStage`: mosaico responsivo de participantes e destaque do orador.
- `MeetingToolbar`: ações de mídia, chat, participantes, minimizar e sair.
- `MeetingParticipantsPanel`: lista e ações de moderação do organizador.
- `MeetingChatPanel`: publicação e recebimento de mensagens LiveKit.
- API de meetings: comandos autenticados de mute, câmera e remoção.

## Fluxo

1. Criar ou entrar numa sala abre o shell sem forçar fullscreen.
2. A pessoa troca de página; o shell permanece montado sobre o layout do app.
3. Mensagens de chat são enviadas pelo canal de dados e renderizadas para participantes conectados.
4. O organizador executa uma ação; o backend valida a sala e a permissão, chama o LiveKit e devolve sucesso/erro.
5. O cliente atualiza o mosaico pelos eventos do LiveKit; remoção encerra a conexão com aviso.

## Segurança e erros

- Apenas membros do workspace entram na sala.
- Apenas criador/admin modera outros participantes.
- Um usuário não pode moderar a própria identidade por esses endpoints.
- Falhas do LiveKit exibem feedback no painel sem derrubar a chamada inteira.
- Mensagens de chat têm limite de tamanho e não são interpretadas como HTML.

## Testes e validação

- Testes de autorização backend para organizador, admin, membro comum e usuário fora do workspace.
- Testes unitários dos estados de chat, shell minimizado e ações de moderação.
- `npm test`/testes existentes e `npm run build` no frontend.
- Teste manual com duas sessões locais: navegação, áudio/vídeo, chat e remoção.
