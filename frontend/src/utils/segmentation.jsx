import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";

let selfieSegmentation = null;
let lastResult = null;
let initialized = false;
let pendingResolve = null;


export const initSegmentation = () => {
  if (initialized) return;

  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
  });

  selfieSegmentation.setOptions({
    modelSelection: 0,
  });

  selfieSegmentation.onResults((results) => {
    lastResult = results;
    if (pendingResolve) {
      pendingResolve(results);
      pendingResolve = null;
    }
  });

  initialized = true;
};

export const segmentAndCrop = async (canvas, timeout = 10000) => {
  if (!selfieSegmentation) {
    throw new Error("Segmentation not initialized");
  }

  lastResult = null; // reset before new send

  const resultPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResolve = null;
      reject(new Error(`Segmentation timed out after ${timeout}ms`));
    }, timeout);

    pendingResolve = (results) => {
      clearTimeout(timer);
      resolve(results);
    };
  });

  await selfieSegmentation.send({ image: canvas });
  return resultPromise;
};