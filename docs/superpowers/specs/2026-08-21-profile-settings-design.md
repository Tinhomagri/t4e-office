# Perfil e configurações da conta

## Objetivo

Substituir a edição compacta do menu por uma página dedicada em `/app/perfil`, capaz de editar identidade, informações profissionais, preferências e senha sem sair do T4E Office.

## Experiência

A página usa um cabeçalho com prévia do avatar e dados principais, navegação lateral por seções e cartões de formulário responsivos. Cada seção salva independentemente, apresenta feedback de sucesso ou erro e preserva alterações durante o envio. O menu da conta passa a navegar para a página.

## Dados

O usuário passa a armazenar cargo, telefone, biografia, localização, fuso horário, idioma, tema, densidade, preferências de notificação e status de disponibilidade. `GET/PATCH /auth/me/` lê e atualiza os campos com validação. A foto permanece comprimida no cliente. A troca de senha usa endpoint autenticado, exige a senha atual para contas com senha e atualiza o hash com segurança.

## Componentes

- `ProfileSettingsPage`: composição, navegação entre seções e feedback.
- Seção de perfil: avatar, nome e informações profissionais.
- Seção de preferências: aparência, idioma, fuso e notificações.
- Seção de segurança: email, método de acesso e troca de senha.
- API e tipos de autenticação ampliados para refletir o perfil completo.

## Erros e segurança

O backend limita comprimentos e valores enumerados, rejeita senha atual incorreta e nunca retorna hashes. A interface exibe erros da API, bloqueia envios duplicados e limpa os campos de senha após sucesso.

## Verificação

Testes de API cobrem leitura, atualização, validações e troca de senha. O frontend passa por TypeScript, testes existentes e build de produção.
