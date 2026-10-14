import assert from "node:assert/strict";
import test from "node:test";
import { CITY_OPTIONS, filterListings } from "./listingFilters.js";

const categories = [
  { id: "electronics", matches: ["electronics", "ტექნიკა"] },
  { id: "sports", matches: ["sports", "სპორტი"] },
  { id: "vehicles", matches: ["vehicles", "ავტო"] },
];

const items = [
  { id: 1, title: "iPhone", description: "Red phone", city: "თბილისი", category: "Electronics", listing_type: "offer" },
  { id: 2, title: "Camera", description: "IPHONE case", city: "  Tbilisi  ", category: "Electronics", listing_type: "auction" },
  { id: 3, title: "Bicycle", description: "Sport", city: "ბათუმი", category: "Sports", listing_type: "offer" },
  { id: 4, title: "Car", description: "Auction item", city: null, category: "Vehicles", listing_type: "auction" },
  { id: 5, title: "Laptop", description: "Desk", city: "ქ. თბილისი", category: "Electronics", listing_type: "offer" },
  { id: 6, title: "Phone", description: "Old", city: "Kutaisi", category: "Electronics", listing_type: "offer" },
  { id: 7, title: "Book", description: "New", city: "ოზურგეთი", category: "Other", listing_type: "offer" },
];

const defaultFilters = { search: "", city: "all", category: "all", listingType: "all" };
const idsFor = (filters = {}) => filterListings(items, { ...defaultFilters, ...filters }, categories).map((item) => item.id);

test("all cities include items without a city; a chosen city does not", () => {
  assert.deepEqual(idsFor(), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(idsFor({ city: "tbilisi" }), [1, 2, 5]);
  assert.deepEqual(
    filterListings([{ id: 8, city: "ქ.თბილისი" }], { ...defaultFilters, city: "tbilisi" }, categories).map((item) => item.id),
    [8],
  );
  const cityMissing = [{ id: 9, city: " " }];
  assert.deepEqual(filterListings(cityMissing, defaultFilters, categories).map((item) => item.id), [9]);
  assert.deepEqual(filterListings(cityMissing, { ...defaultFilters, city: "tbilisi" }, categories), []);
  assert.deepEqual(idsFor({ city: "batumi" }), [3]);
  assert.deepEqual(idsFor({ city: "kutaisi" }), [6]);
  assert.deepEqual(idsFor({ city: "ozurgeti" }), [7]);
});

test("new listing city IDs match the shared filter options", () => {
  for (const option of CITY_OPTIONS) {
    const createdItem = { id: option.id, city: option.id };
    assert.deepEqual(
      filterListings([createdItem], { ...defaultFilters, city: option.id }, categories),
      [createdItem],
    );
  }
});

test("search matches title and description without case sensitivity", () => {
  assert.deepEqual(idsFor({ search: "IPHONE" }), [1, 2]);
  assert.deepEqual(idsFor({ search: "  red PHONE  " }), [1]);
});

test("category and listing type each narrow the displayed items", () => {
  assert.deepEqual(idsFor({ category: "electronics" }), [1, 2, 5, 6]);
  assert.deepEqual(idsFor({ listingType: "auction" }), [2, 4]);
  assert.deepEqual(idsFor({ listingType: "offer" }), [1, 3, 5, 6, 7]);
});

test("search, city, category and type work together and can produce no results", () => {
  assert.deepEqual(idsFor({ search: "iphone", city: "tbilisi", category: "electronics", listingType: "auction" }), [2]);
  assert.deepEqual(idsFor({ search: "phone", city: "batumi", category: "electronics", listingType: "auction" }), []);
  assert.deepEqual(idsFor(defaultFilters), [1, 2, 3, 4, 5, 6, 7]);
});
