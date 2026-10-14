export const CITY_OPTIONS = [
  { id: "tbilisi", labelGe: "თბილისი", labelEn: "Tbilisi", names: ["თბილისი", "tbilisi"] },
  { id: "batumi", labelGe: "ბათუმი", labelEn: "Batumi", names: ["ბათუმი", "batumi"] },
  { id: "kutaisi", labelGe: "ქუთაისი", labelEn: "Kutaisi", names: ["ქუთაისი", "kutaisi"] },
  { id: "ozurgeti", labelGe: "ოზურგეთი", labelEn: "Ozurgeti", names: ["ოზურგეთი", "ozurgeti", "ozurgety"] },
];

const normalizeText = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();

const normalizeCity = (value) => {
  const name = normalizeText(value).replace(/^ქ(?:ალაქი)?(?:\.\s*|\s+)/u, "");
  return CITY_OPTIONS.find((city) => city.names.includes(name))?.id || name;
};

export function filterListings(items, filters, categories) {
  const search = normalizeText(filters.search);

  return items.filter((item) => {
    const textMatches = !search || normalizeText(`${item.title ?? ""} ${item.description ?? ""}`).includes(search);
    const cityMatches = filters.city === "all" || normalizeCity(item.city) === filters.city;
    const category = categories.find((entry) => entry.id === filters.category);
    const categoryMatches = filters.category === "all" || Boolean(
      category?.matches.some((name) => normalizeText(item.category).includes(normalizeText(name))),
    );
    const typeMatches = filters.listingType === "all" || normalizeText(item.listing_type || "offer") === filters.listingType;

    return textMatches && cityMatches && categoryMatches && typeMatches;
  });
}
