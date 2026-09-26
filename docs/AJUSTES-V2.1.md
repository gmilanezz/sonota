# Sonota V2.1 — correções solicitadas

## Interface
- Login centralizado e remoção do bloco `login-brand` separado.
- Identidade visual refeita com base direta no `styles.css` do Sonota V6: fundo #070b12, painéis azul-escuros, bordas frias, gradientes laranja/vermelho, sombras e estados de navegação.
- Menu Ionic alterado para overlay: o botão burger abre e fecha em qualquer largura.
- Removido `Perfil` da lista principal do menu; o card do usuário no rodapé abre a página de Perfil.
- Assistente Sonota trocado de modal/sheet para painel flutuante, limitado à viewport e com campo de digitação sempre visível.

## Dashboard
- Correção da barra do gráfico `Fluxo de estúdio`: `.money-bar` agora é `display:block`, permitindo que a altura percentual represente corretamente os valores dos meses.

## Projetos
- Formulário de edição não reenvia mais campos internos (`id`, `createdAt`, `updatedAt`, etc.) para um schema estrito.
- Campos opcionais podem permanecer vazios.
- Valor aceita formato brasileiro: `5000`, `5.000`, `5.000,00` e decimais.
- Validação explica exatamente o campo inválido.

## Clientes
- Formulário de edição envia apenas campos editáveis.
- Apenas nome é obrigatório; demais campos podem ficar em branco.
- E-mail é validado apenas quando preenchido.
- Erros são mostrados no formulário e por alerta detalhado.

## Arranjos
- Correção da conversão de BPM vazio.
- Nome, BPM e arquivo são validados antes do cadastro.
- Mensagens detalhadas para BPM ausente/fora da faixa, tonalidade inválida, arquivo ausente ou formato incompatível.
- Suporte real a FLAC no frontend e backend, incluindo validação da assinatura `fLaC`.
- Edição envia apenas os campos permitidos pelo backend.

## Validação backend
- Erros Zod agora informam o primeiro campo responsável pelo erro e continuam retornando a lista completa em `details`.
