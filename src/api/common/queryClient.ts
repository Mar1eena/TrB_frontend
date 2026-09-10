import { QueryClient } from "@tanstack/react-query";

/**
 * Единый QueryClient приложения. Живёт в api-слое, чтобы им могли пользоваться
 * и React-компоненты (через QueryClientProvider в App), и «голый» кеш
 * ApiCache в api-модулях.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      gcTime: 5 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
