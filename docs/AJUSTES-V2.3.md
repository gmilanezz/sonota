# Sonota V2.3 — ajustes aplicados

## Navegação e rolagem

A aplicação foi alterada para manter `ion-app` e o shell principal sem rolagem própria. A rolagem acontece somente em `.react-main`, enquanto a sidebar permanece fixa em `100dvh`. O Assistente Sonota é renderizado por portal diretamente no `document.body`, evitando que o `position: fixed` fique preso a um container rolável do Ionic.

O botão `.desktop-menu-toggle` foi removido do header. O único controle de abrir/recolher o menu é a marca/burger no topo da sidebar.

## Dashboard

O antigo `PageTitle` separado do `welcome-card` foi substituído por um único hero de boas-vindas, seguindo a composição do protótipo Sonota V6: gradiente vermelho/rosa, identificação Harmônico • Sonota, mensagem de boas-vindas e waveform à direita.

A waveform contém oito barras com a animação `pulse` herdada do CSS original do Sonota, com pequenas variações de duração para um movimento mais orgânico.

## Inputs

Todos os componentes `IonInput`, `IonTextarea` e `IonSelect` foram removidos das telas. Os formulários agora usam controles HTML nativos com a classe `.sonota-control`, compartilhando a mesma aparência do campo de pesquisa da tela de Clientes.

Arquivos usam `.sonota-file`. Textareas usam `.sonota-textarea`.

## Cadastro de arranjos

Tonalidade e gênero possuem sugestões por `datalist`, mas continuam aceitando texto livre. Instrumentos e tags possuem chips de sugestões clicáveis que são adicionados ao campo sem impedir a escrita manual.

## Busca Inteligente

A tela foi transformada em um chat de IA. Cada pesquisa gera uma mensagem do usuário, uma resposta resumida da busca e uma área separada de “Principais resultados” ordenada pela relevância retornada pelo backend.
