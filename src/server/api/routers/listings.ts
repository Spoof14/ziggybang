import { z } from "zod";
import { getListingDetail, getMapData } from "~/server/listings/aggregate";
import { interpretAsk } from "~/server/listings/ask";
import { isOpenAiConfigured } from "~/server/listings/openai";
import { localizeAskResult, runAskPicks } from "~/server/listings/ask-picks";
import { SEOUL_CENTER, type AskConstraints, type AskPicksResult } from "~/lib/listings/ask-picks";
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
const areaBucketSchema = z.enum(["xs", "s", "m", "l"]);
const constraintsSchema = z.object({
  place: z
    .object({
      name: z.string().min(1).max(60),
      lat: z.number().min(33).max(39),
      lng: z.number().min(124).max(132),
      radiusM: z.number().min(250).max(4000),
      kind: z.enum(["place", "viewport"]),
    })
    .optional(),
  propertyTypes: z.array(propertyTypeSchema).max(4).optional(),
  salesTypes: z.array(salesTypeSchema).max(3).optional(),
  areaBucketIds: z.array(areaBucketSchema).max(4).optional(),
  rooms: z.number().int().min(2).max(4).optional(),
  floorFilter: floorFilterSchema.optional(),
  ageFilter: ageFilterSchema.optional(),
  maxBuildingAge: z.number().int().min(5).max(39).optional(),
  foreignerOk: z.boolean().optional(),
  hasPhotos: z.boolean().optional(),
  preferences: z.array(z.string().min(1).max(40)).max(5).optional(),
  commute: z
    .object({
      name: z.string().min(1).max(60),
      lat: z.number().min(33).max(39),
      lng: z.number().min(124).max(132),
      maxMin: z.number().min(5).max(90),
    })
    .optional(),
  similarTo: z.object({ id: z.string().min(1).max(120), label: z.string().max(60) }).optional(),
  minDeposit: z.number().min(0).max(1_000_000).optional(),
  maxDeposit: z.number().min(0).max(1_000_000).optional(),
  minRent: z.number().min(0).max(50_000).optional(),
  maxRent: z.number().min(0).max(50_000).optional(),
});
const messagesSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(1500),
    }),
  )
  .min(1)
  .max(12);
const priorPicksSchema = z
  .array(
    z.object({
      rank: z.number().int().min(1).max(10),
      id: z.string().min(1).max(120),
      propertyType: propertyTypeSchema,
      salesType: salesTypeSchema.optional(),
      deposit: z.number().optional(),
      rent: z.number().optional(),
      price: z.number().optional(),
      areaM2: z.number().optional(),
      lat: z.number().min(33).max(39),
      lng: z.number().min(124).max(132),
      label: z.string().max(60),
    }),
  )
  .max(10);
const langSchema = z.enum(["en", "ko"]);
const storedPickSchema = z
  .object({
    rank: z.number().int().min(1).max(50),
    listing: z
      .object({
        id: z.string().min(1).max(120),
        source: sourceSchema,
        sourceId: z.string().max(120),
        lat: z.number(),
        lng: z.number(),
        propertyType: propertyTypeSchema,
        url: z.string().max(500),
      })
      .passthrough(),
    reason: z.string().max(400),
    reasonSource: z.enum(["ai", "basic"]),
    facts: z.object({ tags: z.array(z.string().max(20)).max(12), subwayWalkMin: z.number().optional() }).optional(),
  })
  .passthrough();
/** A result the browser already holds (language switch): the stored picks and counts are reused as they are. */
const storedResultSchema = z
  .object({
    status: z.enum(["ok", "empty"]),
    constraints: constraintsSchema,
    picks: z.array(storedPickSchema).max(12).default([]),
    summary: z.string().max(600),
    assumptions: z.array(z.string().max(400)).max(10),
    provider: z.enum(["openai", "local"]),
    candidateCount: z.number(),
    radiusM: z.number(),
    widened: z.boolean(),
    sourceErrors: z.array(z.string().max(200)).max(10),
  })
  .passthrough();
const viewportSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const fallbackReasonSchema = z.enum(["rate_limited", "quota", "auth", "timeout", "error", "unconfigured"]);

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

  /** Step 1 of Ask: natural language → grounded constraints (place resolved to coordinates). */
  askInterpret: publicProcedure
    .input(
      z.object({
        messages: messagesSchema,
        previous: constraintsSchema.optional(),
        viewport: viewportSchema.optional(),
        lang: langSchema.optional(),
        priorPicks: priorPicksSchema.optional(),
      }),
    )
    .mutation(({ input, signal }) => interpretAsk({ ...input, signal })),

  /**
   * Ask: ten selected listings in ONE round trip. With `constraints` it ranks
   * exactly those (chip edits). Otherwise it interprets the message first —
   * merging into `previous` for a refine — using the deterministic parser and
   * only calling the model when that is not enough.
   */
  ask: publicProcedure
    .input(
      z.object({
        messages: messagesSchema,
        constraints: constraintsSchema.optional(),
        previous: constraintsSchema.optional(),
        viewport: viewportSchema.optional(),
        lang: langSchema.optional(),
        priorPicks: priorPicksSchema.optional(),
        skipAi: fallbackReasonSchema.optional(),
      }),
    )
    .mutation(async ({ input, signal }): Promise<AskPicksResult> => {
      const started = Date.now();
      let constraints: AskConstraints | undefined = input.constraints;
      let assumptions: string[] = [];
      let skipAi = input.skipAi;
      let interpretMs = 0;
      if (!constraints) {
        const interpreted = await interpretAsk({
          messages: input.messages,
          previous: input.previous,
          viewport: input.viewport,
          lang: input.lang,
          priorPicks: input.priorPicks,
          signal,
        });
        interpretMs = Date.now() - started;
        if (interpreted.status === "off_topic") return interpreted;
        constraints = interpreted.constraints;
        assumptions = interpreted.assumptions;
        skipAi = skipAi ?? interpreted.fallbackReason;
      }
      if (!constraints.place) {
        constraints = {
          ...constraints,
          place: {
            name: "current map view",
            ...(input.viewport ?? SEOUL_CENTER),
            radiusM: 1500,
            kind: "viewport",
          },
        };
      }
      const result = await runAskPicks({
        messages: input.messages,
        constraints,
        skipAi,
        assumptions,
        fromText: !input.constraints,
        lang: input.lang,
        signal,
      });
      if (result.status === "off_topic") return result;
      return {
        ...result,
        elapsedMs: Date.now() - started,
        ...(result.status === "ok" && result.timingsMs
          ? { timingsMs: { ...result.timingsMs, interpret: interpretMs } }
          : {}),
      };
    }),

  /**
   * Language switch: rewrite summary, reasons and notes of a result the browser
   * already has. The structured constraints and the picks are reused exactly;
   * nothing is re-interpreted, re-fetched or re-ranked.
   */
  askLocalize: publicProcedure
    .input(z.object({ result: storedResultSchema, fromLang: langSchema, lang: langSchema }))
    .mutation(({ input, signal }) =>
      localizeAskResult({
        result: input.result as unknown as Parameters<typeof localizeAskResult>[0]["result"],
        fromLang: input.fromLang,
        lang: input.lang,
        signal,
      }),
    ),

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
