/**
 * Lowercases the field as it is typed. The field is changed in place first, so the caret
 * stays where the publisher put it. Returns the lowercased value.
 */
export function lowercaseAsTyped(input: HTMLInputElement): string {
  const lowered = input.value.toLowerCase();
  if (lowered !== input.value) {
    const { selectionStart, selectionEnd } = input;
    input.value = lowered;
    input.setSelectionRange(selectionStart, selectionEnd);
  }
  return lowered;
}
