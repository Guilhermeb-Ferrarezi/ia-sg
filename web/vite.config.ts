import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const devApiTarget = env.VITE_DEV_API_TARGET || "http://localhost:3002"
  const devWsTarget =
    env.VITE_DEV_WS_TARGET ||
    (devApiTarget.startsWith("https://")
      ? devApiTarget.replace("https://", "wss://")
      : devApiTarget.replace("http://", "ws://"))

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: devApiTarget,
          changeOrigin: true,
        },
        "/ws": {
          target: devWsTarget,
          ws: true,
        },
        "/webhook": {
          target: devApiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
