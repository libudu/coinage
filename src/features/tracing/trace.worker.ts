import { traceRasterWithPlacement } from "./trace";
self.onmessage = (event) => {
  try {
    const { raster, options, name, brush } = event.data;
    self.postMessage(traceRasterWithPlacement(raster, options, name, brush));
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "转换失败",
    });
  }
};
