# Habilitar busca semântica e processamento de áudio

O sistema funciona sem estas dependências. Configure os recursos abaixo para usar os modelos reais.

## Busca semântica local com Ollama

Instale o Ollama e execute:

```sh
ollama pull embeddinggemma
```

Com o serviço Ollama em execução, configure no `.env` da raiz:

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
EMBEDDING_MODEL=embeddinggemma
```

Reinicie o Sonota. A primeira busca indexa o conteúdo textual dos arranjos e dos projetos vinculados; buscas seguintes reutilizam os vetores. Alterações no conteúdo invalidam o cache. As operações de busca não enviam o áudio ao Ollama. Cada pesquisa considera apenas os registros da conta autenticada.

Sem o serviço ou em caso de falha, a busca textual continua funcionando e a resposta informa o modo utilizado. A pontuação de relevância serve para ordenar resultados, não é uma probabilidade de acerto.

## Python no Windows

Use **Python 3.11** para o conjunto completo de dependências. A instalação dos modelos pode ocupar vários GB. FFmpeg deve estar instalado e disponível no PATH para a separação de stems.

Execute estes comandos na raiz do projeto:

```powershell
py -3.11 -m venv .venv-audio
.venv-audio\Scripts\python.exe -m pip install --upgrade pip
.venv-audio\Scripts\python.exe -m pip install -r audio\requirements.txt
```

Para instalar apenas a estimativa de BPM/tonalidade, use:

```powershell
.venv-audio\Scripts\python.exe -m pip install -r audio\requirements-analysis.txt
```

No `.env`, use o caminho da sua pasta, por exemplo:

```dotenv
AUDIO_ENABLED=true
AUDIO_PYTHON=D:/Sonota/.venv-audio/Scripts/python.exe
AUDIO_TIMEOUT_SECONDS=1800
```

Confira as dependências detectadas:

```powershell
.venv-audio\Scripts\python.exe audio\worker.py --capabilities
```

Depois reinicie `npm start`. Em **Laboratório de Arranjos**, selecione uma das opções disponíveis. Os recursos são habilitados conforme os pacotes encontrados; os pesos dos modelos podem precisar ser baixados no primeiro processamento. Detectar um pacote não garante que seu modelo já foi carregado: erros de carregamento são registrados no trabalho e no terminal.

## Linux/macOS

```sh
python3.11 -m venv .venv-audio
.venv-audio/bin/python -m pip install --upgrade pip
.venv-audio/bin/python -m pip install -r audio/requirements.txt
```

Configure `AUDIO_PYTHON` com o caminho absoluto para `.venv-audio/bin/python`. Instale FFmpeg pelo gerenciador do sistema.

## Saídas e comportamento

| Operação | Processamento | Resultado |
| --- | --- | --- |
| Estimar BPM e tonalidade | librosa e correlação de perfis cromáticos | Estimativas no histórico; campos vazios preenchidos se o arranjo não mudou durante o processamento |
| MIDI | Basic Pitch | Arquivo `.mid` com notas detectadas no áudio |
| Partitura | Basic Pitch + music21 | Arquivo `.musicxml`, para abrir e revisar no MuseScore ou editor compatível |
| Stems | Demucs `htdemucs`, CPU | ZIP com vocals, drums, bass e other em WAV |

BPM e tonalidade são estimados em até 180 segundos do áudio. Ritmos ambíguos podem produzir metade/dobro do BPM; músicas com modulação ou poucas notas podem produzir tonalidade imprecisa. O sistema preserva metadados já preenchidos. Uma alteração manual feita durante o trabalho impede a aplicação automática do resultado.

A transcrição de uma mixagem completa é mais difícil do que a de um instrumento isolado. Para melhores resultados, transcreva uma faixa isolada ou primeiro extraia stems. MusicXML é uma partitura editável, não um PDF com revisão editorial. O Demucs desta versão usa CPU e pode levar vários minutos.

A fila roda um trabalho por vez, permite até cinco trabalhos pendentes por conta e oferece cancelamento. Reiniciar o servidor marca trabalhos que estavam em execução como interrompidos; trabalhos ainda na fila permanecem aguardando. Nenhum resultado simulado é usado como substituto de um modelo indisponível.

## Referências técnicas

- [Ollama: embeddings](https://docs.ollama.com/capabilities/embeddings)
- [Spotify Basic Pitch](https://github.com/spotify/basic-pitch)
- [Demucs](https://github.com/facebookresearch/demucs)
- [librosa](https://librosa.org/doc/latest/)
- [music21](https://www.music21.org/music21docs/)

Os adaptadores dos modelos estão implementados. Consulte `docs/VALIDACAO.md` para distinguir os recursos executados nesta entrega das integrações que ainda exigem validação no computador que instalará os modelos.
