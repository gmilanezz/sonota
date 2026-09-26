# Sonota V2.2 — alterações

## Identidade visual
A navegação principal não usa mais IonMenu/IonToolbar/IonItem. O shell foi reconstruído com a mesma estrutura do HTML/CSS do Sonota V6: sidebar fixa, topbar escura, cards, bordas, gradientes e espaçamentos do protótipo antigo. React e Ionic continuam responsáveis pela lógica, modais e infraestrutura mobile.

## Sidebar
- 252 px aberta e 78 px recolhida no desktop.
- Quando recolhida, os ícones continuam visíveis.
- Em telas menores, mantém uma barra de 64 px.
- Ícones SVG uniformes.
- Perfil somente no rodapé.

## Biblioteca
- Cadastrar novo arranjo.
- Editar arranjo.
- Baixar áudio.
- Botão Localização.
- Filtros musicais combinados.

## Laboratório de Arranjos
### Separação de Stems
Seleciona um arranjo existente e inicia o job `stems`. Com as dependências configuradas, o backend usa Demucs `htdemucs` e gera um ZIP com stems WAV (vocals, drums, bass e other).

### MIDI / Partitura
Seleciona um arranjo da Biblioteca e escolhe:
- MIDI: Basic Pitch gera `.mid`.
- Partitura: Basic Pitch + music21 gera `.musicxml`.

Os jobs permanecem relacionados ao arranjo original e aparecem no histórico com download quando concluídos.
