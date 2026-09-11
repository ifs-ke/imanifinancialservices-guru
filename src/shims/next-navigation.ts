import { useLocation, useNavigate, useParams as useRRDParams, useSearchParams as useRRDSearchParams } from 'react-router-dom';

export function usePathname(): string {
  const location = useLocation();
  return location.pathname;
}

export function useRouter() {
  const navigate = useNavigate();

  return {
    push: (url: string) => navigate(url),
    replace: (url: string) => navigate(url, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => {
      // In SPA, refresh can trigger re-render or reload
      window.dispatchEvent(new Event('router-refresh'));
    },
    prefetch: (_url: string) => {},
  };
}

export function useSearchParams(): URLSearchParams {
  const [searchParams] = useRRDSearchParams();
  return searchParams;
}

export function useParams<T extends Record<string, string | string[]> = Record<string, string>>(): T {
  const params = useRRDParams();
  return params as unknown as T;
}

export function redirect(url: string) {
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}

export function notFound() {
  throw new Error('404: Not Found');
}
