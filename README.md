# Domain Expansion (Jujutsu Kaisen Hands)

Domain Expansion is a browser-based hand sign recognition project that detects Jujutsu Kaisen inspired gestures from a webcam feed and triggers real-time 3D background animations.

## Technologies Used

- HTML/CSS + vanilla JavaScript
- [MediaPipe Hands](https://developers.google.com/mediapipe) for 2-hand landmark tracking
- [TensorFlow.js](https://www.tensorflow.org/js) for training and running the gesture classifier in-browser
- [Three.js](https://threejs.org/) for visual effects and animated domain scenes
- Saved model assets: `hand-sign-model.json` + `hand-sign-model.weights.bin`

## How I Trained It

1. Open `train.html`.
2. Choose a class from the dropdown (`infinite_void`, `shrine`, `red`, `mahoraga`, `other`).
3. Click **Collect Class** and record samples for each class.
4. Repeat until data is balanced (the trainer enforces at least 30 samples per class and 100+ total samples).
5. Click **Train** (current setup: 20 epochs, batch size 32, validation split 0.2).
6. Click **Start Predict** to validate predictions live.
7. Click **Save Model** to download the trained TensorFlow.js model files.
8. Replace the root `hand-sign-model.json` and `hand-sign-model.weights.bin` with your new exported files.

## How to Use

1. Run a local web server in this folder (camera APIs work best on `localhost` or HTTPS).
2. Open `index.html` from that local server.
3. Allow webcam access.
4. Perform one of the trained hand signs in view of the camera.
5. When confidence and streak thresholds are met, the matching domain animation activates.
6. If the gesture is uncertain or mapped to `other`, the scene clears.

## Main Files

- `index.html`: main app UI and script loading
- `app.js`: camera loop, hand tracking, model inference, sign gating
- `background-scene.js`: Three.js domain animations and transitions
- `hand-features.js`: shared hand feature extraction helpers
- `train.html` + `train.js`: data collection and model training tool

## Credits

Animations and visual behavior were powered by **Gemini 3** and **Codex**.
