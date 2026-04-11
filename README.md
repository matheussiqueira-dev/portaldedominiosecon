# Portal Econ — Sistema de Reconhecimento de Gestos em Tempo Real

<p align="center">
  <img src="https://img.shields.io/badge/TensorFlow.js-v4.15-FF6F00?logo=tensorflow&logoColor=white" alt="TensorFlow.js"/>
  <img src="https://img.shields.io/badge/MediaPipe-Hands-4285F4?logo=google&logoColor=white" alt="MediaPipe"/>
  <img src="https://img.shields.io/badge/Three.js-r158-black?logo=threedotjs&logoColor=white" alt="Three.js"/>
  <img src="https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white" alt="Vercel"/>
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License"/>
</p>

<p align="center">
  Console de detecção de gestos inspirado no universo de <em>Jujutsu Kaisen</em>, com visual ENCOM/Tron.<br/>
  Reconhece gestos em tempo real diretamente no navegador — sem backend, sem instalação.
</p>

---

## Sumário

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Stack Tecnológico](#stack-tecnológico)
- [Como Executar](#como-executar)
- [Fluxo de Treinamento](#fluxo-de-treinamento)
- [Atalhos de Teclado](#atalhos-de-teclado)
- [Testes](#testes)
- [Segurança](#segurança)
- [Estrutura de Arquivos](#estrutura-de-arquivos)
- [Autor](#autor)

---

## Visão Geral

O **Portal Econ** combina visão computacional, machine learning in-browser e renderização 3D para criar uma experiência de reconhecimento de gestos completamente no lado do cliente. Nenhum dado de câmera é enviado a servidores externos.

O sistema detecta **4 gestos** (Vazio Infinito, Santuário, Vermelho e Mahoraga) usando as 21 landmarks de cada mão fornecidas pelo MediaPipe, normaliza as coordenadas em um vetor de 126 dimensões e classifica com uma rede neural treinada diretamente no navegador via TensorFlow.js.

---

## Funcionalidades

### Monitor (`/`)
- Detecção em tempo real com validação por streak (N quadros consecutivos)
- Animações 3D com Three.js disparadas ao confirmar cada gesto
- Painel de confiança com barras de probabilidade por classe
- Histórico de ativações com timestamps
- Métricas de sessão: total de detecções, último gesto, contador por sinal

### Trainer (`/train`)
- Coleta de amostras via webcam por classe de gesto
- Treinamento in-browser com regularização **L2** e **Dropout**
- **Data Augmentation** com jitter gaussiano (duplica o dataset durante o treino)
- **Persistência de sessão** via localStorage (dados mantidos ao recarregar)
- Barra de progresso de épocas em tempo real
- Validação ao vivo com o modelo recém-treinado
- Exportação do modelo em formato TensorFlow.js

### Novidades da v2.0
- `error-handler.js`: toasts de erro, captura global de exceções e rejeições de Promise
- `performance-monitor.js`: FPS, heap JS e contagem de tensores (`Shift+P`)
- `session-persistence.js`: save/load do dataset no localStorage sem perda de dados
- Atalhos de teclado em todas as páginas (tecla `?` para listar)
- Modal de atalhos acessível com ARIA
- Segurança reforçada: CSP, HSTS, Permissions-Policy, Referrer-Policy no Vercel
- Testes unitários para os módulos de features, configuração e persistência

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                       Navegador                         │
│                                                         │
│  ┌──────────┐    ┌────────────────┐    ┌─────────────┐  │
│  │  Câmera  │───▶│ MediaPipe Hands│───▶│hand-features│  │
│  │ (WebRTC) │    │   (21 pts/mão) │    │    .js      │  │
│  └──────────┘    └────────────────┘    └──────┬──────┘  │
│                                               │ 126 feat │
│                                        ┌──────▼──────┐  │
│                                        │ TF.js Model │  │
│                                        │ (4+1 classes)│  │
│                                        └──────┬──────┘  │
│                                               │ probs    │
│  ┌──────────────┐    ┌────────────┐    ┌──────▼──────┐  │
│  │ background-  │◀───│  app.js /  │◀───│ sign-config │  │
│  │  scene.js    │    │  train.js  │    │    .js      │  │
│  │ (Three.js)   │    │            │    └─────────────┘  │
│  └──────────────┘    └────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

### Pipeline de Inferência

1. **Captura**: WebRTC stream → MediaPipe Hands
2. **Extração**: 21 landmarks/mão → `normalizeHand()` → vetor 126-d invariante a posição e escala
3. **Inferência**: `tf.tidy()` → `model.predict()` → probabilidades softmax
4. **Filtragem**: margem top-2 ≥ 0,12 · margem vs. "other" ≥ 0,08 · streak ≥ N frames
5. **Saída**: animação 3D + painel de feedback visual

### Arquitetura da Rede Neural

```
Input   [126]   — vetor de dois grupos de 63 features (21 landmarks × 3 eixos)
Dense   [128]   — ReLU + L2(λ=1e-4)
Dropout  [20%]
Dense    [64]   — ReLU + L2(λ=1e-4)
Dropout  [20%]
Dense     [5]   — Softmax  (4 gestos + "other")

Optimizer : Adam (lr=0.001)
Loss      : Categorical Cross-Entropy
Epochs    : 20   |   Batch: 32   |   Val split: 20%
```

---

## Stack Tecnológico

| Tecnologia | Papel |
|------------|-------|
| **TensorFlow.js 4.15** | Treinamento e inferência in-browser |
| **MediaPipe Hands** | Detecção de 21 landmarks por mão |
| **Three.js r158** | Cenas 3D e efeitos de partículas |
| **Vercel** | Deploy com SPA routing e headers de segurança |
| **Jest + JSDOM** | Testes unitários (Node.js) |
| HTML5 / CSS3 / ES6 | Interface — sem frameworks ou bundlers |

---

## Como Executar

### Pré-requisito
- Navegador moderno com suporte a WebGL e WebRTC (Chrome 90+, Edge 90+, Firefox 88+)
- Câmera disponível e permissão concedida
- Conexão com a internet (CDNs das bibliotecas)

### Local (sem build)
```bash
# 1. Clone o repositório
git clone https://github.com/matheussiqueira-dev/Portal-Econ.git
cd Portal-Econ

# 2. Sirva via HTTP local (necessário para getUserMedia)
npx serve .
# ou
python -m http.server 8080
```

Acesse `http://localhost:8080` no navegador.

> **Atenção**: abrir `index.html` diretamente como `file://` bloqueia o acesso à câmera. Use sempre um servidor HTTP local ou HTTPS.

### Deploy na Vercel
1. Importe o repositório no dashboard da [Vercel](https://vercel.com).
2. Selecione o preset **Other** (sem framework).
3. Não configure build command nem output directory.
4. Publique — o `vercel.json` cuida de todo o roteamento e segurança.

---

## Fluxo de Treinamento

```
Trainer (/train)
────────────────
1. Selecionar classe no dropdown
2. Clicar "Coletar" (atalho: C) — coletar ≥ 30 amostras por classe
3. Repetir para as 5 classes (mínimo 100 amostras no total)
4. Clicar "Treinar Modelo" — aguardar 20 épocas com barra de progresso
5. Clicar "Iniciar Previsão" (atalho: P) — validar ao vivo
6. Clicar "Exportar Modelo" — baixar hand-sign-model.{json,weights.bin}
7. Substituir os arquivos na raiz do projeto e fazer deploy
```

> O dataset é salvo automaticamente no `localStorage` ao parar a coleta ou após o treino, permitindo retomar de onde parou após recarregar a página.

---

## Atalhos de Teclado

### Monitor (`/`)

| Tecla | Ação |
|-------|------|
| `M` | Alternar espelhamento de câmera |
| `L` | Mostrar / ocultar landmarks |
| `H` | Pausar / retomar histórico de ativações |
| `R` | Resetar monitoramento |
| `Shift+P` | Abrir/fechar monitor de performance |
| `?` | Abrir lista de atalhos |

### Trainer (`/train`)

| Tecla | Ação |
|-------|------|
| `C` | Iniciar coleta de amostras |
| `S` | Parar coleta |
| `P` | Ativar / pausar previsão ao vivo |
| `Shift+P` | Abrir/fechar monitor de performance |
| `?` | Abrir lista de atalhos |

---

## Testes

```bash
# Instalar dependências de desenvolvimento
npm install

# Rodar todos os testes
npm test

# Rodar com relatório de cobertura
npm run test:coverage

# Watch mode (desenvolvimento)
npm run test:watch
```

### Cobertura atual

| Módulo | Casos de Teste | O que é coberto |
|--------|---------------|-----------------|
| `hand-features.js` | 12 | Normalização, invariância à translação/escala, validação de entrada, edge cases |
| `sign-config.js` | 15 | Estrutura de dados, imutabilidade (Object.freeze), utilitários |
| `session-persistence.js` | 10 | Round-trip save/load, validação, clearSession, edge cases |

---

## Segurança

### Headers HTTP (Vercel)

| Header | Valor |
|--------|-------|
| `Content-Security-Policy` | Restringe scripts/estilos/fontes a origens confiáveis (CDNs explícitas) |
| `Strict-Transport-Security` | HSTS por 2 anos com preload |
| `X-Frame-Options` | `DENY` — previne clickjacking |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Câmera restrita ao `self`; microfone, geolocalização e pagamento bloqueados |

### Privacidade
- Nenhum frame de vídeo é enviado a servidores externos
- Toda a inferência ocorre no dispositivo do usuário (on-device ML)
- O dataset de treinamento fica exclusivamente no `localStorage` do navegador

---

## Estrutura de Arquivos

```
Portal-Econ/
├── index.html                   # Monitor de gestos
├── train.html                   # Trainer
├── app.js                       # Pipeline de detecção em tempo real
├── train.js                     # Pipeline de treinamento e validação
├── hand-features.js             # Extração e normalização de features
├── sign-config.js               # Configuração centralizada dos gestos
├── background-scene.js          # Animações 3D com Three.js
├── ui-system.js                 # Componentes globais de UI
├── error-handler.js             # Tratamento centralizado de erros e logging
├── performance-monitor.js       # Monitor de FPS, memória e tensores TF.js
├── session-persistence.js       # Persistência de sessão via localStorage
├── styles.css                   # Estilos do monitor
├── train.css                    # Estilos do trainer
├── styles/
│   └── encom-theme.css          # Design system ENCOM
├── hand-sign-model.json         # Arquitetura do modelo TF.js
├── hand-sign-model.weights.bin  # Pesos pré-treinados
├── vercel.json                  # Configuração de deploy e segurança
├── package.json                 # Dependências de dev (Jest)
└── tests/
    ├── hand-features.test.js         # Testes — extração de features
    ├── sign-config.test.js           # Testes — configuração de gestos
    └── session-persistence.test.js   # Testes — persistência de sessão
```

---

## Autor

Desenvolvido por **Matheus Siqueira**

[www.matheussiqueira.dev](https://www.matheussiqueira.dev/)
