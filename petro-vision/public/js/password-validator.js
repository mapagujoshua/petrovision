function validatePassword(password) {
  const specialCharacters = "!@#$%^&*()_+-=[]{};:'\",.<>/?\\|`~";
  const checks = {
    length: password.length >= 8 && password.length <= 64,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: [...password].some(character => specialCharacters.includes(character)),
    noSpaces: !/\s/.test(password)
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}
