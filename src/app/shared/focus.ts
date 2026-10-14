/** Where the focus goes when a screen changes under the person (plan pillar 7; NFR-008, Annex H). */

/** Focuses the first field marked `aria-invalid="true"` inside `form`; false when no field is in error. */
export function focusFirstError(form: ParentNode): boolean {
  const field = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  field?.focus();
  return field != null;
}

/** Focuses the first `h1` of `area`, focusable by script only (`tabindex="-1"`), so a screen reader announces the area. */
export function focusHeading(area: ParentNode): boolean {
  const heading = area.querySelector<HTMLElement>('h1');
  if (!heading) { return false; }
  if (!heading.hasAttribute('tabindex')) { heading.setAttribute('tabindex', '-1'); }
  heading.focus();
  return true;
}
