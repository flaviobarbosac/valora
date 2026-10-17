import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useMemo } from "react";
import { stopViewAs } from "@/lib/viewAs";

export type LoginCredentials = { email: string; password: string };

export function useAuth() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const loginMutation = trpc.auth.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const login = useCallback(async (credentials: LoginCredentials) => {
    const user = await loginMutation.mutateAsync(credentials);
    utils.auth.me.setData(undefined, user);
    // Anything else cached belongs to whoever was signed in before.
    void utils.invalidate();
    return user;
  }, [loginMutation, utils]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // Drop every cached record so the next person on this browser starts clean.
      stopViewAs({ reload: false });
      queryClient.clear();
      utils.auth.me.setData(undefined, null);
    }
  }, [logoutMutation, queryClient, utils]);

  const state = useMemo(() => ({
    user: meQuery.data ?? null,
    loading: meQuery.isLoading || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
  }), [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  return {
    ...state,
    loggingIn: loginMutation.isPending,
    refresh: () => meQuery.refetch(),
    login,
    logout,
  };
}
