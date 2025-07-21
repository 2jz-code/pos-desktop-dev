import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { visualizer } from "rollup-plugin-visualizer";
import viteCompression from "vite-plugin-compression";
import Sitemap from "vite-plugin-sitemap";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		Sitemap({
			hostname: "https://bakeajeen.com",
			dynamicRoutes: [], // We can add dynamic routes (like products) here later if needed
		}),
		// Bundle analyzer - generates stats.html after build
		visualizer({
			filename: "dist/stats.html",
			open: false,
			gzipSize: true,
			brotliSize: true,
		}),
		// Compression plugin
		viteCompression({
			verbose: true,
			disable: false,
			deleteOriginFile: false,
			threshold: 10240, // Don't compress files smaller than 10kb
			algorithm: "gzip",
			ext: ".gz",
		}),
		viteCompression({
			verbose: true,
			disable: false,
			deleteOriginFile: false,
			threshold: 10240,
			algorithm: "brotliCompress",
			ext: ".br",
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		// Enable source maps for production debugging
		sourcemap: false,
		// Reduce chunk size warnings threshold
		chunkSizeWarningLimit: 500,
		rollupOptions: {
			output: {
				// Let Vite handle chunking automatically for optimal performance
			},
		},
		// Enable minification
		minify: "terser",
		terserOptions: {
			compress: {
				drop_console: true, // Remove console.logs in production
				drop_debugger: true,
			},
		},
		// Enable CSS code splitting
		cssCodeSplit: true,
	},
	// Performance optimizations
	server: {
		host: "0.0.0.0", // Allow external connections
		port: 5174, // Use different port from admin-site to avoid conflicts
		strictPort: false, // Allow port changes if 5174 is taken
		hmr: {
			overlay: false, // Disable error overlay for better performance
		},
	},
	preview: {
		host: "0.0.0.0", // Allow external connections for preview mode
		port: 4174, // Use different preview port from admin-site
	},
	// Optimize deps
	optimizeDeps: {
		include: [
			"react",
			"react-dom",
			"react-router-dom",
			"@tanstack/react-query",
			"framer-motion",
			"axios",
		],
	},
});
