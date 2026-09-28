// Durables activity addresses: durables.dev/<owner>/<name>, with an optional @<version>.

const ACTIVITY_ADDRESS = /^durables\.dev\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*(?:@\d+\.\d+\.\d+)?$/;

export function isActivityAddress(address: string): boolean {
  return ACTIVITY_ADDRESS.test(address.trim());
}
