import { generateMetadata, default as NotFound } from "./[lang]/not-found";

/**
 * Note: this currently can't localise properly because it dosn't have access to the client side localisation contexts etc (and AFAIK is prebaked once for all usages).
 * The simplest way to get a localised version will probably be to utilise i18n-next which (hopefully?) provides server side locales.
 * We'll also need [...notfound] catchalls to route unmatched paths to the localised paths so i18n-next can provide locale information.
 * See https://next-intl.dev/docs/environments/error-files and https://github.com/vercel/next.js/discussions/50518
 */

export { generateMetadata };
export default NotFound;
