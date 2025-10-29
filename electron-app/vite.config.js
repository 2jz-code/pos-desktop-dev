import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
	// ** THE KEY CHANGE IS HERE **
	// We are adding a top-level 'ssr' config to instruct Vite's dev server
	// on how to handle modules in a Node.js environment (the Electron main process).
	ssr: {
		// Explicitly tell Vite to NOT bundle these new modules.
		// The 'require()' or 'import' calls will be left as-is and handled by Node.js at runtime.
		external: [
			"node-thermal-printer",
			"usb",
			"better-sqlite3",
			"axios",
			"os",
			"node-machine-id",
		],
	},
	plugins: [
		react(),
		tailwindcss(),
		electron([
			{
				// Main-process entry
				entry: "electron/main.js",
				// We also need to configure the production build for the main process.
				vite: {
					build: {
						// For the production build, ensure the modules are also externalized.
						rollupOptions: {
							external: [
								"node-thermal-printer",
								"usb",
								"better-sqlite3",
								"axios",
								"os",
								"node-machine-id",
							],
						},
					},
				},
			},
			{
				// Preload-script entry
				entry: "electron/preload.js",
				onstart(options) {
					options.reload();
				},
				vite: {
					// Add ssr config specifically for the preload script's dev server
					ssr: {
						external: ["os", "node-machine-id"],
					},
					build: {
						rollupOptions: {
							external: ["os", "node-machine-id"],
						},
					},
				},
			},
		]),
		renderer(),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@/app": path.resolve(__dirname, "./src/app"),
			"@/shared": path.resolve(__dirname, "./src/shared"),
			"@/domains": path.resolve(__dirname, "./src/domains"),
		},
		dedupe: ["react", "react-dom", "react-router-dom"],
	},
	build: {
		// This config is for the renderer process.
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, "index.html"),
				customer: path.resolve(__dirname, "customer.html"),
			},
		},
	},
});
