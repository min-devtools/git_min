import { QueryClient } from "@tanstack/react-query";

/** Shared instance so non-React code (keymap actions) can invalidate queries. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});
