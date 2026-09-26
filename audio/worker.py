"""Processamento real. Cada trabalho executa em um processo isolado, sem shell."""
import argparse
import importlib.util
import json
import shutil
import sys
from pathlib import Path


def capabilities():
    present = lambda name: importlib.util.find_spec(name) is not None
    analysis = present('librosa') and present('numpy')
    midi = present('basic_pitch')
    return {
        'analysis': analysis,
        'midi': midi,
        'partitura': midi and present('music21'),
        'stems': present('demucs') and present('torch') and shutil.which('ffmpeg') is not None,
        'reason': 'Recursos habilitados conforme as dependências instaladas. Modelos são carregados no primeiro uso.'
    }


def analyze(source):
    import librosa
    import numpy as np
    # Até 180 s para estimativa. O arquivo original nunca é modificado.
    y, sr = librosa.load(source, sr=22050, mono=True, duration=180)
    if len(y) < sr or np.max(np.abs(y)) < 1e-5:
        raise ValueError('Áudio muito curto ou silencioso para análise.')
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.asarray(tempo).reshape(-1)[0])
    chroma = librosa.feature.chroma_stft(y=y, sr=sr).mean(axis=1)
    major = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
    minor = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
    names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
    scores = [(float(np.corrcoef(chroma,np.roll(profile,i))[0,1]),names[i]+suffix)
              for profile,suffix in [(major,''),(minor,'m')] for i in range(12)]
    scores = [x for x in scores if np.isfinite(x[0])]
    best = max(scores) if scores else (0.0,'')
    return {'bpm':round(bpm,1) if 20<=bpm<=300 else None,'key':best[1],
            'keyCorrelation':round(best[0],3),'analyzedSeconds':round(len(y)/sr,2),
            'note':'Estimativas de tempo e tonalidade. Revise antes de usar musicalmente.'}


def process(kind, source, output):
    if kind == 'analysis':
        return analyze(source)
    if kind in ('midi','partitura'):
        from basic_pitch.inference import predict
        _, midi, _ = predict(str(source))
        if not any(instrument.notes for instrument in midi.instruments):
            raise ValueError('O modelo não encontrou notas suficientes para transcrever.')
        midi_path = output / 'transcricao.mid'
        midi.write(str(midi_path))
        if kind == 'midi':
            return {'output':midi_path.name,'engine':'Basic Pitch','note':'Transcrição automática; revise as notas.'}
        from music21 import converter
        score = converter.parse(str(midi_path))
        score.write('musicxml',fp=str(output/'partitura.musicxml'))
        return {'output':'partitura.musicxml','engine':'Basic Pitch + music21',
                'note':'Abra no MuseScore e revise a quantização, compassos e vozes.'}
    if kind == 'stems':
        import demucs.separate
        # Chamada no mesmo processo: cancelar o trabalho também encerra o modelo.
        demucs.separate.main(['-n','htdemucs','-d','cpu','--out',str(output/'separated'),str(source)])
        stems = sorted((output/'separated').rglob('*.wav'))
        if len(stems) != 4:
            raise ValueError('O modelo não gerou os quatro stems esperados.')
        import zipfile
        with zipfile.ZipFile(output/'stems.zip','w',compression=zipfile.ZIP_DEFLATED) as archive:
            for stem in stems:
                archive.write(stem,stem.name)
        return {'output':'stems.zip','engine':'Demucs htdemucs','stems':[s.stem for s in stems]}
    raise ValueError('Tipo de trabalho inválido.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--capabilities',action='store_true')
    parser.add_argument('--type',choices=['analysis','midi','partitura','stems'])
    parser.add_argument('--input',type=Path)
    parser.add_argument('--output',type=Path)
    args = parser.parse_args()
    if args.capabilities:
        print(json.dumps(capabilities()))
        return
    if not args.type or not args.input or not args.output:
        parser.error('--type, --input e --output são obrigatórios')
    args.output.mkdir(parents=True,exist_ok=True)
    result = process(args.type,args.input,args.output)
    (args.output/'result.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')


if __name__ == '__main__':
    main()
