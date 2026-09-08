/**
 * Parses a price out of demoblaze's "$360" / "$360 *includes tax" display
 * text. Shared by `ListingPage.cardPrice()` and `ProductPage.priceValue()`
 * so a card and its detail page are compared through one parser rather
 * than two copies that could drift (TC-15, issue #17: the whole point of
 * that case is that parsed amounts, never raw strings, are what agree).
 */
export function parsePrice(text: string, context: string): number {
  const match = text.match(/\$([\d,.]+)/);
  if (!match) {
    throw new Error(`Could not parse a price out of ${context} text "${text}"`);
  }
  return Number(match[1].replace(/,/g, ''));
}
