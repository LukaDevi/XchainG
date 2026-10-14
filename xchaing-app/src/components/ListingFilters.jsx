import { CITY_OPTIONS } from "../lib/listingFilters";

export default function ListingFilters({
  search,
  onSearchChange,
  city,
  onCityChange,
  category,
  onCategoryChange,
  listingType,
  onListingTypeChange,
  categories,
  resultCount,
  onClear,
  lang,
  isDarkMode,
}) {
  const isGeorgian = lang === "GE";
  const labels = isGeorgian
    ? {
        search: "ძიება",
        searchPlaceholder: "მოძებნე სათაურში ან აღწერაში",
        city: "ქალაქი",
        allCities: "ყველა ქალაქი",
        category: "კატეგორია",
        allCategories: "ყველა კატეგორია",
        type: "ტიპი",
        allTypes: "ყველა ტიპი",
        offer: "გაცვლა",
        auction: "აუქციონი",
        clear: "ფილტრების გასუფთავება",
        results: "შედეგი",
      }
    : {
        search: "Search",
        searchPlaceholder: "Search titles and descriptions",
        city: "City",
        allCities: "All cities",
        category: "Category",
        allCategories: "All categories",
        type: "Type",
        allTypes: "All types",
        offer: "Offer",
        auction: "Auction",
        clear: "Clear filters",
        results: "results",
      };
  const inputClass = `mt-1 min-h-11 w-full rounded-md border px-3 text-sm outline-none focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/20 ${
    isDarkMode ? "border-slate-700 bg-slate-950 text-white placeholder-slate-500" : "border-slate-300 bg-white text-slate-900 placeholder-slate-500"
  }`;

  return (
    <div className={`mb-5 rounded-lg border p-3 sm:p-4 ${isDarkMode ? "border-slate-800 bg-slate-900/70" : "border-slate-200 bg-white"}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold">
          {labels.search}
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className={inputClass}
          />
        </label>
        <label className="text-xs font-semibold">
          {labels.city}
          <select value={city} onChange={(event) => onCityChange(event.target.value)} className={inputClass}>
            <option value="all">{labels.allCities}</option>
            {CITY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{isGeorgian ? option.labelGe : option.labelEn}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          {labels.category}
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)} className={inputClass}>
            <option value="all">{labels.allCategories}</option>
            {categories.map((option) => (
              <option key={option.id} value={option.id}>{isGeorgian ? option.label : option.labelEn}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          {labels.type}
          <select value={listingType} onChange={(event) => onListingTypeChange(event.target.value)} className={inputClass}>
            <option value="all">{labels.allTypes}</option>
            <option value="offer">{labels.offer}</option>
            <option value="auction">{labels.auction}</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-400" role="status" aria-live="polite">{resultCount} {labels.results}</span>
        <button type="button" onClick={onClear} className="min-h-10 rounded-md px-3 text-xs font-semibold text-[#FF5500] hover:bg-[#FF5500]/10">
          {labels.clear}
        </button>
      </div>
    </div>
  );
}
