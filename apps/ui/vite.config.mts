import * as path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  // Only skip electron plugin during dev server in CI (no display available for Electron)
  // Always include it during build - we need dist-electron/main.js for electron-builder
  const skipElectron =
    command === 'serve' && (process.env.CI === 'true' || process.env.VITE_SKIP_ELECTRON === 'true');

  return {
    plugins: [
      // Only include electron plugin when not in CI/headless dev mode
      ...(skipElectron
        ? []
        : [
            electron({
              main: {
                entry: 'src/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
              preload: {
                input: 'src/preload.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            }),
          ]),
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
      tailwindcss(),
      react(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: parseInt(process.env.TEST_PORT || '3007', 10),
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Vendor chunks for large libraries
            // Split xterm terminal library
            if (id.includes('@xterm') || id.includes('xterm')) {
              return 'xterm';
            }

            // Split React and React DOM
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react';
            }

            // Split TanStack Router
            if (id.includes('@tanstack/react-router')) {
              return 'tanstack-router';
            }

            // Split TanStack React Query
            if (id.includes('@tanstack/react-query')) {
              return 'tanstack-query';
            }

            // Split dagre (graph layout library)
            if (id.includes('dagre')) {
              return 'dagre';
            }

            // Split xyflow (React Flow library)
            if (id.includes('@xyflow/react')) {
              return 'xyflow';
            }

            // Split markdown libraries
            if (id.includes('react-markdown') || id.includes('rehype')) {
              return 'markdown';
            }

            // Split CodeMirror
            if (id.includes('@codemirror') || id.includes('@uiw/react-codemirror')) {
              return 'codemirror';
            }

            // Split DnD Kit
            if (id.includes('@dnd-kit')) {
              return 'dnd-kit';
            }

            // Split Radix UI components
            if (id.includes('@radix-ui')) {
              return 'radix-ui';
            }

            // Split Zustand
            if (id.includes('zustand')) {
              return 'zustand';
            }

            // Split Lucide React icons
            if (id.includes('lucide-react')) {
              return 'lucide-icons';
            }

            // Split sonner (toast notifications)
            if (id.includes('sonner')) {
              return 'sonner';
            }

            // Split resize panels
            if (id.includes('react-resizable-panels')) {
              return 'resize-panels';
            }
          },
        },
      },
      // Increase chunk size warning limit to 500 kB
      chunkSizeWarningLimit: 500,
    },
  };
});
