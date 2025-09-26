import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { fetchWithRetry } from './api';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

const ROOT_DOMAIN = (import.meta.env?.NEXT_PUBLIC_ROOT_DOMAIN || '').toLowerCase();
const TENANT_RESOLVE_TIMEOUT_MS = Number(import.meta.env?.VITE_TENANT_RESOLVE_TIMEOUT_MS || 2500);

export const getTenantIdByHostname = async (hostname) => {
	const normalizedHost = String(hostname || '').trim().toLowerCase();
	try {
		if (!normalizedHost || normalizedHost === 'localhost' || normalizedHost.startsWith('localhost:') || normalizedHost === '127.0.0.1') {
			return 0;
		}
		if (ROOT_DOMAIN) {
			if (normalizedHost === ROOT_DOMAIN || normalizedHost.endsWith(`.${ROOT_DOMAIN}`)) {
				return 0;
			}
		}

		const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		const timer = controller ? setTimeout(() => controller.abort(), TENANT_RESOLVE_TIMEOUT_MS) : null;

		try {
			const res = await fetch('/api/tenant/resolve', {
				signal: controller?.signal,
				headers: {
					'X-Horizons-Resolve-Host': normalizedHost,
				},
			});
			if (!res.ok) return 0;
			const j = await res.json();
			return Number.isFinite(Number(j?.tenantId)) ? Number(j.tenantId) : 0;
		} catch (error) {
			if (error?.name === 'AbortError') {
				console.warn('[Tenant] resolve request timed out, falling back to default tenant.');
			} else {
				console.error(`Critical error in getTenantIdByHostname for "${normalizedHost}":`, error);
			}
			return 0;
		} finally {
			if (timer) clearTimeout(timer);
		}
	} catch (fallbackError) {
		console.error('Unexpected failure when resolving tenant ID:', fallbackError);
		return 0;
	}
};