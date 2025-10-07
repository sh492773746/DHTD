import path from 'node:path';
import react from '@vitejs/plugin-react';
import { createLogger, defineConfig } from 'vite';
import inlineEditPlugin from './plugins/visual-editor/vite-plugin-react-inline-editor.js';
import editModeDevPlugin from './plugins/visual-editor/vite-plugin-edit-mode.js';


const isDev = process.env.NODE_ENV !== 'production';

const configHorizonsViteErrorHandler = `
const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			if (
				addedNode.nodeType === Node.ELEMENT_NODE &&
				(
					addedNode.tagName?.toLowerCase() === 'vite-error-overlay' ||
					addedNode.classList?.contains('backdrop')
				)
			) {
				handleViteOverlay(addedNode);
			}
		}
	}
});

observer.observe(document.documentElement, {
	childList: true,
	subtree: true
});

function handleViteOverlay(node) {
	if (!node.shadowRoot) {
		return;
	}

	const backdrop = node.shadowRoot.querySelector('.backdrop');

	if (backdrop) {
		const overlayHtml = backdrop.outerHTML;
		const parser = new DOMParser();
		const doc = parser.parseFromString(overlayHtml, 'text/html');
		const messageBodyElement = doc.querySelector('.message-body');
		const fileElement = doc.querySelector('.file');
		const messageText = messageBodyElement ? messageBodyElement.textContent.trim() : '';
		const fileText = fileElement ? fileElement.textContent.trim() : '';
		const error = messageText + (fileText ? ' File:' + fileText : '');

		window.parent.postMessage({
			type: 'horizons-vite-error',
			error,
		}, '*');
	}
}
`;

const configHorizonsRuntimeErrorHandler = `
window.onerror = (message, source, lineno, colno, errorObj) => {
	const errorDetails = errorObj ? JSON.stringify({
		name: errorObj.name,
		message: errorObj.message,
		stack: errorObj.stack,
		source,
		lineno,
		colno,
	}) : null;

	window.parent.postMessage({
		type: 'horizons-runtime-error',
		message,
		error: errorDetails
	}, '*');
};
`;

const configHorizonsConsoleErrroHandler = `
const originalConsoleError = console.error;
console.error = function(...args) {
	originalConsoleError.apply(console, args);

	let errorString = '';

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg instanceof Error) {
			errorString = arg.stack || \`\${arg.name}: \${arg.message}\`;
			break;
		}
	}

	if (!errorString) {
		errorString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	}

	window.parent.postMessage({
		type: 'horizons-console-error',
		error: errorString
	}, '*');
};
`;

const configWindowFetchMonkeyPatch = `
const originalFetch = window.fetch;

window.fetch = function(...args) {
	const url = args[0] instanceof Request ? args[0].url : args[0];

	// Skip WebSocket URLs
	if (url.startsWith('ws:') || url.startsWith('wss:')) {
		return originalFetch.apply(this, args);
	}

	const shouldSuppress = (u) => {
		try {
			const p = new URL(u, location.origin);
			const pathname = p.pathname || '';
			return pathname === '/'
				|| pathname.startsWith('/@vite')
				|| pathname.startsWith('/@react-refresh')
				|| pathname.includes('__vite')
				|| pathname.includes('/vite')
				|| pathname.includes('sockjs')
				|| pathname.includes('client');
		} catch { return false; }
	};

	return originalFetch.apply(this, args)
		.then(async response => {
			const contentType = response.headers.get('Content-Type') || '';

			// Exclude HTML document responses
			const isDocumentResponse =
				contentType.includes('text/html') ||
				contentType.includes('application/xhtml+xml');

			if (!response.ok && !isDocumentResponse && !shouldSuppress(url)) {
					const responseClone = response.clone();
					const errorFromRes = await responseClone.text();
					const requestUrl = response.url;
					console.error('Fetch error from ' + requestUrl + ': ' + errorFromRes);
			}

			return response;
		})
		.catch(error => {
			if (!url.match(/\.html?$/i) && !shouldSuppress(url)) {
				console.error(error);
			}

			throw error;
		});
};
`;

