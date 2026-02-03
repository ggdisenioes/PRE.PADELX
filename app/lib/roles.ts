import { supabase } from "./supabase";

export type UserRole = "admin" | "manager" | "user";

export type RoleState = {
  role: UserRole;
  isAdmin: boolean;
  isManager: boolean;
  isUser: boolean;
  loading: boolean;
};

/**
 * Obtiene el rol del usuario logueado desde profiles
 */
export const getUserRole = async (): Promise<UserRole> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "user";

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !data?.role) return "user";

  return data.role as UserRole;
};