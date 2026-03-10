# Portal de Dominios ECON

Aplicacao web para reconhecimento de sinais de mao inspirados em *Jujutsu Kaisen*, com deteccao em tempo real pela webcam, animacoes 3D e um layout em portugues baseado na linguagem visual da ECON.

## O que mudou

- Interface principal traduzida para portugues.
- Novo visual corporativo com paleta, blocos e CTAs inspirados na ECON.
- Painel operacional com:
  - barras de confianca por classe
  - historico recente de ativacoes
  - contadores por sinal durante a sessao
  - controles de camera para espelhamento e exibicao dos pontos rastreados
- Treinador reformulado com:
  - dashboard de distribuicao das amostras
  - metricas de treino e validacao
  - previsao ao vivo por classe
  - reset da classe selecionada
  - limpeza completa da base antes de novo treino
- Configuracao compartilhada dos sinais em `sign-config.js`.

## Tecnologias

- HTML, CSS e JavaScript puro
- [MediaPipe Hands](https://developers.google.com/mediapipe) para rastreamento de ate duas maos
- [TensorFlow.js](https://www.tensorflow.org/js) para treinamento e inferencia no navegador
- [Three.js](https://threejs.org/) para os fundos 3D animados

## Estrutura principal

- `index.html`: portal principal com monitoramento e visual ECON
- `styles.css`: estilos da interface principal
- `app.js`: loop de inferencia, atualizacao de UI e controles da sessao
- `train.html`: treinador visual em portugues
- `train.css`: estilos do treinador
- `train.js`: coleta de amostras, treino, previsao e exportacao do modelo
- `sign-config.js`: labels, descricoes e metadados compartilhados dos sinais
- `background-scene.js`: efeitos e transicoes do ambiente 3D
- `hand-features.js`: extracao de features a partir dos pontos rastreados das maos

## Como usar

1. Rode um servidor local na pasta do projeto.
2. Abra `index.html` para usar o monitor principal.
3. Permita acesso a webcam.
4. Execute os gestos com as duas maos visiveis no quadro.
5. Acompanhe barras de confianca, historico e sinal ativo.

## Como treinar um novo modelo

1. Abra `train.html`.
2. Escolha a classe no seletor.
3. Clique em **Iniciar coleta** e grave amostras equilibradas.
4. Repita o processo ate atingir pelo menos 30 amostras por classe e 100 no total.
5. Clique em **Treinar modelo**.
6. Use **Iniciar previsao** para validar o resultado ao vivo.
7. Clique em **Salvar modelo** para baixar os arquivos TensorFlow.js.
8. Substitua `hand-sign-model.json` e `hand-sign-model.weights.bin` na raiz pelos arquivos aprovados.

## Observacao

O projeto continua 100% client-side. Para a webcam funcionar corretamente, use `localhost` ou HTTPS.

## Autoria

Projeto atribuido a Matheus Siqueira.
