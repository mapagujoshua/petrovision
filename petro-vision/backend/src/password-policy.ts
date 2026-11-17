export const PASSWORD_POLICY_MESSAGE = "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

const SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{};:'\",.<>/?\\|`~";

export function validatePassword(password: string) {
  const checks = {
    length: password.length >= 8 && password.length <= 64,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: [...password].some((character) => SPECIAL_CHARACTERS.includes(character)),
    noSpaces: !/\s/.test(password)
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}
