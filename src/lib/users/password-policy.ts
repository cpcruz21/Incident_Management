export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;
export const PASSWORD_REQUIREMENTS = 'Use 8–256 characters, including at least one letter and one special character (e.g. !, @, #).';

const letter = new RegExp('\\p{L}', 'u');
const special = new RegExp('[\\p{P}\\p{S}]', 'u');

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH
    && letter.test(value) && special.test(value);
}
