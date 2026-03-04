(function () {
  function normalizeHand(landmarks) {
    const wrist = landmarks[0];
    const midTip = landmarks[12];
    const scale =
      Math.hypot(midTip.x - wrist.x, midTip.y - wrist.y, midTip.z - wrist.z) ||
      1e-6;

    const out = [];
    for (const p of landmarks) {
      out.push((p.x - wrist.x) / scale);
      out.push((p.y - wrist.y) / scale);
      out.push((p.z - wrist.z) / scale);
    }
    return out;
  }

  // Build fixed-length feature vector [left hand(63), right hand(63)].
  // Missing hands stay zeroed so tensor shape is always stable.
  function getTwoHandFeatures(results) {
    const left = new Array(63).fill(0);
    const right = new Array(63).fill(0);
    const lms = results.multiHandLandmarks || [];
    const handed = results.multiHandedness || [];

    for (let i = 0; i < lms.length; i += 1) {
      const side = handed[i] && handed[i].label;
      const f = normalizeHand(lms[i]);
      if (side === "Left") {
        for (let j = 0; j < 63; j += 1) left[j] = f[j];
      } else if (side === "Right") {
        for (let j = 0; j < 63; j += 1) right[j] = f[j];
      }
    }

    return left.concat(right);
  }

  window.DomainExpansionGestureFeatures = {
    normalizeHand,
    getTwoHandFeatures,
  };
})();
