import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		host: "0.0.0.0", // Allow external connections
		port: 5175, // Default Vite port, change if needed
		strictPort: false, // Allow port changes if 5173 is taken
	},
	preview: {
		host: "0.0.0.0", // Allow external connections for preview mode
		port: 4173, // Default Vite preview port
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@/components": path.resolve(__dirname, "./src/components"),
			"@/pages": path.resolve(__dirname, "./src/pages"),
			"@/services": path.resolve(__dirname, "./src/services"),
			"@/hooks": path.resolve(__dirname, "./src/hooks"),
			"@/utils": path.resolve(__dirname, "./src/utils"),
			"@/lib": path.resolve(__dirname, "./src/lib"),
			"@/types": path.resolve(__dirname, "./src/types"),
			"@/store": path.resolve(__dirname, "./src/store"),
		},
	},
	build: {
		target: "es2015",
		outDir: "dist",
		assetsDir: "assets",
		sourcemap: false,
		minify: "terser",
		terserOptions: {
			compress: {
				drop_console: true,
				drop_debugger: true,
			},
		},
		rollupOptions: {
			output: {
				manualChunks: {
					vendor: ["react", "react-dom", "react-router-dom"],
					ui: [
						"@radix-ui/react-dialog",
						"@radix-ui/react-dropdown-menu",
						"@radix-ui/react-select",
					],
					charts: ["recharts"],
					utils: ["axios", "@tanstack/react-query", "date-fns"],
				},
			},
		},
		chunkSizeWarningLimit: 1000,
	},
});
