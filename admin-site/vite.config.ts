import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
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
});
