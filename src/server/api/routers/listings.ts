import { z } from "zod";
import { getListingDetail, getMapData } from "~/server/listings/aggregate";
import { askListings, isOpenAiConfigured } from "~/server/listings/ask";
import { geocodeKorea } from "~/server/listings/geocode";
import { inspectListingPhotos } from "~/server/listings/vision";
import { translateListingNotes } from "~/server/listings/translate";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { ageFilters } from "~/lib/listings/age";
import { floorFilters } from "~/lib/listings/floor";

const boundsSchema = z.object({
  south: z.number(),
  west: z.number(),
  north: z.number(),
  east: z.number(),
});

const sourceSchema = z.enum(["zigbang", "naver", "peterpan"]);
const propertyTypeSchema = z.enum([
  "oneroom",
  "villa",
  "officetel",
  "apartment",
]);
const salesTypeSchema = z.enum(["jeonse", "wolse", "sale"]);
const floorFilterSchema = z.enum(floorFilters);
const ageFilterSchema = z.enum(ageFilters);
const snapshotSchema = z.object({
  searchInput: z.string().max(120),
  propertyTypes: z.array(propertyTypeSchema).min(1),
  salesTypes: z.array(salesTypeSchema).min(1),
  areaBucketIds: z.array(z.enum(["xs", "s", "m", "l"])),
  radiusM: z.number().min(250).max(3000),
  viewMode: z.enum(["map", "list", "saved", "best"]),
  minDeposit: z.number().min(0).max(1_000_000).optional(),
  maxDeposit: z.number().min(0).max(1_000_000).optional(),
  minRent: z.number().min(0).max(50_000).optional(),
  maxRent: z.number().min(0).max(50_000).optional(),
  foreignerOk: z.boolean().optional(),
  hasPhotos: z.boolean().optional(),
  floorFilter: floorFilterSchema.optional(),
  ageFilter: ageFilterSchema.optional(),
  listingQuery: z.string().max(80).optional(),
  maxBuildingAge: z.number().int().min(5).max(39).optional(),
});

export const listingsRouter = createTRPCRouter({
  getMap: publicProcedure
    .input(
      z.object({
        bounds: boundsSchema,
        zoom: z.number().min(1).max(20),
        sources: z.array(sourceSchema).min(1),
        propertyTypes: z.array(propertyTypeSchema).min(1),
        salesTypes: z
          .array(z.enum(["jeonse", "wolse", "sale"]))
          .min(1)
          .default(["jeonse", "wolse", "sale"]),
        query: z.string().max(80).optional(),
        areaBucketIds: z.array(z.enum(["xs", "s", "m", "l"])).optional(),
        circle: z
          .object({
            lat: z.number(),
            lng: z.number(),
            radiusM: z.number().min(50).max(20_000),
          })
          .optional(),
        polygon: z
          .array(z.object({ lat: z.number(), lng: z.number() }))
          .min(3)
          .max(32)
          .optional(),
        includeListings: z.boolean().optional(),
        listingLimit: z.number().int().min(20).max(300).optional(),
        minDeposit: z.number().min(0).max(1_000_000).optional(),
        maxDeposit: z.number().min(0).max(1_000_000).optional(),
        minRent: z.number().min(0).max(50_000).optional(),
        maxRent: z.number().min(0).max(50_000).optional(),
        foreignerOk: z.boolean().optional(),
        hasPhotos: z.boolean().optional(),
        floorFilter: floorFilterSchema.optional(),
        ageFilter: ageFilterSchema.optional(),
        maxBuildingAge: z.number().int().min(5).max(39).optional(),
      }),
    )
    .query(({ input }) => getMapData(input)),

  getDetail: publicProcedure
    .input(
      z.object({
        source: sourceSchema,
        sourceId: z.string().min(1),
        propertyType: propertyTypeSchema,
      }),
    )
    .query(({ input }) => getListingDetail(input)),

  geocode: publicProcedure
    .input(z.object({ query: z.string().min(1).max(80) }))
    .query(({ input }) => geocodeKorea(input.query)),

  aiStatus: publicProcedure.query(() => ({ openai: isOpenAiConfigured() })),

  ask: publicProcedure
    .input(
      z.object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(1500),
            }),
          )
          .min(1)
          .max(12),
        current: snapshotSchema,
      }),
    )
    .mutation(({ input }) => askListings(input.messages, input.current)),

  inspectPhotos: publicProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              id: z.string().min(1).max(120),
              url: z.string().min(8).max(500),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .mutation(({ input }) => inspectListingPhotos(input.items)),

  translateNotes: publicProcedure
    .input(z.object({ text: z.string().min(1).max(4000) }))
    .query(({ input }) => translateListingNotes(input.text)),
});
