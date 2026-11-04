import { simplifyGeometry } from "./model-processing.js";
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({
      result: await simplifyGeometry(data.geometry, data.ratio),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