const addTransformIndexHtml = {
	name: 'add-transform-index-html',
	transformIndexHtml(html) {
		const tags = [];

		if (isDev) {
			tags.push(
				{ tag: 'script', attrs: { type: 'module' }, children: configHorizonsRuntimeErrorHandler, injectTo: 'head' },
				{ tag: 'script', attrs: { type: 'module' }, children: configHorizonsViteErrorHandler, injectTo: 'head' },
				{ tag: 'script', attrs: { type: 'module' }, children: configHorizonsConsoleErrroHandler, injectTo: 'head' },
				{ tag: 'script', attrs: { type: 'module' }, children: configWindowFetchMonkeyPatch, injectTo: 'head' },
			);
		}

		if (!isDev && process.env.TEMPLATE_BANNER_SCRIPT_URL && process.env.TEMPLATE_REDIRECT_URL) {
			tags.push(
				{
					tag: 'script',
					attrs: { 
						src: process.env.TEMPLATE_BANNER_SCRIPT_URL,
						'template-redirect-url': process.env.TEMPLATE_REDIRECT_URL,
					},
					injectTo: 'head',
				}
			);
		}

		return {
			html,
			tags,
		};
	},
};

console.warn = () => {};

const logger = createLogger()
const loggerError = logger.error

logger.error = (msg, options) => {
	if (options?.error?.toString().includes('CssSyntaxError: [postcss]')) {
		return;
	}

	loggerError(msg, options);
}

export default defineConfig({
	customLogger: logger,
	plugins: [
		...(isDev ? [inlineEditPlugin(), editModeDevPlugin()] : []),
		react(),
		addTransformIndexHtml,
	],
	server: {
		cors: true,
		headers: {
			'Cross-Origin-Embedder-Policy': 'credentialless',
		},
		allowedHosts: true,
		proxy: {
			'/api': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				configure: (proxy /*: import('http-proxy').Server */) => {
					proxy.on('proxyReq', (proxyReq, req) => {
						try {
							const originalHost = req?.headers?.host;
							if (originalHost) {
								proxyReq.setHeader('x-forwarded-host', originalHost);
							}
						} catch {}
					});
				},
			},
		},
	},
	resolve: {
		extensions: ['.jsx', '.js', '.tsx', '.ts', '.json', ],
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	build: {
		// 性能优化：启用压缩和代码分割
		minify: 'terser',
		terserOptions: {
			compress: {
				drop_console: true, // 生产环境移除 console
				drop_debugger: true,
			},
		},
		// 优化 chunk 大小
		chunkSizeWarningLimit: 1000,
		rollupOptions: {
			external: [
				'@babel/parser',
				'@babel/traverse',
				'@babel/generator',
				'@babel/types'
			],
			output: {
				// 代码分割策略
				manualChunks: {
					// 将 React 相关库分离
					'react-vendor': ['react', 'react-dom', 'react-router-dom'],
					// 将 UI 组件库分离
					'ui-vendor': ['framer-motion', 'lucide-react'],
					// 将图表库分离
					'chart-vendor': ['chart.js', 'react-chartjs-2'],
					// 将查询和状态管理分离
					'data-vendor': ['@tanstack/react-query', '@supabase/supabase-js'],
				},
				// 优化输出文件名
				chunkFileNames: 'assets/js/[name]-[hash].js',
				entryFileNames: 'assets/js/[name]-[hash].js',
				assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
			},
		},
		// 启用 CSS 代码分割
		cssCodeSplit: true,
		// 启用源码映射（仅开发环境）
		sourcemap: isDev,
	},
	define: {
		// 🔒 安全：只注入公開的環境變量到前端
		// 注意：這些變量會被編譯到前端代碼，任何人都可以看到
		'import.meta.env.NEXT_PUBLIC_ROOT_DOMAIN': JSON.stringify(process.env.NEXT_PUBLIC_ROOT_DOMAIN),
		'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL),
		'import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
		
		// 🔒 已移除：以下敏感變量不應注入到前端
		// ❌ 'import.meta.env.SUPABASE_SERVICE_ROLE_KEY' - 服務端密鑰
		// ❌ 'import.meta.env.DATABASE_URL' - 數據庫連接字符串
		// ❌ 'import.meta.env.TURSO_AUTH_TOKEN' - 數據庫認證 Token
		// ❌ 'import.meta.env.TURSO_API_TOKEN' - API Token
		// 這些變量僅應在後端使用（server/）
	}
});
