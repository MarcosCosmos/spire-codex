import { generateMetadata, default as NotFound } from "../not-found";

/**
 * Locale-scoped 404 page. Mirrors `/not-found.tsx` but bounces back to
 * the home page, `/` covers all locales
 *
 * Like the English variant: canonical → home + meta-refresh after 3s
 * + robots:noindex. Captures the long tail of bogus localized URLs
 * (e.g. `/jpn/cards/<bad-id>` that aren't caught by the entity-detail
 * redirect helper above, plus any `/jpn/<bogus-page>` routes).
 *
 * Note: this currently can't localise properly because it dosn't have access to the client side localisation contexts etc (and AFAIK is prebaked once for all usages).
 * The simplest way to get a localised version will probably be to utilise i18n-next which (hopefully?) provides server side locales.
 * We'll also need [...notfound] catchalls to route unmatched paths to the localised paths so i18n-next can provide locale information.
 * See https://next-intl.dev/docs/environments/error-files and https://github.com/vercel/next.js/discussions/50518
 */

export { generateMetadata };
export default NotFound;
