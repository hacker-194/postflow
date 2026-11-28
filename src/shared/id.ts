/**
 * Secure ID Generation
 * Cryptographically random IDs with prefix for debugging.
 */

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 16;

export function generateSecureId(prefix: string): string {
  const array = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(array);
  const randomPart = Array.from(array, byte => ID_CHARS[byte % ID_CHARS.length]).join('');
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export function generateGroupId(): string {
  return generateSecureId('grp');
}

export function generateGroupListId(): string {
  return generateSecureId('lst');
}

export function generateShareId(): string {
  return generateSecureId('shr');
}

export function generateTemplateId(): string {
  return generateSecureId('tpl');
}

export function generateImageSetId(): string {
  return generateSecureId('img');
}

export function generateCheckpointId(): string {
  return generateSecureId('chk');
}

export function isValidId(id: string, prefix: string): boolean {
  const pattern = new RegExp(`^${prefix}_[a-z0-9]+_[a-z0-9]{${ID_LENGTH}}$`);
  return pattern.test(id);
}

export function validateGroupId(id: string): boolean {
  return isValidId(id, 'grp');
}

export function validateGroupListId(id: string): boolean {
  return isValidId(id, 'lst');
}

export function validateShareId(id: string): boolean {
  return isValidId(id, 'shr');
}

export function validateTemplateId(id: string): boolean {
  return isValidId(id, 'tpl');
}

export function validateImageSetId(id: string): boolean {
  return isValidId(id, 'img');
}

export function validateCheckpointId(id: string): boolean {
  return isValidId(id, 'chk');
}
