import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

function resolvePort(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue ?? "")

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }

  return fallback
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const frontendPort = resolvePort(env.VITE_DEV_PORT, 8080)
  const devApiTarget = env.VITE_DEV_API_TARGET || "http://localhost:3000"
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
      host: "0.0.0.0",
      port: frontendPort,
      strictPort: false,
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
    preview: {
      host: "0.0.0.0",
      port: frontendPort,
      strictPort: false,
    },
  }
})
