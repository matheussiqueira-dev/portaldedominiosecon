# ENCOM Gesture Console

Aplicacao web para reconhecimento de sinais de mao com deteccao em tempo real pela webcam, treinamento no navegador, animacoes 3D e interface futurista no padrao ENCOM.

## O que mudou

- Interface principal traduzida para portugues.
- Novo visual ENCOM inspirado em Tron Legacy, com neon azul, paineis holograficos e grid animado.
- Separacao fisica entre o frame de efeitos especiais 3D e o frame de captura da webcam.
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
- Configuracao compartilhada das classes, descricoes e metadados visuais em `sign-config.js`.

## Tecnologias

- HTML, CSS e JavaScript puro
- [MediaPipe Hands](https://developers.google.com/mediapipe) para rastreamento de ate duas maos
- [TensorFlow.js](https://www.tensorflow.org/js) para treinamento e inferencia no navegador
- [Three.js](https://threejs.org/) para os fundos 3D animados

## Estrutura principal

- `index.html`: console principal com frames separados para FX e webcam
- `styles.css`: estilos da interface principal
- `app.js`: loop de inferencia, atualizacao de UI e controles da sessao
- `train.html`: treinador visual em portugues
- `train.css`: estilos do treinador
- `train.js`: coleta de amostras, treino, previsao e exportacao do modelo
- `sign-config.js`: labels, descricoes e metadados compartilhados dos sinais
- `background-scene.js`: efeitos e transicoes do ambiente 3D
- `hand-features.js`: extracao de features a partir dos pontos rastreados das maos
- `styles/encom-theme.css`: tema global ENCOM
- `ui-system.js`: footer global e botao flutuante do WhatsApp
- `vercel.json`: configuracao de deploy para Vercel

## Como usar

1. Rode um servidor local na pasta do projeto.
2. Abra `index.html` para usar o monitor principal.
3. Permita acesso a webcam.
4. Execute os gestos com as duas maos visiveis no quadro.
5. Acompanhe barras de confianca, historico, telemetria e o cenario 3D ativado.

## Como treinar um novo modelo

1. Abra `train.html`.
2. Escolha a classe no seletor.
3. Clique em **Iniciar coleta** e grave amostras equilibradas.
4. Repita o processo ate atingir pelo menos 30 amostras por classe e 100 no total.
5. Clique em **Treinar modelo**.
6. Use **Iniciar previsao** para validar o resultado ao vivo.
7. Clique em **Salvar modelo** para baixar os arquivos TensorFlow.js.
8. Substitua `hand-sign-model.json` e `hand-sign-model.weights.bin` na raiz pelos arquivos aprovados.

As classes padrao podem ser renomeadas ou substituidas diretamente em `sign-config.js`, sem alterar a estrutura principal da interface.

## Observacao

O projeto continua 100% client-side. Para a webcam funcionar corretamente, use `localhost` ou HTTPS.

## Deploy na Vercel

1. Importe o repositorio na Vercel.
2. Use o preset `Other`.
3. Nao configure comando de build.
4. Nao configure diretoria de output.
5. Publique normalmente; a Vercel servira os arquivos estaticos da raiz.

Rotas configuradas:

- `/` -> `index.html`
- `/train` -> `train.html`

O arquivo `vercel.json` ja inclui rewrite para a tela de treino e headers para revalidacao dos assets principais.

## Autoria

Projeto atribuido a Matheus Siqueira.
