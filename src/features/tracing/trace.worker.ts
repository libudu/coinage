import { traceRaster } from "./trace";
self.onmessage = (event) => {
  try {
    const { raster, options, name } = event.data;
    self.postMessage({ glyph: traceRaster(raster, options, name) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "转换失败",
    });
  }
};
