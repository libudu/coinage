import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { Button } from "./shared/components/Button";
import { projectStorage } from "./features/project/projectStorage";
import "./styles/index.css";

const container = document.getElementById("root")!;
container.className = "h-[100dvh]";
container.textContent = "正在读取手稿…";
const root = createRoot(container);
try {
  const initialProject = await projectStorage.load();
  root.render(
    <StrictMode>
      <App initialProject={initialProject} />
    </StrictMode>,
  );
} catch (error) {
  container.className =
    "min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-8 text-sm";
  root.render(
    <>
      <p>
        读取手稿失败：
        {error instanceof Error ? error.message : "请检查本地服务"}
      </p>
      <Button variant="bare" onClick={() => location.reload()}>
        重试
      </Button>
    </>,
  );
}
