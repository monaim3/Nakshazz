import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { hasLocale } from "./i18n";

const dictionaries = {
  en: () => import("@/dictionaries/en.json").then((module) => module.default),
  bn: () => import("@/dictionaries/bn.json").then((module) => module.default),
};

/** Current storefront language from the [lang] root segment. Server Components only. */
export async function currentLang() {
  const value = await lang();
  if (!hasLocale(value)) notFound();
  return value;
}

export async function getDictionary() {
  return dictionaries[await currentLang()]();
}
