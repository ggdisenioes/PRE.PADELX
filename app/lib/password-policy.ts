export const PASSWORD_POLICY = {
  minLength: 8,
  uppercaseRegex: /[A-Z]/,
  lowercaseRegex: /[a-z]/,
  numberRegex: /[0-9]/,
  specialRegex: /[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/,
} as const;

export type PasswordRuleStatus = {
  key: "minLength" | "uppercase" | "lowercase" | "number" | "special";
  label: string;
  message: string;
  ok: boolean;
};

const PASSWORD_RULES = [
  {
    key: "minLength",
    label: `Al menos ${PASSWORD_POLICY.minLength} caracteres`,
    message: `Mínimo ${PASSWORD_POLICY.minLength} caracteres`,
    check: (value: string) => value.length >= PASSWORD_POLICY.minLength,
  },
  {
    key: "uppercase",
    label: "Una letra mayúscula (A-Z)",
    message: "Debe contener una mayúscula (A-Z)",
    check: (value: string) => PASSWORD_POLICY.uppercaseRegex.test(value),
  },
  {
    key: "lowercase",
    label: "Una letra minúscula (a-z)",
    message: "Debe contener una minúscula (a-z)",
    check: (value: string) => PASSWORD_POLICY.lowercaseRegex.test(value),
  },
  {
    key: "number",
    label: "Un número (0-9)",
    message: "Debe contener un número (0-9)",
    check: (value: string) => PASSWORD_POLICY.numberRegex.test(value),
  },
  {
    key: "special",
    label: "Un símbolo (!@#$...)",
    message: "Debe contener un carácter especial",
    check: (value: string) => PASSWORD_POLICY.specialRegex.test(value),
  },
] as const;

export function getPasswordRuleStatuses(password: string): PasswordRuleStatus[] {
  return PASSWORD_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    message: rule.message,
    ok: rule.check(password),
  }));
}

export function getFirstPasswordError(password: string): string | null {
  const failed = getPasswordRuleStatuses(password).find((rule) => !rule.ok);
  return failed ? failed.message : null;
}
